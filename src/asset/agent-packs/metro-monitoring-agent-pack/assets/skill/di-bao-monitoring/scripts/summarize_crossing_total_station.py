#!/usr/bin/env python3
"""
Summarize automated total station rows for crossing-stage high-frequency reports.

Usage:
    python scripts/summarize_crossing_total_station.py input.csv
    python scripts/summarize_crossing_total_station.py input.csv --summary report.md

Input should follow assets/crossing-total-station-input-template.csv. The script
outputs an evaluated CSV plus a Markdown summary for filling the report template.
"""

from __future__ import annotations

import argparse
import csv
from collections import Counter, defaultdict
from pathlib import Path

from evaluate_alarms import cell, classify, parse_number


STATUS_RANK = {
    "待确认阈值": 0,
    "正常": 1,
    "预警": 2,
    "报警": 3,
    "红色预警": 4,
}


def read_rows(input_path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with input_path.open("r", encoding="utf-8-sig", newline="") as fin:
        reader = csv.DictReader(fin)
        if not reader.fieldnames:
            raise SystemExit("Input CSV has no header row.")
        rows = [dict(row) for row in reader]
    if not rows:
        raise SystemExit("Input CSV has no data rows.")
    return list(reader.fieldnames), rows


def first_value(rows: list[dict[str, str]], *names: str) -> str:
    for row in rows:
        value = cell(row, *names)
        if value:
            return value
    return ""


def format_num(value: float | None) -> str:
    if value is None:
        return "/"
    return f"{value:.1f}"


def point_label(row: dict[str, str]) -> str:
    return cell(row, "point_id", "测点", "点号") or "/"


def is_station_or_control_point(row: dict[str, str]) -> bool:
    point = point_label(row).upper()
    return point.startswith("CZ") or point.startswith("JD")


def pick_abs_max(rows: list[dict[str, str]], field: str) -> dict[str, str] | None:
    best_row = None
    best_value = -1.0
    for row in rows:
        value = parse_number(cell(row, field))
        if value is None:
            continue
        abs_value = abs(value)
        if abs_value > best_value:
            best_value = abs_value
            best_row = row
    return best_row


def worst_status(rows: list[dict[str, str]]) -> str:
    status = "待确认阈值"
    rank = -1
    for row in rows:
        row_status = cell(row, "status") or "待确认阈值"
        row_rank = STATUS_RANK.get(row_status, 0)
        if row_rank > rank:
            rank = row_rank
            status = row_status
    return status


def has_explicit_thresholds(row: dict[str, str]) -> bool:
    return all(
        parse_number(cell(row, field)) is not None
        for field in ("warning_threshold_mm", "alarm_threshold_mm", "control_threshold_mm")
    )


def force_missing_threshold(result: dict[str, str]) -> dict[str, str]:
    strict_result = dict(result)
    strict_result.update(
        {
            "threshold_warning_mm": "",
            "threshold_alarm_mm": "",
            "threshold_control_mm": "",
            "threshold_source": "missing-crossing-threshold",
            "is_comprehensive_alarm": "否",
            "status": "待确认阈值",
            "recommended_action": "补充当前项目阈值后再判定",
        }
    )
    return strict_result


def evaluate_rows(rows: list[dict[str, str]], allow_inferred_thresholds: bool) -> list[dict[str, str]]:
    evaluated = []
    for row in rows:
        result = classify(row)
        if not allow_inferred_thresholds and not has_explicit_thresholds(row):
            result = force_missing_threshold(result)
        new_row = dict(row)
        new_row.update(result)
        evaluated.append(new_row)
    return evaluated


def write_evaluated_csv(rows: list[dict[str, str]], fieldnames: list[str], output_path: Path) -> None:
    extra_fields = []
    for row in rows:
        for field in row:
            if field not in fieldnames and field not in extra_fields:
                extra_fields.append(field)

    with output_path.open("w", encoding="utf-8", newline="") as fout:
        writer = csv.DictWriter(fout, fieldnames=fieldnames + extra_fields)
        writer.writeheader()
        writer.writerows(rows)


def summary_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    grouped: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        if is_station_or_control_point(row):
            continue
        zone = cell(row, "structure_zone", "line_or_zone", "监测部位") or "未分区"
        item = cell(row, "monitoring_item", "监测项目") or "未分类监测项"
        grouped[(zone, item)].append(row)

    results = []
    for (zone, item), group in sorted(grouped.items()):
        current_row = pick_abs_max(group, "current_change_mm")
        cumulative_row = pick_abs_max(group, "cumulative_mm")
        results.append(
            {
                "structure_zone": zone,
                "monitoring_item": item,
                "current_point": point_label(current_row) if current_row else "/",
                "current_change_mm": format_num(
                    parse_number(cell(current_row or {}, "current_change_mm"))
                ),
                "current_point_cumulative_mm": format_num(
                    parse_number(cell(current_row or {}, "cumulative_mm"))
                ),
                "cumulative_point": point_label(cumulative_row) if cumulative_row else "/",
                "cumulative_point_current_mm": format_num(
                    parse_number(cell(cumulative_row or {}, "current_change_mm"))
                ),
                "cumulative_mm": format_num(
                    parse_number(cell(cumulative_row or {}, "cumulative_mm"))
                ),
                "status": worst_status(group),
            }
        )
    return results


def quality_notes(rows: list[dict[str, str]]) -> list[str]:
    notes = []
    validity_counts = Counter((cell(row, "validity") or "未填写") for row in rows)
    abnormal_validity = {
        name: count
        for name, count in validity_counts.items()
        if name not in {"有效", "正常", "未填写"}
    }
    if abnormal_validity:
        text = "、".join(f"{name}{count}条" for name, count in sorted(abnormal_validity.items()))
        notes.append(f"存在数据质量备注：{text}。")

    missing_values = 0
    for row in rows:
        if parse_number(cell(row, "current_change_mm")) is None or parse_number(
            cell(row, "cumulative_mm")
        ) is None:
            missing_values += 1
    if missing_values:
        notes.append(f"存在 {missing_values} 条本次或累计变量缺失，正式报表不得填 0。")

    threshold_missing = sum(1 for row in rows if cell(row, "status") == "待确认阈值")
    if threshold_missing:
        notes.append(f"存在 {threshold_missing} 条数据阈值待确认，需补充项目阈值后再定性。")

    return notes


def write_markdown_summary(rows: list[dict[str, str]], output_path: Path) -> None:
    monitoring_rows = [row for row in rows if not is_station_or_control_point(row)]
    station_control_count = len(rows) - len(monitoring_rows)
    summaries = summary_rows(rows)
    status_counts = Counter(cell(row, "status") or "待确认阈值" for row in monitoring_rows)

    project_name = first_value(rows, "project_name", "项目名称") or "{{项目全称}}"
    period_label = first_value(rows, "period_label", "报告编号") or "{{第N期}}"
    cadence = first_value(rows, "report_cadence", "出报间隔") or "{{15min/2h/4h}}"
    report_start = first_value(rows, "report_start", "统计开始") or "{{开始时间}}"
    report_end = first_value(rows, "report_end", "统计结束") or "{{结束时间}}"
    initial_time = first_value(rows, "initial_time", "初始采集时间") or "{{初始采集时间}}"
    previous_time = first_value(rows, "previous_time", "上次监测时间") or "{{上次监测时间}}"
    current_time = first_value(rows, "current_time", "本次监测时间") or "{{本次监测时间}}"

    lines = [
        f"# {project_name} 自动化全站仪穿越监测快报汇总",
        "",
        f"- 报告编号：{period_label}",
        f"- 出报间隔：{cadence}",
        f"- 报告统计时段：{report_start} 至 {report_end}",
        f"- 初始采集时间：{initial_time}",
        f"- 上次监测时间：{previous_time}",
        f"- 本次监测时间：{current_time}",
        f"- 状态统计：{', '.join(f'{name}{count}条' for name, count in sorted(status_counts.items()))}",
        "",
        "## 分区最大值汇总",
        "",
        "| 分区 | 监测项目 | 本次最大点号 | 本次(mm) | 该点累计(mm) | 累计最大点号 | 该点本次(mm) | 累计(mm) | 状态 |",
        "|---|---|---|---:|---:|---|---:|---:|---|",
    ]

    for row in summaries:
        lines.append(
            "| {structure_zone} | {monitoring_item} | {current_point} | {current_change_mm} | "
            "{current_point_cumulative_mm} | {cumulative_point} | {cumulative_point_current_mm} | "
            "{cumulative_mm} | {status} |".format(**row)
        )

    if station_control_count:
        lines.extend(
            [
                "",
                f"注：检测到 {station_control_count} 条测站/测量基点数据（如 CZ/JD 前缀），不参与监测点数量、最大值和数据表统计。",
            ]
        )

    notes = quality_notes(rows)
    if notes:
        lines.extend(["", "## 数据质量提示", ""])
        lines.extend(f"- {note}" for note in notes)

    lines.extend(
        [
            "",
            "## 填表提醒",
            "",
            "- 正式报表仍需补施工工况、施工进度、点位图、现场照片和结论。",
            "- 黄色/绿色/红色色标需按项目模板落到 Excel 或 PDF 可见表格中。",
            "- 本次最大和累计最大可能不是同一测点，填表时不要合并。",
        ]
    )

    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Summarize automated total station data for crossing high-frequency reports."
    )
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("--evaluated-output", "-o", type=Path)
    parser.add_argument("--summary", "-s", type=Path)
    parser.add_argument(
        "--allow-inferred-thresholds",
        action="store_true",
        help="Allow evaluate_alarms.py default thresholds when threshold columns are blank.",
    )
    args = parser.parse_args()

    fieldnames, rows = read_rows(args.input_csv)
    evaluated = evaluate_rows(rows, args.allow_inferred_thresholds)

    evaluated_output = args.evaluated_output or args.input_csv.with_name(
        f"{args.input_csv.stem}_crossing_evaluated.csv"
    )
    summary_output = args.summary or args.input_csv.with_name(
        f"{args.input_csv.stem}_crossing_summary.md"
    )

    write_evaluated_csv(evaluated, fieldnames, evaluated_output)
    write_markdown_summary(evaluated, summary_output)

    print(f"Wrote {evaluated_output}")
    print(f"Wrote {summary_output}")


if __name__ == "__main__":
    main()
