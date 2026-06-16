#!/usr/bin/env python3
"""
Fetch Shanghai Huahuan static-level settlement data and normalize it for
crossing-stage high-frequency settlement reports.

Primary API:
    POST /API/finddateById
    POST /API/findSZByIdAndDate  (type=2 for settlement/static-level data)

Usage:
    python scripts/fetch_shhh_static_level.py --project-id 2428
    python scripts/fetch_shhh_static_level.py --project-id 2428 \
      --report-cutoff-time "2026-06-09 16:00:00" \
      --previous-time "2026-06-09 12:00:00" \
      --project-name "某轨道交通控制保护区监测项目"
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

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
    "sensor_sn",
    "point_name",
    "location",
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
    "current_value",
    "previous_value",
    "current_original_value",
    "previous_original_value",
    "unit",
    "shhh_project_id",
    "shhh_point_id",
    "shhh_status",
    "sample_minutes",
    "api_stat_date",
    "api_ref_date",
]


def parse_time(value: str) -> datetime:
    cleaned = str(value or "").strip().replace("T", " ")
    cleaned = re.sub(r"\.\d+$", "", cleaned)
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y/%m/%d %H:%M"):
        try:
            return datetime.strptime(cleaned, fmt)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse time: {value!r}")


def format_time(value: str | datetime) -> str:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    return parse_time(value).strftime("%Y-%m-%d %H:%M:%S")


def parse_number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", "")
    if text in {"-", "--", "/", "nan", "None", "null"}:
        return None
    match = re.search(r"[-+]?\d+(?:\.\d+)?", text)
    if not match:
        return None
    return float(match.group(0))


def cadence_delta(cadence: str) -> timedelta | None:
    cleaned = str(cadence or "").strip().lower().replace(" ", "")
    match = re.search(r"(\d+(?:\.\d+)?)", cleaned)
    if not match:
        return None
    value = float(match.group(1))
    if "min" in cleaned or "分钟" in cleaned:
        return timedelta(minutes=value)
    if "h" in cleaned or "小时" in cleaned:
        return timedelta(hours=value)
    return None


def safe_filename_part(value: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|\r\n\t]+', "_", str(value or "").strip())
    cleaned = re.sub(r"\s+", "", cleaned)
    return cleaned.strip(" ._") or "华桓静力水准项目"


def request_json(session: requests.Session, method: str, url: str, *, retries: int = 3, **kwargs: Any) -> Any:
    response: requests.Response | None = None
    for attempt in range(retries):
        response = session.request(method, url, **kwargs)
        if response.status_code not in {502, 503, 504}:
            break
        if attempt < retries - 1:
            time.sleep(2 * (attempt + 1))
    assert response is not None
    response.raise_for_status()
    text = response.text.strip()
    if not text:
        return None
    return json.loads(text)


def post_api(session: requests.Session, api_base: str, endpoint: str, payload: dict[str, Any], timeout: int) -> Any:
    url = api_base.rstrip("/") + "/" + endpoint.lstrip("/")
    return request_json(
        session,
        "POST",
        url,
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=timeout,
    )


def get_latest_times(session: requests.Session, api_base: str, project_id: str, timeout: int) -> dict[str, str]:
    data = post_api(session, api_base, "/API/finddateById", {"id": str(project_id)}, timeout)
    if not isinstance(data, dict) or not data.get("success"):
        raise SystemExit(f"finddateById failed: {data}")
    payload = data.get("data") or {}
    current = payload.get("currentTimePoint")
    previous = payload.get("lastTimePoint")
    if not current or not previous:
        raise SystemExit(f"finddateById did not return current/last time: {data}")
    return {"current": format_time(str(current)), "previous": format_time(str(previous)), "raw": data}


def fetch_settlement(
    session: requests.Session,
    api_base: str,
    project_id: str,
    current_time: str,
    previous_time: str,
    sensor_type: int,
    direction: int,
    sample_minutes: int,
    timeout: int,
) -> dict[str, Any]:
    payload = {
        "id": int(project_id),
        "statDate": format_time(current_time),
        "endDate": format_time(previous_time),
        "type": int(sensor_type),
        "direction": int(direction),
        "sampMinutes": int(sample_minutes),
    }
    data = post_api(session, api_base, "/API/findSZByIdAndDate", payload, timeout)
    if not isinstance(data, dict) or not data.get("success"):
        raise SystemExit(f"findSZByIdAndDate failed: {data}")
    return {"request": payload, "response": data}


def fetch_raw_history(
    session: requests.Session,
    api_base: str,
    project_id: str,
    start_time: str,
    end_time: str,
    decimal_count: int,
    timeout: int,
) -> dict[str, Any]:
    payload = {
        "id": int(project_id),
        "statDate": format_time(start_time),
        "endDate": format_time(end_time),
        "decimalCount": int(decimal_count),
    }
    data = post_api(session, api_base, "/API/historyCurveByprojectId", payload, timeout)
    return {"request": payload, "response": data}


def validity_from_status(status: Any) -> str:
    if status in (None, ""):
        return "有效"
    try:
        status_int = int(status)
    except (TypeError, ValueError):
        return str(status)
    if status_int == 1:
        return "有效"
    if status_int == 0:
        return "离线/无效"
    return f"状态{status_int}"


def compute_rate(current_offset: float | None, current_time: str, previous_time: str) -> float | None:
    if current_offset is None:
        return None
    try:
        delta = parse_time(current_time) - parse_time(previous_time)
    except ValueError:
        return None
    days = delta.total_seconds() / 86400
    if days <= 0:
        return None
    return current_offset / days


def row_value(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in row and row[key] not in (None, ""):
            return row[key]
    return ""


def normalize_rows(
    api_rows: list[dict[str, Any]],
    *,
    project_name: str,
    project_id: str,
    report_cadence: str,
    previous_time: str,
    current_time: str,
    sample_minutes: int,
    monitoring_item: str,
    structure_zone: str,
    ring_no: str,
    influence_zone: str,
    warning: str,
    alarm: str,
    control: str,
    initial_time: str,
    note_prefix: str,
) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    for item in api_rows:
        point_name = str(row_value(item, "name") or row_value(item, "sn") or row_value(item, "id") or "").strip()
        current_offset = parse_number(row_value(item, "curOffset"))
        cumulative = parse_number(row_value(item, "totalOffset"))
        unit = str(row_value(item, "unit") or "mm").strip() or "mm"
        status = row_value(item, "status")
        validity = validity_from_status(status)
        current_row_time = str(row_value(item, "curTime") or current_time)
        previous_row_time = str(row_value(item, "refTime") or previous_time)
        rate = compute_rate(current_offset, current_row_time, previous_row_time)
        notes = [note_prefix] if note_prefix else []
        if not row_value(item, "unit"):
            notes.append("接口unit为空，按静力水准沉降mm口径填报")
        if validity != "有效":
            notes.append(f"平台状态：{validity}")

        normalized.append(
            {
                "project_name": project_name,
                "period_label": f"{format_time(current_time)} 静力水准沉降快报",
                "report_cadence": report_cadence,
                "report_start": format_time(previous_time),
                "report_end": format_time(current_time),
                "initial_time": initial_time,
                "initial_source": "上海华桓静力水准自动化监测平台",
                "previous_time": format_time(previous_row_time),
                "current_time": format_time(current_row_time),
                "monitoring_item": monitoring_item,
                "monitoring_method": "上海华桓静力水准自动化监测平台",
                "structure_zone": structure_zone,
                "point_id": point_name,
                "sensor_sn": str(row_value(item, "sn") or ""),
                "point_name": point_name,
                "location": str(row_value(item, "location") or ""),
                "ring_no": ring_no,
                "position_label": str(row_value(item, "location") or ""),
                "influence_zone": influence_zone,
                "current_change_mm": "" if current_offset is None else f"{current_offset:.6f}",
                "rate_mm_per_d": "" if rate is None else f"{rate:.6f}",
                "cumulative_mm": "" if cumulative is None else f"{cumulative:.6f}",
                "warning_threshold_mm": warning,
                "alarm_threshold_mm": alarm,
                "control_threshold_mm": control,
                "same_direction_count": "",
                "mean_rate_3_times_mm_per_d": "",
                "validity": validity,
                "platform_warn_status": str(status),
                "note": "；".join(notes),
                "current_value": "" if parse_number(row_value(item, "curValue")) is None else str(row_value(item, "curValue")),
                "previous_value": "" if parse_number(row_value(item, "refValue")) is None else str(row_value(item, "refValue")),
                "current_original_value": "" if parse_number(row_value(item, "curOriginalValue")) is None else str(row_value(item, "curOriginalValue")),
                "previous_original_value": "" if parse_number(row_value(item, "refOriginalValue")) is None else str(row_value(item, "refOriginalValue")),
                "unit": unit,
                "shhh_project_id": str(project_id),
                "shhh_point_id": str(row_value(item, "id") or ""),
                "shhh_status": str(status),
                "sample_minutes": str(sample_minutes),
                "api_stat_date": format_time(current_time),
                "api_ref_date": format_time(previous_time),
            }
        )
    return normalized


def pick_abs_max(rows: list[dict[str, str]], field: str) -> dict[str, str] | None:
    best: dict[str, str] | None = None
    best_abs = -1.0
    for row in rows:
        value = parse_number(row.get(field))
        if value is None:
            continue
        if abs(value) > best_abs:
            best = row
            best_abs = abs(value)
    return best


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fout:
        writer = csv.DictWriter(fout, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def format_max(row: dict[str, str] | None, field: str) -> str:
    if not row:
        return "/"
    value = parse_number(row.get(field))
    if value is None:
        return f"{row.get('point_id') or '/'} /"
    return f"{row.get('point_id') or '/'} {value:.1f}mm"


def write_summary(
    path: Path,
    *,
    project_name: str,
    project_id: str,
    api_base: str,
    current_time: str,
    previous_time: str,
    sample_minutes: int,
    rows: list[dict[str, str]],
    csv_path: Path,
    latest_path: Path | None,
    data_path: Path,
    raw_path: Path | None,
) -> None:
    current_max = pick_abs_max(rows, "current_change_mm")
    cumulative_max = pick_abs_max(rows, "cumulative_mm")
    validity_counts: dict[str, int] = {}
    unit_counts: dict[str, int] = {}
    for row in rows:
        validity_counts[row.get("validity") or "未填写"] = validity_counts.get(row.get("validity") or "未填写", 0) + 1
        unit_counts[row.get("unit") or "未填写"] = unit_counts.get(row.get("unit") or "未填写", 0) + 1

    lines = [
        "# 上海华桓静力水准数据源摘要",
        "",
        f"- 项目名称：{project_name}",
        f"- 华桓项目ID：{project_id}",
        f"- API Base：{api_base.rstrip('/')}",
        f"- 本期时间：{format_time(current_time)}",
        f"- 参考时间：{format_time(previous_time)}",
        f"- 取样时长：{sample_minutes} 分钟",
        f"- 测点数量：{len(rows)}",
        f"- 本次最大：{format_max(current_max, 'current_change_mm')}",
        f"- 累计最大：{format_max(cumulative_max, 'cumulative_mm')}",
        f"- 数据状态：{', '.join(f'{k}{v}条' for k, v in sorted(validity_counts.items())) or '无'}",
        f"- 单位统计：{', '.join(f'{k}{v}条' for k, v in sorted(unit_counts.items())) or '无'}",
        "- 计算口径：`curOffset` 作为本期变化，`totalOffset` 作为累计变化；`curValue/refValue` 作为本期/参考测值追溯。",
        "- 正负号：按项目报表或方案说明执行；未提供时需人工确认。",
        f"- 规范化CSV：{csv_path}",
    ]
    if latest_path:
        lines.append(f"- 最新时间接口：{latest_path}")
    lines.append(f"- 沉降数据接口：{data_path}")
    if raw_path:
        lines.append(f"- 原始数据接口：{raw_path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def default_prefix(current_time: str, project_name: str) -> str:
    dt = parse_time(current_time)
    return f"{dt.strftime('%Y%m%d_%H%M%S')}_{safe_filename_part(project_name)}_shhh_static_level"


def resolve_times(args: argparse.Namespace, session: requests.Session) -> tuple[str, str, dict[str, Any] | None]:
    latest_raw = None
    current_time = args.report_cutoff_time
    previous_time = args.previous_time

    if not current_time:
        latest = get_latest_times(session, args.api_base, args.project_id, args.timeout)
        latest_raw = latest["raw"]
        current_time = latest["current"]
        previous_time = previous_time or latest["previous"]

    if current_time and not previous_time:
        delta = cadence_delta(args.report_cadence)
        if delta is None:
            raise SystemExit("Cannot infer previous time from report cadence; pass --previous-time.")
        previous_time = format_time(parse_time(current_time) - delta)

    assert current_time and previous_time
    return format_time(current_time), format_time(previous_time), latest_raw


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch Shanghai Huahuan static-level settlement data.")
    parser.add_argument("--api-base", default=os.getenv("SHHH_API_BASE", "http://yun.shhhcl.com/TESTAPI"))
    parser.add_argument("--project-id", default=os.getenv("SHHH_PROJECT_ID", ""), help="Huahuan project id used by TESTAPI.")
    parser.add_argument("--project-name", default=os.getenv("DIBAO_PROJECT_NAME", "华桓静力水准自动化监测项目"))
    parser.add_argument("--report-cadence", default="4h")
    parser.add_argument("--report-cutoff-time", help="Current/stat time. If omitted, use finddateById currentTimePoint.")
    parser.add_argument("--previous-time", help="Reference/end time. If omitted, use finddateById lastTimePoint.")
    parser.add_argument("--samp-minutes", type=int, default=60, help="API sampling duration in minutes.")
    parser.add_argument("--direction", type=int, default=0)
    parser.add_argument("--sensor-type", type=int, default=2, help="findSZByIdAndDate type; 2 means settlement.")
    parser.add_argument("--monitoring-item", default="结构沉降")
    parser.add_argument("--structure-zone", default="")
    parser.add_argument("--ring-no", default="")
    parser.add_argument("--influence-zone", default="")
    parser.add_argument("--initial-time", default="上海华桓静力水准自动化平台初始值")
    parser.add_argument("--warning-threshold-mm", default="")
    parser.add_argument("--alarm-threshold-mm", default="")
    parser.add_argument("--control-threshold-mm", default="")
    parser.add_argument("--note-prefix", default="")
    parser.add_argument("--output-dir", type=Path, default=Path("平台数据输出"))
    parser.add_argument("--prefix", help="Output file prefix. Defaults to current time + project name.")
    parser.add_argument("--fetch-raw-history", action="store_true")
    parser.add_argument("--raw-window-minutes", type=int, default=10)
    parser.add_argument("--raw-decimal-count", type=int, default=4)
    parser.add_argument("--timeout", type=int, default=30)
    args = parser.parse_args()
    if not args.project_id:
        raise SystemExit("Provide --project-id or set SHHH_PROJECT_ID.")

    session = requests.Session()
    current_time, previous_time, latest_raw = resolve_times(args, session)
    settlement = fetch_settlement(
        session,
        args.api_base,
        args.project_id,
        current_time,
        previous_time,
        args.sensor_type,
        args.direction,
        args.samp_minutes,
        args.timeout,
    )
    api_rows = settlement["response"].get("data") or []
    if not isinstance(api_rows, list):
        raise SystemExit(f"Unexpected settlement data payload: {settlement['response']}")

    normalized = normalize_rows(
        api_rows,
        project_name=args.project_name,
        project_id=args.project_id,
        report_cadence=args.report_cadence,
        previous_time=previous_time,
        current_time=current_time,
        sample_minutes=args.samp_minutes,
        monitoring_item=args.monitoring_item,
        structure_zone=args.structure_zone,
        ring_no=args.ring_no,
        influence_zone=args.influence_zone,
        warning=args.warning_threshold_mm,
        alarm=args.alarm_threshold_mm,
        control=args.control_threshold_mm,
        initial_time=args.initial_time,
        note_prefix=args.note_prefix,
    )

    prefix = args.prefix or default_prefix(current_time, args.project_name)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    latest_path: Path | None = None
    if latest_raw is not None:
        latest_path = args.output_dir / f"{prefix}_latest_times.json"
        write_json(latest_path, latest_raw)
    data_path = args.output_dir / f"{prefix}_settlement_response.json"
    csv_path = args.output_dir / f"{prefix}_static_level_settlement.csv"
    summary_path = args.output_dir / f"{prefix}_source_summary.md"
    write_json(data_path, settlement)
    write_csv(csv_path, normalized)

    raw_path: Path | None = None
    if args.fetch_raw_history:
        end_dt = parse_time(current_time)
        start_dt = end_dt - timedelta(minutes=args.raw_window_minutes)
        raw = fetch_raw_history(
            session,
            args.api_base,
            args.project_id,
            format_time(start_dt),
            format_time(end_dt),
            args.raw_decimal_count,
            args.timeout,
        )
        raw_path = args.output_dir / f"{prefix}_raw_history.json"
        write_json(raw_path, raw)

    write_summary(
        summary_path,
        project_name=args.project_name,
        project_id=args.project_id,
        api_base=args.api_base,
        current_time=current_time,
        previous_time=previous_time,
        sample_minutes=args.samp_minutes,
        rows=normalized,
        csv_path=csv_path,
        latest_path=latest_path,
        data_path=data_path,
        raw_path=raw_path,
    )

    print(f"Wrote {csv_path}")
    print(f"Wrote {summary_path}")
    print(f"Rows: {len(normalized)}")


if __name__ == "__main__":
    main()
