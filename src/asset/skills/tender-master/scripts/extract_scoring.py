#!/usr/bin/env python3
"""从招标文件/解析结果中启发式提取评分标准（技术评分），输出 JSON。

无第三方依赖。用法：
    python extract_scoring.py 招标文件解析.md --out scoring_criteria.json
输出仅为辅助草稿，需人工核对（分值、得分条件以招标原文为准）。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SCORE_RE = re.compile(r"(\d+(?:\.\d+)?)\s*分")
EXCLUDE = ("价格分", "报价评分", "商务评分", "价格评审")


def extract(text: str) -> list[dict]:
    items = []
    for raw in re.split(r"[\n\r]+", text):
        line = raw.strip().lstrip("|").strip()
        if not line or len(line) < 4:
            continue
        if any(x in line for x in EXCLUDE):
            continue
        m = SCORE_RE.search(line)
        if not m:
            continue
        score = float(m.group(1))
        if score <= 0 or score > 100:
            continue
        name = SCORE_RE.sub("", line).strip(" |：:—-")
        items.append({"评分项": name[:120], "分值": score, "原文行": line[:200]})
    # 去重
    seen, out = set(), []
    for it in items:
        key = (it["评分项"], it["分值"])
        if key not in seen:
            seen.add(key)
            out.append(it)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--out", default="scoring_criteria.json")
    args = ap.parse_args()
    text = Path(args.input).read_text(encoding="utf-8", errors="ignore")
    items = extract(text)
    total = sum(i["分值"] for i in items)
    result = {"技术评分项数": len(items), "分值合计": total, "评分项": items}
    Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"提取 {len(items)} 条技术评分项，合计 {total} 分 → {args.out}")
    print("⚠️ 启发式结果仅供草稿，请人工核对分值与得分条件。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
