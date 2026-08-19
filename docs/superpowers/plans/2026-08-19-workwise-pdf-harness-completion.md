# WorkWise PDF 与 DeepSeek Harness 合并实施计划

日期：2026-08-19
目标分支：`codex/workwise-plugin-marketplace-recovered`

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
- [x] 保留 PDF.js 阅读/搜索与 MarkItDown 快解析职责。
- [x] 在设置和预览中展示解析模式、当前引擎和切换原因。
- [x] 接入 Unlimited-OCR 本机回环协议，覆盖健康检查、提交、轮询、取消、超时和响应大小限制。
- [x] 保留 MinerU 高精度路径和失败回退。
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
- [x] 实时用量先估算、后由精确 usage 替换，TPS 不因空 chunk 归零。
- [x] 内置 Workbench registry 支持注册、卸载、去重、懒加载共享、错误边界和 retry。
- [x] File Viewer 使用 sniff、优先级和扩展名匹配。
- [ ] 在当前候选包中人工验证通知点击、实时用量和全尺寸 Workbench 交互。

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

- [x] Electron 的 `userData`、`cache`、`sessionData`、`crashDumps` 和 `logs` 全部重定向到候选根目录，并在窗口创建前完成设置。
- [x] 候选进程不继承父进程的 `DEEPSEEK_API_KEY`；正式版环境和用户保存的第三方配置保持原行为。
- [x] 唯一 bundle ID `com.wangjiawei508.workwise.uireview.20260819` 的 macOS arm64 候选包已生成。
- [x] 候选 ASAR 完整性、MarkItDown sidecar、严格签名校验和 packaged SQLite ABI 148 smoke 通过。
- [ ] 启动当前候选包并确认浅色/深色 UI、PDF 设置和零正式数据继承。

## 发布门禁

- [x] 自动化测试、类型检查、Lint、构建和仓库策略验证通过。
- [ ] 当前候选包完成浅色/深色和支持窗口尺寸的人工 UI 验收。
- [ ] 真实 OCR、视觉端点和指定飞书测试聊天的外部验收按可用环境完成。
- [ ] 用户确认准确版本号和发布动作。

未完成的人工或外部服务项不得被标记为 `DONE`，也不得阻塞继续完善仓库内可验证的代码与候选包。
