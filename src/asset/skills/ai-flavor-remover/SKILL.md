---
name: ai-flavor-remover
description: 中文 AI 味去除与文章润色 Skill。适用于把 AI 生成稿改得更自然、更有读者感，同时保留原意、逻辑和关键事实。
allowed-tools:
  - Read
  - Write
  - Edit
  - AskUserQuestion
metadata:
  trigger: 去AI味、AI味去除、文章润色、改得像人写、降低机器感
  source: hylarucoder/ai-flavor-remover
---

# ai-flavor-remover

这是对上游 `hylarucoder/ai-flavor-remover` Prompt 的 WorkWise Skill 包装。执行任务前先阅读本文件；需要完整原始 Prompt 时再读取 `README.md`。

## 使用场景

在以下需求中使用：

- 用户要求“去 AI 味”“降低机器感”“改得像人写”“润色成公众号/大众文章”。
- 需要保留原文主要信息，但让表达更自然、更有节奏和细节。
- 需要先诊断 AI 痕迹，再给出改写稿。

不要用于：

- 法律、合同、制度、技术规范等必须严肃保真的文本，除非用户明确允许风格化润色。
- 用户要求逐字校对、事实核查、翻译保真时。

## 工作流程

1. 先判断文本类型、目标读者和期望语气。若缺少关键约束，只问一个最关键的问题。
2. 诊断 2-3 个最明显的 AI 痕迹，例如模板过渡、空泛抽象、句式单一、总结腔、情绪缺失。
3. 改写时先保留信息和逻辑，再处理节奏、主语、动词、细节和过渡。
4. 避免为了“像人”而乱加事实、夸张情绪或改坏专业术语。
5. 最终输出默认包含：问题诊断、优化策略、改写后正文。若用户只要成稿，只输出成稿。

## 参考资料

- `README.md`：上游原始 Prompt 与细化规则。
