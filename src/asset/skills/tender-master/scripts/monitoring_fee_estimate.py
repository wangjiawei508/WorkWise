#!/usr/bin/env python3
"""工程监测报价估算辅助（2002版《工程勘察收费标准》变形监测路径）。

计价路径：工作量(点·次/米·次) × 2002标准单价 = 基础费
         → +技术工作费(默认22%) → ×最终报价折扣率(默认30%) → 分项/合计
无第三方依赖。单价须由用户填 2002 标准实际值，脚本不内置费率。
输出为估算草稿，最终报价由人工核定。

用法：
    python monitoring_fee_estimate.py --config fee_config.json --out 报价明细.md
    python monitoring_fee_estimate.py                # 交互式录入
配置示例见文件末尾 __doc_example__ 或 --sample 生成。
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SAMPLE = {
    "项目名称": "XX轨道交通保护区第三方监测",
    "技术工作费率": 0.22,
    "折扣率": 0.30,
    "备注": "单价请填2002标准实际值；次数用已知点数基准校正，勿用累计次数虚高",
    "监测项目": [
        {"项目": "竖向位移(沉降)", "计量单位": "点·次", "数量基准": 120, "监测次数": 90, "单价": 0.0},
        {"项目": "水平位移", "计量单位": "点·次", "数量基准": 60, "监测次数": 90, "单价": 0.0},
        {"项目": "隧道收敛", "计量单位": "点·次", "数量基准": 40, "监测次数": 90, "单价": 0.0},
        {"项目": "深层水平位移(测斜)", "计量单位": "米·次", "数量基准": 300, "监测次数": 30, "单价": 0.0},
        {"项目": "地下水位", "计量单位": "点·次", "数量基准": 15, "监测次数": 60, "单价": 0.0},
    ],
}


def finite_number(value: object, label: str, *, minimum: float = 0.0, maximum: float | None = None) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{label}必须是数字") from error
    if not math.isfinite(number):
        raise ValueError(f"{label}必须是有限数字")
    if number < minimum:
        raise ValueError(f"{label}不得小于{minimum:g}")
    if maximum is not None and number > maximum:
        raise ValueError(f"{label}不得大于{maximum:g}")
    return number


def estimate(cfg: dict) -> dict:
    tech_rate = finite_number(cfg.get("技术工作费率", 0.22), "技术工作费率", maximum=10)
    discount = finite_number(cfg.get("折扣率", 0.30), "折扣率", maximum=1)
    items = cfg.get("监测项目")
    if not isinstance(items, list) or not items:
        raise ValueError("监测项目必须是非空数组")
    rows = []
    base_total = 0.0
    for index, it in enumerate(items, 1):
        if not isinstance(it, dict):
            raise ValueError(f"监测项目[{index}]必须是对象")
        name = str(it.get("项目", "")).strip()
        if not name:
            raise ValueError(f"监测项目[{index}]缺少项目名称")
        qty = finite_number(it.get("数量基准"), f"{name}.数量基准")
        times = finite_number(it.get("监测次数"), f"{name}.监测次数")
        price = finite_number(it.get("单价"), f"{name}.单价")
        if qty == 0 or times == 0 or price == 0:
            raise ValueError(f"{name}的数量、次数和单价必须大于0，示例零值不能用于报价")
        workload = qty * times
        base = workload * price
        if not math.isfinite(base):
            raise ValueError(f"{name}计算结果超出安全范围")
        base_total += base
        rows.append({
            "项目": name,
            "计量单位": it.get("计量单位", ""),
            "数量基准": qty,
            "监测次数": times,
            "工作量": workload,
            "单价": price,
            "基础费": base,
        })
    tech_fee = base_total * tech_rate
    subtotal = base_total + tech_fee
    final = subtotal * discount
    return {
        "rows": rows, "base_total": base_total, "tech_rate": tech_rate,
        "tech_fee": tech_fee, "subtotal": subtotal, "discount": discount, "final": final,
    }


def render_md(cfg: dict, r: dict) -> str:
    L = [f"# 工程监测报价估算明细 · {cfg.get('项目名称','')}", "",
         "> 依据 2002 版《工程勘察收费标准》变形监测路径。**估算草稿，最终报价由人工核定。**",
         f"> 备注：{cfg.get('备注','')}", "",
         "| 监测项目 | 计量单位 | 数量基准 | 监测次数 | 工作量 | 单价(元) | 基础费(元) |",
         "|---|---|---:|---:|---:|---:|---:|"]
    for x in r["rows"]:
        L.append(f"| {x['项目']} | {x['计量单位']} | {x['数量基准']:.0f} | {x['监测次数']:.0f} | "
                 f"{x['工作量']:.0f} | {x['单价']:.2f} | {x['基础费']:.2f} |")
    L += ["", "## 费用汇总", "",
          f"- 基础费合计：**{r['base_total']:.2f}** 元",
          f"- 技术工作费（×{r['tech_rate']:.0%}）：{r['tech_fee']:.2f} 元",
          f"- 小计：{r['subtotal']:.2f} 元",
          f"- 最终报价折扣率：×{r['discount']:.0%}",
          f"- **最终估算报价：{r['final']:.2f} 元**", "",
          "## 人工复核项",
          "- [ ] 单价是否为 2002 标准现行实际值",
          "- [ ] 监测次数是否已用已知点数基准校正（非累计次数）",
          "- [ ] 监测等级/场地复杂程度调整系数是否已计",
          "- [ ] 测斜孔深、地下水位是否单独计价",
          "- [ ] 折扣率是否符合本次投标策略"]
    return "\n".join(L)


def interactive() -> dict:
    print("交互式录入（直接回车用示例默认）")
    cfg = {"项目名称": input("项目名称：").strip() or SAMPLE["项目名称"],
           "技术工作费率": float(input("技术工作费率(默认0.22)：") or 0.22),
           "折扣率": float(input("折扣率(默认0.30)：") or 0.30),
           "备注": SAMPLE["备注"], "监测项目": []}
    print("逐项录入监测项目，项目名留空结束：")
    while True:
        name = input("  项目名：").strip()
        if not name:
            break
        cfg["监测项目"].append({
            "项目": name,
            "计量单位": input("  计量单位(点·次/米·次)：").strip() or "点·次",
            "数量基准": float(input("  数量基准：") or 0),
            "监测次数": float(input("  监测次数：") or 0),
            "单价": float(input("  单价(元)：") or 0),
        })
    return cfg


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config")
    ap.add_argument("--out", default="监测报价明细.md")
    ap.add_argument("--sample", action="store_true", help="生成示例配置 fee_config.sample.json")
    args = ap.parse_args()

    if args.sample:
        Path("fee_config.sample.json").write_text(
            json.dumps(SAMPLE, ensure_ascii=False, indent=2), encoding="utf-8")
        print("已生成 fee_config.sample.json，请填入 2002 标准单价后 --config 使用。")
        return 0

    if args.config:
        config_path = Path(args.config)
        if config_path.is_symlink() or not config_path.is_file():
            print("配置必须是普通 JSON 文件且不能是符号链接。", file=sys.stderr)
            return 1
        try:
            cfg = json.loads(config_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            print(f"读取配置失败：{error}", file=sys.stderr)
            return 1
    elif sys.stdin.isatty():
        cfg = interactive()
    else:
        print("非交互执行必须提供 --config；如需示例请显式使用 --sample。", file=sys.stderr)
        return 1

    try:
        r = estimate(cfg)
    except (TypeError, ValueError) as error:
        print(f"报价配置无效：{error}", file=sys.stderr)
        return 1
    md = render_md(cfg, r)
    out_path = Path(args.out)
    if out_path.exists() and out_path.is_symlink():
        print("输出不能是符号链接。", file=sys.stderr)
        return 1
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(md, encoding="utf-8")
    print(md)
    print(f"\n→ {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
