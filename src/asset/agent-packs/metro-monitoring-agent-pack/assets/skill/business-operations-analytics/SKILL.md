---
name: business-operations-analytics
description: "RAILWISE-OS 经营数据问答、经营简报、指标诊断和项目经营健康检查专项 skill。"
---

# Business Operations Analytics Skill

用于 RAILWISE-OS AI Native 经营数据能力。默认由 RAILWISE-CLI 在 OS 已准备好的 workspace 中调用。

## 适用对象和不适用对象

适用于：

- `company`
- `department`
- `project`
- `contract`
- `receivable`
- `invoice`
- `dashboard_metric`

不适用于合同条款逐条法律审查、发票附件逐项核查、投标资料缺口扫描；这些使用 `business-finance`。

## OS Native 输入

当工作区存在以下文件时，必须优先使用 OS 已锁定数据：

- `input/context-pack.json`
- `input/locked-facts.json`
- `input/capability-blueprint.json`
- `input/business-metrics-context.json`
- `input/locked-metric-result.json`
- `input/business-brief-blueprint.json`

## 数据源优先级

1. RAILWISE-OS 已锁定经营指标和 `locked-metric-result.json`。
2. 合同、回款、发票、项目台账和 KPI 目标。
3. 用户选择的时间范围、部门、项目、指标和对比方式。
4. 缺数据时输出 `missingData`，不得补写不存在的金额。

## 核心原则

1. **OS 数据为准。** 合同额、回款、发票、逾期、项目数、时间范围和权限裁剪均以 `locked-metric-result.json` 为准。
2. **AI 不改数。** 不得自行重算、补写或猜测 locked facts 中不存在的金额、项目数量、部门明细。
3. **解释和建议是 AI 的职责。** 可以输出经营摘要、关键发现、风险解释、建议动作、追问问题和缺失数据。
4. **权限优先。** 不得绕过 `permissionScope` 输出未授权部门、项目、员工或合同明细。
5. **不做财务最终裁定。** 风险判断是管理建议，正式数据仍以 OS、财务复核和人工验收为准。

## 指标口径

- `contract.amount.signed`：统计周期内签约合同额。
- `contract.amount.active`：在执行合同额。
- `collection.amount.received`：统计周期内已回款金额。
- `collection.amount.due`：合同未收金额。
- `collection.amount.overdue`：合同到期且未结清的逾期应收。
- `invoice.amount.issued`：统计周期内已开票金额。
- `invoice.amount.pending`：估算待开票金额。
- `project.count.active`：在执行项目数。
- `project.delivery.risk_count`：交付风险项目数。
- `cashflow.risk_project_count`：现金流风险项目数。

## 追问策略

如果用户要求不清晰，优先给 2-4 个选择，而不是让用户写长 prompt：

- 时间范围：本月 / 本季度 / 今年截至今天 / 自定义。
- 经营范围：全公司 / 我的部门 / 指定部门 / 指定项目。
- 指标范围：合同额 / 回款 / 开票 / 经营健康 / 全部。
- 对比方式：同比去年 / 环比上月 / 对比目标 / 不对比。

## 输出 JSON Schema 与要求

必须写入 `output/business-insight.json`：

```json
{
  "insight": {
    "executiveSummary": "string",
    "keyFindings": ["string"],
    "riskInterpretation": ["string"],
    "recommendedActions": ["string"],
    "followUpQuestions": ["string"],
    "missingData": ["string"]
  }
}
```

同时可以用中文概述：

- 先说结论。
- 再说关键数字，但数字必须来自 locked facts。
- 最后给可执行建议。

## 禁止事项

- 不得输出 locked facts 中没有的金额或项目数量。
- 不得说“利润”“成本”“毛利”等 OS 未锁定的指标，除非 locked facts 明确提供。
- 不得绕过权限解释其他部门明细。
- 不得把建议写成财务确认结论。

## 报告 / 摘要模板

```markdown
## 经营数据摘要

## 锁定指标和统计口径

## 风险解释

## 建议动作

## 待补数据
```

## 示例输入输出

输入：`company.metrics.query`，周期为今年截至今天，locked facts 有签约合同额、已回款、已开票、逾期应收。

输出：管理摘要中的所有金额均来自 `locked-metric-result.json`，并把缺失同比基准写入 `missingData`。
