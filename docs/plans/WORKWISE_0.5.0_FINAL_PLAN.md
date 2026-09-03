# WorkWise 0.5.0 最终执行计划与收口记录

更新日期：2026-09-02（Asia/Shanghai）  
当前分支：`codex/release-0.4.2-product-page`  
当前公开版本：`0.4.2`

## 目标

以“工程监测数据 → 可审查交付成果”为 0.5.0 的唯一首发闭环，同时保留 WorkWise Electron + 现有 Runtime、Code/Write、Design、Flow、插件和既有 IM 能力。工程工作台使用现有线程、附件、TaskRun 和 Artifact 链，不建立第二 Runtime、第二队列或第二会话数据库。

固定交付物：

- DOCX 正式报告
- PDF 正式报告
- XLSX 数据与证据包
- `manifest.json` 成果依赖清单

PPTX 汇报、实时监测平台、跨项目仪表盘和外部 IM 触发器延期到 0.5.1，不阻塞 0.5.0。

## 已完成实现

1. 工程合约、SQLite 仓储、CSV/XLSX 规范化、字段映射、质量校核、确定性分析、图表、报告、证据包和不可变 manifest。
2. `domain=engineering + projectId` 线程元数据、工程侧栏隔离、项目线程幂等创建、消息恢复和 Code/Write/Design/Flow 独立时间线。
3. AI 工程指挥台：上下文快照、Typed Plan、校验、审批令牌、TaskRun/AgentLoop 执行、事件投影、证据卡、取消/恢复、过期计划和模型不可用恢复。
4. 经典确定性工作台兼容入口，以及“交付控制台”首屏：项目配置、数据资产、质量校核、趋势分析、成果中心、审查归档六阶段。
5. 工程 Runtime 路由已加入主进程 IPC 白名单，避免打包应用中的 `runtime request path is not allowed`。
6. 真实隔离数据 E2E 已生成并校验 DOCX、PDF、XLSX 和 manifest；原始附件、来源工作表、行号、哈希和成果目录均保留。

## 已通过门禁

- 主项目：286 个测试文件，2349 个测试通过，2 个跳过。
- 现有 Runtime：84 个测试文件，795 个测试通过。
- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run build`：通过，包含工程工作台懒加载资源。
- 工程 IPC/线程隔离/响应式定向测试：45/45 通过。
- OpenSpec 严格校验、品牌边界、文档依赖/许可证检查和 `git diff --check`：此前已通过；本次仅增加文档与白名单回归，不改变其结论。
- 修复提交：`9c492fe62acc8c2b60f14a5ef240c162cafa49f9`。

## 候选包验收状态

已构建隔离 arm64 候选包：

`/private/tmp/workwise-0.5-candidate-dist/mac-arm64/WorkWise Candidate 9c492fe62acc.app`

ASAR 完整性为 7721 个文件、459 个编译文件；候选使用独立用户目录和 `candidate.env`，未覆盖 `/Applications/WorkWise.app`，未创建 Tag、Release 或修改 Stable/官方下载页。

最新候选的主进程可以启动，但当前机器未为该实例创建可连接渲染器/CDP 页面（9230 端口无监听），因此以下项目必须保持“待验收”，不能用旧候选页面或静态检查替代：

- 工程入口点击后不再出现 IPC 白名单错误。
- 工程 AI 首屏、Typed Plan、审批、错误恢复和经典回退。
- 工程线程与 Code/Design 线程互不混用，项目切换可恢复原消息。
- 浅色/深色主题、窄窗口、键盘导航和可访问名称。
- 在打包应用内完成一次真实 CSV/XLSX → DOCX/PDF/XLSX/manifest 流程。

### 产品验收补充（2026-09-03）

源码级体验审查发现，原布局把“工程 Agent”嵌套在通用工程网页导航和二级卡片中，导致首屏同时出现两套导航，既不像 Agent 工作面，也没有足够的测量仪表盘层级。该问题属于发布阻塞项，不是文案问题。已将 AI 指挥台改为独立全宽 Agent 工作面，并加入任务状态、当前能力、运行门禁和下一动作的仪表条；非 AI 页仍保留项目、数据、平差、成果和审查导航。

这项源码改造已经通过定向类型检查、Lint、响应式/体验契约测试和生产构建，但必须在最新候选包中重新完成浅色/深色、窄窗口、键盘可达性及真实工程流程验收后，才能判断体验是否达到发布标准。旧候选包不再作为验收依据。

## 收口顺序

### A. 候选 GUI 验收（唯一当前代码阻塞）

1. 在可创建窗口的 macOS 会话中启动上述候选包，并确认 Runtime 健康。
2. 建立两个工程项目，分别发送目标、导入数据、切换项目并重启应用，确认线程隔离和恢复。
3. 验证无项目、Runtime 离线、模型不可用、空/加载/部分/错误/过期状态均有可恢复动作。
4. 在浅色/深色和窄窗口分别检查三栏折叠、1px 分隔线、文字可读性和键盘焦点。
5. 用隔离真实 CSV/XLSX 完成导入、质量修正、趋势/异常/阈值分析、图表和四项成果校验；记录文件哈希、引用和 manifest。

### B. 旧计划尾项（外部条件满足后执行）

- `workwise-0-3-3-flow-and-delivery` 7.4：精确打包 GUI 的 Write、附件、Scheduled tasks、Flow starter、Design PPT。
- `add-builtin-specialist-skills` 3.4：配置真实图片 Provider 后完成 Document Illustrator 输出和插入映射。
- `add-builtin-specialist-skills` 5.6：在 macOS arm64、macOS x64、Windows x64 三平台候选包复核 Skill 文件、许可证边界和真实场景。

这些任务没有可用外部凭据或平台时保持未勾选；不删除用户数据，不伪造结果。

### C. 发布前检查

只有在 A、B 中明确标注“通过”，且用户确认最终候选 UI 和功能后，才可以准备 `0.5.0-rc`。发布动作仍需用户另行明确确认“发布 0.5.0”，随后才允许创建 Tag、GitHub Release、Stable feed 或官方下载页更新。

## 数据与兼容性约束

- 不删除或改写旧线程、日志、插件、Skill、MCP、凭据引用、附件和数据库。
- 未知旧字段保持可读；缺失字段不强行迁移成工程线程。
- 原始数据不逐行发送给模型；数值、阈值、状态、引用、哈希由确定性 Runtime 生成。
- 所有变更接口继续使用 `expectedRevision` + `idempotencyKey`；重复提交复用原结果，过期修订稳定返回冲突。
- 第三方 Provider 配置、密钥、Base URL 和自动选模规则不修改。

## 最终判定

源码实现、Runtime、确定性工程数据闭环和自动化门禁已达到候选阶段；公开发布尚未获准。当前唯一代码侧收口点是用最新候选包完成可见 GUI 验收，另外三个旧计划尾项受真实 Provider/Windows/可见打包环境约束。完成这些证据后，再向用户请求明确的 0.5.0 发布确认。
