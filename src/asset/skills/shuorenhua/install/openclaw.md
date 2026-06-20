# OpenClaw 安装

## lite / full 怎么选

- `lite`：只放 `SKILL.md`。适合 token 紧张或只做基础改写。
- `full`：放 `SKILL.md` + `references/`。适合长期 workspace、对外文本、技术文档和需要误杀防护的场景。

## 1. 把 skill 放进 workspace

```bash
mkdir -p workspace/skills/shuorenhua
cp SKILL.md workspace/skills/shuorenhua/
cp -r references workspace/skills/shuorenhua/
```

上面是 full 用法。token 紧张时只放 `SKILL.md` 也能完成基础改写；`references/` 能让场景判断和误杀防护更稳。

## 2. 触发方式选一个

**方式 A：按需触发（默认）**

把文件放进 `workspace/skills/` 后，OpenClaw 会按 skill 的 `name` 和 `description` 判断何时启用。对话里说"用说人话规则改写"就能触发，不需要额外配置。

**方式 B：设为默认写作风格**

如果希望所有对外文本都自动套用，在 `workspace/SOUL.md` 中加：

```markdown
## 说人话
所有对外文本（消息、文档、摘要、公开写作）遵循 `skills/shuorenhua/SKILL.md` 的规则。
内部技术输出（代码、日志、配置）不受约束。
```

## 3. 同步到 VM

```bash
git add workspace/skills/shuorenhua
git commit -m "feat: add shuorenhua skill"
git push
```

VM 上 `git pull` 后即生效。如果 VM 配了自动拉取，push 之后直接就能用。

## 使用提示

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
用说人话规则改写这段文本：在当今快速发展的人工智能时代，如何打造一个真正赋能开发者的工具，已经成为业界不容忽视的关键议题。
```

输出里不再保留 `打造 / 赋能 / 不容忽视 / 关键议题`，且信息没有改散，说明 skill 生效了。
