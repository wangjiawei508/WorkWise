# Survey 生产指标口径

截至源码 `281dc87672509de147357efc3aabbeae0eb4dbcb`，2026-09-20。本文描述现有脚本的实际口径，列出尚未采集的生产分母；不新增埋点、不补造事件、不把候选验收换算成生产 KPI。

## 数据与事件来源

只读工具为 [`scripts/measure-survey-workflows.py`](../../scripts/measure-survey-workflows.py)，不是 [`check-survey-production-delivery.mjs`](../../scripts/check-survey-production-delivery.mjs)。后者在临时隔离 Runtime 主动创建工程与交付，并可调用产品参考解析器，验证的是所选样本闭环；即使使用包内 Electron，也不产生 GUI 或生产成功率分母。

指标脚本用 SQLite `mode=ro`、`query_only=ON` 和独立读事务读取 `engineering.sqlite3` / `survey.sqlite3`。应使用完全停止应用后的成对副本，保留副本哈希、代码提交、提取时点和 cohort 来源；两个库的读事务不是跨库原子快照。脚本不读输出/源文件、不发遥测、不重算平差、不验签，不输出项目名、坐标或私有路径。

| 事实/事件 | 持久来源 | 真实含义与限制 |
| --- | --- | --- |
| 网络创建 | `survey_networks.data_json.createdAt` | 成功保存网络的时点。不是导入按钮点击、文件选择开始或首次请求；没有被拒绝导入记录。 |
| 平差完成 | `survey_adjustments.data_json.run.completedAt`，`run.status=completed`、`result.validation=valid` | 当前保存的运行与结果；需要网络/项目/输入hash/算法版本绑定。不是人工复核。 |
| 草稿清单创建 | `engineering_manifests.data_json.createdAt`、`reviewStatus=draft` | 已保存草稿，非签认固化；清单包含成果引用不证明当前字节完好。 |
| 复验终态 | `engineering_verification_attempts` | `EngineeringService.verifyDeliverable` 在成功、检查失败或捕获异常后保存的终态；序列、身份、时间、原JSON SHA-256及元数据绑定可核对。进程崩溃或审计写入失败没有此事件，不能进入已记录分母。 |

指标时间统一为 UTC 半开区间 `[start, end)`；输入时间必须带时区。清单按 `createdAt` 入期，复验尝试按 `completedAt` 入期。`--cohort candidate-fixture` 与 `production` 必须分开；`production` 参数只是调用者标签，不认证数据来源，也不会自动过滤候选记录。

## 现有可计算统计

| 输出键 | 样本/分母 | 数值定义 | 无效或缺失处理 |
| --- | --- | --- | --- |
| `counts.projectsInSnapshot` / `networksInSnapshot` | 所读完整快照 | 唯一项目/网络ID总数，不限报告期 | 缺失或重复ID直接失败，不能悄悄去重。不是每月生产项目数。 |
| `counts.manifestsInPeriod` / `manifestReviewStates` | 创建时间入期的全部清单 | 已知状态draft/reviewed/approved/rejected分组，其余记other | 无效时间排除并计入`invalidManifestTime`；状态字符串不能证明批准真实。 |
| `draftManifestsWithConsistentStoredBindings` | 入期且通过下述草稿绑定检查的清单 | 每清单计一次，同项目多份可以多次计数 | 不查当前文件字节、不表示完整三格式，也不是成功导入率。 |
| `importToFirstBoundDraftSeconds` | 保留历史中每项目最早合格草稿恰好在期内的项目；每项目一次 | 每份首草稿时间减去它所绑定网络的最早创建时间，取中位数，单位秒，同时报sampleSize与range；包括等待和人工操作 | 先读期前历史，防止重复交付误算首次。空样本为`value:null/status:no-samples`；删除过的历史不可探测。不是“首次有效正式成果”或操作净耗时。 |
| `recordedStrictReverificationCoverage` | 创建时间入期且当前`reviewStatus=draft`的全部清单，以`(projectId,manifestId)`为唯一键；不只选曾成功或已有正确绑定的清单 | 分子为每个清单截止end前最后一条终态复验通过、完整检查通过且与本次快照元数据仍绑定的数量 | 缺事件或最后失败均不给分；后续失败覆盖旧成功。分母身份缺失/重复则不可测。无清单为no-samples。 |
| `recordedVerificationAttemptSuccessRate` | `completedAt`入期的所有已记录终态尝试，包括passed/failed/error、未知清单查找错误和对期前清单的复验 | 分子是终态passed且仍通过当前快照元数据绑定检查的尝试数；同清单多次尝试各自计数 | 当前绑定失效的旧passed保留在分母但不进分子；`outcomes.passed`可能大于分子。无事件为no-samples。崩溃/未写入审计不在分母。 |

草稿绑定检查要求项目存在、非空adjustments及outputs、清单validation.valid，并对每个adjustment核对run/result/network的项目、网络、result ID、run ID、非空inputHash和algorithmVersion；要求 `network.createdAt <= run.completedAt <= manifest.createdAt`。首草稿排序读取所有end之前保留历史，只处理draft；不能把reviewed/approved/rejected当成首草稿或人审通过。

“最后一条”按审计表 `sequence` 顺序选取满足 `completedAt < end` 的最后写入终态，不按UUID排序，也不是按checkedAt求最大。覆盖率没有额外要求该条必须在start以后；它是截止期末的记录状态。尝试率则严格按完成时间入期，与清单创建期是两个不同分母。

复验分子要求原事件schema/SQL身份/精确序列化JSON摘要/时间一致；bindingStable、bindings.complete和verification.valid为true；checkedAt位于startedAt与completedAt之间；清单仍为draft；项目/清单/工程run/dataset/analysis及Survey network/result/deformation的集合和typed-json-sha256-v1摘要匹配，五项检查状态完整。没有Survey网络时surveyReplay/sources必须为not-applicable；其余应passed。脚本只核对记录元数据，不能证明原复验之后文件没有变化，因此 `strictReverificationCoverage`（当前重新复验）仍不可测。

## 无效样本与故障口径

1. `invalidManifestTime`统计全快照的无效清单创建时间；无法判断是否属于报告期，不能强塞入期内分母。
2. `missingOrMismatchedBinding`、`invalidBoundInputTime`、`nonForwardTime`检查所有end之前的draft历史，含期前历史；不是仅期内失败数，也不是唯一项目数。每份草稿遇到首个失败后停止该草稿的输入检查，不能把这些计数相加当“全部缺陷数”。
3. 任一审计行的身份、JSON摘要或时间完整性失败，会使两项recorded指标一起`not-measurable`，不跳过坏行后选旧成功；这包括扫描到的期外审计行。
4. 没有终态审计表时，两项recorded指标均不可测；不从“文件存在”或GUI截图反推历史事件。其他数据库/记录结构错误导致命令退出1且不产生可信结果，不填0。
5. `not-measurable`表示缺必要测量条件，`no-samples`表示该已定义样本集合为空；二者都不是0%或100%。单项故障、跨库不一致、缺审计记录均应保留原因，不从分母删掉失败以改善比例。

## 生产目标的缺失分母

以下是后续采集要求，不是当前已实现的事件合同。截至本索引均为`not-measurable`，无生产数值。

| 产品指标/目标 | 必需事件与分母 | 目前缺口 |
| --- | --- | --- |
| 每月完整可追溯项目数 | 期内完成且唯一的真实项目ID，绑定完整交付、源数据、算法与可验证的人工批准/签名 | 当前草稿和reviewStatus文本不能证明正式批准；真实生产cohort来源与覆盖不明。 |
| 首次有效成果耗时 | 预先固定的开始事件至首次合格签认交付事件，每项目一次；失败/中断项目保留审查名单 | 现有时间只是成功网络创建至首草稿，缺首次尝试和正式批准时点。 |
| P0一次导入成功率 ≥85% | 每个事先定义的导入任务首次开始及终态，包括解析拒绝、崩溃/中断；成功任务数/全部首次任务数 | 持久网络没有拒绝分母和首次任务标识；“任务”按文件/批次的选择须先固定，不能事后按成功文件去重。 |
| 中等水准网导入至固化中位时间 ≤30分钟 | 先定义网络规模、排除规则与生产cohort，再记录开始/签认固化及未完成样本 | 中等网络定义、正式固化事件和代表性样本缺失；首草稿秒数不能代替。 |
| 数值可复现率 100% | 预先冻结的运行集合及每项严格重放终态；分子为输入/版本/输出条件一致并在声明数值规则下通过者 | 已存绑定与选定两样本参考比较不覆盖全部生产运行。 |
| 规范依据可追溯率 100% | 预声明必须核查的规范判定项集合，逐项权威版本/条款/适用条件/数值证据 | 自由文本引用和有限条文试算不能证明全量逐项适用及验真。 |
| 非Runtime数字混入成果=0 | 固定成果及全部需追溯数值字段清单，逐项绑定Runtime计算/授权原始声明与变换来源 | 没有完整值级provenance审计；不能把PDF/DOCX/XLSX哈希一致当数字来源合规。 |
| 许可违规=0 | 固定发行包/依赖/转换器/资料范围及逐项许可证审计 | 无该生产范围独立许可结论；“未发现记录”不等于0。 |
| 英文界面中文残留=0 | 预声明英文可见状态与可计UI文本集合，明确排除用户原文、源证据和专有名称 | 未覆盖完整状态、错误、窄屏与恢复路径；截图抽样不能推广为全量0。 |
| 结果一键追问覆盖率 | 冻结可追问结果表面集合，逐项成功携带准确结果/工程上下文进入追问 | 数据库记录数不提供UI分母，缺全清单及真实操作证据。 |

缺失/失败/取消的采集政策必须在正式统计前固定。上述建议不会追溯伪造旧事件；历史未知应保持未知。`productionRepresentativeness`即使传production标签仍不可测，需单独提供收集来源、授权、去重及覆盖证据。

## 截至 281dc87 的证据索引

- [d249035历史指标](./evidence/railwise-research-20260919/candidate-metrics.json)：两项目首草稿中位111.788秒（原JSON为`111.78800000000001`，此处按毫秒展示），范围83.48至140.096秒。保留历史窗口和旧schema；不能当最新源码或生产指标。
- [4f859c0失败快照](./evidence/railwise-convergence-4f859c081b33/metrics-failed.json)为记录覆盖0/1、尝试通过1/2；[结束快照](./evidence/railwise-convergence-4f859c081b33/metrics-final.json)为2/2、5/6，首草稿中位66.994秒（样本2）。该差异证明已记录的后续失败不会被旧成功掩盖，不证明总体生产稳定性。
- [6ff P0证据](./evidence/railwise-convergence-6ff82c8c2746/p0-summary.json)：实际GUI的IN2/GSI两网络、两草稿、六文件以及重启前后四次持久成功复验，每次五项。此文件是P0选定样本核验摘要，不是指标脚本输出；没有把它重新标成生产“100%覆盖率”或生成新耗时。格式范围见[验收矩阵当前索引](./WORKWISE_0.5.0_SURVEY_FORMAT_ACCEPTANCE_MATRIX.md)。

不要将不同候选、不同窗口、重复使用的同源样本合并成更大的生产样本数。四次复验与每次五检查不是20个项目；IN2和GSI的实际文件也不是六个独立工程。

## 复测命令与检查范围

```sh
python3 scripts/measure-survey-workflows.py \
  --engineering-db '<停止应用后的副本>/engineering.sqlite3' \
  --survey-db '<同一副本>/survey.sqlite3' \
  --cohort candidate-fixture \
  --start '2026-09-01T00:00:00Z' --end '2026-10-01T00:00:00Z'
```

本次文档核对运行既有 `python3 scripts/test_measure_survey_workflows.py` 的14项回归，并复核上述已归档数值、6ff的60个归档哈希及新增文档相对链接；未采集或重测真实生产数据库。终态审计的现有服务回归位置为 [`engineering-verification-audit.test.ts`](../../kun/src/engineering/engineering-verification-audit.test.ts)，本次无产品代码变更，不重复全量构建。
