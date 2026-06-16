#!/usr/bin/env python3
"""
Evaluate rail-protection monitoring rows and append alarm/status fields.

Usage:
    python scripts/evaluate_alarms.py input.csv
    python scripts/evaluate_alarms.py input.csv --output evaluated.csv

Input should follow assets/data-input-template.csv. Per-row threshold columns
override inferred defaults:
    warning_threshold_mm, alarm_threshold_mm, control_threshold_mm
"""

from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path


STATUS_NO_THRESHOLD = "待确认阈值"


def parse_number(value: object) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text in {"-", "--", "/", "nan", "None"}:
        return None
    text = text.replace("±", "").replace("+/-", "").replace("mm", "").replace("MM", "")
    text = text.replace(",", "").strip()
    match = re.search(r"[-+]?\d+(?:\.\d+)?", text)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def cell(row: dict[str, str], *names: str) -> str:
    for name in names:
        if name in row and str(row[name]).strip():
            return str(row[name]).strip()
    return ""


def is_automated(item: str, method: str, point_id: str) -> bool:
    if "自动" in item or "auto" in method.lower() or "自动" in method:
        return True
    return bool(re.search(r"[A-Za-z]+z\d*", point_id))


def is_elevated_or_bridge(item: str, zone: str, point_id: str) -> bool:
    text = f"{item} {zone} {point_id}"
    return any(key in text for key in ("桥", "墩", "盖梁", "梁端", "倾斜", "QDCJ", "QDWJ", "QDQXJ"))


def inferred_thresholds(row: dict[str, str]) -> tuple[float | None, float | None, float | None, str]:
    item = cell(row, "monitoring_item", "监测项目")
    method = cell(row, "monitoring_method", "监测方法")
    zone = cell(row, "structure_zone", "监测部位")
    point_id = cell(row, "point_id", "测点", "点号")

    override = (
        parse_number(cell(row, "warning_threshold_mm", "预警值")),
        parse_number(cell(row, "alarm_threshold_mm", "报警值")),
        parse_number(cell(row, "control_threshold_mm", "控制值")),
    )
    if all(v is not None for v in override):
        return override[0], override[1], override[2], "row-override"

    if is_elevated_or_bridge(item, zone, point_id):
        return None, None, None, "project-required"

    if is_automated(item, method, point_id):
        return 5.0, 7.0, 10.0, "inferred-automated-underground"

    if point_id.startswith(("SYD", "XYD")) or "远端" in item:
        return 5.0, 7.0, 10.0, "inferred-manual-far-end"

    if (point_id.startswith("Xw") and not point_id.startswith("Xwz")) or "下行" in zone and "水平" in item:
        return 5.0, 7.0, 10.0, "inferred-manual-lower-horizontal"

    if point_id.startswith(("SD", "XD", "Sw")) or "道床" in item or ("上行" in zone and "水平" in item):
        return 3.0, 4.2, 6.0, "inferred-manual-trackbed-or-upper-horizontal"

    return 5.0, 7.0, 10.0, "inferred-general-default"


def data_alarm(row: dict[str, str], automated: bool) -> tuple[bool, str]:
    rate = parse_number(cell(row, "rate_mm_per_d", "daily_rate_mm_per_d", "变化速率"))
    same_count = parse_number(cell(row, "same_direction_count", "连续同向次数"))
    mean_rate = parse_number(cell(row, "mean_rate_3_times_mm_per_d", "三次平均速率"))

    if automated:
        if rate is not None and abs(rate) > 1.5:
            return True, "single-rate>1.5mm/d"
        if same_count is not None and mean_rate is not None and same_count >= 3 and abs(mean_rate) >= 0.5:
            return True, "3-same-direction-and-mean-rate>=0.5mm/d"
    else:
        if rate is not None and abs(rate) > 1.0:
            return True, "manual-rate>1.0mm/d"
    return False, ""


def classify(row: dict[str, str]) -> dict[str, str]:
    item = cell(row, "monitoring_item", "监测项目")
    method = cell(row, "monitoring_method", "监测方法")
    point_id = cell(row, "point_id", "测点", "点号")
    automated = is_automated(item, method, point_id)

    warning, alarm, control, threshold_source = inferred_thresholds(row)
    cumulative = parse_number(cell(row, "cumulative_mm", "累计值", "累计变量"))
    current = parse_number(cell(row, "current_change_mm", "本次变化量", "本次变量"))
    rate = parse_number(cell(row, "rate_mm_per_d", "daily_rate_mm_per_d", "变化速率"))
    is_data_alarm, data_reason = data_alarm(row, automated)

    if warning is None or alarm is None or control is None or cumulative is None:
        status = STATUS_NO_THRESHOLD
        is_comprehensive = False
    else:
        abs_cum = abs(cumulative)
        is_comprehensive = abs_cum >= alarm
        if abs_cum >= control:
            status = "红色预警"
        elif abs_cum >= alarm or is_data_alarm:
            status = "报警"
        elif abs_cum >= warning:
            status = "预警"
        else:
            status = "正常"

    action_map = {
        "正常": "持续按方案监测",
        "预警": "通知相关单位，关注趋势并加强巡视",
        "报警": "通知相关单位，加密监测并复核数据",
        "红色预警": "立即升级上报，组织专题研判并按要求处置",
        STATUS_NO_THRESHOLD: "补充当前项目阈值后再判定",
    }

    return {
        "current_change_num_mm": "" if current is None else f"{current:.3f}",
        "rate_num_mm_per_d": "" if rate is None else f"{rate:.3f}",
        "cumulative_num_mm": "" if cumulative is None else f"{cumulative:.3f}",
        "threshold_warning_mm": "" if warning is None else f"±{warning:g}",
        "threshold_alarm_mm": "" if alarm is None else f"±{alarm:g}",
        "threshold_control_mm": "" if control is None else f"±{control:g}",
        "threshold_source": threshold_source,
        "is_data_alarm": "是" if is_data_alarm else "否",
        "data_alarm_reason": data_reason,
        "is_comprehensive_alarm": "是" if is_comprehensive else "否",
        "status": status,
        "recommended_action": action_map[status],
    }


def evaluate(input_path: Path, output_path: Path) -> dict[str, int]:
    with input_path.open("r", encoding="utf-8-sig", newline="") as fin:
        reader = csv.DictReader(fin)
        if not reader.fieldnames:
            raise SystemExit("Input CSV has no header row.")
        rows = list(reader)

    extra_fields = [
        "current_change_num_mm",
        "rate_num_mm_per_d",
        "cumulative_num_mm",
        "threshold_warning_mm",
        "threshold_alarm_mm",
        "threshold_control_mm",
        "threshold_source",
        "is_data_alarm",
        "data_alarm_reason",
        "is_comprehensive_alarm",
        "status",
        "recommended_action",
    ]
    fieldnames = list(reader.fieldnames)
    for field in extra_fields:
        if field not in fieldnames:
            fieldnames.append(field)

    counts: dict[str, int] = {}
    evaluated = []
    for row in rows:
        result = classify(row)
        row.update(result)
        counts[result["status"]] = counts.get(result["status"], 0) + 1
        evaluated.append(row)

    with output_path.open("w", encoding="utf-8", newline="") as fout:
        writer = csv.DictWriter(fout, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(evaluated)

    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate monitoring alarm status from CSV rows.")
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("--output", "-o", type=Path)
    args = parser.parse_args()

    output = args.output or args.input_csv.with_name(f"{args.input_csv.stem}_evaluated.csv")
    counts = evaluate(args.input_csv, output)
    summary = ", ".join(f"{k}:{v}" for k, v in sorted(counts.items())) or "no rows"
    print(f"Wrote {output}")
    print(f"Status summary: {summary}")


if __name__ == "__main__":
    main()
