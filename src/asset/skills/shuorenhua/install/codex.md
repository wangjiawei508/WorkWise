# Codex 安装 / 使用

## lite / full 怎么选

- `lite`：只加载 `SKILL.md`。适合单次临时改写、上下文紧张、只想先压掉明显模板感的场景。
- `full`：加载 `SKILL.md` + `references/`。适合长期项目、README / release note / issue 回复、技术文档和需要误杀防护的场景。

## 方式 1：项目内长期使用（推荐）

把 skill 文件放进项目：

```bash
mkdir -p shuorenhua
cp SKILL.md shuorenhua/
cp -r references shuorenhua/
```

这是 full 用法，也是项目内长期使用的默认建议。

在 `AGENTS.md` 里写清楚触发条件和适用边界：

```markdown
## 写作风格
当任务涉及"去 AI 味""说人话""自然一点""别像模板"这类改写时，遵循 `shuorenhua/SKILL.md`。
对外文本优先按它处理；代码、日志、配置和命令输出不套这个 skill。
```

这样规则跟项目一起版本管理，团队成员也能复用。

## 方式 2：单次改写

在仓库根目录运行，让 Codex 先读取 `SKILL.md` 再改写：

```bash
codex exec -C . "读取 ./SKILL.md，按其中规则改写以下文本：..."
```

不需要修改项目文件，适合临时使用。这是 lite 用法；如果要处理公开文本、技术边界或 Scene Packs，建议同时让 Codex 读取 `references/` 下的相关文件。

如果你想先判断“哪里像 AI”，不要直接改稿，可以这样用：

```bash
codex exec -C . "读取 ./SKILL.md，只按 annotation mode 标出下面这段文字里的问题：..."
```

适合这几类场景：

- 你想先看这段话该不该改
- 你要做审稿或 review，不想直接替作者重写
- 你怀疑有无源引用、语域混搭或工程师腔，但还不想动正文

## 方式 3：全局 AGENTS

先把完整规则放到本地 skill 目录：

```bash
mkdir -p ~/.codex/skills/shuorenhua
cp SKILL.md ~/.codex/skills/shuorenhua/
cp -r references ~/.codex/skills/shuorenhua/
```

这是 full 用法。只复制 `SKILL.md` 也能用，但误杀防护和场景细分会弱一些。

再在全局 `AGENTS.md` 里写触发入口：

```bash
mkdir -p ~/.codex
cat >> ~/.codex/AGENTS.md <<'EOF'
当任务涉及"去 AI 味""说人话""自然一点""别像模板"这类改写时，使用本地 skill `shuorenhua`。
对外文本优先按它处理；代码、日志、配置和命令输出不套这个 skill。
EOF
```

全局入口只建议写触发条件，不建议把整份 `SKILL.md` 直接拼进全局规则。完整规则仍应放在项目内或本地 skill 目录里，按需读取更稳。

## 注意

"装了 skill"不等于 Codex 会无条件自动套用全部规则。你需要给它一个清楚的触发入口（`AGENTS.md`、项目提示，或在单次任务里明确要求读取 `SKILL.md`），它才会按规则处理。

## 长文改写的三档 scope

长文（约 1000 字以上的 `public-writing`）改写时，可以指定三档 scope，和力度档位正交：

- `structural`：自由删句、并句、重排，去味最彻底，但长度不可控（实测同一篇可能 -18% 到 -39%）
- `bounded`（长文默认）：实句只做句内清理；整句空话不直接删，列成「建议删除（待确认）」清单交你拍板
- `in-place`：一句都不删，只做句内降调，适合“完全原样”的要求

在指令里直接说就行，例如：「用 bounded scope 改写，整句空话列出来给我确认、别直接删。」

## 验证

```text
用说人话规则改写：在当今快速发展的人工智能时代，如何打造一个真正赋能开发者的工具，已经成为业界不容忽视的关键议题。
```

输出去掉了 `打造 / 赋能 / 不容忽视 / 关键议题`，但没把信息改空，说明接上了。
