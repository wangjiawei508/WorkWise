#!/usr/bin/env python3
"""
Fetch adjusted total-station batches from the monitoring platform and convert
the latest completed batch to the crossing-report CSV format.

The preferred source is:
数据查询 / 平差与测站数据 / 变形监测平差数据

The script first locates the latest completed adjustment batch, then fetches
the corresponding adjustment reports and the point deformation table for that
batch time. The point deformation table is used only after anchoring it to an
actual adjustment batch, so the output remains traceable to the adjusted result.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import os
import re
import time
from copy import deepcopy
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import requests


CSV_FIELDS = [
    "project_name",
    "period_label",
    "report_cadence",
    "report_start",
    "report_end",
    "initial_time",
    "initial_source",
    "previous_time",
    "current_time",
    "monitoring_item",
    "monitoring_method",
    "structure_zone",
    "point_id",
    "ring_no",
    "position_label",
    "influence_zone",
    "current_change_mm",
    "rate_mm_per_d",
    "cumulative_mm",
    "warning_threshold_mm",
    "alarm_threshold_mm",
    "control_threshold_mm",
    "same_direction_count",
    "mean_rate_3_times_mm_per_d",
    "validity",
    "platform_warn_status",
    "note",
    "initial_x_m",
    "initial_y_m",
    "initial_h_m",
    "adjustment_id",
    "adjustment_time",
    "adjustment_net_id",
    "adjustment_report_plane",
    "adjustment_report_height",
]

METRICS = [
    ("纵向变形量", "dX"),
    ("横向变形量", "dY"),
    ("垂直位移", "dH"),
]


def normalize_base_url(value: str) -> str:
    return value.rstrip("/") + "/"


def parse_platform_time(value: str) -> datetime:
    cleaned = value.strip()
    if "T" in cleaned:
        return datetime.fromisoformat(cleaned)
    return datetime.strptime(cleaned, "%Y-%m-%d %H:%M:%S")


def format_platform_time(value: str | datetime) -> str:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    return parse_platform_time(value).strftime("%Y-%m-%d %H:%M:%S")


def read_json_response(response: requests.Response) -> Any:
    response.raise_for_status()
    text = response.text.strip()
    if not text:
        return None
    return json.loads(text)


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def request_with_retry(method: Any, url: str, *, retries: int = 4, **kwargs: Any) -> requests.Response:
    response: requests.Response | None = None
    for attempt in range(retries):
        response = method(url, **kwargs)
        if response.status_code not in {502, 503, 504}:
            return response
        if attempt < retries - 1:
            time.sleep(2 * (attempt + 1))
    assert response is not None
    return response


def apply_cookie_header(session: requests.Session, base_url: str, cookie_header: str) -> None:
    host = platform_host(base_url)
    for part in cookie_header.split(";"):
        if "=" not in part:
            continue
        name, value = part.split("=", 1)
        session.cookies.set(name.strip(), value.strip(), domain=host, path="/")


def platform_host(base_url: str) -> str:
    return re.sub(r"^https?://", "", base_url).split("/", 1)[0].split(":", 1)[0]


def login(session: requests.Session, base_url: str, username: str, password: str) -> None:
    host = platform_host(base_url)
    session.get(urljoin(base_url, "Login/Login.aspx"), timeout=20).raise_for_status()
    session.get(urljoin(base_url, "Login/imagecode.aspx"), timeout=20).raise_for_status()
    captcha = session.cookies.get("adfadhjfghd@10088")
    if not captcha:
        raise SystemExit("Cannot read platform captcha cookie.")
    # The login page writes these cookies in client-side JavaScript before
    # posting the form; reproduce that step for direct script login.
    session.cookies.set("sys_em_username210088", username, domain=host, path="/")
    session.cookies.set("sys_em_passwrod10088", password, domain=host, path="/")
    response = session.post(
        urljoin(base_url, "Default.aspx?sn=login"),
        data={"username": username, "passwordhash": password, "captcha": captcha},
        timeout=20,
        allow_redirects=True,
    )
    response.raise_for_status()
    if "TPSMonitor10088_userlogininfo" not in session.cookies.get_dict():
        # Some deployments redirect without setting the cookie until the index
        # page is requested; leave a useful error if that still fails later.
        pass


def ensure_project_context(session: requests.Session, base_url: str, prjid: str) -> str:
    response = session.get(urljoin(base_url, f"IndexPage.aspx?prjid={prjid}"), timeout=20)
    response.raise_for_status()
    return response.text


def discover_adjust_net_id(session: requests.Session, base_url: str) -> tuple[str, str]:
    response = session.get(
        urljoin(base_url, "MonitorInfo/RawAndProData/AdjustDataManage/AdjustData.aspx"),
        timeout=20,
    )
    response.raise_for_status()
    match = re.search(r'var\s+selCStr\s*=\s*"([^"]*)"', response.text)
    if not match or not match.group(1).strip():
        raise SystemExit("Cannot discover adjustment net id from AdjustData.aspx.")
    first = match.group(1).split("|", 1)[0]
    parts = first.split(",", 1)
    return parts[0], parts[1] if len(parts) > 1 else parts[0]


def fetch_adjustment_page(
    session: requests.Session,
    base_url: str,
    adjust_net_id: str,
    start_time: str,
    end_time: str,
    page_size: int,
) -> dict[str, Any]:
    response = request_with_retry(
        session.post,
        urljoin(
            base_url,
            "MonitorInfo/RawAndProData/AdjustDataManage/StationDataHandler.ashx"
            "?title=getPage&fpage=AdjustData1",
        ),
        data={
            "pageCurrent": "1",
            "pageSize": str(page_size),
            "startTime0": start_time,
            "endTime0": end_time,
            "adjustNetID0": adjust_net_id,
        },
        timeout=30,
    )
    data = read_json_response(response)
    if not isinstance(data, dict):
        raise SystemExit("Unexpected adjustment list response.")
    return data


def finished_parent_batches(page: dict[str, Any]) -> list[dict[str, Any]]:
    batches = []
    for row in page.get("list", []):
        if not isinstance(row, dict):
            continue
        if row.get("level") != 0:
            continue
        if int(row.get("IsFinishedAdj") or 0) != 1:
            continue
        if not row.get("AdjNetDataSummID") or not row.get("SurveyTime"):
            continue
        batches.append(row)
    return sorted(batches, key=lambda row: parse_platform_time(str(row["SurveyTime"])), reverse=True)


def filter_batches_before_cutoff(
    batches: list[dict[str, Any]],
    cutoff_time: str | None,
    grace_minutes: int = 0,
) -> list[dict[str, Any]]:
    if not cutoff_time:
        return batches
    cutoff = parse_platform_time(cutoff_time) + timedelta(minutes=grace_minutes)
    return [
        row for row in batches
        if parse_platform_time(str(row["SurveyTime"])) <= cutoff
    ]


def find_batch_by_time(batches: list[dict[str, Any]], reference_time: str) -> dict[str, Any]:
    expected = format_platform_time(reference_time)
    for row in batches:
        if format_platform_time(str(row["SurveyTime"])) == expected:
            return row
    available = "、".join(format_platform_time(str(row["SurveyTime"])) for row in batches[:10])
    raise SystemExit(f"Cannot find previous reference batch at {expected}. Available recent batches: {available}")


def child_station_rows(page: dict[str, Any], parent_id: str) -> list[dict[str, Any]]:
    parent_key = f"C_{parent_id}"
    rows = []
    for row in page.get("list", []):
        if isinstance(row, dict) and str(row.get("parentid")) == parent_key:
            rows.append(row)
    return rows


def fetch_all_point_info(session: requests.Session, base_url: str, survey_time: str) -> list[dict[str, Any]]:
    response = request_with_retry(
        session.get,
        urljoin(base_url, "OverView/AllPointCurrInfo/AllPointCurrInfoHandler.ashx"),
        params={
            "title": "get1",
            "time0": format_platform_time(survey_time),
            "dzu": "0",
            "pageSize": "500",
            "pageCurrent": "1",
            "_": str(int(time.time() * 1000)),
        },
        timeout=30,
    )
    data = read_json_response(response)
    if not isinstance(data, list):
        raise SystemExit("Unexpected all-point deformation response.")
    return data


def fetch_platform_initial_values(session: requests.Session, base_url: str) -> list[dict[str, Any]]:
    response = request_with_retry(
        session.get,
        urljoin(base_url, "ConfigManage/MonitorConfig/Point/PointHandler3.ashx"),
        params={
            "title": "get",
            "pointtype": "1",
            "_": str(int(time.time() * 1000)),
        },
        timeout=30,
    )
    data = read_json_response(response)
    if not isinstance(data, list):
        raise SystemExit("Unexpected platform initial-value response.")
    return data


def fetch_point_coordinate_records(
    session: requests.Session,
    base_url: str,
    point_ids: list[str],
    center_time: str,
    *,
    minutes: int = 2,
) -> list[dict[str, Any]]:
    center = parse_platform_time(center_time)
    start = (center - timedelta(minutes=minutes)).strftime("%Y-%m-%d %H:%M:%S")
    end = (center + timedelta(minutes=minutes)).strftime("%Y-%m-%d %H:%M:%S")
    response = request_with_retry(
        session.get,
        urljoin(base_url, "MonitorInfo/MonData/PointMonCoordHandler.ashx"),
        params={
            "title": "get1",
            "startTime0": start,
            "endTime0": end,
            "pointID0": ",".join(point_ids),
            "showData0": "true",
            "_": str(int(time.time() * 1000)),
        },
        timeout=30,
    )
    data = read_json_response(response)
    if not isinstance(data, list):
        raise SystemExit("Unexpected point-coordinate record response.")
    return data


def extract_pre_text(source_html: str) -> str:
    match = re.search(r"<pre[^>]*>(.*?)</pre>", source_html, flags=re.S | re.I)
    if not match:
        return html.unescape(re.sub(r"<[^>]+>", "", source_html)).strip()
    return html.unescape(match.group(1)).strip()


def fetch_adjust_report_text(
    session: requests.Session,
    base_url: str,
    adjustment_id: str,
    report_type: int,
) -> str:
    response = request_with_retry(
        session.get,
        urljoin(
            base_url,
            f"MonitorInfo/RawAndProData/AdjustDataManage/AdjustReportChild.aspx"
            f"?adjsummid={adjustment_id}&rpt={report_type}",
        ),
        timeout=30,
    )
    response.raise_for_status()
    return extract_pre_text(response.text)


def fetch_station_detail2(session: requests.Session, base_url: str, station_data_id: str) -> list[dict[str, Any]]:
    response = request_with_retry(
        session.get,
        urljoin(
            base_url,
            f"MonitorInfo/RawAndProData/AdjustDataManage/StationDataDetail2Handler.ashx"
            f"?statid={station_data_id}",
        ),
        timeout=30,
    )
    data = read_json_response(response)
    return data if isinstance(data, list) else []


def parse_adjusted_coordinates(plane_text: str, height_text: str) -> dict[str, dict[str, float]]:
    points: dict[str, dict[str, float]] = {}
    plane_section = plane_text.split("平差坐标及其精度", 1)[-1]
    plane_section = plane_section.split("最弱点及其精度", 1)[0]
    for line in plane_section.splitlines():
        match = re.match(r"\s*\d+\s+([A-Za-z0-9]+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)", line)
        if match:
            name, north, east = match.groups()
            points.setdefault(name, {})["X"] = float(north)
            points.setdefault(name, {})["Y"] = float(east)
    height_section = height_text.split("平差后高程值", 1)[-1]
    height_section = height_section.split("平差后高差值", 1)[0]
    for line in height_section.splitlines():
        match = re.match(r"\s*\d+\s+([A-Za-z0-9]+)\s+(-?\d+\.\d+)", line)
        if match:
            name, height = match.groups()
            points.setdefault(name, {})["H"] = float(height)
    return points


def point_zone(point_name: str) -> str:
    upper = point_name.upper()
    if upper.startswith("CZ"):
        return "测站"
    if upper.startswith("JD"):
        return "测量基点"
    match = re.search(r"(\d+)$", point_name)
    if match:
        return f"{int(match.group(1))}号桥墩"
    return "其他监测点"


def point_position(point_name: str) -> str:
    upper = point_name.upper()
    match = re.search(r"(\d+)$", point_name)
    suffix = match.group(1) if match else ""
    if upper.startswith("S") and suffix:
        return f"{int(suffix)}#桥墩上部测点"
    if upper.startswith("X") and suffix:
        return f"{int(suffix)}#桥墩下部测点"
    if upper.startswith("CZ"):
        return "测站"
    if upper.startswith("JD"):
        return "测量基点"
    return point_name


def make_point_index(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(row.get("PointName")): row for row in rows if row.get("PointName")}


def make_point_index_by_adjustment(rows: list[dict[str, Any]], adjustment_id: str) -> dict[str, dict[str, Any]]:
    filtered = [
        row for row in rows
        if str(row.get("AdjNetDataSummID") or "") == adjustment_id and row.get("PointName")
    ]
    return make_point_index(filtered or rows)


def metric_value(row: dict[str, Any] | None, field: str) -> float | None:
    if row is None:
        return None
    value = row.get(field)
    if value in (None, ""):
        return None
    return float(value)


def format_decimal(value: float | None) -> str:
    if value is None:
        return ""
    return f"{value:.3f}"


def format_coordinate(value: float | None) -> str:
    if value is None:
        return ""
    return f"{value:.9f}"


def cumulative_from_initial(
    coord_row: dict[str, Any] | None,
    initial_row: dict[str, Any] | None,
    field: str,
) -> float | None:
    if coord_row is None or initial_row is None:
        return None
    axis = {"dX": "X", "dY": "Y", "dH": "H"}.get(field)
    if not axis:
        return None
    current = metric_value(coord_row, axis)
    initial = metric_value(initial_row, axis)
    if current is None or initial is None:
        return None
    return (current - initial) * 1000.0


def field_axis(field: str) -> str | None:
    return {"dX": "X", "dY": "Y", "dH": "H"}.get(field)


def coordinate_delta_mm(
    current_coord: dict[str, Any] | None,
    reference_coord: dict[str, Any] | None,
    field: str,
) -> float | None:
    axis = field_axis(field)
    if not axis or current_coord is None or reference_coord is None:
        return None
    current = metric_value(current_coord, axis)
    reference = metric_value(reference_coord, axis)
    if current is None or reference is None:
        return None
    return (current - reference) * 1000.0


def derive_initial_coordinates(
    current_points: list[dict[str, Any]],
    current_coord_records: list[dict[str, Any]],
    adjustment_id: str,
    fallback_initial_points: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Return the deformation baseline coordinates used by the platform.

    The platform point configuration endpoint can contain target/configuration
    coordinates that differ slightly from the deformation baseline. The
    engineer workbook uses the baseline implied by the adjusted coordinate and
    the platform cumulative deformation: initial = current_coord - d*/1000.
    """
    current_by_name = make_point_index(current_points)
    coords_by_name = make_point_index_by_adjustment(current_coord_records, adjustment_id)
    fallback_by_name = make_point_index(fallback_initial_points)
    initial_by_name: dict[str, dict[str, Any]] = {}
    for point_name, coord in coords_by_name.items():
        baseline: dict[str, Any] = {"PointName": point_name}
        point = current_by_name.get(point_name, {})
        complete = True
        for field in ("dX", "dY", "dH"):
            axis = field_axis(field)
            assert axis is not None
            coord_value = metric_value(coord, axis)
            deformation = metric_value(point, field)
            if coord_value is None or deformation is None:
                complete = False
                break
            baseline[axis] = coord_value - deformation / 1000.0
        if complete:
            initial_by_name[point_name] = baseline
        elif point_name in fallback_by_name:
            initial_by_name[point_name] = deepcopy(fallback_by_name[point_name])
    for point_name, initial in fallback_by_name.items():
        initial_by_name.setdefault(point_name, deepcopy(initial))
    return initial_by_name


def build_csv_rows(
    current_points: list[dict[str, Any]],
    previous_points: list[dict[str, Any]],
    initial_points: list[dict[str, Any]],
    current_coord_records: list[dict[str, Any]],
    previous_coord_records: list[dict[str, Any]],
    *,
    project_name: str,
    cadence: str,
    initial_time: str,
    previous_time: str,
    current_time: str,
    work_condition: str,
    influence_zone: str,
    adjustment_id: str,
    previous_adjustment_id: str,
    adjustment_net_id: str,
    plane_path: Path,
    height_path: Path,
    platform_status: str,
    cumulative_source: str,
    current_change_source: str,
) -> list[dict[str, str]]:
    previous_by_name = make_point_index(previous_points)
    current_coords_by_name = make_point_index_by_adjustment(current_coord_records, adjustment_id)
    previous_coords_by_name = make_point_index_by_adjustment(previous_coord_records, previous_adjustment_id)
    initial_by_name = make_point_index(initial_points)
    engineer_initial_by_name = derive_initial_coordinates(
        current_points,
        current_coord_records,
        adjustment_id,
        initial_points,
    )
    rows: list[dict[str, str]] = []
    for point in sorted(current_points, key=lambda row: str(row.get("PointName", ""))):
        point_name = str(point.get("PointName") or "").strip()
        if not point_name:
            continue
        prev = previous_by_name.get(point_name)
        initial = initial_by_name.get(point_name)
        current_coord = current_coords_by_name.get(point_name)
        previous_coord = previous_coords_by_name.get(point_name)
        for item_name, field in METRICS:
            if cumulative_source == "coordinate-formula":
                initial = engineer_initial_by_name.get(point_name) or initial_by_name.get(point_name)
                current_cumulative = coordinate_delta_mm(current_coord, initial, field)
                previous_cumulative = coordinate_delta_mm(previous_coord, initial, field)
                if current_cumulative is None:
                    current_cumulative = metric_value(point, field)
                if previous_cumulative is None:
                    previous_cumulative = metric_value(prev, field)
                source_note = (
                    "沉降=Z坐标差，东西向水平位移=Y坐标差，南北向水平位移=X坐标差；"
                    "累计=本批平差坐标-平台变形成果初值，本次=本批平差坐标-上期平差坐标"
                )
                initial_source = "全站仪自动化平台初始值（按平差坐标与累计dX/dY/dH反推并校核）"
            elif cumulative_source == "coord-minus-initial":
                current_cumulative = cumulative_from_initial(current_coord, initial, field)
                previous_cumulative = cumulative_from_initial(previous_coord, initial, field)
                if current_cumulative is None:
                    current_cumulative = metric_value(point, field)
                if previous_cumulative is None:
                    previous_cumulative = metric_value(prev, field)
                source_note = "累计变形按本批平差坐标-平台监测点配置X/Y/H计算"
                initial_source = "全站仪自动化平台初始值（监测点配置X/Y/H）"
            else:
                current_cumulative = metric_value(point, field)
                previous_cumulative = metric_value(prev, field)
                if current_cumulative is None:
                    current_cumulative = cumulative_from_initial(current_coord, initial, field)
                if previous_cumulative is None:
                    previous_cumulative = cumulative_from_initial(previous_coord, initial, field)
                source_note = "累计变形采用平台平差成果表dX/dY/dH字段，平台初始值X/Y/H用于高差和校核"
                initial_source = "全站仪自动化平台平差变形成果（dX/dY/dH）"
            current_change = None
            if current_change_source == "same-as-cumulative":
                current_change = current_cumulative
            elif cumulative_source == "coordinate-formula":
                current_change = coordinate_delta_mm(current_coord, previous_coord, field)
                if current_change is None and current_cumulative is not None and previous_cumulative is not None:
                    current_change = current_cumulative - previous_cumulative
            elif current_cumulative is not None and previous_cumulative is not None:
                current_change = current_cumulative - previous_cumulative
            row_initial = engineer_initial_by_name.get(point_name) if cumulative_source == "coordinate-formula" else initial
            if row_initial is None:
                row_initial = initial_by_name.get(point_name)
            rows.append(
                {
                    "project_name": project_name,
                    "period_label": f"{current_time} 平差后全站仪快报",
                    "report_cadence": cadence,
                    "report_start": previous_time,
                    "report_end": current_time,
                    "initial_time": initial_time,
                    "initial_source": initial_source,
                    "previous_time": previous_time,
                    "current_time": current_time,
                    "monitoring_item": item_name,
                    "monitoring_method": "自动化全站仪（平台平差后变形成果）",
                    "structure_zone": point_zone(point_name),
                    "point_id": point_name,
                    "ring_no": work_condition,
                    "position_label": point_position(point_name),
                    "influence_zone": influence_zone,
                    "current_change_mm": format_decimal(current_change),
                    "rate_mm_per_d": "",
                    "cumulative_mm": format_decimal(current_cumulative),
                    "warning_threshold_mm": "",
                    "alarm_threshold_mm": "",
                    "control_threshold_mm": "",
                    "same_direction_count": "",
                    "mean_rate_3_times_mm_per_d": "",
                    "validity": "有效",
                    "platform_warn_status": platform_status,
                    "note": (
                        f"由平差批次 {adjustment_id} 锁定；{source_note}；"
                        + (
                            "日变量/本次变量按本批累计值填列。"
                            if current_change_source == "same-as-cumulative"
                            else (
                                "本次变量=本批平差坐标-上期平差坐标。"
                                if cumulative_source == "coordinate-formula"
                                else "本次变量=本批累计-上一已完成平差批次累计。"
                            )
                        )
                    ),
                    "initial_x_m": format_coordinate(metric_value(row_initial, "X")),
                    "initial_y_m": format_coordinate(metric_value(row_initial, "Y")),
                    "initial_h_m": format_coordinate(metric_value(row_initial, "H")),
                    "adjustment_id": adjustment_id,
                    "adjustment_time": current_time,
                    "adjustment_net_id": adjustment_net_id,
                    "adjustment_report_plane": str(plane_path),
                    "adjustment_report_height": str(height_path),
                }
            )
    return rows


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as fout:
        writer = csv.DictWriter(fout, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in CSV_FIELDS})


def default_start_end() -> tuple[str, str]:
    now = datetime.now()
    start = now - timedelta(days=31)
    return start.strftime("%Y-%m-%d 00:00:00"), (now + timedelta(days=7)).strftime("%Y-%m-%d 23:59:59")


def main() -> None:
    default_start, default_end = default_start_end()
    parser = argparse.ArgumentParser(description="Fetch adjusted total-station data from the platform.")
    parser.add_argument("--base-url", default=os.getenv("DIBAO_PLATFORM_BASE_URL", ""))
    parser.add_argument("--prjid", default=os.getenv("DIBAO_PLATFORM_PRJID", ""))
    parser.add_argument("--adjust-net-id", help="Adjustment net id; if omitted, discover it from AdjustData.aspx.")
    parser.add_argument("--start-time", default=default_start)
    parser.add_argument("--end-time", default=default_end)
    parser.add_argument(
        "--report-cutoff-time",
        help="Only use finished adjustment batches at or before this report deadline, e.g. 2026-06-04 16:00:00.",
    )
    parser.add_argument(
        "--data-grace-minutes",
        type=int,
        default=0,
        help=(
            "Allow finished batches this many minutes after --report-cutoff-time. "
            "Use for scheduled reports that wait a few minutes for the platform's post-hour batch."
        ),
    )
    parser.add_argument(
        "--require-current-at-or-after-cutoff",
        action="store_true",
        help=(
            "Require the selected current adjustment batch to be at or after --report-cutoff-time. "
            "Use for scheduled reports so stale previous-period data cannot be mislabeled as the current report."
        ),
    )
    parser.add_argument("--page-size", type=int, default=100)
    parser.add_argument("--output-dir", type=Path, default=Path("平台数据输出"))
    parser.add_argument("--prefix", default=None)
    parser.add_argument("--project-name", default=os.getenv("DIBAO_PROJECT_NAME", "轨道交通控制保护区监测项目"))
    parser.add_argument("--report-cadence", default="15min")
    parser.add_argument(
        "--cumulative-source",
        choices=["platform-deformation", "coord-minus-initial", "coordinate-formula"],
        default="platform-deformation",
        help=(
            "Cumulative deformation source. Use platform-deformation for the platform's "
            "adjusted dX/dY/dH results; use coordinate-formula for the engineer workbook "
            "caliber: settlement=Z coordinate delta, displacement=Y coordinate delta, "
            "inclination from X coordinate delta; use coord-minus-initial only after project confirmation."
        ),
    )
    parser.add_argument(
        "--current-change-source",
        choices=["previous-batch", "same-as-cumulative"],
        default="previous-batch",
        help=(
            "How to fill current/daily change. previous-batch uses current cumulative minus "
            "previous finished batch; same-as-cumulative matches reports where daily change "
            "equals cumulative deformation."
        ),
    )
    parser.add_argument(
        "--previous-report-cutoff-time",
        help=(
            "Nominal previous report deadline used as the reference for current change. "
            "When set, current change uses the latest finished batch before this time plus grace."
        ),
    )
    parser.add_argument(
        "--previous-reference-time",
        help=(
            "Exact previous adjustment batch time to use for current change, e.g. "
            "2026-06-04 16:11:37. This overrides --previous-report-cutoff-time."
        ),
    )
    parser.add_argument(
        "--previous-data-grace-minutes",
        type=int,
        default=None,
        help="Grace minutes for --previous-report-cutoff-time; defaults to --data-grace-minutes.",
    )
    parser.add_argument("--display-current-time", help="Time label printed in report rows instead of the actual platform batch time.")
    parser.add_argument("--display-previous-time", help="Previous-time label printed in report rows instead of the actual reference batch time.")
    parser.add_argument(
        "--initial-time",
        default="全站仪自动化平台初始值",
        help="Displayed source/time for the cumulative deformation baseline. For automated reports, use platform initial values, not the manual initial-value report.",
    )
    parser.add_argument("--work-condition", default="{{施工工况}}")
    parser.add_argument("--influence-zone", default="{{影响范围}}")
    parser.add_argument("--cookie", help="Authenticated Cookie header copied from browser developer tools.")
    parser.add_argument("--username", default=os.getenv("DIBAO_PLATFORM_USER"))
    parser.add_argument("--password", default=os.getenv("DIBAO_PLATFORM_PASSWORD"))
    args = parser.parse_args()

    if not args.base_url or not args.prjid:
        raise SystemExit("Provide --base-url/--prjid or set DIBAO_PLATFORM_BASE_URL/DIBAO_PLATFORM_PRJID.")

    base_url = normalize_base_url(args.base_url)
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36",
            "X-Requested-With": "XMLHttpRequest",
        }
    )
    if args.cookie:
        apply_cookie_header(session, base_url, args.cookie)
    elif args.username and args.password:
        login(session, base_url, args.username, args.password)
    else:
        raise SystemExit("Provide --cookie or DIBAO_PLATFORM_USER/DIBAO_PLATFORM_PASSWORD.")

    ensure_project_context(session, base_url, args.prjid)
    adjust_net_id, adjust_net_name = (
        (args.adjust_net_id, args.adjust_net_id)
        if args.adjust_net_id
        else discover_adjust_net_id(session, base_url)
    )

    adjustment_page = fetch_adjustment_page(
        session,
        base_url,
        adjust_net_id,
        args.start_time,
        args.end_time,
        args.page_size,
    )
    batches = filter_batches_before_cutoff(
        finished_parent_batches(adjustment_page),
        args.report_cutoff_time,
        args.data_grace_minutes,
    )
    if len(batches) < 1:
        raise SystemExit("No finished adjustment batches found before the selected report cutoff/time range.")
    latest = batches[0]
    if args.require_current_at_or_after_cutoff and args.report_cutoff_time:
        latest_time = parse_platform_time(str(latest["SurveyTime"]))
        cutoff_time = parse_platform_time(args.report_cutoff_time)
        if latest_time < cutoff_time:
            grace_cutoff = cutoff_time + timedelta(minutes=args.data_grace_minutes)
            raise SystemExit(
                "No current-period adjustment batch is available. "
                f"Need {cutoff_time:%Y-%m-%d %H:%M:%S} <= batch <= {grace_cutoff:%Y-%m-%d %H:%M:%S}; "
                f"latest finished batch is {latest_time:%Y-%m-%d %H:%M:%S}."
            )
    previous = batches[1] if len(batches) > 1 else batches[0]
    if args.previous_reference_time:
        previous = find_batch_by_time(finished_parent_batches(adjustment_page), args.previous_reference_time)
    elif args.previous_report_cutoff_time:
        previous_grace = args.previous_data_grace_minutes
        if previous_grace is None:
            previous_grace = args.data_grace_minutes
        previous_batches = filter_batches_before_cutoff(
            finished_parent_batches(adjustment_page),
            args.previous_report_cutoff_time,
            previous_grace,
        )
        if not previous_batches:
            raise SystemExit("No finished previous-report reference batch found before the selected previous cutoff/time range.")
        previous = previous_batches[0]

    adjustment_id = str(latest["AdjNetDataSummID"])
    previous_id = str(previous["AdjNetDataSummID"])
    actual_current_time = format_platform_time(str(latest["SurveyTime"]))
    actual_previous_time = format_platform_time(str(previous["SurveyTime"]))
    current_time = args.display_current_time or actual_current_time
    previous_time = args.display_previous_time or actual_previous_time
    prefix = args.prefix or parse_platform_time(actual_current_time).strftime("%Y%m%d_%H%M%S_adjusted")

    plane_text = fetch_adjust_report_text(session, base_url, adjustment_id, 1)
    height_text = fetch_adjust_report_text(session, base_url, adjustment_id, 2)
    adjusted_coordinates = parse_adjusted_coordinates(plane_text, height_text)

    current_points = fetch_all_point_info(session, base_url, actual_current_time)
    previous_points = fetch_all_point_info(session, base_url, actual_previous_time)
    point_ids = [
        str(point.get("PointID"))
        for point in current_points
        if point.get("PointID") not in (None, "")
    ]
    initial_points = fetch_platform_initial_values(session, base_url)
    current_coord_records = fetch_point_coordinate_records(session, base_url, point_ids, actual_current_time)
    previous_coord_records = fetch_point_coordinate_records(session, base_url, point_ids, actual_previous_time)

    children = child_station_rows(adjustment_page, adjustment_id)
    station_detail2 = []
    if children and children[0].get("StationDataSummID"):
        station_detail2 = fetch_station_detail2(session, base_url, str(children[0]["StationDataSummID"]))

    output_dir = args.output_dir
    adjustment_json = output_dir / f"{prefix}_adjustment_page.json"
    initial_json = output_dir / f"{prefix}_platform_initial_values.json"
    current_json = output_dir / f"{prefix}_all_point_current.json"
    previous_json = output_dir / f"{prefix}_all_point_previous.json"
    current_coords_json = output_dir / f"{prefix}_point_coords_current.json"
    previous_coords_json = output_dir / f"{prefix}_point_coords_previous.json"
    station_json = output_dir / f"{prefix}_station_detail2.json"
    coords_json = output_dir / f"{prefix}_adjusted_coordinates.json"
    plane_path = output_dir / f"{prefix}_adjust_report_plane.txt"
    height_path = output_dir / f"{prefix}_adjust_report_height.txt"
    csv_path = output_dir / f"{prefix}_adjusted_total_station.csv"
    summary_path = output_dir / f"{prefix}_source_summary.md"

    write_json(adjustment_json, adjustment_page)
    write_json(initial_json, initial_points)
    write_json(current_json, current_points)
    write_json(previous_json, previous_points)
    write_json(current_coords_json, current_coord_records)
    write_json(previous_coords_json, previous_coord_records)
    write_json(station_json, station_detail2)
    write_json(coords_json, adjusted_coordinates)
    write_text(plane_path, plane_text)
    write_text(height_path, height_text)

    platform_status = f"IsTolerance={latest.get('IsTolerance')}; XCMC={latest.get('XCMC')}"
    rows = build_csv_rows(
        current_points,
        previous_points,
        initial_points,
        current_coord_records,
        previous_coord_records,
        project_name=args.project_name,
        cadence=args.report_cadence,
        initial_time=args.initial_time,
        previous_time=previous_time,
        current_time=current_time,
        work_condition=args.work_condition,
        influence_zone=args.influence_zone,
        adjustment_id=adjustment_id,
        previous_adjustment_id=previous_id,
        adjustment_net_id=adjust_net_id,
        plane_path=plane_path,
        height_path=height_path,
        platform_status=platform_status,
        cumulative_source=args.cumulative_source,
        current_change_source=args.current_change_source,
    )
    write_csv(csv_path, rows)

    summary = "\n".join(
        [
            f"# 平差后全站仪数据源摘要",
            "",
            f"- 平差网：{adjust_net_name}（ID={adjust_net_id}）",
            f"- 报表截止时间：{args.report_cutoff_time or '未指定，使用查询范围内最新已完成批次'}",
            f"- 出报取数宽限：{args.data_grace_minutes} 分钟",
            f"- 最新已完成平差：{actual_current_time}，平差ID={adjustment_id}",
            f"- 单次变化参考平差：{actual_previous_time}，平差ID={previous_id}",
            f"- 报表显示时间：本次 {current_time} / 上次 {previous_time}",
            f"- 上期报表截止时间/参考批次：{args.previous_reference_time or args.previous_report_cutoff_time or '未指定，使用上一已完成批次'}",
            f"- 平差列表：{adjustment_json}",
            f"- 平台初始值：{initial_json}",
            f"- 本批平差坐标记录：{current_coords_json}",
            f"- 上批平差坐标记录：{previous_coords_json}",
            f"- 本批点位累计变形：{current_json}",
            f"- 上批点位累计变形：{previous_json}",
            f"- 累计量来源：{args.cumulative_source}；日变量/本次变量来源：{args.current_change_source}。",
            (
                "- 计算口径：沉降=本次/上次/初值平差Z坐标差，东西向水平位移=Y坐标差，南北向水平位移=X坐标差；"
                "东西向倾斜=上下点Y坐标位移差/上下点初始三维距离，南北向倾斜=上下点X坐标位移差/"
                "上下点初始三维距离；平台累计 `dX/dY/dH` 用于反推并校核自动化初值。"
                if args.cumulative_source == "coordinate-formula"
                else "- 初始/校核口径：平台初始值取全站仪自动化平台监测点配置 `X/Y/H`，用于高差、点位配置和校核；正式累计变形默认采用平台平差成果表 `dX/dY/dH`，不使用人工初始值报告重新计算。"
            ),
            f"- 平面平差报告：{plane_path}",
            f"- 高程平差报告：{height_path}",
            f"- 预处理测站数据：{station_json}",
            f"- 快报输入CSV：{csv_path}",
        ]
    )
    write_text(summary_path, summary)
    print(f"Wrote {csv_path}")
    print(f"Wrote {summary_path}")


if __name__ == "__main__":
    main()
