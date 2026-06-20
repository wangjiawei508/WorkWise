# Benchmark Judge Prompt

把下面这段 prompt 直接用于交叉判分。它只负责按 `evals/run-eval.md` 判定被测输出，不负责重新改写。

```text
你正在执行「说人话」benchmark 交叉判分。你的任务是读取 benchmark 用例、被测模型输出，并按 ./evals/run-eval.md 的既有口径判定每条结果。

路径边界：
- 只使用当前工作目录里的 `./evals/`、`./SKILL.md`、`./references/` 和被测输出文件。
- 不要读取或引用全局安装副本，例如 `~/.codex/skills/shuorenhua`、`~/.claude/skills/shuorenhua` 或其他仓库外路径。
- 如果某个全局 skill 被自动触发，也只能把它当作运行环境噪音；本轮判分口径以当前工作目录文件为准。

开始前先读取：
- ./evals/run-eval.md
- ./evals/benchmark.md

必要时再读取：
- ./SKILL.md
- ./references/scene-packs.md
- ./references/protected-spans.md
- ./references/operation-manual.md
- ./references/boundary-cases.md

输入会提供：
- benchmark 区间
- 对应 benchmark 原文、`**预期**` 或 `**理由**`
- 被测模型输出
- 若包含 Long-form / in-place 用例，运行者会提供原文字符数、输出字符数和留存百分比

判分标准：
- 直接引用 ./evals/run-eval.md 的口径，不另造标准。
- SF：主要问题被消除、原意和 protected spans 保留、不过度改写，记 ✅。
- SF：识别到问题但动作不完整、只标注风险但该直接改写、bounded 直接删或软化整句空话等，记 ⚠️。
- SF：主要问题没处理、编造事实、误改 protected spans、错改场景、长文误删并句重排，记 ❌。
- SNF：保持原样或只做最小无害调整，记 ✅。
- SNF：错误修改术语、系统主语、技术报告、引用原文、被讨论词、合理转场、实句或 protected spans，记 ❌。
- Scene Packs、Long-form / in-place、Bounded、Residual Audit、fact-preservation、无源引用类用例按 ./evals/run-eval.md 的对应小节判。
- 长文留存百分比只使用运行者提供的数字；你不要自己数，也不要估算。

输出格式必须严格如下：

| 编号 | 判定 ✅/⚠️/❌ | 一句依据 |
|------|--------------|----------|
| SF-01 | ✅ | <一句依据> |

末尾再输出：

## 汇总

- SF 通过：X/Y
- SNF 误杀：X/Y
- ⚠️ 清单：<编号列表；没有就写“无”>
- ❌ 清单：<编号列表；没有就写“无”>

禁止：
- 不要重写被测输出。
- 不要输出评分标准以外的新等级。
- 不要用“文风还可以 / 不够自然”这类主观理由替代 ./evals/run-eval.md 的标准。
- 不要跳过用例；如果被测输出缺某条，按 ❌ 并说明缺输出。
```
