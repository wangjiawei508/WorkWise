# v1.8.5 评测归档

> 复核时间：2026-05-27
> 复核方式：**静态复核**——对照 `SKILL.md` + `references/` 当前规则，对 70 条 benchmark 和 19 条 real samples 逐条走查，确认新增 long-form / in-place 用例能被规则解释。
> 这一轮不是模型实跑结果。下面表格里的"40/40""0/30"只代表"规则在这些用例上有明确处理路径"，不代表任何具体模型在线跑出来的通过率。
> 评测集：`evals/benchmark.md`（70 条：40 SF + 30 SNF）+ `evals/real-samples.md`（19 条整段样本）。

## 静态走查结果

| 维度 | 走查结果 | 说明 |
|------|----------|------|
| SF | 40/40 在当前规则下能命中并改掉主要问题 | 不等于模型实跑通过率 |
| SNF | 30/30 在当前规则下应放行，预计误杀为 0/30 | 不等于模型实跑误杀率 |
| Long-form / in-place（SF-39 / SF-40 / SNF-29 / SNF-30） | 4 条全部能按 `scope = in-place` 规则正确解释 | 见下方走查表 |
| Real Samples `RS-19` | 推荐改法保住五段结构、三处时间锚点和关键转场 | 字数留存符合 ≥ 0.90 目标 |

模型实跑留给后续轮次，需要在真实 codex / Claude Code 环境分别跑一遍，再对照本文件的静态走查校准。

## 本版增量

| 文件 | 增量 | 作用 |
|------|------|------|
| `SKILL.md` | 新增 edit scope：`structural / in-place` | 把"改写力度"和"能否动结构"拆成两条轴 |
| `references/operation-manual.md` | 二元对比、总结式收尾、narrator 腔、价值拔高骨架四类骨架补 `in-place` 替代动作 | 长文保长度时不默认删整句、并句 |
| `references/positive-style.md` | 长文重复、转场和节奏边界 | 防止把承担转场的承接句当水分删 |
| `references/scene-guardrails.md` | `public-writing` 长文默认触发 `in-place` | 给 issue #4 类场景一个默认入口 |
| `evals/benchmark.md` | SF-39 / SF-40 / SNF-29 / SNF-30 | 钉住 long-form in-place 的正例和误杀边界 |
| `evals/real-samples.md` | RS-19 + `长度节奏` 评分维度 | 用整段样本验证"保长度 ≠ 凑字数" |

## 新增 benchmark 走查

| 用例 | 场景 | 走查口径 | 是否能被规则解释 |
|------|------|----------|----------------|
| SF-39 | public-writing / long | `in-place` scope + narrator / 价值拔高 / 总结式收尾 | 是。去骨架但保留三段结构和关键句 |
| SF-40 | public-writing / long | `in-place` scope + 二元对比 / 价值拔高 / 总结式收尾 | 是。句内替代，不删段落 |
| SNF-29 | public-writing / long | 长文重复承担节奏 | 是。"我想慢一点说"重复句不应删 |
| SNF-30 | public-writing / long | 正常承接句承担转场 | 是。`另外 / 与此同时 / 也就是说` 不应误杀 |

## RS-19 走查

- 原文是高拟真合成长文，不直接转录 issue #4 原文，避免未授权使用真实用户材料。
- benchmark 里的 long-form 用例是节选，走查时按"用户已要求保长度 / 保节奏"触发 `in-place`。
- 推荐改法保留五段结构，不把文章压缩成摘要。
- 三处"我当时其实没有马上想明白"的时间锚点保留。
- `换个角度看`、`也就是说` 的转场功能保留。
- `系统性重塑 / 真正让我开始犹豫 / 这说明作者在持续反思表达边界` 等姿态层降到了句内替代。
- `长度节奏` 维度从 2 分提升到 5 分。

## 几个关键口径

- `in-place` 不是第四个力度档位，而是改写动作的边界。`minimal` 不因此变弱，`aggressive` 也不因此失效。
- 中文 `public-writing` 约 1000 字以上默认优先 `in-place`，但用户明确要求重写时仍可走 `structural`。
- 字数留存率目标 `≥ 0.90`，硬下限 `0.85`；这只是回读指标，不是让模型注水。
- 本版不改既有 66 条 benchmark 的判分口径，也不改三档力度本身。

## 结论

v1.8.5 处理的是长文改写的动作粒度问题：默认 structural 时多条规则叠加，容易把 1800 字压成 1500 / 1000 字；切到 `in-place` 后，先保字数、句数和段落节奏，再清理句内 AI 味。

后续需要做的事：真实模型实跑、用更多长文 bad case 校准"约 1000 字"阈值。
