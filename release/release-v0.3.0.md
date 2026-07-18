# WorkWise 0.3.0

0.3.0 将 WorkWise 升级为可靠的 Agent 工作台：长任务不再因为一次模型停止、步骤上限或临时异常被误报为完成；默认界面也不再用大段脚本和工具输出淹没用户对话。

## 可靠任务引擎

- 新增持久化 TaskRun、节点、checkpoint、租约和 exactly-once 终态。
- 模型 `stop` 只表示申请结束，最终回复、强制节点和真实成果必须通过验收。
- 步骤触顶、网络/模型流和幂等工具异常会保存进度并有界重试；连续无进展会重新规划并明确进入停滞状态。
- 支持取消整个任务树、应用退出清理和重启恢复，避免重复完成、重复副作用和悬挂进程。

## 简洁对话与真实成果

- 默认简洁模式只显示对话、短进度、审批、错误和成果；标准/开发者模式按需展开脱敏详情。
- 脚本、命令、工具参数和长输出收入“工作详情”，任何模式都不显示私有思维链。
- 成果卡统一提供打开、另存为和显示位置，并在失败时显示原因。
- PPTX、DOCX、XLSX、PDF 必须通过格式验证；HTML 或改扩展名文本不能冒充正式成果。

## Agent、权限、MCP 与代码工作

- 新增 General、Explore、Review、Research 以及全局/工作区自定义 Agent。
- 子任务拥有独立状态、预算、checkpoint 和成果，支持取消与恢复。
- 新增四级工作区信任、MCP V2、OAuth PKCE、安全凭据引用和持久化 Shell 诊断。
- 新增非破坏式 Git checkpoint/回滚预览、嵌套仓库边界、Repo Map 和 TypeScript/JavaScript 定义、引用、诊断与 hover。

## PDF 与 Office 文档

- 三个平台内置固定提交构建的 Microsoft MarkItDown sidecar，仅包含 PDF、DOCX、PPTX、XLSX 所需依赖。
- PDF.js 提供本地页面阅读、缩放、搜索和页码映射。
- MinerU 3.4 系列作为可选本地/企业私有增强引擎，不进入客户端安装包，不自动连接公共云端。
- 新增恶意 OOXML、损坏/密码 PDF、取消、隐私、许可证和 SBOM 门禁。

## 升级与发布

- 现有会话、工作区和设置会保留；旧运行中 Turn 进入安全待恢复。
- Electron 升级到 43.1.1，SQLite 原生绑定升级到 12.11.1；全依赖与生产依赖审计均为 0 个已知漏洞。
- 详细迁移说明见 `docs/MIGRATION_0.3.0.zh-CN.md`。
- GitHub Release 公开区域仍只发布三个客户端：macOS Apple Silicon、macOS Intel、Windows x64。

0.3.0 不包含 Design、Flow、MiMo 或 MiniMax 多模态能力，这些仍属于后续版本路线图。
