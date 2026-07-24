#!/usr/bin/env python3
"""从招标文件/解析结果中启发式提取资质/技术/商务/废标要求，输出 JSON。

无第三方依赖。用法：
    python extract_requirements.py 招标文件解析.md --out key_requirements.json
输出为辅助草稿，需人工核对（以招标原文为准，勿删减硬性条款）。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

CATS = {
    "资质要求": ("资质", "资格", "证书", "认证", "许可", "备案", "注册证"),
    "技术要求": ("技术参数", "性能", "功能", "配置", "指标", "≥", "≤", "不少于", "不超过", "支持"),
    "商务要求": ("工期", "质保", "服务期", "交付", "付款", "验收", "培训"),
    "废标风险": ("废标", "无效投标", "否决", "拒绝", "实质性", "★", "▲", "必须", "不得"),
}


def extract(text: str) -> dict:
    result = {k: [] for k in CATS}
    for raw in re.split(r"[。\n\r；;]", text):
        line = raw.strip().lstrip("|").strip(" |")
        if len(line) < 6:
            continue
        for cat, kws in CATS.items():
            if any(kw in line for kw in kws):
                result[cat].append(line[:200])
    for cat in result:
        seen, uniq = set(), []
        for it in result[cat]:
            if it not in seen:
                seen.add(it)
                uniq.append(it)
        result[cat] = uniq
    return result


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--out", default="key_requirements.json")
    args = ap.parse_args()
    text = Path(args.input).read_text(encoding="utf-8", errors="ignore")
    result = extract(text)
    Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    for cat, items in result.items():
        print(f"{cat}: {len(items)} 条")
    print(f"→ {args.out}")
    print("⚠️ 启发式结果仅供草稿，请人工核对，勿删减招标硬性条款。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
