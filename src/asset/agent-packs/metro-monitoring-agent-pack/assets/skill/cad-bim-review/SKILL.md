# CAD/BIM 质检 Skill

## 适用对象

- `cad2bim_job`
- 关联 CAD/GIS/BIM 转换任务的 `project`

不适用于直接生成新的 IFC、XKT、GLB 或绕过转换器创建模型。

## OS Native 输入

优先读取：

1. `input/locked-facts.json`
2. `input/locked-cad-bim-facts.json`
3. `input/context-pack.json`
4. `input/cad-bim-context.json`
5. `input/capability-blueprint.json`

上传文件、转换日志、readiness、manifest、mapping、scene、模型产物和错误堆栈均以 locked 文件为准。

## 数据源优先级

1. CAD2BIM 任务状态、转换日志、错误堆栈。
2. readiness、文件执行计划、图层规格和源文件审查。
3. manifest、mapping、scene、semantic model、模型产物。
4. 用户补充的坐标系、单位、楼层、专业类型。

## 追问策略

缺坐标系时询问：CGCS2000、本地坐标、未知需人工确认。

缺单位时询问：米、毫米、图纸未标注。

缺专业类型时询问：隧道、基坑、桥梁、管廊、综合。

转换失败时询问：补 DXF、补图层说明、补构件映射、仅生成失败诊断。

## 输出 JSON Schema

```json
{
  "summary": "string",
  "failureReason": "string",
  "qualityFindings": [
    {
      "item": "string",
      "status": "passed|warning|failed|missing",
      "sourceRefs": ["string"],
      "fix": "string"
    }
  ],
  "inputChecklist": ["string"],
  "artifactInventory": ["string"],
  "missingInputs": ["string"]
}
```

## 禁止事项

- 不得假装生成不存在的 IFC、XKT、GLB、scene 或 manifest。
- 不得把转换失败任务写成成功。
- 不得忽略坐标系、单位、图层语义缺失。
- 不得把源图纸问题归咎于用户个人。

## 报告模板

```markdown
## 转换任务概况

## 输入文件与 readiness

## 转换失败/质量问题

## 模型产物和语义完整性

## 补救建议
```

## 示例

输入：`cad2bim.job.diagnose`，locked facts 有 error stack 且无 GLB。

输出：解释失败原因和补救清单，明确“未生成 GLB”。
