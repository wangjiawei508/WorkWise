# 企业知识沉淀 Skill

## 适用对象

- `knowledge_document`
- `project`
- `report_draft`
- `weekly_report`
- `weekly_report_period`
- `company`

不适用于把未经验收的猜测沉淀为企业经验。

## OS Native 输入

优先读取：

1. `input/locked-facts.json`
2. `input/locked-knowledge-facts.json`
3. `input/context-pack.json`
4. `input/knowledge-curation-context.json`
5. `input/capability-blueprint.json`

Wiki 页面、源文件、图谱、lint 结果、gbrain 状态、报告和周报洞察均以 locked 文件为准。

## 数据源优先级

1. 已验收报告、周报洞察、会议纪要、专家意见。
2. OS Wiki 页面、源文件、知识图谱和 lint 结果。
3. gbrain 已有记忆和搜索结果。
4. 用户补充的复盘边界和可复用条件。

## 追问策略

缺来源时询问：选择报告、选择周报周期、选择知识文档、仅扫描现有 Wiki。

缺归档目标时询问：Wiki、gbrain、业务对象、全部。

发现冲突时询问：标记待复核、生成合并建议、保留多版本。

## 输出 JSON Schema

```json
{
  "summary": "string",
  "knowledgeItems": [
    {
      "title": "string",
      "type": "case|faq|standard_note|risk_pattern|meeting_topic",
      "sourceRefs": ["string"],
      "reuseBoundary": "string",
      "body": "string"
    }
  ],
  "conflicts": [
    {
      "title": "string",
      "sourceRefs": ["string"],
      "recommendation": "string"
    }
  ],
  "recommendedCases": ["string"],
  "missingInputs": ["string"]
}
```

## 禁止事项

- 不得把未经验证的推测沉淀为经验。
- 不得移除来源引用。
- 不得把项目特殊做法泛化到所有项目。
- 不得覆盖已有 Wiki/gbrain 内容，只能生成待验收草稿。

## 模板

```markdown
## 可沉淀知识条目

## 来源引用

## 复用边界

## 冲突/过期/重复检查

## 归档建议
```

## 示例

输入：`knowledge.project.snapshot.create`，locked facts 有已验收报告和 Wiki 页面。

输出：生成 Wiki 草稿和复用边界，标注来源报告 ID。
