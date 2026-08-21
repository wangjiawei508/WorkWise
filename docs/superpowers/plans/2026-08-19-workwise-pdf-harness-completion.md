# WorkWise PDF 与 DeepSeek Harness 合并实施计划

日期：2026-08-21
目标分支：`codex/workwise-plan-final-0.4.0`

## 目标

在不增加第二 Runtime、Provider Switcher、Remote Web 或任意 DOM 插件的前提下，完成 PDF 分层解析与 DeepSeek Harness 机制集成，并用当前代码、当前测试和当前候选包证据区分实现完成度与真实外部服务验收状态。

## 不在范围

- 不修改 OpenAI Official 配置或用户正在使用的第三方 API。
- 不向微信发送测试消息，不修改微信连接状态。
- 不覆盖 `/Applications/WorkWise.app`。
- 不发布正式版本、Git 标签、GitHub Release、官网或稳定更新源。
- 不用 mock、旧日志或旧候选包证明当前真实 OCR、视觉分析或 IM 链路成功。

## 实施任务

### 1. PDF 分层解析

- [x] 细分电子文本、弱文本层、扫描件、复杂版面、表格和公式质量信号。
- [x] 返回页码引用、标题页映射、警告和降级原因。
- [x] MarkItDown 优先使用与 PDF 页数严格一致的结构性换页符；不信任正文中的显式页码标记，避免伪造溯源和跨页标题粘连。
- [x] 保留 PDF.js 阅读/搜索与 MarkItDown 快解析职责。
- [x] 在设置和预览中展示解析模式、当前引擎和切换原因。
- [x] 接入 Unlimited-OCR 本机回环协议，覆盖健康检查、提交、轮询、取消、超时和响应大小限制。
- [x] 保留 MinerU 高精度路径和失败回退。
- [x] 候选 Runtime/Schedule/IM 端口使用持有监听器的 reservation，Runtime `port: 0` 从 ready marker 交接真实端口，并在候选探针和退出路径验证/清理。
- [ ] 使用真实 Unlimited-OCR 服务和真实扫描/复杂版面 PDF 完成人工端到端验收。

### 2. Workspace 引用

- [x] Runtime 提供有界文件/目录索引、30 秒 TTL、5,000 条和 8 层默认限制。
- [x] 跳过 symlink 与忽略目录，返回截断状态。
- [x] Renderer 发送引用而非未授权正文，Runtime 在 turn 边界重新校验。
- [x] 覆盖中文、空格、越界、symlink、目录、截断和 TTL 测试。

### 3. 视觉证据

- [x] 增加结构化 `VisionEvidencePort` 与附件证据合约。
- [x] 非视觉模型使用结构化证据，禁止 Base64 文本冒充视觉理解。
- [x] 原生视觉模型继续接收原图。
- [x] 覆盖 magic bytes、MIME、大小、回环端点、超时、取消、LRU 和并发共享。
- [ ] 配置真实视觉端点并完成 DeepSeek 纯文本图片问答人工验收。

### 4. 通知、用量与工作台

- [x] 终态通知区分完成、错误、中止、阻塞和 max-token，并去重和抑制当前线程。
- [x] 通知点击唤醒窗口并定位对应线程。
- [x] 实时用量先估算、后由精确 usage 替换，TPS 不因空 chunk 归零；文本、推理和 tool-call 增量均纳入有界计数估算，原始参数不跨 Runtime 边界。
- [x] 内置 Workbench registry 支持注册、卸载、去重、懒加载共享、错误边界和 retry。
- [x] File Viewer 使用 sniff、优先级和扩展名匹配。
- [ ] 在当前候选包中人工验证系统通知点击后定位原线程；候选 `dbd44ff` 已用现有线程 `thr_jmn4g7g1` 做无模型请求探针，Electron 返回 `{ ok: true, shown: true }`，但 macOS `usernoted` 数据库没有该候选 bundle 的实际投递记录，因此系统投递/点击仍未证明，不再重复触发通知冒充通过。
- [x] 在当前候选包中验证实时估算用量最终由精确 usage 替换：本地回环模型固定返回输入 37、输出 6、总计 43 tokens，界面最终显示 43 tokens。
- [x] 在当前候选包中验证全尺寸 Workbench 可打开、无重叠，浅色侧栏可读且分隔线足够细。
- [x] 设置与 IM 凭据更新使用同一事务边界：stale revision 不触碰凭据，设置落盘失败清理新凭据，落盘成功后才清理旧凭据，并等待多 channel 保护全部结束后再回滚部分失败。

### 5. Git 与声明式 UI

- [x] Git 切换前检查 ref、冲突、进行中操作、其他 worktree 与未跟踪覆盖风险。
- [x] `dsh-ui` 只允许白名单组件并限制深度、节点、字符串、表格和选项数量。
- [x] 密码不持久化，动作绑定 thread/message/block/action/fingerprint。
- [x] `ui_action` 进入 Runtime turn queue 和审计链，不拼成普通用户 Prompt。

## 当前验证命令

```bash
npm run typecheck
npm run lint
npm test -- --run
npm run build
npm run openspec:validate
npm run verify:brand-boundary
npm run verify:document-licenses
git diff --check origin/main...HEAD
```

## 当前候选隔离证据

- [x] 当前 HEAD `5712e4c77a75e2fd6ab7b3fe3f541eb719110e64` 已重新构建隔离候选包；设置事务实现提交 `29912f251b2541ffebaec0a55cebd129a5e9ae03` 等后续修复不再依赖旧候选包证据。
- [x] Electron 的 `userData`、`cache`、`sessionData`、`crashDumps` 和 `logs` 全部重定向到候选根目录，并在窗口创建前完成设置。
- [x] 候选进程不继承父进程的 `DEEPSEEK_API_KEY`；正式版环境和用户保存的第三方配置保持原行为。
- [x] 唯一 bundle ID `com.wangjiawei508.workwise.candidate.head5712e4c77a75` 的 macOS arm64 候选包 `WorkWise Candidate 5712e4c77a75.app` 已从干净工作树生成，正式 `/Applications/WorkWise.app` 未被覆盖。
- [x] 当前候选 ASAR 完整性、MarkItDown sidecar、ad-hoc 严格签名校验和 packaged SQLite ABI 148 smoke 通过；未将 ad-hoc 签名描述为生产签名或公证。
- [ ] 当前候选包的浅色/深色 UI、PDF 设置、打包 PDF 预览、全尺寸 Workbench 和零正式数据继承仍需一次人工启动检查；旧候选的 UI 记录不投影为当前包证据。
- [x] 候选退出前已清空临时假密钥和本地模型桩地址；隔离设置文件中不再包含本地桩端口或假密钥。

## 发布门禁

- [x] 自动化测试、类型检查、Lint、构建和仓库策略验证通过。
- [ ] 当前候选包完成浅色/深色和支持窗口尺寸的人工 UI 验收；旧候选的 UI 结果仅作历史参考。
- [ ] 真实 OCR、视觉端点和指定飞书自助手机器人测试聊天的外部验收按可用环境完成；当前候选配置中 OCR 与视觉端点均为空，本轮未通过重复扫码或发送消息制造证据。
- [ ] 用户确认准确版本号和发布动作。

未完成的人工或外部服务项不得被标记为 `DONE`，也不得阻塞继续完善仓库内可验证的代码与候选包。
