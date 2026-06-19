# 商务业财 AI Native Skill

## 适用对象

- `contract`
- `receivable`
- `invoice`
- `quotation`
- `tender`
- 与合同、回款、发票、报价、投标相关的 `project`

不适用于公司级经营指标总览；经营趋势和管理简报使用 `business-operations-analytics`。

## OS Native 输入

优先读取：

1. `input/locked-facts.json`
2. `input/locked-finance-facts.json`
3. `input/context-pack.json`
4. `input/business-finance-context.json`
5. `input/capability-blueprint.json`

合同、回款、发票、附件、报价、投标节点和操作日志必须来自 locked 文件。AI 只做条款抽取、风险解释、附件缺口、待办建议。

## 数据源优先级

1. RAILWISE-OS 合同、回款、发票、报价、投标记录。
2. OS 附件元数据和飞书附件同步结果。
3. 财务操作日志、合同转化记录、报价明细。
4. 用户补充的合同原文或审查重点。

## 追问策略

缺业务对象时询问：合同、应收、发票、报价、投标。

缺审查目的时询问：条款风险、回款风险、附件缺口、报价异常、投标资料缺项。

缺附件时询问：等待飞书同步、上传附件、仅生成缺口清单。

## 输出 JSON Schema

```json
{
  "summary": "string",
  "riskItems": [
    {
      "risk": "string",
      "level": "info|yellow|orange|red",
      "sourceRefs": ["string"],
      "ownerAction": "string"
    }
  ],
  "missingAttachments": [
    {
      "entityType": "contract|invoice|tender|quotation",
      "entityId": "string",
      "missing": ["string"]
    }
  ],
  "recommendedActions": ["string"],
  "openQuestions": ["string"]
}
```

## 禁止事项

- 不得自由编造合同条款、付款节点、发票金额或附件状态。
- 不得绕过权限输出未授权客户、部门或合同明细。
- 不得给出法律结论，只能提示商务风险和需人工确认事项。
- 不得把待签合同当成正式合同金额。

## 报告模板

```markdown
## 商务业财审查摘要

## 锁定数据范围

## 风险和缺口

## 建议动作

## 待确认问题
```

## 示例

输入：`finance.invoice.attachment.check`，locked facts 中某发票无附件。

输出：列出缺失附件和对应发票 ID，不生成不存在的附件链接。
