# WorkWise 0.2.4

## 合规基线

- 代码基线调整为 WorkWise Agent Runtime 最后一个经审计的 MIT 提交 `363fdf566657cd4d60801f62b0b8f3aa8dfbf2fc`。
- 不包含后续 PolyForm Noncommercial 源码；WorkWise 后续功能均以自主提交和独立兼容层维护。
- 保留原 MIT `LICENSE`，并在 `FORK_NOTICE.md` 记录上游边界和实现策略。

## 功能与修复

- 保留 MIT 基线已有的 Xiaomi MIMO 与 MiniMax 模型供应商预设，以及 MiniMax `image-01` 图片生成配置。
- 保留 PPT Master、Agent Reach、Ian 小黑插画、guizang 外部入口及 Write“生成 PPT”功能。
- 保留 Lark CLI、OfficeCLI、ego-browser 托管中心，以及 RailWise 官方知识库混合检索。
- CLI 下载改用 Electron 系统网络栈，跟随 macOS/Windows 系统代理，修复安装时统一显示 `fetch failed` 的问题。
- CLI Release 发现不再依赖 GitHub API；配套 Skills 使用单个源码 ZIP 安装，减少请求数量并保留失败回滚。
- 保留 macOS Dock 专用图标和透明留白修正。

## 后续计划

- WorkWise Agent Runtime 在 MIT 基线之后新增的 Design 工作区不包含在 0.2.4 中；WorkWise 将以独立实现方式在后续版本提供。
- MIMO 与 MiniMax 的图片理解、文件及音视频输入能力将在后续版本继续进行端到端适配和验证。

## 验证

- TypeScript 类型检查通过。
- 138 个测试文件、894 项测试通过。
- ESLint 无错误；生产构建通过。
