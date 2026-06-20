# Claude Code 安装

## lite / full 怎么选

- `lite`：只加载 `SKILL.md`。适合临时改写和轻量审稿。
- `full`：加载 `SKILL.md` + `references/`。适合项目级安装、公开文本、技术文档和需要误杀防护的场景。

Claude Code 会基于 `SKILL.md` 开头的 description 自动发现并触发 skills 目录里的 skill，装好即用。

## 方式 1：项目级

```bash
mkdir -p .claude/skills/shuorenhua
cp SKILL.md .claude/skills/shuorenhua/
cp -r references .claude/skills/shuorenhua/
```

这是 full 用法，也是项目级安装的默认建议。规则跟项目一起进版本管理，团队成员 clone 即用。

## 方式 2：全局

```bash
git clone https://github.com/MrGeDiao/shuorenhua.git
mkdir -p ~/.claude/skills
cp -r shuorenhua ~/.claude/skills/shuorenhua
```

整个仓库拷进去即可，多出来的 evals、install 文件不影响触发。想要最小安装，只拷 `SKILL.md`（lite）或 `SKILL.md` + `references/`（full）。

## 方式 3：跟随更新

```bash
git clone https://github.com/MrGeDiao/shuorenhua.git
ln -s "$PWD/shuorenhua" ~/.claude/skills/shuorenhua
```

软链接指向本地仓库，之后 `git pull` 即升级，不用重新拷贝。

## 触发说明（可选）

Claude Code 会基于 SKILL.md 开头的 description 自动触发这个 skill。如果你想在长期项目里提高命中稳定性、或限定它只处理对外文本，可以在项目的 `CLAUDE.md` 里补一段触发说明（可选，不是必需）：

```markdown
## 写作风格
当任务涉及“去 AI 味”“说人话”“自然一点”“别像模板”这类改写时，遵循 `.claude/skills/shuorenhua/SKILL.md`。
对外文本优先按它处理；代码、日志、配置和命令输出不套这个 skill。
```

## 使用

对话里直接说：

```text
用说人话规则改写这段文本。
```

或者更具体：

```text
把这段 status 更新按说人话规则轻改，保留术语和系统主语，不要改成口语闲聊体。
```

如果你想先判断"哪里像 AI"，不要直接改稿：

```text
先不要改写，只按 annotation mode 标出下面这段文字里的问题：...
```

适合这几类场景：

- 你想先看这段话该不该改
- 你要做审稿或 review，不想直接替作者重写
- 你怀疑有无源引用、语域混搭或工程师腔，但还不想动正文

处理无源引用时，可以指定模式：

```text
用说人话规则改写这段文本，无源引用按 audit-only 处理。
```

三种模式：`rewrite-safe`（默认用于 chat/public-writing，直接删无证据权威铺垫）、`audit-only`（默认用于 docs/status，只标缺来源）、`rewrite-with-placeholder`（保留结构但暴露缺来源）。不指定时按场景默认值走。

## 长文改写的三档 scope

长文（约 1000 字以上的 `public-writing`）改写时，可以指定三档 scope，和力度档位正交：

- `structural`：自由删句、并句、重排，去味最彻底，但长度不可控（实测同一篇可能 -18% 到 -39%）
- `bounded`（长文默认）：实句只做句内清理；整句空话不直接删，列成「建议删除（待确认）」清单交你拍板
- `in-place`：一句都不删，只做句内降调，适合“完全原样”的要求

在指令里直接说就行，例如：「用 bounded scope 改写，整句空话列出来给我确认、别直接删。」

## 验证

```text
在当今快速发展的人工智能时代，如何打造一个真正赋能开发者的工具，已经成为业界不容忽视的关键议题。
```

输出不再保留 `打造 / 赋能 / 不容忽视 / 关键议题`，且信息没有改散，说明接好了。
