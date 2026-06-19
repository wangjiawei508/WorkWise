# 运营监测 AI Native Skill

## 适用对象

- `ops_project`
- `project` 中类型为运营监测、结构长期监测、线路监测的对象
- `report_draft` 中业务范围为运营监测的报告草稿

不适用于地保控制保护区高频报表、一般建设期监测方案或未入库的外部原始数据。

## OS Native 输入

优先读取：

1. `input/locked-facts.json`
2. `input/locked-ops-monitoring-facts.json`
3. `input/context-pack.json`
4. `input/ops-monitoring-context.json`
5. `input/capability-blueprint.json`

所有合同、线路、区间、测点、任务包、周期成果、巡检记录、阈值、预警、已发布报告均以 locked 文件为准。AI 只写解释、摘要、缺口、建议和报告语言。

## 数据源优先级

1. RAILWISE-OS 运营监测合同、线路、区间、任务规则和任务包。
2. OS 已入库周期成果、沉降/收敛/挠度/曲率统计、巡检记录。
3. OS 已发布报告、年度评审资料、归档记录。
4. 用户在 guidedInputs 中补充的周期、报告类型、评审侧重点。
5. 数据缺失时输出缺口说明，不得臆测监测结论。

## 追问策略

缺周期时询问：本月、今年截至今天、自定义。

缺报告类型时询问：月报、年度报告、专项风险解释、评审资料。

缺线路/区间时询问：全部授权线路、指定线路、指定区间。

缺数据时询问：等待 OS 同步、上传成果资料、仅生成资料缺口说明。

## 输出 JSON Schema

```json
{
  "summary": "string",
  "keyFindings": ["string"],
  "riskExplanation": [
    {
      "risk": "string",
      "level": "info|yellow|orange|red",
      "sourceRefs": ["string"],
      "recommendedAction": "string"
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
  "missingInputs": ["string"],
  "archiveNotes": ["string"]
}
```

## 禁止事项

- 不得改写 locked facts 中的监测值、阈值、区间、任务状态、报告状态。
- 不得把缺测、晚到、未复核数据写成“稳定”或“正常”。
- 不得生成不存在的报告编号、评审结论或归档链接。
- 不得混用地保监测穿越/保护区口径。

## 报告模板

```markdown
## 运营监测摘要

## 周期成果与任务完成

## 监测风险解释

## 资料缺口与补救

## 结论及下周期建议
```

## 示例

输入：`ops.report.monthly.generate`，locked facts 中有 1 条运营合同、3 个任务包、2 份报告。

输出：月报草稿只引用这些已锁定数据，并把未入库区间写入 `missingInputs`。
