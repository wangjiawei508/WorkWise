# WorkWise 0.5.0 工程测量工作台候选证据

日期：2026-09-01（Asia/Shanghai）

## 2026-09-10 最新安装候选与 GSI 修复

最新状态见 [候选 912e4d30b065 安装与双 P0 复测](evidence/survey-candidate-912e4d30b065/README.md)。
已修复 WI83 累计高程语义，并从隔离 0.5.0 DMG 安装后完成 COSA IN2/GSI 包内 Runtime
交付与独立数值复核。完整 GUI、签名公证、真实私有 updater 和用户确认仍待完成。
以下保留历史记录，不将旧 GSI 语义或旧宿主诊断当作当前验收结果。

## 2026-09-10 自动化门禁复核

- `npm --prefix kun test -- --maxWorkers=2`：135 个测试文件、1557 项通过、1 项跳过。
- `npm test -- --maxWorkers=2`：在允许本机 `127.0.0.1` 回环监听的受限测试环境中，304 个测试文件、2438 项通过、2 项跳过。未允许回环监听时出现的 12 项失败均为 `listen EPERM` 环境错误，重跑后全部恢复，不是业务断言失败。
- `npm run typecheck`、`npm run lint`（0 error，保留既有 `Workbench.tsx:1402` Hook warning）、`npm run openspec:validate`（11/11）、`npm run verify:brand-boundary`（1511 文件）、`npm run verify:document-licenses`、`npm run verify:specialist-skills` 和 `git diff --check`：通过。
- `npm run build`：通过；随后 `npm run verify:build-freshness`：957 个生产输入通过。
- 候选 GUI 仍未完成：当前宿主 `mdutil -s /` 和 `/System/Volumes/Data` 返回 `Spotlight server is disabled`，候选包 `lsregister -lint` 返回 `-10822`，`open` 返回 `kLSNoExecutableErr`。因此 Task 15、29、36 继续保持未勾选，未执行任何发布动作。

## 2026-09-10 Leica GSI 水准语义回归

- `survey-leica-gsi-leveling.test.ts` 定向回归 7 项通过，覆盖 WI57 信息码 1/2/3/4 语义、WI83 `..08/..28` 最终高差、初始化记录排除、缺首个 WI11、缺目标点、重复最终高差、非递增累计距离和自闭合记录。
- 真实 NAS 样本 `/Volumes/MOVESPEED/.../三角高程水准/右线.GSI` 只读复核通过：`leica-gsi8`，284 条原始记录，56 条最终高差观测，2 个 WI41 块，0 条 blocking diagnostic；首两条相邻路线长度为 `30.33351 m`、`59.82590 m`，第二个 WI41 块累计距离正确重置。
- 本项只证明有界语义解析、原始记录保留和异常阻断；该样本尚无同源独立成果/精度参考，也没有候选 GUI 截图，因此不提升 Task 36 或发布门禁状态。

## 2026-09-08 最新进展：COSA 映射入口与包内真实数据闭环

## 2026-09-09 总计划实施：Survey 摘要真实数据与处置门禁

- `EngineeringWorkspaceView` 的专业摘要条已接入 Survey Runtime 只读接口：网络点数、测站数和观测数来自当前网络/源文件摘要；闭合差、闭合单位和最大点位中误差来自最新确定性平差结果。没有对应 Runtime 结果时保持 `—`，不生成占位数字。
- `archive-only`、`converter-required`、`gnss-processing-required` 和来源准入失败会优先显示为摘要处置状态并标记阻断，不再因通用监测数据状态而误显示“可平差”。新增中英文处置文案。
- 平差完成后会同时刷新工程总览与 Survey 摘要，保持连续会话中结果可追问、可追溯。
- 本轮验证：工程组件 11 个测试文件、56 项通过；`npm run typecheck` 通过；`npm run lint` 0 error（保留既有 `Workbench.tsx:1402` warning）；`npm --prefix kun test` 135 个文件、1556 项通过、1 项跳过；`npm run build` 通过；严格 OpenSpec `11/11` 通过；`git diff --check` 通过。
- 候选包门禁没有改变：当前工作树仍有未提交改动，且尚未取得可用于最终候选的签名/公证和完整 GUI/专业格式验收条件，因此任务 15、29、36 继续保持未勾选。

- 修复 `.in1` 的可操作性缺口：文件选择和对话附件导入现在先显示内嵌字段确认，支持已知点行数、ASCII/GB18030、分隔符和两段列序。多文件逐份确认；界面随全局中英文和主题设置变化，不增加弹窗。
- 导入去重键改为包含原始内容、网型、文件名和映射的 SHA-256；修正同一文件更换映射仍可能重放旧阻断结果的问题。内核仍负责来源与质量门禁，映射未确认时不提交导入。
- 类型检查、Lint（0 error，保留既有 Workbench Hook warning）、12 文件/100 项相关界面回归、生产 build、954 项 build-freshness、OpenSpec strict 11/11 通过。最后一次完整源码回归见下方历史记录；此处没有把定向回归写成新的全量结果。
- 从独立干净快照 `f09e74ebcbc51331ca04e2227ff9632b61913689` 生成私有 arm64 `0.4.2` 候选，独立 bundle ID 和用户目录；原工作区未提交或重置。包内完整性、SQLite ABI 148 和 adhoc 签名完整性通过，未公证。
- 四份真实左右线 IN1/IN2 在候选自带 Electron/Runtime 中完成导入、预检、平差和 DOCX/PDF/XLSX/manifest 内容核查；两组 IN1 的 61/52 点与同源 OU1 比较均为 0 不匹配。详见[机器生成证据与范围说明](evidence/survey-candidate-f09e74ebcbc5/README.md)。这不是 GUI 交互验收，IN2 未宣称通过 OU2 独立坐标比对。
- Computer Use 应用清单读取成功；候选 GUI 启动与 DMG 修正被自动审批基础设施阻断（429，继而 CC Switch 返回 `codex-auto-review` 不受支持的 404）。已保留安装副本和隔离配置，未绕过拒绝。任务 15、29、36 仍为未完成；无公开发布动作。

## 范围

本记录只覆盖 `workwise-0-5-0-engineering-delivery` 的本地实现和私有候选检查。
公共版本、Git tag、GitHub Release、Stable feed 和官方下载页均未修改；应用包内公开
版本仍为 `0.4.2`。

## 自动化门禁

- Runtime typecheck：通过。
- Runtime Vitest：83 个测试文件，791 个测试通过。
- WorkWise typecheck：通过。
- ESLint：通过。
- WorkWise Vitest：285 个测试文件通过、2 个跳过；2340 个测试通过、2 个跳过。
- OpenSpec strict validation：11/11 通过。
- 品牌边界、文档依赖/许可证和 `git diff --check`：通过。
- 生产构建：通过；工程测量工作台资源包含 `EngineeringWorkspaceView` 懒加载 chunk。
- 2026-09-01 复核：Runtime 工程服务与监测报告 Flow 定向回归 `7/7` 通过；修复并验证多工作表
  XLSX 后续工作表新增列时 `unknownColumns`/`columnCount` 不再丢失。

## 真实工程数据 E2E

使用临时隔离工作区和真实 JSZip XLSX（2 个工作表、2 条观测记录）完成：

1. 创建工程项目。
2. 导入多工作表 XLSX，并保留工作表来源。
3. 质量校核。
4. 确定性趋势/速率分析。
5. 生成 `report.docx`、`report.pdf`、`evidence.xlsx` 和 `manifest.json`。
6. 检查成果文件存在且 manifest 已写入成果目录。

证据目录位于临时路径 `/var/folders/t8/1bkjpgdx5zbd2ynlyzpqd7zw0000gn/T/workwise-0.5-e2e-h1Md0v/workspace/.workwise/deliverables/project_c5ce395b-1e06-4312-8dc8-11b83b7e9db5/run_ea0c220a-c879-459a-b85c-8da0d79d010c`，包含：

| 文件 | 字节数 |
| --- | ---: |
| `report.docx` | 3708 |
| `report.pdf` | 1701 |
| `evidence.xlsx` | 13928 |
| `manifest.json` | 2835 |

## 私有本地候选包

由当前工作树构建，未上传：

| 包 | SHA-256 | 状态 |
| --- | --- | --- |
| `/private/tmp/workwise-0.5-private-dist/WorkWise-0.4.2-mac-arm64.dmg` | `d217ba5f22c4b8224b4cad7d4aecb5fa085bd4b790aee697ea6c1cfb7d8a44a3` | 已构建 |
| `/private/tmp/workwise-0.5-private-dist/WorkWise-0.4.2-mac-x64.dmg` | `6e37cfc4c77c7d029b5686722599d756f97a2c73d908b9c7c73a026f22159976` | 已构建 |

- arm64 和 x64 包的 ASAR 完整性检查：通过（18338 个文件，0 个编译文件）。
- arm64/x64 `better_sqlite3.node`：ABI 148，与目标架构匹配。
- macOS 签名：adhoc，`TeamIdentifier` 未设置。
- Apple notarization/stapling：未执行，环境没有 Apple Developer/notary 凭据。
- Windows x64 包：本机没有 Windows 构建环境/Wine，未声称完成。
- 已用候选环境文件启动精确 arm64 包，数据写入隔离临时目录；本机没有可用 Runtime API key，候选 GUI 停留在 Runtime 唤醒状态，无法执行依赖 Runtime 的长文本、Flow 和 Design AI 操作。macOS LaunchServices 还会将同 bundle ID 的候选窗口映射到已安装实例，无法可靠完成 Computer Use 定位，因此未把这次启动冒充为 GUI 通过。
- 2026-09-01 尝试从当前 `dist/mac-arm64/WorkWise.app` 复制并重签名唯一候选包后直接启动，Electron
  返回原始错误 `FATAL: ... electron_main_delegate_mac.mm:66 Unable to find helper app`；通过
  `open` 启动同样返回 `NSOSStatusErrorDomain Code=-10827 kLSNoExecutableErr`。候选包未被计为
  GUI 通过，也未操作 `/Applications/WorkWise.app`。

## 尚未完成或需要用户动作

- 旧 OpenSpec `workwise-0-3-3-flow-and-delivery` 的 7.4 需要启动精确打包 GUI，
  通过隔离用户数据目录实测 Write 长文本/附件、Scheduled tasks、Flow starter 和
  Design PPT；当前未触碰 `/Applications/WorkWise.app`，也未把静态检查冒充 GUI 验收。
- `add-builtin-specialist-skills` 的 3.4 需要已配置图片 Provider 的真实文档配图和
  插入映射；当前配置没有可用图片 Provider，不能伪造生成结果。
- `add-builtin-specialist-skills` 的 5.6 需要三平台 0.3.2 候选包复核；本机只能重建
  macOS 双架构，不能替代 Windows 原生包验证。
- 由于以上外部条件，`workwise-0-5-0-engineering-delivery` 的任务 9、10 保持未勾选，
  不请求公开发布 0.5.0。

## 2026-09-01 收口结论

- 工程测量工作台实现、Runtime API、确定性分析、成果文件和自动化门禁仍然通过；本日补丁只扩大
  XLSX 多工作表未知列的保留范围，不改变版本或发布元数据。
- 旧 0.3.3 GUI 7.4、Document Illustrator 3.4、三平台 5.6 仍未满足真实验收条件；候选 GUI
  启动错误已按原始输出记录，不能用静态检查替代。
- 因此任务 9、10 继续保持未勾选，不创建 tag、Release、Stable feed 或官方下载页更新。

## 2026-09-01 会话隔离与工程首屏复核

- 编程侧栏过滤 Design 助手线程；Design 侧栏改为只列出当前工作区的设计文档，点击文档恢复其独立画布，点击旧版 `Design · ...` 线程也会先切换到 Design 并恢复对应文档。
- 工程测量侧栏改为只列出当前工作区的工程测量项目，不再渲染编程线程；项目选择通过持久化项目 ID 和事件交给工程测量工作台，数据集、分析、成果和审查状态随项目恢复。
- 工程测量工作台首屏改为“交付控制台”，展示项目配置、数据资产、质量校核、趋势分析、报告证据包、人工审查六个阶段及状态，而不是导入表单；每个阶段可直接进入对应处理页。
- 本轮定向回归：11 项测试通过；`npm run lint`、`npm run typecheck -- --pretty false`、品牌边界、文档许可证、OpenSpec 严格校验和生产构建通过。
- 工程 Runtime 定向回归在将 `better-sqlite3` 重编译为当前 Node ABI 147 后为 7/7 通过；完整测试仍有既有端口占用、OAuth/OCR loopback 和候选 Runtime 资源竞争失败项，单独重跑相关文件可通过，未将其误报为全量通过。
- 本轮重新构建的候选目录包为 `dist/mac-arm64/WorkWise.app`，ASAR 完整性通过并包含新的 `交付控制台` 文案；因同 bundle ID 的已安装实例和本机 Electron helper/LaunchServices 限制，未把候选包 GUI 启动冒充为通过，也未覆盖 `/Applications/WorkWise.app`。

## 2026-09-02 AI 工程会话收口

- 修复工程 AI 指挥台类型错误；目标输入现在先创建 Runtime Typed Plan，界面显示真实计划编号、修订、工具和审批状态。
- 新增计划校验、审批、启动、取消、恢复接口；批准计划通过现有 `TurnService → TaskController → AgentLoop`，不创建第二队列，也不把 AI 运行直接写成 `engineering_runs` 完成态。
- 新增工程计划 Runtime `pipeline_stage` 事件、证据卡中的 metric/artifact 投影和 Watch draft 上下文接口；上下文仍只发送项目/数据摘要、哈希和引用，不发送原始观测行。
- 修复 `EngineeringService.updateProject()` 将 mutation 控制字段误传入项目 schema 的缺陷。
- 定向工程 AI/工程服务测试：10/10 通过；前一轮 WorkWise 全量测试：286 个文件通过、2 个跳过，2348 个测试通过、2 个跳过。
- `npm run typecheck`、`npm run lint`、`npm run build`、严格 OpenSpec 校验、品牌边界、文档依赖/许可证和 `git diff --check` 均通过。
- Runtime 子项目全量回归（2026-09-02）：84 个测试文件、795 个测试全部通过。
- 回环监听集成测试在受限沙箱中曾报告 `listen EPERM`；获准使用本机回环端口后全量测试通过，故该失败属于环境限制而非代码回归。

## 2026-09-02 IPC 白名单修复与候选重建

- 修复工程项目、数据集、分析、图表、报告、成果、运行记录、工程 AI 计划、上下文、证据、取消和恢复路由未进入主进程 `runtime:request` 白名单的问题；新增 38 条允许/拒绝回归断言。
- 修复提交：`9c492fe62acc8c2b60f14a5ef240c162cafa49f9`（`fix: allow engineering runtime endpoints`）。用户未跟踪文件 `?? :-` 未触碰。
- 主项目全量回归：286 个测试文件通过，2349 个测试通过，2 个跳过；现有 Runtime：84 个测试文件通过，795 个测试通过。
- `npm run typecheck`、`npm run lint`、`npm run build` 和工程/响应式定向测试（45/45）通过。
- 重新构建隔离 arm64 候选包：`/private/tmp/workwise-0.5-candidate-dist/mac-arm64/WorkWise Candidate 9c492fe62acc.app`。ASAR 完整性：7721 个文件、459 个编译文件；未上传、未安装到 `/Applications`、未修改版本元数据。
- 候选包启动命令已带隔离 `candidate.env` 和临时用户目录。当前机器上该新候选主进程可驻留，但未创建可连接的渲染器/CDP 页面（9230 端口无监听）；因此没有把旧候选 `1e892...` 的页面状态或静态检查冒充为本次打包 GUI 通过。工程入口在旧候选中曾复现 `runtime request path is not allowed`，本次修复已由源码/IPC 回归覆盖，但仍需在可见的新候选窗口中复核。
- 该阻塞只影响“最新候选包 GUI 验收”证据，不影响源码测试、真实工程数据 E2E 或成果文件校验。

## 2026-09-03 clean 0.5.0-rc 包级复核

本次复核基于提交 `51cd307de82c58295bb7941e52ab58d8645a1a18` 的干净独立源码副本
`/private/tmp/workwise-candidate-src-51cd307`，没有使用主仓库的 `node_modules` 符号链接。
候选输出为：

`/private/tmp/workwise-0.5-rc-clean-dist/mac-arm64/WorkWise Candidate 51cd307de82c.app`

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| ASAR 内容、编译产物和源码 HEAD | 通过 | `18,339` 文件、`461` 个编译文件；ASAR 中的 `buildProvenance.sourceHead` 与 `51cd307de82c58295bb7941e52ab58d8645a1a18` 一致 |
| `better-sqlite3` 原生 Runtime | 通过 | arm64 Electron ABI `148` 内存数据库 smoke 通过 |
| MarkItDown sidecar | 通过（单架构） | arm64 候选包含 `1` 个 helper；使用 `EXPECTED_HELPERS=1` 完成 sidecar、许可文件、模型和启动 smoke |
| DMG 完整性 | 通过 | `hdiutil verify` CRC 有效；SHA-256 `b84e277e7207d79a54c68a8ad186d0c9a11eee3bc687d9e0fbfdfab13de4ed90` |
| 版本与来源 | 通过 | 包内版本 `0.5.0`，来源 HEAD 与构建提交一致 |
| macOS 代码签名 | 结构通过，发布门禁未通过 | adhoc 签名、`codesign --verify --deep --strict` 通过；无 Developer ID、Team ID、公证和 stapling |

### clean 候选 GUI 启动结果

使用隔离用户目录启动精确 arm64 候选，没有操作 `/Applications/WorkWise.app`。候选进程在
macOS 26.6.2 的当前受限运行环境中立即退出，未监听 CDP/渲染器端口；对应诊断报告为：

`/Users/wangjiawei/Library/Logs/DiagnosticReports/WorkWise Candidate 51cd307de82c-2026-09-03-093750.ips`

报告记录 `app_version=0.5.0`、候选 bundle ID、`SIGABRT`，崩溃发生在 AppKit
`RegisterApplication`/`NSApplication` 初始化阶段。通过 LaunchServices 打开同一候选 bundle
另外返回 `NSOSStatusErrorDomain Code=-10827 (kLSNoExecutableErr)`。因此本次不能把工程线程隔离、
AI 首屏、经典 fallback、主题/窄窗口/a11y 或真实 CSV/XLSX → DOCX/PDF/XLSX/manifest 的
打包 GUI 验收记为通过，也不能用源码测试或旧候选窗口替代。

### 当前剩余门禁

- `workwise-0-5-0-engineering-delivery` 仍为 `15/18`；任务 15 的真实打包 GUI 验收和任务 18 的
  打包 GUI 收口需要可见的候选窗口以及可用的 macOS 签名/公证环境。
- 旧变更 `workwise-0-3-3-flow-and-delivery` 的 7.4 仍需要精确候选 GUI；
  `add-builtin-specialist-skills` 的 3.4 仍缺可用图片 Provider 的真实输出；5.6 仍缺 Windows x64
  原生验收环境。上述条件不具备时保持未勾选，不以静态检查、Mock 或旧包冒充通过。

本机复核：用户 Runtime 配置中的 `imageGen.enabled=false`、
`visionEvidence.enabled=false`；系统为 macOS arm64，未发现 Wine 或 Windows 交叉运行时。因此不能
把本地测试图片、DeepSeek 视觉理解或 macOS 构建结果替代 Document Illustrator 图片生成和 Windows
x64 候选验收。

## 2026-09-03 自动化门禁刷新

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm test`：在允许本机回环监听、并将 `better-sqlite3` 重编译到 Node ABI 147 后通过，
  `286` 个测试文件通过、`2` 个跳过，`2350` 个测试通过、`2` 个跳过。
- `npm run build`：通过；Runtime、主进程、预加载和 renderer 生产构建完成，包含
  `EngineeringWorkspaceView` chunk。
- `npm run verify:build-freshness`：通过，检查 `909` 个生产输入。
- `openspec validate --all --strict --no-interactive`：`11 passed, 0 failed`。
- `npm run verify:brand-boundary`、`npm run verify:document-licenses`、`git diff --check`：通过。

回环权限和原生 ABI 是测试运行条件；它们不改变任务 15/17 的真实 GUI、图片 Provider 和
Windows 验收结论。公开版本仍为 `0.4.2`，未创建或移动 tag、未发布 Release、未提升 Stable。

## 2026-09-03 工程测量工作台产品体验复核与修复

用户反馈“候选包像 Web 后台，不像 AI Agent 工作台，也不像专业测量软件”与源码现状一致：原工程 AI 页面采用两栏卡片堆叠，测量平差页面把 JSON 文本框作为主要交互，项目导航也把 AI、数据和交付阶段平铺在同一层级。该状态不能视为 0.5.0 的产品验收通过。

本轮已完成源码级产品修复（候选包尚未重打包）：

- `EngineeringAiCommandCenter` 改为三栏工程 Agent 表面：左侧执行阶段轨、中央真实 ChatState 会话与目标输入、右侧 Copilot 检查器。Typed Plan、审批、TaskRun 状态、下一步和证据回流在同一工作区中显示，保留工程线程隔离和 Runtime 单一执行链。
- `SurveyAdjustmentPanel` 改为专业测量工作区：网形与基准、观测表、点位与拓扑、平差结果与精度评定四个区段；显示已知/未知点、测站到目标、单位、先验中误差、闭合差、残差、粗差候选、方差因子和运行哈希。高级 JSON 仅保留为兼容输入入口。
- 工程导航按“AI 工作流 / 数据与计算 / 交付与审查”分组，删除指标卡片的彩色左边框，减少通用后台视觉。
- 新增 `EngineeringWorkbenchExperience.test.ts`，防止 AI 三栏结构、证据回流和测量专业区退化为 JSON-only 界面。

本轮源码验证：`npm run typecheck`、`npm run lint`、工程体验定向测试 `7/7`、`npm run build` 和 `git diff --check` 通过。当前私有候选包仍是修复前构建，必须重打包后才能进行视觉验收；此前记录的 macOS 候选包 AppKit `SIGABRT` / `kLSNoExecutableErr` 阻塞仍然存在。因此任务 15、17、18 继续未完成，不能发布 0.5.0。

## 2026-09-03 测量策略内核增量回归

- 水准、导线、平面控制、三角网、CPIII、GNSS 和坐标转换继续通过显式 `strategyId` 分发；未知网型不会返回成功结果。
- GNSS 新增专用基线加权求解：缺少标准协方差、固定基准、端点坐标或基线观测时稳定返回阻断；完整二维基线 fixture 返回闭合量、残差、标准化残差、协方差和精度摘要。
- 坐标转换支持显式七参数，也支持至少两组非退化源/目标控制点的确定性二维相似变换拟合；缺少参数或控制对不会默认套用零参数。
- 导线结果补充 `fx`、`fy` 和相对闭合差；运行前按点数、观测数、未知参数和预计矩阵非零元素执行硬上限检查，超限不分配矩阵。
- Runtime 测量回归：89 个测试文件、818 个测试通过；本轮新增 GNSS 完整输入和坐标转换拟合 fixture，测量定向测试共 17 项通过。
- UI 结果面板显示策略、算法版本、导线闭合差和 GNSS 基线闭合摘要；源码类型检查、Lint、生产构建和品牌边界均通过。

以上为源码和 Runtime 证据，尚不能替代最新候选包中的可见 GUI、真实工程资料、签名/公证和跨平台验收；任务 15、17、18 仍保持未勾选。

## 2026-09-06 当前工作树验证刷新

本节只记录当前工作树（HEAD `9210efe15bbc3331f202cd866c74d7acee95b33f`）及本轮
CR-only Leica GSI 原始行锚点修复后的自动化证据。公开版本仍为 `0.4.2`，未创建 tag、Release，
未提升 Stable，也未覆盖 `/Applications/WorkWise.app`。

- `npm --prefix kun run typecheck`：通过。
- `npm run typecheck`：通过。
- `npm run lint`：通过，0 error；保留既有 `src/renderer/src/components/Workbench.tsx:1402`
  的 Hook dependency warning。
- `npm --prefix kun test`：118 个测试文件，1222 passed、1 skipped。
- `npm test`：在允许本机回环监听的环境中 294 个测试文件通过、2 个跳过，2382 passed、2 skipped。
  受限沙箱中的 loopback `listen EPERM` 不计作业务回归。
- 格式/来源定向回归：7 个测试文件，227 passed、1 skipped；包含 Leica GSI 物理 lexer、CR-only
  原始行锚点、SUC 归档边界、GNSS/转换器安全处置。
- `npm run test:survey-converter-sandbox`：本机无网络转换器沙箱 7/7 通过。
- `npm run build`、`npm run verify:brand-boundary`（1463 files）、`npm run verify:document-licenses`、
  `npm run verify:build-freshness`（935 inputs）、`git diff --check`：全部通过。
- `npm exec --yes openspec -- validate --all --strict --no-interactive`：11 passed、0 failed。

这组自动化证据不替代打包应用可见窗口、双架构私有 RC、签名/公证、updater 往返、授权厂商
golden/negative fixtures 或专业人员验收。OpenSpec 任务 23、42、48、49、50、52 继续保持未勾选；
P0 目录仍将未取证厂商格式保持为 `archive-only`，GNSS 原始数据保持 `gnss-processing-required`，
无审计转换器的私有格式保持 `converter-required`。

## 2026-09-06 专业格式安全处置覆盖

- 新增 `kun/src/engineering/survey-format-coverage.test.ts`，用 33 个独立合成探针覆盖 RINEX
  2/3/4 观测/导航/气象/钟差、Hatanaka、SINEX、NMEA、RTCM 2/3、SP3/IONEX/ANTEX、u-blox
  UBX、NovAtel OEM、Septentrio SBF、BINEX、Javad JPS、Topcon TPS、南方 STH、中海达 ZHD、
  华测 HCN、司南 CNB，以及 Trimble T00/T01/T02/T04/JOB、Leica DBX/MDB 和 Survey Pro
  转换器入口；同时覆盖 Topcon GTS-7、FC-5、Nikon RAW 的归档阻断。
- 定向结果：33/33 通过；Runtime typecheck 和 `git diff --check` 通过。
- 这些探针只证明“内容/扩展名可被识别并落到正确的安全处置”，不证明厂商互操作、单位/基准
  语义或 adjustment-ready。任务 32、33、34、36 仍不能勾选；没有新增真实厂商数据、二进制
  转换器或网络下载。

## 2026-09-06 AI 首屏离线恢复补强

- `EngineeringAiCommandCenter` 在 Runtime 错误时新增“重试 Runtime”和“检查配置”操作；Runtime
  尚未连接但尚未产生错误时也显示可操作的“重试连接”入口。
- 消息时间线、空项目状态和目标输入继续保留，恢复动作统一调用现有 `probeRuntime('user')`，
  不创建第二套连接状态，也不改变 Engineering 线程隔离或附件边界。
- 定向 UI 回归：`EngineeringWorkbenchExperience` 与产品命名回归 5/5 通过；类型检查、
  `eslint --quiet` 和 `git diff --check` 通过。

## 2026-09-06 原生测量格式合成夹具增量

- 新增 `kun/src/engineering/fixtures/survey-formats/professional/manifest.json` 及 17 个独立合成夹具：
  Leica GSI-8/GSI-16/HeXML、Trimble JobXML/M5、TDS RAW、Carlson RW5、Sokkia SDR33、LandXML，
  每类同时保留 golden 与 malformed negative 样例。
- 新增 `survey-professional-fixture-manifest.test.ts`，逐文件验证内容识别、原始附件保留、解析结果或
  `archive-only` 阻断；18/18 通过。合成夹具仅证明 parser safety/provenance，不构成授权厂商互操作证据。
- 新增同一项目修订号下连续多文件导入回归；52/52（SurveyService 与夹具清单）通过，确认导入不会
  推进工程项目修订号，也不需要放宽 `expectedRevision` 检查。
- 本轮根项目完整回归：在允许本机回环监听的环境中 294 个测试文件通过、2 个跳过，2382 个测试通过、
  2 个跳过；Runtime 119 个测试文件通过、1 个跳过，1241 个测试通过、1 个跳过。
- 本轮 `npm run build` 通过；`verify:build-freshness` 检查 936 个生产输入，品牌边界、文档依赖/许可证、
  严格 OpenSpec 校验和 `git diff --check` 均通过。Lint 保留既有 `Workbench.tsx:1402` Hook dependency warning。
- 任务 32、33、34、36 仍保持未勾选；待真实/授权厂商 golden、独立参考计算、审计转换器和打包验收后再评估。

## 2026-09-06 Leica GSI 单位码与事务性失败回归

- 更新 GSI8/GSI16 夹具与断言：单位原始值现在保留为 `0:0.001-m`、`2:0.00001-gon` 等
  provenance 字符串，不再把原始声明压扁成 `m/deg`；观测本身仍只向数值内核提供 canonical
  `m/rad`。
- 新增 `survey-leica-gsi-units.test.ts`，覆盖长度码 `0/1/6/7/8`、角度码 `2/3/4/5`、
  GSI8/GSI16 两种数据区宽度、正负号、逐 word 混合单位、完整 raw lexeme/information/anchor、
  紧凑 DMS 边界、非法单位码、维度冲突和不安全数值。定向结果：5 个测试文件、248 项通过。
- P0 目录原因现在在成功解析的归档结果中完整回显；解析器能力或安全失败优先时仍返回具体的
  `数值语义校验失败`/`archive-only` 原因，避免用目录说明覆盖可操作诊断。
- 该回归仍只证明合成输入的解析安全与来源保留，不构成 Leica 授权厂商互操作、独立参考计算或
  `adjustment-ready` 证据；任务 32、33、34、36 继续保持未勾选。

## 2026-09-06 XML 原始记录锚点补强

- HeXML、Trimble JobXML/JXL 和 LandXML 解析现在为点、测站、目标和观测记录发布真实物理行级
  `rawRecordAnchors`。对压缩成单行的 XML，多个记录明确共享原文件第 1 行和完整行字节范围；实现
  不伪造元素级 byte span。
- XML 仍保留方言语义/单位/元素级偏移未独立验收的阻断诊断，并继续保持 `archive-only`，没有把
  合成解析结果提升为 `adjustment-ready`。
- 定向回归：`survey-format-registry` 与专业格式 fixture manifest 共 2 个测试文件、151 项通过；
  Runtime typecheck 通过。
- 生产构建已按本次 Runtime 改动重建；`npm run build` 与 `npm run verify:build-freshness` 通过，检查
936 个生产输入。该构建仍未安装到 `/Applications`，也未改变公共版本或发布渠道。

## 2026-09-08 真实 COSA P0 闭环与落盘竞态修复

- 新增显式映射 [`cosa-in1-level-2known-ascii-mapping.json`](../../docs/references/cosa-in1-level-2known-ascii-mapping.json)，用于真实 ASCII、2 条已知点、CSV 四字段测段的 COSA `.in1` 布局；不猜测列序、不修改原始文件。
- 用户授权的真实 COSA 文件在隔离 Runtime 中完成 `导入 → 预检 → 确定性平差 → DOCX/PDF/XLSX/manifest`：左线 `.in1` 134 条观测/61 点，左线 `.in2` 268 条观测/61 点；右线 `.in1` 116 条观测/52 点，右线 `.in2` 232 条观测/52 点。两份 `.in1` 与同源 `.ou1` 的逐点比较均为 `mismatches=0`，最大显示高程差分别为 `4.9803e-6 m`、`4.8722e-6 m`。
- 修复 `SurveyService`/`EngineeringService` 的异步 sidecar/元数据写入竞态：新增 `flush()` 等待持久化队列和原子写入队列，Runtime shutdown 与交付脚本清理临时目录前均显式等待；新增回归测试确认调整 sidecar 已落盘。
- 定向测量回归：4 个测试文件、206 项通过；Runtime typecheck、主项目 typecheck、lint、生产 build、952 项 build-freshness、品牌边界、文档许可和 `git diff --check` 通过；`npm exec --yes openspec -- validate --all --strict --no-interactive` 为 `11 passed, 0 failed`。
- 主项目全量测试：在允许本机 loopback、并将根项目 `better-sqlite3` 从 Electron ABI 148 重编译回 Node ABI 147 后，`298` 个测试文件通过、`2` 个跳过，`2413` 个测试通过、`2` 个跳过；没有测量相关失败。受限沙箱下的 loopback 失败和打包后的 ABI 临时切换均已区分记录，未改动源码依赖版本。
- 使用本地缓存 `electron-builder 26.8.1` 生成 arm64 App，ASAR 完整性通过（18,364 文件、461 个编译文件），包内 SQLite smoke 通过（ABI 148）；同次检查涉及的 x64 App 为旧产物，未在本轮重建。DMG 在受限环境中因 `~/Library/Caches/electron-builder` 写入权限失败；App 为 adhoc 签名、无 Team ID、未公证。该次命令没有启用 `WORKWISE_CANDIDATE=1`，生成的是生产应用标识的本地包，不能作为正确隔离候选的验收证据。
- 该次启动中 `open` 返回 `NSOSStatusErrorDomain Code=-10827 (kLSNoExecutableErr)`，直接执行仅记录退出码 134。此前误引用的 `WorkWise-2026-09-08-041754.ips` 来自 04:17 的旧 0.5.0 包，不能用于归因 11:05 构建的 0.4.2 包；撤回据此作出的 SIGTRAP 结论。任务 15、29、36 在获得身份明确的候选包 GUI 证据前保持未勾选。

## 2026-09-06 官方格式取证与 RW5/GNSS 增量回归

- 通过公开浏览核验 Carlson [RW5 File Format](https://update.carlsonsw.com/manuals/SurvCE/online/source/FileFormat.html)：`OP` 是测站、`FP` 是目标；`LS.HI/HR` 是仪器高/棱镜高；`BD/BR/FD/FR` 表示正倒镜；`MO.UN` 为 `0=feet, 1=meter, 2=US feet`；`ZE` 与 `VA` 语义不同，`AU` 枚举未在该页定义。
- `parseRawRw5` 已按上述事实修正：不再把 `OP` 当目标，不再遗漏 `FD/FR`，支持有界 `LS` 状态与显式 `MO.UN` 线性换算；未知单位和未核验角度只保留 raw 字段并阻断，`BK` 仅保留为设置记录。解析器指纹提升为 `workwise-survey-formats-14`。
- 通过公开浏览核验 [Trimble JobXML Schema 6.27](https://ww2.trimble.com/schema/JobXML/6_2/JobXMLSchema-6.27.xsd)：XSD 明确 `JOBFile/FieldBook/Reductions/Environment` 结构，以及角度/经纬度十进制度、距离与仪器/目标高米制；schema 原件未复制进仓库，JobXML 仍需逐元素 golden/互操作验收。
- 固定 RTKLIB 提交 `71db0ffa0d9735697c6adfd06fdf766d0e5ce807` 的公开研究原件已隔离到 `docs/references/third-party/gnss-rtklib/`，包含 RINEX 2.10、SP3、RTCM 2/3、u-blox、NovAtel、Javad 文件及 BSD-2-Clause 说明；每个文件均记录字节数、Git blob SHA-1 与 SHA-256。它们只用于检测/锚点和 `gnss-processing-required`，不宣称基线成果。
- 新增 `survey-rw5-inspection.test.ts`（22 项）和 `survey-rtklib-fixtures.test.ts`（8 项）；连同格式注册/专业夹具回归共 `181` 项通过。`npm --prefix kun run typecheck` 通过。
- 任务 32、33、34、36 仍未完成：尚缺每个广告厂商格式的授权/脱敏 golden 与独立数值参考、完整格式族覆盖、经审计的私有格式转换器，以及安装包多厂商导入→平差验收。任务 15、29 仍受打包 UI/实机验收门槛约束。

随后重建 Runtime 与 Electron 生产输出后，`npm run verify:build-freshness` 检查 `936` 个生产输入通过；`git diff --check` 和严格 OpenSpec 校验仍通过。

## 2026-09-06 GNSS 来源锚点与 SINEX 语义加固

- RINEX、SINEX、NMEA、SP3、IONEX、ANTEX 现在发布物理行级来源锚点；支持 LF、CRLF、CR、UTF-8 BOM、UTF-16LE/BE，并在记录超出锚点上限时整体阻断，不输出被截断的伪来源记录。
- SINEX 解析按 `INDEX TYPE CODE PT SOLN EPOCH UNIT CONSTRAINT ESTIMATE` 列读取 `ESTIMATE`，仅合并同一测站、解、历元的完整 STAX/STAY/STAZ；重复解、单位错误、非有限值和不完整向量只生成 `record_ignored`，不产生部分点。
- RTCM2 以及没有经过消息边界审计的 JPS/TPS/STH/ZHD/HCN/CNB 原始字节改为单个 `unparsed-source` 文件锚点，不再从 `0x66/0x99` 或任意二进制内容猜测协议记录；处置仍为 `gnss-processing-required`。
- 新增 `survey-gnss-source-evidence.test.ts`，59 项通过；格式定向回归合计 254 项通过，Runtime typecheck 通过。该证据只证明有界检测、来源保留和安全阻断，不把 GNSS 原始流提升为基线平差成果。

本轮完整验证：Runtime `123` 个测试文件通过、`1397 passed / 1 skipped`；根项目 typecheck、`eslint --quiet`、Runtime/Electron 生产构建、构建新鲜度（936 inputs）、严格 OpenSpec（11/11）和 `git diff --check` 均通过。公共版本、安装目录与发布渠道未变更。

## 2026-09-06 格式 fixture 清单与哈希回归补强

- `survey-professional-fixture-manifest.test.ts` 现在对 Leica GSI-8/GSI-16、HeXML、Trimble
  JobXML/M5、TDS RAW、Carlson RW5、Sokkia SDR33、LandXML 的固定观测数量、数值和单位做断言；
  TDS/RW5 fixture 显式声明 `MO,UN1,AU0`，Sokkia fixture 使用 SDR33 定长字段布局。所有解析结果
  仍由 P0 策略限制为 `archive-only`，不会因有观测而自动进入平差。
- `survey-public-fixtures.test.ts` 新增 MANIFEST 文件字节数、SHA-256 和 Git blob SHA-1 重算校验；
  公开样本的来源、许可证和本地原件现在可在测试中逐项复核。
- 新增 `fixtures/survey-formats/gnss/manifest.json` 与
  `survey-gnss-format-manifest.test.ts`，以 24 个有界 synthetic probe 覆盖 RINEX 2/3/4
  （观测/导航/气象/钟差）、Hatanaka、SINEX、NMEA、RTCM 2/3、SP3/IONEX/ANTEX、u-blox、
  NovAtel、Septentrio、BINEX、Javad、Topcon、South、Hi-Target、CHCNAV 和 ComNav；每项均验证
  原件保留、无观测输出和 `gnss-processing-required`（Hatanaka 为 `converter-required`）。
- 本轮定向格式回归：4 个测试文件、77 项通过；Runtime typecheck 与 `git diff --check` 通过。

上述证据仍是 parser/inspection/provenance 安全边界，不是厂商互操作、授权真实外业数据、独立
参考平差、审计转换器或打包 GUI 验收。任务 15、29、32、33、34、36 继续保持未勾选；公共版本仍
为 `0.4.2`，未创建 tag/Release、未提升 Stable、未覆盖 `/Applications/WorkWise.app`。

## 2026-09-06 本机回环与转换器沙箱结果

- 根项目在允许本机回环监听的执行环境中全量回归：`294` 个测试文件通过、`2` 个跳过，
  `2382` 个测试通过、`2` 个跳过。受限沙箱中复现的 `listen EPERM 127.0.0.1` 仅属于环境权限限制。
- `npm run test:survey-converter-sandbox`：受限环境曾返回 `sandbox_apply: Operation not permitted`，
  该次不计通过。恢复严格的 `ok: true` / 输出逐字节相等断言后，在本机权限下重跑 `7/7` 真正通过。
  这里执行的是系统 `/bin/cp` 测试适配器，只证明执行基础设施，不证明厂商转换器可用；任务 34 未完成。
- `npm run lint` 仍为 0 error，保留既有 `Workbench.tsx:1402` Hook dependency warning；
  Runtime/根项目 typecheck、生产构建、品牌/许可证/新鲜度校验、严格 OpenSpec 和 `git diff --check`
  均通过。

- 浏览器外部对照检索还确认 Total Open Station 固定提交
  `95fc444ce2d8f6c663f19db7754e295f621e030a` 中存在 Sokkia SDR33、Carlson RW5、Nikon RAW 和
  Leica GSI 样本。该仓库虽声明 GPL-3.0，但样本没有独立再分发许可；本项目只记录路径和提交，
  未复制样本或上游代码，继续使用独立 synthetic fixture 作为仓库测试输入。

## 2026-09-07 COSA 真实配对只读数值对照

- 在用户授权的本机 `/Volumes/MOVESPEED` 挂载内找到 7 组 `.in1/.ou1` 候选配对；原始文件未复制、修改或上传。
- 新增显式 `knownPointRecordCount` 映射，用于没有空行分隔已知点区和测段区的真实导出；映射仍要求固定版本、单位和一对一列绑定。
- `.ou1` 对照现在先验证“已知点信息”和“测段实测高差数据统计”表，核对点号、顺序、高差、距离和距离倒数权，再比较“高程平差值及其精度”表；输入与报告不是同一测段集合时直接阻断。
- 只读 CLI：`scripts/check-cosa-level-reference.mjs`。该工具仅输出文件字节数、SHA-256、记录计数、自由度、差异计数和固定舍入容差，不输出原始测量值。

结果摘要：左线 `InPush(0627c01--0728c08)` 通过（3 known / 113 unknown / 290 sections / dof 177）；芦徐区间通过（2 / 40 / 103 / 63）；高梁区间通过（2 / 63 / 160 / 97）；高高区间通过（2 / 67 / 176 / 109）；宁波 1 号线二期 B 测站通过（3 / 41 / 102 / 61，GB18030 + 全角逗号已知点段）。右线 `s6g03-s7g48原始数据` 因输入 143 段、报告 108 段而阻断；梁芦区间存在 3 条报告测段与输入不一致并造成 40 个高度超出报告打印精度，标记为失败而不是通过。

该结果证明的是当前 COSA 水准布局解析和确定性水准网计算在五组真实配对上可复现报告打印结果；它不满足 PRD 的授权/脱敏样本再分发、全 P0 格式互操作、安装包 GUI 或专业人员签署门禁。因此 OpenSpec 任务 15、29、32、33、34、36 继续保持未勾选，`.in1` 仍为 `archive-only`。

- 本轮回归：Runtime 定向 COSA/registry 测试 `179 passed`；Runtime 全量 `127` 个测试文件、`1472 passed / 1 skipped`；根项目在允许本机回环监听的环境中 `294` 个测试文件、`2382 passed / 2 skipped`；根项目类型检查、Runtime/根项目构建、严格 OpenSpec `11/11` 和 `git diff --check` 通过。
- `npm run lint` 为 `0 errors / 1 existing warning`（`Workbench.tsx:1402` 的既有 Hook dependency warning）。受限沙箱下的根测试曾因 `listen EPERM` 失败，提升本机回环权限后同一测试全量通过；该环境差异未修改测试或生产代码。

## 2026-09-07 Computer Use RPC 配置复核

- 已在 `/Users/wangjiawei/.codex/config.toml` 配置 `computer-use` MCP，使用绝对路径启动
  `computer-use-client-launcher`，并为 `node_repl` 显式设置 `CODEX_HOME`、Sky 客户端路径和
  Computer Use 指令注入；当前 WorkWise 候选 bundle 标识已加入允许列表。
- 直接启动本机 launcher 并发送 MCP `initialize` 请求成功，返回 Computer Use 服务端及协议版本；
  启动器可执行文件、Sky 客户端和 `node_repl` 路径均存在。该握手只证明 RPC 传输层可用，不代表候选
  GUI 验收通过。
- 当前 Codex 线程中的旧 `node_repl` 连接在配置变更后返回 `Transport closed`，需要新线程或重启
  Codex 应用重新加载配置后，才能继续通过 `node_repl + @oai/sky` 读取隔离候选窗口。此期间未对
  `/Applications/WorkWise.app` 执行任何 Computer Use 操作，也未把 RPC 层握手冒充为 UI 通过。

## 2026-09-07 当前工作树自动化门禁

- Runtime 全量：`127` 个测试文件，`1472 passed / 1 skipped`。
- 根项目全量：在允许本机回环监听的执行环境中 `294` 个测试文件，`2382 passed / 2 skipped`；
  受限沙箱中的 `listen EPERM` 失败未计入业务回归。
- Runtime/WorkWise typecheck、生产构建、严格 OpenSpec `11/11`、品牌边界（1467 files）、文档
  依赖/许可证、新鲜度（942 production inputs）和 `git diff --check` 均通过。
- 无网络 macOS converter sandbox：`7/7` 通过；执行的是系统 `/bin/cp` 测试适配器，只证明执行
  基础设施，不代表任何厂商转换器已获许可或可用于生产。
- 以上自动化证据不替代隔离候选的可见窗口、合法 Runtime API Key、真实/授权厂商 golden、独立
  参考平差、审计转换器和专业人员签署。OpenSpec 任务 23、46、52、53、54、56 仍未勾选。

## 2026-09-07 工程 AI 计划审批与 TaskRun 复核

- 用户明确确认并启动计划 `eplan_62088e77-94b5-4914-8ae2-e501cb011d47`；隔离 Runtime 创建
  `task_578347aa-df33-4618-a7bf-2a37162b103e`，事件顺序为 `task_created` → `attempt_started` →
  `task_completed`，TaskRun 状态为 `completed`。
- 四个计划步骤均记录为 `approved` 并走完执行阶段；有界上下文中的
  `surveyNetworks`、`datasets`、`surveyAdjustments`、`analyses`、`runs` 均为空，因此 Agent
  明确阻断工具调用，不编造 `networkId`/`datasetId`/`adjustmentIds`，不写入测量数值，也没有导出
  成果文件。该结果证明审批门禁和空上下文保护生效，不构成真实测量数据验收。
- 工程入口已调整为 Code / Survey 主模式，Write、Flow、Design、Plugins、Scheduled tasks 保留
  在侧边栏；Survey 项目元数据、导航分组和 AI 指挥台文案接入中英文 locale，并压缩执行协议与
  解释性文案。源码定向测试、typecheck 和生产构建通过。
- 由当前工作树生成的私有 arm64 候选 ASAR 完整性通过（18,392 文件、514 个编译文件），但 macOS
  候选 bundle 在 AppKit 初始化阶段仍 `SIGABRT`，因此没有把打包 GUI、主题/窄窗口或真实资料导入
  验收记为通过，也没有安装到 `/Applications` 或修改公共版本/发布渠道。

## 2026-09-07 Survey locale pass

- AI 指挥台的空状态、Typed Plan、TaskRun 状态、审批/恢复、证据检查器、资料入口和目标输入均改为
  使用 `common` locale；中英文 locale 的键集合保持一致（工程/Survey 相关键 219 个）。数字格式随
  当前语言切换为 `zh-CN` 或 `en-US`。
- 相关回归：工程测量组件 `6` 个测试文件、`24` 个测试通过；聚焦 Agent/工作台测试 `8/8` 通过；
  typecheck、生产构建和 `git diff --check` 通过；Lint 保留 1 条既有 `Workbench.tsx:1402` Hook
  dependency warning，新增代码无 error。
- 经典测量平差面板的专业数据诊断和历史兼容提示仍有部分领域术语保留中文，不能据此宣称整个经典
  面板已完成英文等价翻译；核心 AI 入口和主导航已完成语言跟随。

## 2026-09-07 Survey locale and interaction pass

- 经典 Survey 平差面板的用户界面文案已接入 `common` locale：网络类型、转换类型、来源筛选、就绪状态、
  观测/点位/结果/期次导航、来源预检、原始记录锚点、残差定位、来源资格和计算状态均随全局中英文切换
  重新渲染。厂商名称、格式标识、坐标基准、原始诊断、哈希、ID 和 JSON 样例保持原文，避免翻译数据或证据。
- 删除了测量页重复的解释性头部/提示内容；保留来源资格、完整性失败和历史结果锁定等必要安全门禁。平差
  主按钮统一为“运行平差 / Run adjustment”，不再把坐标转换模式误称为加权最小二乘。
- 新增 DOM 语言切换回归：切换到英文后仍保留当前网络选择，切换到 archive-only 来源后平差按钮仍保持禁用。
  工程测量定向测试 `4` 个文件、`20` 个测试通过；类型检查、生产构建和 `git diff --check` 通过；Lint
  仍为 `0 errors / 1 existing warning`（`Workbench.tsx:1402`）。
- 全量 `npm test` 本轮得到 `286` 个文件通过、`2` 个跳过；剩余 `13` 个失败均为受限执行环境的本机
  `127.0.0.1` 监听 `EPERM`（Runtime、OAuth、OCR、候选端口测试），另有源码断言已随 locale 迁移更新。该
  环境失败不计作业务逻辑通过，也不改变任务 15、29、32、33、34、36 的未完成状态。

## 2026-09-07 Full regression with loopback permission

- 在允许本机临时回环监听的执行环境重跑 `npm test`：`294` 个测试文件通过、`2` 个跳过，
  `2384` 个测试通过、`2` 个跳过。此前 `13` 个失败均复现为受限沙箱的 `listen EPERM`，本次未再出现。
- 本次通过只覆盖源码和 Runtime 自动化回归，不改变打包 GUI、厂商 golden、审计转换器或专业人员签署的
  验收结论；OpenSpec 任务 15、29、32、33、34、36 继续保持未勾选。

## 2026-09-07 原生测量格式独立驱动矩阵（当前状态修订）

- 新增 `kun/src/engineering/survey-native-format-golden.test.ts`，以独立于 parser 的固定期望值
  覆盖 Leica GSI8/GSI16/HeXML、Trimble JobXML/M5（含 `.dat` 内容优先冲突）、TDS/Carlson
  RAW/RW5、Sokkia SDR20/SDR33 和 LandXML；每种驱动均保留正向观测、原始记录锚点、输入
  SHA-256 和负向无部分观测断言。
- 新增 `trimble-m5-dat.dat`、`sokkia-sdr20.sdr` 及对应负向夹具；专业格式 manifest 与原生
  驱动矩阵均校验这些独立样本。定向回归：
  `npm --prefix kun test -- --run src/engineering/survey-native-format-golden.test.ts
  src/engineering/survey-professional-fixture-manifest.test.ts`，70/70 通过。
- 因此 OpenSpec 任务 32 的“原生驱动实现与 synthetic golden/negative 独立验证”已完成。所有
  P1/P2 格式仍由目录/策略保持 `archive-only`，不构成厂商授权、独立专业参考计算、
  `adjustment-ready` 资格或打包应用内多厂商导入→平差验收。

## 2026-09-07 GNSS 格式族安全处置矩阵（当前状态修订）

- `kun/src/engineering/fixtures/survey-formats/gnss/manifest.json` 与
  `survey-gnss-format-manifest.test.ts` 覆盖 RINEX 2/3/4 观测、导航、气象、钟差，Hatanaka/CRINEX，
  SINEX、NMEA、RTCM 2/3、SP3、IONEX、ANTEX，以及 u-blox UBX、NovAtel OEM、Septentrio SBF、
  BINEX、Javad JPS、Topcon TPS、South STH、Hi-Target ZHD、CHCNAV HCN、ComNav CNB。
- `survey-gnss-source-evidence.test.ts`、`survey-rtklib-fixtures.test.ts` 和格式注册器回归覆盖
  物理行/字节锚点、压缩展开上限、截断帧和公开研究样本；`survey-golden.test.ts` 与 Runtime 服务回归
  覆盖固定三维基准、向量分量和完整协方差的 GNSS 平差，以及缺协方差/基准/非正定矩阵的稳定阻断。
- 因此 OpenSpec 任务 33 的“GNSS 格式族 inspection/import 状态与平差前基准/协方差门禁”已完成。
  原始 GNSS 数据仍明确保持 `gnss-processing-required`（Hatanaka 为 `converter-required`），不构成
  厂商认证、GNSS 后处理器交付或打包多厂商闭环；任务 15、29、34、36 仍未完成。

## 2026-09-07 本轮自动化与私有应用包复核

- `npm --prefix kun test -- --run src/engineering/survey-converter.test.ts`：13 项通过、1 项按平台条件跳过。
  本轮修复了无适配器矩阵对“缺省属性”与显式 `undefined` 的错误断言；未改变转换器安全策略。
- 根项目 `npm test`：在允许本机临时回环监听的执行环境中 `294` 个测试文件通过、`2384` 项通过、2 项跳过。
  受限沙箱中的 `listen EPERM 127.0.0.1` 仅是环境权限差异，未计作业务失败。
- `npm run typecheck`、`npm run lint`、`npm run build`、`npm run verify:build-freshness`、严格 OpenSpec
  校验和 `git diff --check`：均通过；Lint 保留 `Workbench.tsx:1402` 的既有 Hook dependency warning。
- 使用当前工作树构建了隔离私有 arm64 应用目录
  `/private/tmp/workwise-0.5-current-dist/mac-arm64/WorkWise.app`，通过 `electron-builder 26.8.1`
  的 `dir` 目标构建，包内 `CFBundleShortVersionString=0.5.0`。`verify-packaged-asar`：18,341 个文件、
  462 个编译文件通过；ASAR SHA-256 为
  `f83ff1ef8bc5f0163abfba79ec7406164fb272e283bfaf9ffc1c5aaab2e7e489`。
- `verify-packaged-runtime-native`：arm64 `better-sqlite3` 内存数据库 smoke 通过，Electron ABI `148`。
  代码签名结构校验通过但为 adhoc（`TeamIdentifier` 未设置）；公证/stapling 未执行。
- DMG 目标未计为通过：首次构建因 npm 无网络无法下载 `electron-builder`，改用本机缓存的 26.8.1；随后
  DMG builder 的用户缓存目录写权限失败。应用目录包没有上传、没有安装到 `/Applications`，公开版本和发布源不变。
- 启动该当前工作树应用的直接 GUI 进程未建立可连接的渲染器/CDP 端口；既有候选在 AppKit
  `RegisterApplication` 阶段 `SIGABRT` 的阻塞仍适用。因此本轮不把工程线程隔离、主题/窄窗口/a11y、
  真实 CSV/XLSX → DOCX/PDF/XLSX/manifest 的打包 GUI 验收记为通过。

本轮只收紧了自动化与包内容证据，不改变以下结论：OpenSpec 任务 15、29、34、36 仍未完成；未取得
审计通过的 Trimble/Leica/Survey Pro 本地转换器，也没有合法授权的多厂商打包导入→平差验收资料。

## 2026-09-07 本轮测量生产链修订（以本节为当前状态）

- 生产处理政策已修订：本地测量数据的正常解析、平差和成果导出不以 Trimble、Leica、Survey Pro
  厂家授权或转换器授权为前置条件。私有二进制仍只能使用用户本地提供、网络禁用、限时限输出、
  允许列表内的转换器；WorkWise 不捆绑厂家二进制、不逆向 opaque 格式，也不复制或上传用户源文件。
- 纯测量交付不再要求伪造监测 CSV/XLSX。`EngineeringService.previewReport/finalize` 现在接受仅有已选
  平差/变形成果的请求，生成 DOCX、PDF、XLSX 和 `manifest.json`；此类 manifest 的 `inputDatasets`、
  `analyses`、`charts` 为空，不会声称存在监测观测、阈值或趋势分析。监测报表原有数据集链路保持兼容。
- 水准网络闭合已扩展为控制点根定的有序生成森林：无序分支网络的非树观测产生独立原始环闭合量，
  交付和闭合限差门禁使用同一确定性计算；无冗余树网络不虚构闭合。旧版记录可读，但缺少 COSA
  `X=北/Y=东` 轴序元数据的旧 `.in2` 不能用于新的计算或交付，须从原始文件重新导入，原记录不改写。
- 平面控制模型不再因退化几何静默丢弃方程；无效几何保留行身份并以非有限目标使解算阻断。COSA 新导入
  明确保留 `north-east` 轴序；真实 COSA `.in2` 运行使用签名解析和解析器版本 `0.3.0`。
- PDF 由 PDFKit + 固定 Google Fonts 提交的 Noto Sans SC 字体离线生成，字体随 OFL 许可原文打包并做
  SHA-256 自校验；报告不再截断到 5,000 字，支持分页、页码和中文。合成 PDF 渲染检查确认中文、边界、
  分页和末行均可读。字体来源提交 `5e35378e6bda803962ee6fd257e444a7d459660d`，字体 SHA-256
  `a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da`。

### 真实 NAS 数据：隔离 Runtime 交付检查

以下只记录文件哈希、计数、质量指标和成果哈希，不记录原始观测、点坐标或用户源文件副本。每次检查使用
独立临时 Runtime，结束后清理；结果是私有验收证据，不是已批准成果。

| 来源 | 输入 SHA-256 | 观测/点数 | 平差状态 | 精度/闭合摘要 | 成果页数 | 输出哈希记录 |
| --- | --- | ---: | --- | --- | ---: | --- |
| COSA `.in1`（左线，显式 mapping） | `2b409ac35577c1e1bac64f9d0b3d56298adf5d8fc9b4599ee321647fbfe1c290` | 290 / 116 | `completed`, `valid` | DOF 177；最大点位中误差 `0.0007405260721181677 m`；最大独立高程闭合 `0.004106000000001053 m` | 11 | DOCX `5e930f84c23b3da6b2257074dc177d1d10681a8756ac4544aabd5cf640d0b07e`；PDF `256832c66350d0e8cc64f6893e0c6fcbc2f77ed39a5c2cec0d27cf4ffe64a422`；XLSX `cba8f29de9aeb83481fb223c82471b2fef25639d776156689f673627d65fd3d8` |
| COSA `.in2`（高梁区间） | `a2813d79fc37f8a1c0c6d64d7f8dcbb92c6d168e32aad6409b7b445118cc4d75` | 320 / 65 | `completed`, `valid` | DOF 172；最大点位中误差 `0.0023867476374013633 m`；水平残差范数 `0.011795764098279721 m`；角度残差范数 `0.000030920739897060716 rad` | 7 | DOCX `2f9920adbbcf4291c12529f7bd3f589acb64cb4bfdf04308bc4028821e6dcb11`；PDF `48570920d54678ead579b30417e33d27e7a6cd9a3e0539c6c08f89050fc5d2c5`；XLSX `75ec33dfa67f01f9bcd915360df9cfae9c2228ddc63c09ced3828905d801b0d5` |

- `.in1` 使用保存的 mapping SHA-256 `af84483192d4e96f9183f09d6926e374d698b046c8839c37dbaa138d669ec0d3`。
  与同名 `.ou1`（SHA-256 `15b79917baa0765d9bc0c5fd7ae74a43e4e88c39a017135d36e1aaf3b0d2e1f0`）
  的 116 个调整高程逐点在各打印字段舍入精度内一致，最大差 `0.000004974355341857972 m`，
  mismatch `0`。该比较是只读参考核对，不宣称厂商软件等价或替代专业人员签署。
- 两个真实项目均经过：导入 → 来源预检/完整性 → 确定性平差 → 纯测量 DOCX/PDF/XLSX/manifest；
  所有输出按 manifest 字节哈希重读，PDF 使用文字提取与渲染检查，DOCX/XLSX 检查点位、闭合量、来源
  哈希和“审查记录”末行。manifest 均保持 `reviewStatus=draft`，不得作为已批准交付。
- 纯测量闭环的 Runtime/服务端回归、PDF 分页回归、工具桥接回归均通过；Runtime 全量为 132 个文件、
  1,531 项通过、1 项跳过；根项目 `npm run build`、Runtime typecheck、lint（0 errors，保留既有
  `Workbench.tsx:1402` warning）、`git diff --check` 和 OpenSpec strict `11/11` 通过。
- 任务边界仍未改变：任务 15、29、36 不能仅凭隔离 Runtime 结果勾选。真实数据闭环不是打包 GUI 验收；
  当前包虽已能创建真实窗口，仍需完成干净源码提交上的安装、截图、主题/窄窗口/a11y 验证、用户确认和
  包内真实资料闭环。旧候选的 AppKit `SIGABRT` 仅作为历史诊断保留，当前包未复现；本轮未安装到
  `/Applications`，未修改公共版本、tag、Release、Stable feed 或官方下载页。

## 2026-09-08 Survey 连续会话收口记录

- Survey 默认入口现在是持续 AI 会话：输入、附件、发送、停止、队列和模型选择复用 `FloatingComposer`；经典项目、数据、质量、测量、分析、成果、审查和技能页面通过同一工作视图选择器访问，对话区保持挂载。
- 专业测量附件（`.in1/.in2/.gsi/.dat`、GNSS 与交换格式）先进入同一工程会话的“待导入测量文件”队列，用户选择网型后再进入 Runtime 内容探测和确定性导入；普通 PDF/DOCX/XLSX 仍走标准附件链。
- 当前查看的网络、平差结果和区段以工程范围内的引用 ID 随追问传递。`survey_read_context` 对网络和结果 ID 做当前项目校验；普通轮次只暴露读取/提案工具，提案保持 `awaiting_approval`，计算和导出只在对应已审批执行轮次开放。
- 定向验证：Survey 工程组件 8 个文件、45 项通过；Runtime 工具与编排回归 16 项通过；完整根项目回归（允许本机回环监听、`--maxWorkers=2`）为 297 个测试文件、2,410 项通过、2 项跳过。`npm run typecheck`、`npm run lint`、`npm run build`、`npm run verify:build-freshness`（949 个生产输入）、`git diff --check` 和 OpenSpec strict `11/11` 通过；Lint 仅保留既有 `Workbench.tsx:1402` Hook dependency warning。
- 历史隔离候选包位于 `/private/tmp/workwise-survey-chat-FIFtPw/dist/mac-arm64/WorkWise Candidate 64da6c1bf469.app`。ASAR 18,340 文件/461 编译文件通过，ASAR SHA-256 为 `3ec6ab940c777a1098334c7c0edd536d61802a4e919ab146ee7be6ba9920eb4f`，SQLite ABI 148 smoke 通过；该包曾在本机 AppKit 注册阶段异常退出，不能代表当前工作树包，也不作为当前验收依据。

## 2026-09-08 当前工作树隔离 GUI 包复核

- 基于当前工作树的最新 `out` 目录，在 `/private/tmp/workwise-gui-current-dist/mac-arm64/WorkWise.app` 生成了仅供本机复核的 dir 包；包内 `CFBundleShortVersionString=0.5.0`，ASAR SHA-256 为
  `f5649917bb429db4845d662e0584f188a321306c8fb259023fb80ac048a28902`。
- `verify-packaged-asar` 通过（18,340 个文件）；`verify-packaged-runtime-native` 通过（macOS arm64，Electron ABI 148）；`codesign --verify --deep --strict` 通过，签名为 adhoc，未公证。
- 直接启动同一包资源的隔离 Bundle 副本使用临时 user-data/cache/logs，启动跟踪依次达到 `app.whenReady`、`window:did-finish-load` 和 `window:ready-to-show`；没有复现旧候选的 AppKit `SIGABRT`。本次只证明当前包能创建真实窗口，仍未完成深色/浅色主题、窄窗口、键盘/a11y 全量交互、附件导入以及 CSV/XLSX → DOCX/PDF/XLSX/manifest 的包内真实闭环。
- 因此 OpenSpec 任务 15、29、36 继续保持未勾选；应用目录未安装到 `/Applications`，没有修改公共版本、tag、Release、Stable feed 或官方下载页。

## 2026-09-08 任意设站控制网术语与真实样例回归刷新

- 语音误识别已统一修正为“任意设站控制网测量”。源码、内置 Skill、Marketplace 条目、工程能力清单、
  对话框 `@` 补全/显式调用、报告模板和回归测试均已扫描确认，不再出现“任意射程”表述。
- 使用隔离临时 Python 环境安装 Skill 声明的固定依赖（numpy 2.3.5、python-docx 1.2.0、openpyxl 3.1.5、
  Pillow 12.3.0），对用户 Downloads 中的徐望左右线项目只读执行 `reproduce_project.py`：左线 955 项、
  右线 820 项、右线第三方评估 820 项，三组 `mismatches=0`；生成 DOCX、XLSX、PNG、Markdown、JSON
  及三部分测量单位交付目录，未改写原始工程资料。
- Node 原生依赖已在当前 Node ABI 147 下重建；`npm --prefix kun test` 为 134 个文件、1539 项通过、1 项跳过。
  根项目在允许临时 loopback 监听的执行环境中为 298 个文件、2413 项通过、2 项跳过。受限沙箱中的
  `listen EPERM` 仅是环境权限差异，不计作业务回归。
- `npm run typecheck`、`npm run lint`（0 error，保留既有 `Workbench.tsx:1402` warning）、`npm run build`、
  `npm run verify:specialist-skills`、品牌边界、文档依赖、`verify-build-freshness`（952 个生产输入）、
  `git diff --check` 和严格 OpenSpec 校验（11/11）均通过。
- 已在当前隔离候选应用中用 computer use 打开 Survey 工作台，确认默认首屏为连续 Survey AI 会话，输入区、
  工程项目/会话列表和 Survey 调整入口同屏可见；该运行仍不是无改动源码树生成的唯一候选，因此不勾选 15、29、36。

## 2026-09-08 最新私有 arm64 包静态复核

- 从本轮已通过生产构建的 `out` 目录生成了仅存于 `/private/tmp/workwise-current-fresh-dist` 的 arm64
  dir 包，构建参数显式使用 `WORKWISE_UPDATE_PROVIDER=none`，未连接 Stable/frontier feed，也未安装到
  `/Applications`。包内版本 `0.5.0`，ASAR SHA-256 为
  `9e878a9656d3b24e2686447bcf547032a65235fb326b3ea2e4025f5deadf1576`。
- `verify-packaged-asar` 通过（18,364 个文件、461 个编译文件）；`verify-packaged-runtime-native`
  通过（macOS arm64，Electron ABI 148）；ASAR unpacked 目录确认包含完整的
  `src/asset/skills/rail-any-station-control-network` 内置资源。
- 该包仍为 adhoc 签名、无 Team ID、未公证；当前工作树有未提交改动，故不能生成带来源提交证明的
  唯一候选包，也不能据此勾选 15、29、36 或发起任何公开发布动作。

## 2026-09-09 当前唯一候选包：包内真实 COSA 闭环

- 在临时、独立 Git 快照 `/private/tmp/workwise-0.5-snapshot-a6KhOK` 中生成候选包，快照提交为
  `c1dcc2f79f6cdacff0da6c54e948b815c17a4d83`；工作区原有修改和未跟踪文件未被清理或提交。
  候选应用为 `/private/tmp/workwise-0.5-snapshot-a6KhOK/dist/mac-arm64/WorkWise Candidate c1dcc2f79f6c.app`，
  `CFBundleShortVersionString=0.5.0`，Bundle ID 为
  `com.wangjiawei508.workwise.candidate.headc1dcc2f79f6c`，更新 Provider 为 `none`，未安装到
  `/Applications`，未连接 Stable/frontier feed。
- `verify-packaged-asar` 通过：`7838` 个归档文件、`461` 个编译文件；包内 source-head provenance 与
  `c1dcc2f79f6cdacff0da6c54e948b815c17a4d83` 一致。`verify-packaged-runtime-native` 通过：macOS arm64，
  `better-sqlite3` ABI `148`；包内 `kun/dist/engineering/survey-cosa-ou2.js` 存在。候选 ASAR SHA-256 为
  `22fa7e55526c7f1666fee1cdc84664ec45038e40b6dbe990e7e466a755159341`。
- 使用候选应用自己的 Electron 可执行文件（`ELECTRON_RUN_AS_NODE=1`）完成两组真实资料的
  `导入 → 来源预检/完整性 → 确定性平差 → DOCX/PDF/XLSX/manifest`。`.in1` 左线样本结果为 `290/116`
  （观测/点）、`completed/valid`、最大点位中误差 `0.740526 mm`、OU1 `116` 点 `mismatch=0`；`.in2`
  `s7g47-s8g09` 样本结果为 `160/33`、`completed/valid`、最大点位中误差 `0.833955 mm`、最大标准化残差
  `1.93381 <= 3`，OU2 `33` 点 `mismatch=0`，最大组合归一化差 `0.088999 sigma <= 1`。两组均验证
  `report.docx`、`report.pdf`、`evidence.xlsx` 和持久化 `manifest.json` 的字节/哈希/内容一致性，manifest
  `reviewStatus=draft`。
- 可见窗口验收仍未通过：直接启动候选可执行文件生成 macOS `SIGABRT`，崩溃栈位于 AppKit/LaunchServices
  `RegisterApplication`；`open -n` 返回 `NSOSStatusErrorDomain Code=-10827 (kLSNoExecutableErr)`。
  可复核诊断文件为 `/Users/wangjiawei/Library/Logs/DiagnosticReports/WorkWise Candidate c1dcc2f79f6c-2026-09-09-135028.ips`
  （以及同一候选的 13:48、13:50 两份记录）。因此本节只提升包内 Runtime 证据，不提升为 GUI 通过，
  不勾选 OpenSpec Task 15、29、36。

## 2026-09-09 第二个独立 COSA 平面项目闭环

- 在本机挂载资料中找到另一工程目录的 COSA `.in2/.ou2` 配对：
  `/Volumes/MOVESPEED/中铁咨询/20120615--宁波轨道交通项目/宁波_轨道基础控制网数据评估/s7g47-s8g09/s7g47-s8g09/Result-1/InPush(0704c10--0712c13).in2`
  与同目录 `InPush(0704c10--0712c13).ou2`。原始文件只读访问，没有复制、修改或上传。
- `scripts/check-survey-production-delivery.mjs` 在隔离 Runtime 中完成：导入 → 来源预检/完整性 → 确定性平差 → DOCX/PDF/XLSX/manifest；结果为 `completed` / `valid`，来源完整性 `verified`，`160` 条观测、`33` 个点、自由度 `87`、迭代 `3` 次，最大点位中误差 `0.000833955311431341 m`，最大标准化残差 `1.9338096680391301 <= 3`。
- 输入 SHA-256：`3a01828c195bc6a7cee89d4293f21c1957b51ad150d16066980d1066a2b40500`；解析器 `cosa-in2-parser@0.3.0`，原始记录锚点 `174/174` 可用，观测链接 `160/160`，处置 `adjustment-ready`。
- 同源 OU2 参考 SHA-256：`5c72252c90038bb3713c3d4bb0834cdd53cc693c3c99810f1b2d8ea6268934b7`；`33` 点逐点比较 `mismatch=0`，最大平面差 `0.00006341583922171748 m`，最大组合归一化差 `0.0889992519963462 sigma <= 1`，参考最大点位中误差 `0.83 mm`，WorkWise `0.833955311431341 mm`。
- 成果哈希：DOCX `c4ce4092ca6a3ce8c5803d21b711a52a3781efa4bf8b4967d5d14f7d3e3aba5d`，PDF `4f3da60d558a2f293ee4298155a5b8473ef56035cdbf956928e458b833c68b51`，XLSX `d8883dfd2444c28c66e5e0cfba5205d9765164d8a3dee5748ec59dce470b3dcc`，manifest `5d527d5e5f7cb2f73ef6d4621d93223af8022bac0c7b4ba0ab7a81c6da325671`；manifest `reviewStatus=draft`，不是已批准交付。
- 该样本与前述 `.in1` 水准项目属于不同工程目录和不同网络类型，证明两条真实 COSA P0 生产链；但两者仍是同一 COSA 格式族，不能替代“第二种厂商格式”的证据。Leica GSI、Trimble DAT 等真实文件继续按安全策略保持 `archive-only` 或阻断，没有人为放宽门禁。
- 本次结果仍是隔离 Runtime 证据，不是候选包 GUI 交互证据；当前工作树存在未提交改动，候选包签名为 adhoc、无 Team ID、未公证。因此 OpenSpec 任务 15、29、36 继续保持未勾选。
