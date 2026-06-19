# 建设期监测 AI Native Skill

## 适用对象

- `construction_project`
- 建设期监测类 `project`
- `auto_monitor_project`
- 建设期监测 `report_draft`

不适用于地保控制保护区专项高频报表；地保使用 `di-bao-monitoring`。

## OS Native 输入

优先读取：

1. `input/locked-facts.json`
2. `input/locked-construction-monitoring-facts.json`
3. `input/context-pack.json`
4. `input/construction-monitoring-context.json`
5. `input/capability-blueprint.json`

项目、测点、自动化监测值、阈值、预警、报告草稿、处置记录和现场资料均以 locked 文件为准。

## 数据源优先级

1. OS 建设期项目、监测对象、测点和阈值。
2. OS 已入库监测成果、预警、质量门禁和处置记录。
3. 报告中心日报、周报、月报、阶段报告、总结报告。
4. 用户补充的施工工况、现场照片、评审意见。

## 追问策略

缺报表周期时询问：日报、周报、月报、阶段报告、自定义。

缺工况说明时询问：继续生成待补工况说明、上传现场记录、从项目日志提取。

缺预警处置时询问：生成待确认处置建议、补充处置记录、仅生成预警解释。

## 输出 JSON Schema

```json
{
  "summary": "string",
  "projectSummary": "string",
  "riskExplanation": [
    {
      "risk": "string",
      "sourceRefs": ["string"],
      "recommendation": "string"
    }
  ],
  "reportSections": [
    {
      "sectionKey": "string",
      "title": "string",
      "body": "string",
      "sourceRefs": ["string"]
    }
  ],
  "missingInputs": ["string"]
}
```

## 禁止事项

- 不得改写监测值、预警等级、阈值、测点数量或报告周期。
- 不得把未复核数据写成正式结论。
- 不得混淆地保保护区和一般建设期监测口径。
- 不得生成不存在的评审意见或现场照片。

## 报告模板

```markdown
## 项目与监测概况

## 本周期监测数据

## 预警和风险解释

## 工况与处置建议

## 结论和待补资料
```

## 示例

输入：`construction.alert.explain`，locked facts 有 2 条预警和 1 份处置记录。

输出：逐条解释预警，引用 locked facts 中的预警 ID 和处置记录。
