---
name: chatgpt-comparison-detection
description: 文本 AI 痕迹审阅与人类表达对照 Skill。基于 HC3 对比语料和检测仓库资料，帮助判断文本是否有 ChatGPT/AI 写作特征，并给出修正建议。
allowed-tools:
  - Read
  - Write
  - Edit
metadata:
  trigger: 检测AI痕迹、判断是不是AI写的、ChatGPT检测、文本像不像人写
  source: Hello-SimpleAI/chatgpt-comparison-detection
---

# chatgpt-comparison-detection

这是对 `Hello-SimpleAI/chatgpt-comparison-detection` 的 WorkWise Skill 包装。它不是百分百准确的鉴定器；它用于审阅文本中的 AI 写作信号，并把问题转成可修改的建议。

## 使用场景

在以下需求中使用：

- 用户要求判断一段文字“像不像 AI 写的”。
- 用户需要定位中文或英文稿件中的 AI 痕迹。
- 用户想把检测结果转成可执行的改写清单。

## 审阅方法

1. 先判断文本类型：问答、说明文、报告、公众号文章、邮件、技术文档或其他。
2. 从语言层面检查：泛化表述、过度完整、模板过渡、缺少具体主体、缺少经验细节、过度平衡、结尾总结腔。
3. 从内容层面检查：是否只给一般性判断、是否缺少证据和场景、是否有“看似完整但不可落地”的段落。
4. 需要参考语料时，优先读取：
   - `README.md`
   - `HC3/README.md`
   - `HC3/indicating_words_zh_chatgpt.txt`
   - `HC3/indicating_words_zh_human.txt`
   - `linguistic_analysis/README.md`
5. 输出时给出“风险等级 + 具体问题 + 修改建议”。不要声称能给出司法、平台审核或学术检测结论。

## 输出格式

默认输出：

1. AI 痕迹风险：低 / 中 / 高
2. 主要命中点：列出 3-5 个最明显问题
3. 修改建议：给出可操作的删改方向
4. 可选改写：如果用户要求，给出改写后的文本
