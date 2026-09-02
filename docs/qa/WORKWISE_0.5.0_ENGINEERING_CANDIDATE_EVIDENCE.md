# WorkWise 0.5.0 工程工作台候选证据

日期：2026-09-01（Asia/Shanghai）

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
- 生产构建：通过；工程工作台资源包含 `EngineeringWorkspaceView` 懒加载 chunk。
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

- 工程工作台实现、Runtime API、确定性分析、成果文件和自动化门禁仍然通过；本日补丁只扩大
  XLSX 多工作表未知列的保留范围，不改变版本或发布元数据。
- 旧 0.3.3 GUI 7.4、Document Illustrator 3.4、三平台 5.6 仍未满足真实验收条件；候选 GUI
  启动错误已按原始输出记录，不能用静态检查替代。
- 因此任务 9、10 继续保持未勾选，不创建 tag、Release、Stable feed 或官方下载页更新。

## 2026-09-01 会话隔离与工程首屏复核

- 编程侧栏过滤 Design 助手线程；Design 侧栏改为只列出当前工作区的设计文档，点击文档恢复其独立画布，点击旧版 `Design · ...` 线程也会先切换到 Design 并恢复对应文档。
- 工程侧栏改为只列出当前工作区的工程项目，不再渲染编程线程；项目选择通过持久化项目 ID 和事件交给工程工作台，数据集、分析、成果和审查状态随项目恢复。
- 工程工作台首屏改为“交付控制台”，展示项目配置、数据资产、质量校核、趋势分析、报告证据包、人工审查六个阶段及状态，而不是导入表单；每个阶段可直接进入对应处理页。
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
