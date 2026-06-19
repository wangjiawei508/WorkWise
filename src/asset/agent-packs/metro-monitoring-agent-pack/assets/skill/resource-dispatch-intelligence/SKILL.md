# 资源调度与资质缺口 Skill

## 适用对象

- `resource_center`
- `resource_personnel`
- `resource_equipment`
- `resource_qualification`

用于资源中心、人员资质、设备台账、车辆和借用场景的 AI Native 分析。目标是帮助项目负责人快速看清人员是否够、证书是否有效、设备是否可用、检定和借用是否存在风险。

## 不适用对象

- 不适用于经营财务、合同条款、发票附件和回款风险判断。
- 不适用于地保/运营/建设期监测成果解释、监测报告编制或预警消警结论。
- 不适用于员工绩效评价、人员能力定级或正式调度命令签发。
- 不适用于未进入 RAILWISE-OS locked facts 的外部人员、设备或证书台账。

## OS Native 输入

运行时必须优先读取：

- `input/object-ref.json`
- `input/actor-context.json`
- `input/permission-scope.json`
- `input/context-pack.json`
- `input/locked-facts.json`
- `input/capability-blueprint.json`
- `input/resource-operations-context.json`
- `input/locked-resource-facts.json`
- `input/resource-operations-blueprint.json`
- `input/skill-context.md`

所有人员、设备、车辆、借用、检定、资质和提醒数据都以 locked facts 为准。

## 数据源优先级

1. RAILWISE-OS `locked-resource-facts.json`。
2. RAILWISE-OS `locked-facts.json`。
3. 用户在引导面板补充的项目、部门、周期或出工要求。
4. 不允许直接到旧台账、外部表格或聊天历史中补数。

## locked 数据边界

- AI 不得修改人员数量、设备状态、检定日期、证书有效期、借用状态和部门分布。
- AI 可以解释缺口、梳理风险、生成补证/调度建议。
- 若 locked facts 中没有某类资源，应写入 `missingInputs`，不能假装已有数据。

## 追问策略

当信息不足时，优先追问选择题：

- 分析范围：全公司 / 我的部门 / 指定项目。
- 任务类型：日常巡检 / 自动化监测 / 外业复测 / 专项评审。
- 输出深度：管理摘要 / 风险清单 / 出工就绪检查。
- 补救方式：调配人员 / 补证 / 更换设备 / 推迟出工。

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

同时写入 `output/summary.md`，用于 Workbench 快速预览。

## 禁止事项

- 禁止编造人员、证书、设备、车辆或借用记录。
- 禁止把资质缺口写成已经满足。
- 禁止绕过权限输出其他部门或客户不可见的个人信息。
- 禁止将 AI 建议作为正式调度命令，必须等待人工验收。

## 模板

### 资质缺口

- 缺口：`{licenseType}` 需 `{required}`，当前 `{actual}`。
- 影响：`{impact}`。
- 建议：`{action}`。
- 来源：`{sourceRefs}`。

### 设备就绪

- 设备：`{equipmentName}`。
- 状态：`{status}`。
- 风险：`{calibrationOrBorrowRisk}`。
- 处置：`{nextAction}`。

## 示例

用户选择“指定项目 + 出工就绪检查”时：

```json
{
  "result": {
    "summary": "本次检查锁定人员、设备、借用和检定数据，发现 2 项出工前风险。",
    "findings": ["全站仪可用 3 台，1 台检定 12 天后到期。"],
    "risks": [
      {
        "title": "现场上岗证覆盖不足",
        "severity": "medium",
        "sourceRefs": ["locked-resource-facts.json.qualifications"]
      }
    ],
    "recommendedActions": ["优先补充持证外业人员或调整班组。"],
    "missingInputs": []
  }
}
```
