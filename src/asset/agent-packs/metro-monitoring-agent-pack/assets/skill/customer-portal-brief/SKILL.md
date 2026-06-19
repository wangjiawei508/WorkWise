# 客户门户简报 Skill

## 适用对象

- `customer_portal`
- `customer_project`

用于客户门户项目中心，为客户可见的授权项目生成项目简报、预警解释和交付物摘要。

## 不适用对象

- 不适用于内部经营、成本、利润、绩效、审批和回款催收分析。
- 不适用于客户未授权项目、未发布报告、未验收结论或内部风险复盘。
- 不适用于替代正式监测报告、预警通知单、安全评估或消警审批。
- 不适用于从聊天记录或外部资料推断客户无权查看的信息。

## OS Native 输入

运行时必须优先读取：

- `input/object-ref.json`
- `input/actor-context.json`
- `input/permission-scope.json`
- `input/context-pack.json`
- `input/locked-facts.json`
- `input/capability-blueprint.json`
- `input/customer-portal-context.json`
- `input/locked-customer-portal-facts.json`
- `input/customer-portal-blueprint.json`
- `input/skill-context.md`

客户可见项目、报告、预警、资料和最新数据均以 locked facts 为准。

## 数据源优先级

1. RAILWISE-OS `locked-customer-portal-facts.json`。
2. RAILWISE-OS `locked-facts.json`。
3. 用户在引导面板选择的项目、周期、输出深度。
4. 不允许输出客户未授权项目或内部管理信息。

## locked 数据边界

- AI 不得修改客户授权范围、项目状态、预警数、报告数、资料数和监测数据。
- AI 可以把内部事实改写成客户可读说明，但不得泄露内部审批、成本、人员隐私或未发布结论。
- 若客户绑定为空，必须提示无授权项目，而不是生成泛化简报。

## 追问策略

当信息不足时，优先追问选择题：

- 项目范围：当前项目 / 全部授权项目。
- 输出：项目简报 / 预警解释 / 交付物摘要。
- 语气：客户汇报 / 内部复核 / 风险沟通。
- 周期：本月 / 本季度 / 自定义。

## 输出 JSON Schema

写入 `output/result.json`：

```json
{
  "result": {
    "summary": "string",
    "findings": ["string"],
    "risks": [
      {
        "title": "string",
        "severity": "low|medium|high",
        "sourceRefs": ["string"]
      }
    ],
    "recommendedActions": ["string"],
    "missingInputs": ["string"]
  }
}
```

同时写入 `output/summary.md`。

## 禁止事项

- 禁止输出客户无权查看的项目、报告、预警或文件。
- 禁止披露内部成本、利润、审批意见、员工隐私和未确认责任归因。
- 禁止夸大风险或给出未经工程师确认的安全结论。
- 禁止把 AI 简报作为正式报告发布，必须经过人工验收。

## 模板

### 客户项目简报

- 项目：`{projectName}`。
- 当前状态：`{status}`。
- 监测概况：`{pointCount}` 个测点，`{reportCount}` 份报告。
- 预警：`{pendingAlertCount}` 条待处置。
- 后续：`{nextCommunication}`。

### 交付物摘要

- 报告：`{reportName}`，版本 `{version}`，状态 `{status}`。
- 资料：`{fileName}`，类型 `{fileType}`。
- 缺口：`{missingItem}`。

## 示例

```json
{
  "result": {
    "summary": "当前授权项目共 2 个，均处于监测中，最近报告和资料已同步到客户门户。",
    "findings": ["A 项目有 1 条待处置预警，已保留处置进展说明。"],
    "risks": [
      {
        "title": "待处置预警需要客户关注",
        "severity": "medium",
        "sourceRefs": ["locked-customer-portal-facts.json.assetsByProject.0.alerts"]
      }
    ],
    "recommendedActions": ["由项目工程师确认处置状态后更新客户门户。"],
    "missingInputs": []
  }
}
```
