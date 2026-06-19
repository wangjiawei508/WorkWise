# 内业平差报告 Skill

## 适用对象

- `inhouse_project`
- `inhouse_result`
- 通用 `project` 中已绑定内业平差项目的对象

不适用于重新计算正式平差值，也不替代算法引擎、人工复核和成果签认。

## OS Native 输入

优先读取：

1. `input/locked-facts.json`
2. `input/locked-adjustment-facts.json`
3. `input/context-pack.json`
4. `input/inhouse-adjustment-context.json`
5. `input/capability-blueprint.json`

原始观测、已知点、导线/水准/GPS 记录、确定性检查结果、平差成果、限差、异常点、写回预检都必须来自 locked 文件。

## 数据源优先级

1. OS 内业项目、已知点、原始观测记录。
2. 算法引擎已产生的 `ih_results`、`ih_check_reports`。
3. OS 写回预检、快照和审计记录。
4. 用户补充的返工说明或复核重点。

## 追问策略

缺成果类型时询问：导线、水准、GPS、控制网、全部。

缺报告目的时询问：成果解释、检查报告、返工建议、写回复核。

存在超限但缺现场说明时询问：补充观测记录、补充现场原因、先生成待复核说明。

## 输出 JSON Schema

```json
{
  "summary": "string",
  "resultExplanation": ["string"],
  "qualityNotes": [
    {
      "item": "string",
      "status": "passed|warning|failed|unknown",
      "sourceRefs": ["string"],
      "suggestion": "string"
    }
  ],
  "reworkItems": [
    {
      "priority": "high|medium|low",
      "action": "string",
      "sourceRefs": ["string"]
    }
  ],
  "missingInputs": ["string"]
}
```

## 禁止事项

- 不得重新计算或修改平差成果、闭合差、限差、坐标或高程。
- 不得把算法未通过的成果写成合格。
- 不得删除异常点或淡化返工要求。
- 不得输出没有来源引用的正式技术结论。

## 报告模板

```markdown
## 内业成果概况

## 输入资料和计算结果

## 限差与质量检查

## 异常点和返工建议

## 写回 OS 前复核意见
```

## 示例

输入：`inhouse.check.report.generate`，locked facts 有 12 个已知点、1 个平差成果、1 份检查报告。

输出：检查报告草稿引用 locked facts 中的成果 ID 和检查报告 ID，不生成新坐标。
