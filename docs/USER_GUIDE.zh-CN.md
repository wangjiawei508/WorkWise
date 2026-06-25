# WorkWise 操作文档

本文档用于快速上手 WorkWise 桌面端。更多背景、源码和发布包请查看：

- 项目主页：https://github.com/wangjiawei508/WorkWise
- 产品与下载：https://www.railwise.cn/products/workwise/
- 问题反馈：https://github.com/wangjiawei508/WorkWise/issues
- 维护者：https://github.com/wangjiawei508

## 产品定位

WorkWise 是面向工程、基础设施、城市更新与企业运营场景的智能体工作台。当前 0.2.1 版本先把安装包内置能力和本地工作流做稳，再把高级 MCP、可选在线 Skill 更新、复杂文档导出和更多行业智能体作为预览或路线图持续完善。

| 状态 | 范围 |
| --- | --- |
| 正式可用 | Code、Write、模型配置、工作区会话、内置工程 Skills、帮助中心、下载入口和 GUI 更新检查 |
| 预览能力 | 高级 MCP 插件市场、可选在线 Skill 更新、复杂 Markdown/DOCX 导出、连接手机和定时任务自动化 |
| 路线图 | 基础设施巡检、城市更新、数字孪生、经营分析、投标辅助和企业知识库 |

## 下载安装

前往 WorkWise 产品页获取产品介绍和下载入口。国内用户优先使用公司官网产品页；GitHub 主要保留为项目主页、源码协作、Issues 和开发者备用渠道。后续正式发布只保留三个安装包：

| 系统 | 下载说明 |
| --- | --- |
| macOS Apple 芯片 | 下载 `WorkWise-版本号-mac-Apple-Silicon.dmg` |
| macOS Intel 芯片 | 下载 `WorkWise-版本号-mac-Intel.dmg` |
| Windows 64 位 | 下载 `WorkWise-版本号-win-x64.exe` |
| Linux | 当前不发布 Linux 客户端 |

如果应用内更新不可用，直接从产品页下载新安装包覆盖安装即可。

## 首次配置

1. 选择界面语言、主题和字体大小。
2. 在设置中填写 DeepSeek API Key，或选择/配置兼容 OpenAI / DeepSeek 协议的模型服务。
3. 内置模型供应商包含 DeepSeek 和 Agnes AI；Agnes AI 默认使用 `https://apihub.agnes-ai.com/v1`、`chat_completions` 协议和 `agnes-2.0-flash` 文本模型。
4. 如使用其他兼容服务，在 Base URL 中填入服务地址并选择默认模型。
5. 选择默认工作区，后续每个会话都可以切换到不同项目目录。
6. 在通用设置中检查 GUI 更新，确认当前版本是否为最新。

Agnes AI 文本模型通过“模型供应商”接入；API Key、额度、计费和可用模型以 Agnes 官方账户规则为准。WorkWise 不承诺模型永久免费。

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

写作工具栏提供 Agnes AI 文生图入口，可从内置提示词模板生成封面图、监测数据背景、施工/运维示意图、商务写作配图和图标式插画。图片会保存到当前写作工作区的 `img` 目录，并可自动插入当前 Markdown。当前 MVP 支持文生图；视频生成、完整图生图编辑和多图合成属于后续扩展。

## 插件市场与 Skills

在设置的 Skills 和外部工具页面，可以安装、启用、禁用和更新扩展能力。

- 内置 Skills 可被 Code、Write、连接手机和定时任务参考。
- 内置 Skills 随安装包提供，默认本地可用，不依赖 GitHub 或 npm。
- 在线 Skill 更新是可选动作；网络不可用时，WorkWise 会继续使用本地内置版本。
- MCP 工具属于高级扩展，可接入外部系统、仓库、文档或企业工具，可能需要外部网络、授权、API Key 或本机运行环境。
- WorkWise 已内置工程与基础设施智能体套件、地保监测、运营期监测和写作增强相关 Skills。
- PPT Master 作为内置 Skill 出现在插件市场，可把 Markdown、报告、方案、网页或已有 PPTX 整理为原生可编辑 PowerPoint。

PPT Master 内置的是瘦身工作流能力，不是完整官方仓库。它包含核心 `SKILL.md`、工作流脚本、设计规范、通用图表/布局、Step 4 本地 localhost 确认页、SVG 实时预览页、两个轻量顶级咨询风示例和空 `projects` 占位目录；不包含全量官方 examples、用户真实 projects、exports、backup、大体积图标库或私有 PPT 文件。运行脚本需要 Python 3.10+，本地确认页和实时预览需要 `flask`；MVP 不启用 Pandoc。

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
- 手动下载入口默认打开 WorkWise 产品页。
- 自动更新元数据和安装包下载需要在发布环境中配置真实的静态文件目录或对象存储域名，例如 `WORKWISE_PUBLIC_BASE_URL` 或 `WORKWISE_UPDATE_URL`。
- 如果当前构建不支持自动安装，会打开产品页。
- macOS 未签名开发包通常需要手动替换安装或清除隔离属性。

## 本地数据

新安装默认使用 `workwise` 命名目录；从旧版本升级时，已有 `workgpt` 历史目录仍会被兼容读取，不会自动删除历史会话或文件：

| 数据 | 默认位置 |
| --- | --- |
| 默认工作区 | `~/.workwise/default_workspace` |
| 写作空间 | `~/.workwise/write_workspace` |
| 运行时与会话数据 | `~/.workwise/kun` 或系统应用数据目录 |
| 设置文件 | macOS: `~/Library/Application Support/WorkWise/workwise-settings.json`；Windows: `%APPDATA%\WorkWise\workwise-settings.json`；旧版 `workgpt-settings.json` 会自动兼容读取 |
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
