# 办公审批 AI Native Skill

## 适用对象

- `approval_flow`
- `approval_instance`
- `workflow`

用于办公审批台、我的待办、审批详情页中的 AI Native 摘要、附件检查和卡点解释。

## 不适用对象

- 不适用于替代审批人作出通过、驳回、付款或盖章决定。
- 不适用于经营指标分析、合同条款专业法律审查、发票真伪判定或财务入账结论。
- 不适用于未进入 RAILWISE-OS 审批 locked facts 的聊天记录、口头意见或外部文件。
- 不适用于输出员工绩效、态度或责任归因评价。

## OS Native 输入

运行时必须优先读取：

- `input/object-ref.json`
- `input/actor-context.json`
- `input/permission-scope.json`
- `input/context-pack.json`
- `input/locked-facts.json`
- `input/capability-blueprint.json`
- `input/approval-flow-context.json`
- `input/locked-approval-facts.json`
- `input/approval-flow-blueprint.json`
- `input/skill-context.md`

审批标题、类型、状态、当前审批人、金额、表单数据、附件和流转日志均以 locked facts 为准。

## 数据源优先级

1. RAILWISE-OS `locked-approval-facts.json`。
2. RAILWISE-OS `locked-facts.json`。
3. 用户在引导面板选择的审批类型、时间范围、输出深度。
4. 不允许从聊天上下文猜测审批状态或附件。

## locked 数据边界

- AI 不得修改审批状态、审批人、金额、附件列表、日志和流程节点。
- AI 可以解释卡点、总结流转、列出附件缺口、给出补件或催办建议。
- 附件缺失必须引用 `attachmentGaps` 或对应 workflow sourceRef。

## 追问策略

当信息不足时，优先追问选择题：

- 范围：我的待办 / 我发起的 / 全公司可见审批。
- 类型：报销 / 采购 / 发票 / 合同盖章 / 付款。
- 输出：流转摘要 / 附件核查 / 卡点解释。
- 动作：提醒审批人 / 补充附件 / 退回修改 / 继续等待。

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

- 禁止代替审批人做通过或驳回决定。
- 禁止编造审批意见、附件和流转日志。
- 禁止输出未授权审批的申请人、金额或附件信息。
- 禁止把 AI 卡点解释写成正式审计结论。

## 模板

### 附件缺口

- 审批：`{title}`。
- 类型：`{workflowType}`。
- 缺失：`{missing}`。
- 建议：`{repairAction}`。
- 来源：`{sourceRef}`。

### 卡点解释

- 当前节点：`{currentApprover}`。
- 已停留：`{duration}`。
- 可能原因：`{reason}`。
- 下一步：`{nextAction}`。

## 示例

```json
{
  "result": {
    "summary": "本次锁定 18 条审批记录，其中 4 条仍在流转。",
    "findings": ["材料采购审批存在 1 条附件缺口。"],
    "risks": [
      {
        "title": "采购审批缺少报价附件",
        "severity": "medium",
        "sourceRefs": ["workflow_instances.wf-1001.data.attachments"]
      }
    ],
    "recommendedActions": ["由申请人补充报价单后再提醒当前审批人。"],
    "missingInputs": []
  }
}
```
