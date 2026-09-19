# Survey 规范规则与质检记录内核

此增量提供可接入 Runtime 的版本化规则注册和质检事件链。它没有内置 GB/T 24356-2023 或其他真实规范的阈值、抽样数、评分表，也没有实现该标准的符合性判定。现有[官方来源记录](evidence/railwise-research-20260919/standards-source.json)只核实标准元数据与在线预览入口；全文、条款核对和专业签认仍缺证。

## 规则执行条件

入口为 `kun/src/engineering/survey-standard-registry.ts`，合同在 `kun/src/contracts/survey-standard-quality.ts`。必须同时满足：

- 用 `standardCode + standardVersion + ruleId + ruleVersion` 精确选择规则；没有自动选择最新版或替换版本。
- 任务类型、等级、地区逐项精确匹配，时间落在配置的生效区间 `[effectiveFrom, effectiveUntil)` 内；不解释通配符。
- 指标和单位完全相同；不做隐式单位换算，输入必须为有限数。
- 来源为 `full-text`，具有全文 SHA-256、条款位置、条款字节范围和 SHA-256；读取的真实字节与两项哈希一致。
- 全文摘要存在于调用方受信集合中，**完整规则内容的摘要**存在于独立审核集合中。修改阈值、适用范围、来源、条款或版本都会使旧审核摘要失效。
- 同一规范版本、同一适用范围和指标下，不存在单位、操作符或阈值冲突的注册规则。发生冲突时不自动选择较严或较宽的规则。

缺少任一条件时，返回 `outcome: 'not-evaluated'` 和稳定原因码。非法合同、重复精确版本在注册时抛错。`official-metadata` 即使带有阈值也不能执行，可以不填条款位置。来源读取失败不暴露底层路径或异常文本。

可执行断言只有有限标量的 `lte`、`gte`、`abs-lte`。它不是任意代码或表达式执行器。单条谓词执行的结果可为 `passed` 或 `failed`，但 `standardConformity` 始终为 `not-evaluated`。

```ts
import { SurveyStandardRegistry } from '../../kun/src/engineering/survey-standard-registry.js'

// 三项输入由受信调用方提供；不能从模型文本或同一未审核上传中直接授予信任。
const registry = new SurveyStandardRegistry(registeredRules, {
  fullTextSha256: verifiedFullTextHashes,
  reviewedRuleDigests: independentlyReviewedRuleDigests,
  readSource: sha256 => retainedSourceBytes.get(sha256)
})
const evaluation = registry.evaluate(exactRuleReference, {
  taskType: project.taskType,
  grade: project.grade,
  jurisdiction: project.jurisdiction,
  at: inspectionTime,
  metric: measurement.metric,
  unit: measurement.unit,
  value: measurement.value
})
```

这是依赖注入示例，变量必须来自真实项目和受信存储。内核验证内容完整性，不验证发布机构身份、来源使用许可或审核人的真实身份。调用方负责这些信任来源，不能把设置集合视为已完成人工审核。测试只使用明确标为 `TEST-ONLY` 的虚构规则。

## 质检记录

入口为 `kun/src/engineering/survey-quality-record.ts`。`appendSurveyQualityEvent(history, event)` 返回新的事件数组，不改变历史。事件类型为检查、发现问题、记录整改、复核问题；阶段名称由项目流程提供，不声称是标准规定的检查层级。

- 每条事件绑定项目和原成果摘要，保持连续序号、非倒退时间、前项哈希与自身哈希。
- 问题必须引用之前的非通过检查；整改必须对应未关闭问题，并绑定新的成果摘要。
- 复核必须引用该问题最新的整改编号和同一整改成果摘要；未解决结果保留问题，已关闭问题不能重复关闭。
- 重复事件、检查、问题或整改编号、跨项目混入、篡改和非法顺序被拒绝。

```ts
const next = appendSurveyQualityEvent(history, recordedEvent)
const checkpoint = {
  projectId: next[0].projectId,
  artifactSha256: next[0].artifactSha256,
  eventCount: next.length,
  headHash: next.at(-1).thisHash
}
// 将 checkpoint 独立保存，不能每次从待验证链重新生成。
const integrity = verifySurveyQualityRecord(reloadedEvents, retainedCheckpoint)
```

无独立检查点时，哈希链不能证明末尾没有被截断，也不能抵御整条链被重新计算后替换。`valid` 只表示记录完整性；为空的链可完整但没有检查。`standardConformity` 和 `humanSignatureVerification` 始终为 `not-evaluated`。事件中的摘要和人员标识本身不证明原文件存在、数字签名有效或人员已签认；`valid: false` 时不可把附带数量用于验收。尚未接入数据库、HTTP 路由、交付 manifest 或 UI。

`openIssueCount = 0` 只说明各问题分别记录了闭环，整改可能对应不同成果版本；它不证明同一个最终成果通过全部检查。接入交付门禁前，仍需定义最终成果版本及其完整检查覆盖，不能直接以该计数放行。

## 验证

```sh
cd kun
npm test -- --run src/engineering/survey-standard-registry.test.ts src/engineering/survey-quality-record.test.ts
npm run typecheck
```

2026-09-19：20 项独立测试通过，覆盖版本隔离、来源与条款篡改、元数据默认不执行、规则冲突、时间/单位边界、整改产物绑定及独立检查点；Runtime 类型检查与新增文件 ESLint 通过。
