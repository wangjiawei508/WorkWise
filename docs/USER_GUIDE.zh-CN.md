# WorkWise 操作文档

本文档用于快速上手 WorkWise 桌面端。更多背景、源码和发布包请查看：

- 项目主页：https://github.com/wangjiawei508/WORKGPT
- 下载页面：https://github.com/wangjiawei508/WORKGPT/releases
- 问题反馈：https://github.com/wangjiawei508/WORKGPT/issues
- 维护者：https://github.com/wangjiawei508

## 产品定位

WorkWise 是面向工程、基础设施、城市更新与企业运营场景的智能体工作台。当前 0.2.0 版本先把基础能力做稳，再把 MCP、Skill 同步、复杂文档导出和更多行业智能体作为预览或路线图持续完善。

| 状态 | 范围 |
| --- | --- |
| 正式可用 | Code、Write、模型配置、工作区会话、内置工程 Skills、帮助中心、下载入口和 GUI 更新检查 |
| 预览能力 | MCP 插件市场、GitHub Skill 同步、复杂 Markdown/DOCX 导出、连接手机和定时任务自动化 |
| 路线图 | 基础设施巡检、城市更新、数字孪生、经营分析、投标辅助和企业知识库 |

## 下载安装

前往 GitHub Releases 下载最新版本。后续正式发布只保留三个安装包：

| 系统 | 下载说明 |
| --- | --- |
| macOS Apple 芯片 | 下载 `WorkWise-版本号-mac-Apple-Silicon.dmg` |
| macOS Intel 芯片 | 下载 `WorkWise-版本号-mac-Intel.dmg` |
| Windows 64 位 | 下载 `WorkWise-版本号-win-x64.exe` |
| Linux | 当前不发布 Linux 客户端 |

如果应用内更新不可用，直接从 Releases 下载新安装包覆盖安装即可。

## 首次配置

1. 选择界面语言、主题和字体大小。
2. 在设置中填写 DeepSeek API Key，或配置兼容 OpenAI / DeepSeek 协议的模型服务。
3. 如使用兼容服务，在 Base URL 中填入服务地址并选择默认模型。
4. 选择默认工作区，后续每个会话都可以切换到不同项目目录。
5. 在通用设置中检查 GUI 更新，确认当前版本是否为最新。

## Code 工作台

Code 模式适合项目开发、代码审查、需求拆解和自动化执行。

- 在左侧选择工作区后开始对话。
- 使用 `/plan` 让 AI 先生成执行计划。
- 使用 `/review` 审查当前改动、指定分支或指定 commit。
- 文件变更会显示在时间线中，执行前后都可以查看差异。
- 对敏感命令或高风险操作，先阅读提示再决定是否继续。

## Write 写作模式

Write 模式用于 Markdown 写作、预览、工程文档起草和导出。

- `Live`：当前行保留 Markdown 源码，其他内容实时渲染。
- `Source`：纯源码编辑。
- `Split`：左侧编辑、右侧预览，适合长文校对。
- `Preview`：最终阅读视图，适合导出前检查。

导出支持 `HTML / PDF / DOC / DOCX`：

- PDF 使用应用内置 Chromium 渲染，适合固定版式交付。
- DOC 使用 Word 兼容 HTML，适合快速交给 Word 或 WPS 编辑。
- DOCX 会优先使用随应用携带的平台转换器，失败时使用 WorkWise 内置生成器兜底。
- 复杂版式、特殊表格和跨平台完全一致性仍属于预览能力，导出前建议打开结果文件复核。
- 相对路径图片会按当前 Markdown 文件所在目录解析。

## 插件市场与 Skills

在设置的 Skills 和外部工具页面，可以安装、启用、禁用和同步扩展能力。

- 内置 Skills 可被 Code、Write、连接手机和定时任务参考。
- GitHub 管理的 Skill 会记录来源和 commit，后续可同步更新。
- MCP 工具可扩展外部系统、仓库、文档或企业工具接入能力。
- WorkWise 已内置工程与基础设施智能体套件、地保监测、运营期监测和写作增强相关 Skills。

## 连接手机

连接手机用于把 WorkWise 接入飞书 / Lark、微信或本地 webhook。

1. 在设置中启用手机连接。
2. 创建或绑定一个手机 Agent。
3. 设置 Agent 名称、描述、角色、人设、用户上下文和回复规则。
4. 按平台要求完成扫码或 webhook 配置。
5. 如需后台自动化，可添加一次性、每日、间隔或手动定时任务。

## 在线更新

进入 `设置 -> 通用 -> GUI 更新`：

- 点击检查更新，查看当前版本、最新版本和发布说明。
- 正式 macOS 和 Windows x64 包支持应用内下载。
- 如果当前构建不支持自动安装，会打开 GitHub 下载页。
- macOS 未签名开发包通常需要手动替换安装或清除隔离属性。

## 本地数据

为兼容旧版本，部分目录仍保留 `workgpt` 命名：

| 数据 | 默认位置 |
| --- | --- |
| 默认工作区 | `~/.workgpt/default_workspace` |
| 写作空间 | `~/.workgpt/write_workspace` |
| 运行时与会话数据 | `~/.workgpt/kun` 或系统应用数据目录 |
| 设置文件 | macOS: `~/Library/Application Support/WorkWise/workgpt-settings.json`；Windows: `%APPDATA%\WorkWise\workgpt-settings.json` |
| 日志 | 可在设置的通用页面打开 |

卸载应用不会自动删除这些数据。彻底清理前请确认不再需要历史会话、MCP 配置和 Skills。

## 作者与反馈

WorkWise 由 wangjiawei508 维护，面向工程、基础设施与企业运营场景持续开发。欢迎把真实使用中遇到的问题、希望内置的行业 Skills、需要支持的文档格式和插件需求反馈到 GitHub Issues。

反馈问题时建议附带：

- WorkWise 版本号。
- 操作系统和芯片架构。
- 问题截图或错误日志。
- 复现步骤。
- 如果是导出问题，请附最小 Markdown 样例。
- 如果是 Skill / MCP 问题，请说明安装来源、触发方式和报错内容。
