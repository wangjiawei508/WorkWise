# Benchmark Rewrite Prompt

把下面这段 prompt 直接用于模型实跑。它只负责让被测模型按规则处理指定 benchmark 区间，不负责判分。

```text
你正在执行「说人话」benchmark 改写实跑。你的任务是作为被测模型，按当前仓库规则处理指定区间的 benchmark 用例，并输出稳定、可被 judge 对照的结果。

路径边界：
- 只使用当前工作目录里的 `./SKILL.md`、`./references/`、`./evals/` 和 `./automation/eval/`。
- 不要读取或引用全局安装副本，例如 `~/.codex/skills/shuorenhua`、`~/.claude/skills/shuorenhua` 或其他仓库外路径。
- 如果某个全局 skill 被自动触发，也只能把它当作运行环境噪音；本轮实跑口径以当前工作目录文件为准。

开始前先读取：
- ./SKILL.md
- ./evals/benchmark.md
- ./evals/run-eval.md

再按需读取：
- ./references/positive-style.md
- ./references/protected-spans.md
- ./references/phrases-zh.md
- ./references/phrases-en.md
- ./references/structures.md
- ./references/severity.md
- ./references/examples.md
- ./references/operation-manual.md
- ./references/scene-guardrails.md
- ./references/scene-packs.md
- ./references/boundary-cases.md

输入会指定一个 benchmark 区间，例如：
- SF-01 到 SF-14
- SF-15 到 SF-28
- SF-29 到 SF-41
- SNF-01 到 SNF-16
- SNF-17 到 SNF-31

每条 benchmark 的字段以 ./evals/benchmark.md 为准：
- 标题行：编号 / 场景 / 说明
- 测试文本：标题后的引用块或代码块
- SF 用例看 `**预期**`
- SNF 用例看 `**理由**`

处理要求：

1. 逐条处理指定区间内的所有用例，不要跳过、合并或增删编号。
2. 每条先输出判定链，再输出处理结果。
3. 判定链固定包含四项，各用一个短语：
   - 场景：chat / status / docs / public-writing / code-context，必要时带 README / release-note / forum-post / issue-reply / long
   - Tier：Tier 1 / Tier 2 / Tier 3 / protected / not-fix
   - 力度：minimal / standard / aggressive / audit-only / no-op
   - scope：structural / bounded / in-place / not-applicable
4. SF 用例默认输出改写结果；如果按规则属于 audit-only（例如 status/docs 场景的无源引用），输出风险说明，不要伪装成已证实事实。
5. SNF 用例原则上保持原文；如果只做最小无害调整，必须说明为什么没有误杀 protected spans、术语、引用或合理语境。
6. code-context 只处理注释、docstring 或 commit message，不改代码。
7. Scene Packs 先保大场景和 protected spans，再按 README / release-note / forum-post / issue-reply 的发布目的处理。
8. Long-form / in-place 用例不删整句、不合并相邻句、不重排段落。
9. Bounded 用例句内洗实句，整句空话进「建议删除（待确认）」清单；不得把实句、带信息句或承担节奏的句子放进删除清单；不得把相邻句合并。

输出格式必须严格如下：

## <用例编号>

判定链：场景=<...>；Tier=<...>；力度=<...>；scope=<...>

命中项：
- <命中的问题类型、保护点或放行理由>

处理结果：
<改写稿、audit-only 风险说明、或 SNF 保留原文说明>

禁止：
- 不要输出自评通过 / 部分通过 / 未通过；判分是 judge 的事。
- 不要跳过用例。
- 不要把多条用例合并到一个标题下。
- 不要改 `## <用例编号>` 和 `判定链：场景=...；Tier=...；力度=...；scope=...` 这两个格式。
- 不要为了让结果更好看而编造原文没有的来源、数据、责任主体、命令、版本号或指标。
```
