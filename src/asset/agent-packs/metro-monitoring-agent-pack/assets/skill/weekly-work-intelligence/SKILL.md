---
name: weekly-work-intelligence
description: "RAILWISE-OS 员工周报整理、部门周报汇总、公司运行状态扫描和周报风险追踪专项 skill。"
---

# Weekly Work Intelligence Skill

用于 RAILWISE-OS AI Native 工作周报和组织运行状态能力。默认由 RAILWISE-CLI 在 OS 已准备好的 workspace 中调用。

## 适用对象和不适用对象

适用于：

- `weekly_report`
- `weekly_report_period`
- `user`
- `department`
- `company`
- `project`
- `work_log`

不适用于员工绩效裁决、人格评价、薪酬建议或未经授权的跨部门明细查看。

## OS Native 输入

当工作区存在以下文件时，必须优先使用 OS 已锁定数据：

- `input/context-pack.json`
- `input/locked-facts.json`
- `input/capability-blueprint.json`
- `input/weekly-report-context.json`
- `input/locked-weekly-facts.json`
- `input/weekly-intelligence-blueprint.json`

## 数据源优先级

1. RAILWISE-OS 周报、工作日志、项目事件、任务和风险记录。
2. `locked-weekly-facts.json` 中的提交状态、未提交人员和权限裁剪结果。
3. 用户选择的周期、部门、项目和输出深度。
4. 缺数据时输出 `missingInputs` 或 follow-up，不得补写不存在的工作内容。

## 核心原则

1. **事实为准。** 周期、提交状态、周报原文、工作日志、风险来源和权限裁剪以 `locked-weekly-facts.json` 为准。
2. **不做人格评价。** 不得输出“态度差”“能力不足”“绩效差”等结论。
3. **聚焦运行状态。** 输出项目进展、风险问题、协同需求、管理层关注、下周重点和追踪事项。
4. **风险必须带来源。** 风险、协同事项、管理层关注必须引用 `sourceRef`。
5. **缺失要明确。** 未提交周报、缺少项目关联、缺少责任人时，写入 `missingInputs` 或 follow-up。

## 汇总层级

- 员工：本周完成、进行中、风险问题、下周计划、需协调事项。
- 项目：项目进展、停滞信号、风险、需要支持事项。
- 部门：部门重点、项目风险、协同需求、未提交周报。
- 公司：总体运行状态、经营信号、交付风险、人员负荷信号、管理层会议议题。

## 风险抽取维度

- 项目延期、停滞、资料缺失。
- 客户、回款、合同、开票相关风险。
- 质量、安全、预警、返工。
- 跨部门协同、资源冲突、人员高负荷。
- 反复出现的问题。

## 追问策略

如果用户要求不清晰，优先给 2-4 个选择：

- 周期：本周 / 上周 / 指定周。
- 层级：员工 / 部门 / 公司 / 项目。
- 输出深度：管理摘要 / 风险清单 / 完整汇总 / 跟进事项。
- 缺失周报处理：先提醒未提交人员 / 仍生成已提交摘要 / 只生成缺口清单。

## 输出 JSON Schema 与要求

必须写入 `output/weekly-intelligence.json`：

```json
{
  "weeklyInsight": {
    "summary": "string",
    "projectProgress": ["string"],
    "risks": [
      { "text": "string", "sourceRef": "string", "severity": "low|medium|high" }
    ],
    "coordinationNeeds": ["string"],
    "managementAttention": ["string"],
    "nextWeekFocus": ["string"],
    "followUpItems": [
      { "title": "string", "owner": "string", "sourceRef": "string" }
    ],
    "missingInputs": ["string"]
  }
}
```

## 禁止事项

- 不得给员工贴人格标签。
- 不得根据周报字数、条数直接判断员工绩效。
- 不得输出无来源风险。
- 不得绕过权限查看其他部门或个人周报。
- 不得把 AI 摘要作为正式考核结论。

## 报告 / 摘要模板

```markdown
## 本周运行状态

## 项目推进

## 风险和协同需求

## 管理层关注

## 下周重点和追踪事项
```

## 示例输入输出

输入：`weekly.report.company.operating.scan`，locked facts 有 18 份已提交周报和 3 个未提交记录。

输出：公司运行摘要引用每条风险的 `sourceRef`，未提交人员只出现在授权角色可见结果中。
