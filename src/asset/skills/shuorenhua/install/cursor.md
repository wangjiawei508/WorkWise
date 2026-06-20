# Cursor / Windsurf 安装

## lite / full 怎么选

- `lite`：只加载 `SKILL.md`。适合临时改写和上下文紧张的编辑任务。
- `full`：加载 `SKILL.md` + `references/`。适合长期 rules、公开文本、技术文档和需要误杀防护的场景。

## 方式 1：项目 Rules

```bash
# Cursor
mkdir -p .cursor/rules
cp SKILL.md .cursor/rules/shuorenhua.md

# Windsurf
mkdir -p .windsurf/rules
cp SKILL.md .windsurf/rules/shuorenhua.md
```

上面是 lite 用法。如果需要参考文件（词表、结构反模式等），在对应目录下创建 `references/` 并复制进去，升级为 full 用法：

```bash
# Cursor
cp -r references .cursor/rules/

# Windsurf
cp -r references .windsurf/rules/
```

## 方式 2：全局 Rules

在 Cursor Settings > Rules 中粘贴 `SKILL.md` 的内容。

## 注意

Rules 文件会加载到上下文，但不等于会自动对所有输出套用。触发时建议明确说：

```text
用说人话规则改写这段文本。
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

token 紧张时用 lite；需要精细改写、Scene Packs 或误杀防护时用 full。

## 长文改写的三档 scope

长文（约 1000 字以上的 `public-writing`）改写时，可以指定三档 scope，和力度档位正交：

- `structural`：自由删句、并句、重排，去味最彻底，但长度不可控（实测同一篇可能 -18% 到 -39%）
- `bounded`（长文默认）：实句只做句内清理；整句空话不直接删，列成「建议删除（待确认）」清单交你拍板
- `in-place`：一句都不删，只做句内降调，适合“完全原样”的要求

在指令里直接说就行，例如：「用 bounded scope 改写，整句空话列出来给我确认、别直接删。」

## 验证

```text
用说人话规则改写这段文本：在当今快速发展的人工智能时代，如何打造一个真正赋能开发者的工具，已经成为业界不容忽视的关键议题。
```

输出不再保留 `打造 / 赋能 / 不容忽视 / 关键议题`，且信息没有改散，说明接好了。
