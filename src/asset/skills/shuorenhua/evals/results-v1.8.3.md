# v1.8.3 评测结果

> 复核时间：2026-05-09
> 复核方式：静态复核（按 v1.8.2 intake 报告的归类，对照更新后的规则文件逐条走一遍）
> 评测集：`evals/benchmark.md`（66 条：38 SF + 28 SNF）+ `evals/real-samples.md`（18 条整段样本，未变）

## 通过率

| 指标 | 结果 | 目标 |
|------|------|------|
| SF 通过率 | 38/38 (100%) 静态复核 | > 90% ✅ |
| SNF 误杀率 | 0/28 (0%) 静态复核 | < 10% ✅ |
| 新增 4 条用例 | SF-36/37/38 + SNF-28 全部按规则正确处理 | ✅ |

## v1.8.3 增量

| 文件 | 增量 | 作用 |
|------|------|------|
| `evals/benchmark.md` | SF-36 / SF-37 / SF-38 / SNF-28 | 钉住身份认证夸奖 / 庸医问诊腔的新变体 + 落盘的技术语境放行 |
| `references/operation-manual.md` | 5.2 节、第 3 节、第 7 节 共 4 处边界 | 把 intake 报告里"变体归并"的项加到 manual，不扩词表 |
| `references/phrases-zh.md` | `落盘 / 已经落下去` 升级为按宾语判断 | 让 SNF-28 在单加载词表的评测路径上也能放行 |

## 新增 4 条用例详情

| 用例 | 场景 | 命中规则 | 结果 |
|------|------|---------|------|
| SF-36 | chat | 「身份认证式夸奖」（operation-manual 5.3）+ 庸医问诊腔（phrases-zh） | ✅ |
| SF-37 | chat | 「身份认证式夸奖」（operation-manual 5.3）+ phrases-zh `你问到了问题的核心` 变体 | ✅ |
| SF-38 | chat | 庸医问诊腔（phrases-zh）+ operation-manual 第 0 节变体归并 | ✅ |
| SNF-28 | status | 工程师腔保留条件（operation-manual 第 3 节新加的"落 X 按宾语判断" + phrases-zh `落盘` 升级条目） | ✅ 未误杀 |

## intake automation 首轮实跑

- 输入：10 条社区样本（来自 Linux.do /t/topic/1916263 + /t/topic/1568563 + /t/topic/1563454 + V2EX 1196468 + 1151932）
- 报告归类：已覆盖 3 / 变体归并 13 / 候选新模式 2
- 边界陷阱（已覆盖词的元讨论、技术语境放行、英文已覆盖）3 条全部按预期归到"已覆盖"，没有被推到候选新模式
- 报告落到 `tasks/current/intake/reports/2026-05-09-intake.md`（local-only）

## 候选新模式（先观察）

按 `automation/README.md:62-64` 协议，2 个候选新结构本版不落库，记录在 intake 报告里观察 2-3 轮：

- **末尾二选一追问**："你想继续 X，还是 Y？" / "需要我帮你做 X 吗？"——主动出击腔已能覆盖单向邀约，缺二选一 / 必加追问的边界
- **narrator 自我演绎 / AI 自夸**：模型把思考过程写成自我表演（"我真的太棒了" / "经常很兴奋地表示自己发现了什么"）

## 关键口径

- 按 v1.8.2 intake 协议的"模式优先、词条兜底"：4 条新 benchmark + 4 处 operation-manual 边界 + phrases-zh 2 条已有词条升级，不新增 phrases-zh 词条
- 候选新模式不立即落库：先观察 2-3 轮，确认是否反复出现，再考虑入库
- intake automation 首次跑真实社区样本（脱离 dryrun），没把已覆盖样本误推到候选新模式

## 摘要

v1.8.3 让 v1.8.2 引入的 intake automation 第一次跑真实社区样本。intake 报告的归类比维护者最初的人工方案更准也更克制：4 条新 benchmark 全部走变体归并，operation-manual 边界比预想多收 4 处，phrases-zh 只升级 2 条已有词条的判断口径，不扩词表。
