<h1 align="center">说人话：中文 AI 味清理 skill</h1>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.svg">
    <img src="assets/banner-light.svg" alt="说人话：中文 AI 味清理 skill — 先保信息，再谈风格" width="100%">
  </picture>
</p>

<p align="center">
  <strong>别让模型替你装腔。</strong>
</p>

<p align="center">
  给 Codex、Claude Code、Cursor、ChatGPT 和自建 agent 用。
  <br>
  改聊天、技术同步、README、论坛帖和中文长文：先保住事实，再把那股“一眼 AI”的腔调降下来。
</p>

<p align="center">
  <a href="https://github.com/MrGeDiao/shuorenhua/stargazers"><img src="https://img.shields.io/github/stars/MrGeDiao/shuorenhua?style=for-the-badge&amp;label=stars" alt="GitHub stars"></a>
  <a href="https://github.com/MrGeDiao/shuorenhua/releases"><img src="https://img.shields.io/github/v/release/MrGeDiao/shuorenhua?style=for-the-badge&amp;label=release" alt="GitHub release"></a>
  <a href="evals/benchmark.md"><img src="https://img.shields.io/badge/benchmark-73%20cases-2563eb?style=for-the-badge" alt="Benchmark: 73 cases"></a>
  <a href="evals/real-samples.md"><img src="https://img.shields.io/badge/real%20samples-19-16a34a?style=for-the-badge" alt="Real samples: 19"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/MrGeDiao/shuorenhua?style=for-the-badge" alt="License"></a>
</p>

<p align="center">
  <a href="#改成什么样">改成什么样</a> ·
  <a href="#30-秒上手">30 秒上手</a> ·
  <a href="#它怎么判断怎么改">怎么改</a> ·
  <a href="#评测">评测</a> ·
  <a href="#安装">安装</a> ·
  <a href="#常见问题">FAQ</a>
</p>

`说人话` 专治那种“每个字都对，但一看就不是你写的”中文。它不把空话包装得更漂亮，也不替你编新事实；它先护住版本、命令、责任和证据，再拆掉过度承接、工程师腔、小红书 AI 腔、翻译腔和无源权威铺垫。目标很简单：改完你敢直接发。

它适合这些场景：

| 场景 | 它会做什么 |
|------|------------|
| 日常聊天 | 删掉过度承接、推销式结尾和工程汇报腔，保留口语感 |
| 技术状态同步 | 保住事实、版本、命令、报错和责任归属，压低套话 |
| README / release note | 先讲清楚项目、变更、验证和限制，不写发布宣言 |
| 论坛帖 / issue 回复 | 像维护者在认真沟通，不像客服公告或营销稿 |
| 中文长文 | 句内清理保住节奏，整句空话列「建议删除」清单交你确认，不让长文越改越短 |

英文去 AI 味已经有 [stop-slop](https://github.com/hardikpandya/stop-slop) 和 [humanizer](https://github.com/blader/humanizer)。`说人话` 补的是中文这一层：互联网黑话、工程师腔、小红书 AI 腔、翻译腔、语域混搭、场景分档和事实保真。

## 改成什么样

### 接住体，先颁奖再共情

**改写前**

> 你不是敏感，你只是太久没被稳稳接住了。你问到了问题的核心。这次我懂了，我真的懂了。我必须很认真地说一句：你这种观察力和表达方式，绝对是顶刊作者的素养。

**改写后**

> 我在听。你要是愿意，可以继续说。

问题不在某个单词，而在整套姿态链：先替对方做心理判断，再表演共情，最后给对方颁奖。完整样本见 [evals/real-samples.md](evals/real-samples.md) RS-13。

### 工程师腔溢出到生活

**改写前**

> 先说结论：吃日料。我把你最近三周的外卖记录过了一遍，已经把差异收窄到两个选项，根因基本坐实是你上周说过腻了火锅。要不要我顺手帮你把 X 店的外卖也下了？你一回复我就上手。

**改写后**

> 吃日料吧，上周你说火锅腻了。要帮你下单吗？

这类文本的问题是把 debug 口吻带进生活对话。信息可以保留，工程报告感不需要保留。

### 公开介绍的宏大开场

**改写前**

> 在当今快速发展的人工智能时代，如何打造一个真正赋能开发者的工具，已经成为业界不容忽视的关键议题。

**改写后**

> AI 工具很多，真正能帮开发者把活做快、做稳的并不多。这个项目做的，就是把模型写出来的套话和表演感压下去，让结果更像人写的。

更多例子见 [references/examples.md](references/examples.md) 和 [evals/real-samples.md](evals/real-samples.md)。

## 30 秒上手

**Codex** — clone 后单次使用：

```bash
git clone https://github.com/MrGeDiao/shuorenhua.git && cd shuorenhua
codex exec -C . "读取 ./SKILL.md，按其中规则改写以下文本：……"
```

**Claude Code** — 放进 skills 目录，之后自动触发：

```bash
git clone https://github.com/MrGeDiao/shuorenhua.git
mkdir -p ~/.claude/skills
cp -r shuorenhua ~/.claude/skills/shuorenhua
```

装好后在对话里说「把这段去 AI 味」就会命中。想跟随仓库更新，用软链接代替 cp，见 [install/claude-code.md](install/claude-code.md)。

**ChatGPT** — 什么都不用装：[说人话 GPT](https://chatgpt.com/g/g-69d5d86a32608191b523efd7a4048736-shuo-ren-hua)（需 Plus / Pro），完整规则已内置。

**只想先看问题、不要改稿**：指令里加一句「按 annotation mode 只标注不改写」。

Cursor、OpenClaw 和自建 agent 见[安装](#安装)。

## 它怎么判断怎么改

`说人话` 不是见词就替换。一句话原则：

> **先保信息，再谈风格。**

完整流程固定六步：

1. 判场景：`chat / status / docs / public-writing`；命中 README、release note、论坛帖、issue 回复时，再进对应的 Scene Pack
2. 划保护片段：数字、版本、命令、路径、报错、引用原文先锁住
3. 按命中强度定力度（`minimal / standard / aggressive`），按能删到什么程度定 scope（`structural / bounded / in-place`）
4. 先按模式改，词表只兜底
5. 保真回读：事实、术语、语域、保护片段逐项过
6. 仍有残味才做第二遍 Residual Audit，只允许轻量修正

### 场景与力度

四个场景的默认力度：

| 大场景 | 默认强度 | 处理策略 |
|--------|----------|----------|
| `chat` | 轻 | 只砍明显套话，不把聊天改成公文 |
| `status` | 中 | 保留动作、状态、阻塞点和下一步 |
| `docs` | 中 | 技术表达优先，二次回读更保守 |
| `public-writing` | 重 | 全规则扫描，并按需要触发 Scene Packs |

### 按发布目的细分（Scene Packs）

可发布文本再按「发到哪里」细分，不是换语气，是按发布目的决定改法：

| 子场景 | 目标 | 容易修掉的问题 |
|--------|------|----------------|
| README | 第一屏说清“这是什么、给谁用、解决什么问题” | 标语堆叠、价值宣言、功能列表没重点 |
| release note | 列清变更、验证、限制和迁移影响 | 发版感言、过度庆祝、没说清测试 |
| forum post | 像维护者分享真实观察和取舍 | 公司公告腔、营销腔、空泛号召 |
| issue reply | 先确认问题、影响范围和下一步 | 客服式安抚、过度承诺、绕开复现条件 |

### 长文不缩水：三档 scope

长文按默认动作改写，删句、并句会叠加，1800 字可能被压到 1000 字；反过来一句不删，整句的空话又留在文里。所以长文把「删到什么程度」单独分成三档，和力度档位正交：

| scope | 删整句吗 | 适用 |
|-------|----------|------|
| `structural` | 自由删并重排 | 短文、明确要重写 |
| `bounded`（长文默认） | 整句空话列成「建议删除（待确认）」清单，删多少你拍板 | `public-writing` 长文 |
| `in-place` | 一句都不删，只句内降调 | 明确要求「完全原样」 |

<details>
<summary>为什么是这三档：issue #4 的实测过程</summary>

长文按默认 structural 动作改写时，删句、并句、重排段落容易叠加，一篇 1800 字的稿子可能被压到 1000 字（见 [#4](https://github.com/MrGeDiao/shuorenhua/issues/4)）。但反过来只做句内改写（`in-place`），整句级的空话（无源引用、价值拔高收尾）又删不掉、去味偏弱——v1.8.6 用真实模型实跑验证了这一点：两个模型在 `in-place` 下都把无源引用和拔高收尾整句留了下来。

`bounded` 的取舍：句内洗实句直接改、承担节奏的重复不动；整句都是空话的（剥掉引导词就什么都不剩）进「建议删除（待确认）」清单，删多少由用户拍板。这样既不像 `structural` 那样不可控地缩水，也不像 `in-place` 那样把整句空话留在文里。

</details>

### 哪些内容永远优先保护

这些内容默认优先保护：

| 类型 | 例子 |
|------|------|
| 数字和版本 | 日期、区间、单位、指标、版本号 |
| 代码上下文 | 命令、路径、参数、字段、配置项 |
| 事实归属 | 人名、组织名、责任主体、时间线 |
| 引用和证据 | 引号内原文、报错、状态码、实验结果 |

### 改完往哪个方向靠

清理不是只删词。它也会把文本往这些方向拉：

- 具体动作优先于抽象拔高
- 真主语和真动作优先于姿态层
- 允许轻微不对称，不把每句都抛光成同一种腔
- 按场景校准，不把聊天改成公告，也不把文档改成段子

## 评测

规则层覆盖 210+ 中文短语、96 条英文短语、19 类结构反模式。

当前评测集共 73 条：

| 类型 | 数量 | 目标 |
|------|------|------|
| SF | 41 | 应该改的文本必须命中并改掉主要问题 |
| SNF | 32 | 不该误杀的文本必须放行或轻提示 |
| Real Samples | 19 | 整段样本按自然、保真、可直接发三项评分，长文加 `长度节奏` |
| Scene Packs | 8 | README / release note / forum post / issue reply 的正反样本 |
| Long-form In-place | 4 | 长文保长度场景，检查字数留存、句数对齐和关键转场 |
| Bounded | 3 | 长文整句空话进删除清单，但不误删实句和节奏句 |

v1.9.0 起 benchmark 改为双模型实跑口径（Codex + Claude 交叉判分，见 [evals/results-v1.9.0.md](evals/results-v1.9.0.md)）；静态走查退为发版前快速自查。完整用例集见 [evals/benchmark.md](evals/benchmark.md)，整段真实样本见 [evals/real-samples.md](evals/real-samples.md)。`results-v1.8.6.md` 保留为 v1.8.6 首次模型实跑归档。

## 安装

| 平台 | 文档 |
|------|------|
| Codex | [install/codex.md](install/codex.md) |
| Claude Code | [install/claude-code.md](install/claude-code.md) |
| Cursor / Windsurf | [install/cursor.md](install/cursor.md) |
| OpenClaw | [install/openclaw.md](install/openclaw.md) |
| ChatGPT / Custom GPT | [install/chatgpt.md](install/chatgpt.md) |

核心只需要 `SKILL.md` 一个文件（lite）；长期项目、公开文本和需要误杀防护的场景，建议带上 `references/` 完整包（full）。

项目内长期使用时，可以在 `AGENTS.md` 加一段触发规则：

```markdown
## 写作风格
当任务涉及“去 AI 味”“说人话”“自然一点”“别像模板”这类改写时，遵循 `shuorenhua/SKILL.md`。
对外文本优先按它处理；代码、日志、配置和命令输出不套这个 skill。
```

## 常见问题

### 这是不是拿来骗 AI 检测器的？

不是。目标是减少模板感、表演感和语域漂移，让文本更自然、更可发布，不是绕过检测。

### 英文能不能用？

可以，但这是一个中文优先项目。英文支持主要用于清理常见英文套话和中英混写里的模板感。

### 为什么改完有时还是有 AI 味？

“去掉明显套路”不等于“拥有具体作者的个人表达”。当前版本更擅长清理模板感和表演感，还不负责拟合某个具体人的长期写作习惯。

### 会不会把技术文档改坏？

正常不会按聊天口吻去改技术文档。`docs`、`status`、`code-context` 都有更保守的保护策略，命令、路径、版本、报错和指标优先保真。

## 贡献：bad case 比 star 有用

欢迎提交新的评测样本、边界案例、真实问题案例、改写前后样本和误杀防护。

如果你遇到“改完还是像 AI”的具体文本，可以用 [bad case 模板](.github/ISSUE_TEMPLATE/bad-case.md) 提交。请先脱敏，不要贴未授权私聊全文、密钥、内部链接或真实个人身份信息。也可以直接贴到[征集 issue](https://github.com/MrGeDiao/shuorenhua/issues/5)。

在提交新词之前，先想一件事：

> 这是一个“新模式”，还是只是“现有模式的变体”？

详细规则见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 相关项目

- [stop-slop](https://github.com/hardikpandya/stop-slop)：英文 AI slop 规则和评分框架
- [humanizer](https://github.com/blader/humanizer)：英文 AI 模式分类
- [avoid-ai-writing](https://github.com/conorbronsdon/avoid-ai-writing)：AI 写作问题分类和严重度参考

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=MrGeDiao/shuorenhua&type=Date)](https://www.star-history.com/#MrGeDiao/shuorenhua&Date)

## 许可

[MIT](LICENSE)
