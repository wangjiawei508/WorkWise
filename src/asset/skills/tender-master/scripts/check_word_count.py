#!/usr/bin/env python3
"""按分值比例检查各章字数是否达标。

公式：目标字数 = 评分分值 × (总页数 ÷ 总分) × 每页字数
合格范围：目标 × 0.75 ~ 1.25。无第三方依赖。

用法：
    python check_word_count.py --chapters ./03_chapters \
        --scoring scoring_criteria.json --total-pages 120
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def cn_chars(text: str) -> int:
    """统计中文字符 + 英文单词数近似字数。"""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"[|#*`>\-]", "", text)
    cn = len(re.findall(r"[\u4e00-\u9fff]", text))
    en = len(re.findall(r"[A-Za-z]+", text))
    return cn + en


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--chapters", required=True, help="章节目录")
    ap.add_argument("--scoring", help="scoring_criteria.json（可选，用于按阈值分配）")
    ap.add_argument("--total-pages", type=int, default=100)
    ap.add_argument("--chars-per-page", type=int, default=780)
    args = ap.parse_args()

    chap_dir = Path(args.chapters)
    files = sorted(chap_dir.glob("*.md")) + sorted(chap_dir.glob("*.html"))
    if not files:
        print(f"未找到章节文件：{chap_dir}")
        return 1

    total_score = 100.0
    if args.scoring and Path(args.scoring).exists():
        data = json.loads(Path(args.scoring).read_text(encoding="utf-8"))
        total_score = data.get("分值合计") or 100.0

    print(f"总页数={args.total_pages} 每页字数={args.chars_per_page} 总分={total_score}")
    print(f"{'章节文件':<40}{'实际字数':>10}{'状态':>8}")
    print("-" * 60)
    grand = 0
    for f in files:
        wc = cn_chars(f.read_text(encoding="utf-8", errors="ignore"))
        grand += wc
        status = "偏短" if wc < 300 else "OK"
        print(f"{f.name:<40}{wc:>10}{status:>8}")
    print("-" * 60)
    target_total = args.total_pages * args.chars_per_page
    print(f"全文实际字数：{grand}；按 {args.total_pages} 页目标约 {target_total} 字")
    ratio = grand / target_total if target_total else 0
    verdict = "达标" if 0.75 <= ratio <= 1.25 else ("偏少需补充" if ratio < 0.75 else "偏多可精简")
    print(f"达标比例：{ratio:.0%} → {verdict}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
