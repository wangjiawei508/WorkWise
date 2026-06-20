# Benchmark Eval Harness — 运行说明

> v1.9.0 起使用的模型实跑入口。
> Prompt 本体见 `./rewrite-prompt.md` 和 `./judge-prompt.md`。
> 这份 README 只解决"具体怎么跑一次"。

## 文件约定

工具本体（committed）：

| 角色 | 路径 |
|------|------|
| 被测模型改写 prompt | `automation/eval/rewrite-prompt.md` |
| 交叉判分 prompt | `automation/eval/judge-prompt.md` |
| 运行说明 | `automation/eval/README.md`（本文件） |

运行实例（local-only，`tasks/` 在 `.gitignore` 内）：

| 角色 | 路径 |
|------|------|
| Codex 改写输出 | `tasks/current/eval-runs/<YYYY-MM-DD>-codex/rewrite-<batch>.md` |
| Claude 改写输出 | `tasks/current/eval-runs/<YYYY-MM-DD>-claude/rewrite-<batch>.md` |
| Claude 判 Codex | `tasks/current/eval-runs/<YYYY-MM-DD>-judge/claude-judge-codex-<batch>.md` |
| Codex 判 Claude | `tasks/current/eval-runs/<YYYY-MM-DD>-judge/codex-judge-claude-<batch>.md` |

第一次使用前先建目录：

```bash
mkdir -p tasks/current/eval-runs/2026-06-18-codex \
  tasks/current/eval-runs/2026-06-18-claude \
  tasks/current/eval-runs/2026-06-18-judge
```

## 批次划分

默认按 5 批跑：

| batch | 区间 |
|-------|------|
| `SF01-14` | SF-01 到 SF-14 |
| `SF15-28` | SF-15 到 SF-28 |
| `SF29-41` | SF-29 到 SF-41 |
| `SNF01-16` | SNF-01 到 SNF-16 |
| `SNF17-31` | SNF-17 到 SNF-31 |

新增或补跑用例可以单独成批。v1.9.0 的 `SNF-32` 就按 `SNF32` 单条 follow-up 跑，输出命名为 `rewrite-SNF32.md` / `judge-...-SNF32.md`。

如果模型或供应商的上下文 / 输出限制跑不下 5 批之一，可以继续细拆，例如把 `SNF01-16` 拆成 `SNF01-08` 和 `SNF09-16`。文件名保持区间可读即可，最终汇总时按原区间合并。

交叉判分固定为：

- Codex 改写 → Claude 判
- Claude 改写 → Codex 判

## 改写批

Codex 改写一批：

```bash
codex exec -C . -s read-only --ephemeral \
  -o tasks/current/eval-runs/2026-06-18-codex/rewrite-SF01-14.md \
  '你正在执行说人话 benchmark 改写实跑。

请完整读取 ./automation/eval/rewrite-prompt.md，按其中 text 代码块里的 prompt 行事。
只使用当前工作目录下的 ./SKILL.md、./references/ 和 ./evals/，不要读取全局安装的 shuorenhua skill 副本。

本轮只处理 ./evals/benchmark.md 中 SF-01 到 SF-14。
请直接输出最终结果，不要附加过程叙述。'
```

Claude 改写一批：

```bash
claude --print --model opus \
  --name shuorenhua-eval-rewrite-SF01-14 \
  --disallowedTools Edit Write \
  > tasks/current/eval-runs/2026-06-18-claude/rewrite-SF01-14.md <<'EOF'
你正在执行说人话 benchmark 改写实跑。

请完整读取 ./automation/eval/rewrite-prompt.md，按其中 text 代码块里的 prompt 行事。
只使用当前工作目录下的 ./SKILL.md、./references/ 和 ./evals/，不要读取全局安装的 shuorenhua skill 副本。

本轮只处理 ./evals/benchmark.md 中 SF-01 到 SF-14。
请直接输出最终结果，不要附加过程叙述。
EOF
```

其余批次只替换区间和输出文件名。

## 判分批

Claude 判 Codex 改写：

```bash
claude --print --model opus \
  --name shuorenhua-eval-judge-codex-SF01-14 \
  --disallowedTools Edit Write \
  > tasks/current/eval-runs/2026-06-18-judge/claude-judge-codex-SF01-14.md <<'EOF'
你正在执行说人话 benchmark 交叉判分。

请完整读取 ./automation/eval/judge-prompt.md，按其中 text 代码块里的 prompt 行事。
只使用当前工作目录下的 ./evals/、./SKILL.md、./references/ 和被测输出文件，不要读取全局安装的 shuorenhua skill 副本。

benchmark 区间：SF-01 到 SF-14
被测输出：./tasks/current/eval-runs/2026-06-18-codex/rewrite-SF01-14.md

请直接输出判分表和汇总，不要重写被测输出。
EOF
```

Codex 判 Claude 改写：

```bash
codex exec -C . -s read-only --ephemeral \
  -o tasks/current/eval-runs/2026-06-18-judge/codex-judge-claude-SF01-14.md \
  '你正在执行说人话 benchmark 交叉判分。

请完整读取 ./automation/eval/judge-prompt.md，按其中 text 代码块里的 prompt 行事。
只使用当前工作目录下的 ./evals/、./SKILL.md、./references/ 和被测输出文件，不要读取全局安装的 shuorenhua skill 副本。

benchmark 区间：SF-01 到 SF-14
被测输出：./tasks/current/eval-runs/2026-06-18-claude/rewrite-SF01-14.md

请直接输出判分表和汇总，不要重写被测输出。'
```

其余批次只替换区间、被测输出和输出文件名。

## 小样试跑

调 prompt 时先跑小样，不要直接上全量：

```bash
mkdir -p tasks/current/eval-runs/2026-06-18-smoke-v2

codex exec -C . -s read-only --ephemeral \
  -o tasks/current/eval-runs/2026-06-18-smoke-v2/rewrite-SF01-05-SNF01-03.md \
  '请完整读取 ./automation/eval/rewrite-prompt.md，按其中 text 代码块里的 prompt 行事。
只使用当前工作目录下的 ./SKILL.md、./references/ 和 ./evals/，不要读取全局安装的 shuorenhua skill 副本。

本轮只处理 ./evals/benchmark.md 中 SF-01 到 SF-05，以及 SNF-01 到 SNF-03。
请直接输出最终结果，不要附加过程叙述。'

claude --print --model opus \
  --name shuorenhua-eval-smoke-judge \
  --disallowedTools Edit Write \
  > tasks/current/eval-runs/2026-06-18-smoke-v2/judge-SF01-05-SNF01-03.md <<'EOF'
请完整读取 ./automation/eval/judge-prompt.md，按其中 text 代码块里的 prompt 行事。
只使用当前工作目录下的 ./evals/、./SKILL.md、./references/ 和被测输出文件，不要读取全局安装的 shuorenhua skill 副本。

benchmark 区间：SF-01 到 SF-05，以及 SNF-01 到 SNF-03
被测输出：./tasks/current/eval-runs/2026-06-18-smoke-v2/rewrite-SF01-05-SNF01-03.md

请直接输出判分表和汇总，不要重写被测输出。
EOF
```

小样只看格式是否可对照：

- 每条改写输出都有 `## <编号>`。
- 每条都有固定判定链。
- judge 只输出固定三列表格。
- 汇总里有 SF 通过、SNF 误杀、⚠️ / ❌ 清单。

如果格式不顺，最多改 prompt 后再跑一轮；第二轮仍不顺就停下，不要继续全量。
