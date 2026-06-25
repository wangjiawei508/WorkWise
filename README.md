<p align="center">
  <img src="src/asset/img/workgpt.png" width="104" alt="WorkWise 图标">
</p>

# WorkWise

面向工程、基础设施与企业运营场景的智能体工作台。

简体中文 | [English](./README.en.md)

[产品与下载](https://www.railwise.cn/products/workwise/) · [操作文档](./docs/USER_GUIDE.zh-CN.md) · [GitHub 主页](https://github.com/wangjiawei508/WorkWise) · [问题反馈](https://github.com/wangjiawei508/WorkWise/issues) · [作者主页](https://github.com/wangjiawei508)

WorkWise 是一个桌面端 AI 工作台，重点服务工程技术人员、项目管理者、经营管理者和需要高质量文档交付的团队。它把代码工作台、写作工作台、安装包内置行业 Skills、Markdown 渲染导出、可选在线更新和高级 MCP 扩展放在同一个应用里，让日常工作从“临时问答”升级为可沉淀、可复用、可扩展的智能体工作流。

它不是只解决某一个单点问题，也不只是一层聊天外壳。WorkWise 的设计目标是：让 AI 能真正进入工程项目、基础设施运维、技术交付、经营分析和知识管理这些长期、复杂、需要上下文的工作。

## 为什么做 WorkWise

传统监测和工程服务正在从单一交付走向综合化、数字化和运营化。团队面对的不再只是“写一份方案”或“导出一份报告”，而是更连续的工作链条：

- 项目前期要理解规范、招标文件、风险点和实施条件。
- 项目执行中要处理日报、周报、月报、监测数据、预警、消警和评审回复。
- 项目后期要形成总结、知识库、复盘材料和经营分析。
- 企业层面还需要沉淀方法论、统一交付标准、复用优秀模板，并把经验转化为可持续更新的智能体能力。

WorkWise 因此采用“桌面工作台 + 行业 Skills + 插件市场 + 本地数据”的设计，而不是把所有能力塞进一个固定聊天框里。用户可以从一个简单问题开始，也可以逐步把自己的项目资料、写作模板、企业流程和行业知识组织成长期可用的工作系统。

## 设计思路

### 1. 本地优先，工作连续

WorkWise 是桌面应用，默认围绕本机工作区、文件、会话和设置运行。项目目录、写作空间、会话上下文、插件配置和 Skills 都可以在本地持续保留，适合长期项目和反复交付的工作。

### 2. 能力分层，避免“什么都说会”

应用内把能力分成正式可用、预览能力和路线图。已经能稳定交付的能力优先打磨体验；需要更多真实场景验证的能力放在预览区；更大的行业方向进入路线图持续演进。

### 3. Skills 是核心资产

WorkWise 鼓励把行业经验写成 Skills。地保监测、运营期监测、工程报告、投标知识、标准条文、经营分析、写作润色等核心能力随安装包内置，默认不依赖 GitHub 或 npm。在线更新只是附加能力，网络不可用时仍使用本地内置版本。

### 4. 写作和交付不是附属功能

很多工程和企业工作最终都落到文档交付。WorkWise 内置 Write 写作工作台，支持 Markdown 编辑、预览、上下文补全、文本处理、PDF/DOC/DOCX 导出和写作增强 Skills，目标是直接服务方案、报告、标书、汇报和知识库文档。

### 5. 插件市场要能看懂、能选择

插件市场不只展示一个名字。WorkWise 为 MCP 和 Skills 提供详情页，展示用途、说明、来源链接、安装状态和适用场景，减少“看不清是什么就不敢装”的问题。

## 当前能力状态

| 状态 | 能力 |
| --- | --- |
| 正式可用 | Code 工作台、Write 写作工作台、模型配置、工作区会话、内置工程 Skills、帮助中心、下载入口、GUI 更新检查 |
| 预览能力 | 高级 MCP 插件市场、可选在线 Skill 更新、复杂 Markdown/DOCX 导出、连接手机、定时任务自动化 |
| 路线图 | 基础设施巡检、城市更新、数字孪生、经营分析、投标辅助、企业知识库、更多行业智能体套件 |

## 核心功能

### Code 工作台

适合项目开发、代码审查、需求拆解、脚本执行和自动化协作。

- 选择本地项目目录后发起会话。
- 查看推理过程、工具调用、Todo、命令审批和文件变更。
- 支持围绕当前仓库进行解释、修改、测试、构建和发布协作。
- 适合研发项目，也适合把工程资料、模板和脚本组织成可维护的工作区。

### Write 写作工作台

适合 Markdown 写作、工程文档起草、资料整理、报告编辑和导出。

- 支持 `Live`、`Source`、`Split`、`Preview` 四种编辑视图。
- 支持 Markdown / TXT 文件管理和多文档上下文。
- 支持选中文本改写、续写、润色、结构调整和风格统一。
- 支持导出 `HTML / PDF / DOC / DOCX`。
- 适合技术方案、监测报告、评审回复、投标文件、公众号文章和内部知识库。

### Markdown 渲染与导出

WorkWise 不是只把 Markdown 显示出来，而是把“编辑、预览、交付”放在一起：

- PDF 使用应用内置 Chromium 渲染，适合固定版式交付。
- DOC 使用 Word 兼容 HTML，便于交给 Word 或 WPS 二次编辑。
- DOCX 优先使用平台转换器，失败时使用 WorkWise 内置生成器兜底。
- 支持相对路径图片解析，适合把图片、表格和说明放在同一项目目录中管理。

复杂表格、跨平台完全一致排版和高度定制的 Word 样式仍属于持续优化范围，正式交付前建议打开导出文件复核。

### 内置工程与企业 Skills

当前内置能力覆盖：

- 地铁保护区 / 控制保护区第三方监测方案、日报、周报、月报、预警、消警、总结和评审回复。
- 城市轨道交通运营期结构长期变形监测，包括沉降、收敛、净空断面、三维扫描、控制网联测和稳定性分析。
- 工程监测方案、报告写作、数据平差、Excel 报表、Word 文档生成、工程图表与可视化。
- 投标知识、标准条文速查、技术文件检查、工程文档人性化润色。
- 企业经营分析、部门周报、项目风险扫描、资源调度和知识库整理。

### 写作增强 Skills

WorkWise 内置一组写作增强 Skills，用于提升 AI 写作结果的可读性、可信度和真实感：

- 去除明显 AI 味，减少空泛、套路化和堆词式表达。
- 风格建模，把文本调整为更自然、更像资深从业者的表达。
- 公众号长文、标题、结构、读者体验和发布前检查。
- 文本审阅、事实核查、表达压缩、案例具体化和语气统一。

### 插件市场

插件市场用于管理 Skills 和高级 MCP：

- 查看每个扩展的功能介绍、来源链接、安装状态和适用范围。
- 内置 Skills 随安装包提供，默认本地可用。
- 在线更新是可选动作，网络不可用时不影响本地内置能力。
- MCP 属于高级扩展，可能需要外部网络、授权、API Key 或本机运行环境。
- 后续可接入更多企业工具、文档系统、知识库、仓库和自动化服务，并优先提供可控的内置/镜像来源。

### 连接手机与后台任务

WorkWise 可以接入飞书 / Lark、微信或本地 webhook，用于移动端消息处理和后台任务：

- 创建独立 IM Agent，配置名称、角色、用户上下文和回复规则。
- 支持扫码或 webhook 方式接入。
- 支持一次性、每日、间隔或手动触发的定时任务。

这部分仍属于预览能力，适合先在低风险场景中试用。

### 在线更新

应用内 `设置 -> 通用 -> GUI 更新` 可检查新版本。手动下载入口默认打开 [WorkWise 产品页](https://www.railwise.cn/products/workwise/)；自动更新元数据和安装包下载需要在发布环境中配置真实的静态文件目录或对象存储域名，例如 `WORKWISE_PUBLIC_BASE_URL` 或 `WORKWISE_UPDATE_URL`。如果未配置更新源，应用会明确提示暂不可用，不会假装连接服务器。

## 快速开始

### 1. 下载并安装

前往 [WorkWise 产品页](https://www.railwise.cn/products/workwise/) 获取产品介绍和下载入口。自动更新文件仍需要另行部署到你们实际可访问的官网静态目录、服务器、CDN 或对象存储公开域名；GitHub 主要作为项目主页、源码协作、Issues 和开发者发布记录。

| 平台 | 安装包 |
| --- | --- |
| macOS Apple 芯片 | `WorkWise-版本号-mac-Apple-Silicon.dmg` |
| macOS Intel 芯片 | `WorkWise-版本号-mac-Intel.dmg` |
| Windows 64 位 | `WorkWise-版本号-win-x64.exe` |

当前不发布 Linux 客户端，也不在 Release 页面展示中间构建文件。

### 2. 配置模型

首次启动后进入设置页：

- 填写 DeepSeek API Key，或选择内置的 Agnes AI / 其他 OpenAI 兼容模型服务。
- Agnes AI 预设使用 `https://apihub.agnes-ai.com/v1`、`chat_completions` 和 `agnes-2.0-flash`；API Key、额度和计费以 Agnes 官方账户规则为准。
- 设置 Base URL、默认模型和必要的代理环境。
- 检查 GUI 更新，确认是否为最新版本。

### 3. 使用 Code 工作台

1. 选择一个本地项目或资料目录作为工作区。
2. 输入任务，例如“检查这个项目的发布配置”或“帮我整理这批监测日报模板”。
3. 在时间线中查看 AI 的分析、命令、文件变更和待办事项。
4. 对高风险命令先确认，再让它继续执行。

### 4. 使用 Write 写作工作台

1. 新建或打开 Markdown / TXT 文件。
2. 在 `Live` 或 `Split` 模式下边写边预览。
3. 选中文本后让 WorkWise 改写、润色、扩写、压缩或统一风格。
4. 使用 Agnes AI 文生图模板生成封面图、监测数据背景、施工/运维示意图、商务写作配图或图标式插画，并插入当前 Markdown。
5. 导出为 PDF、DOC、DOCX 或 HTML。
6. 对正式交付文件进行人工复核。

Agnes 生图是独立素材生成能力，不混入聊天 Provider。当前支持文生图；视频生成、完整图生图编辑和多图合成留作后续扩展。

### 5. 使用 Skills 和插件

1. 打开设置中的 Skills 或插件市场。
2. 查看扩展详情，确认它适合你的任务。
3. 安装或启用对应 Skill；需要外部系统时再配置高级 MCP。
4. 在 Code、Write、连接手机或定时任务中使用它。

PPT Master 已作为内置 Skill 加入插件市场，可将 Markdown、报告、方案、网页或已有 PPTX 整理为原生可编辑 PowerPoint。内置包只保留核心工作流、localhost 确认页、SVG 预览页、通用 charts/layouts、两个轻量顶级咨询风示例和空 `projects` 占位；不包含全量官方 examples、用户真实 projects、exports、backup、大体积图标库或私有 PPT 文件。运行脚本需要 Python 3.10+；MVP 不启用 Pandoc。

## 推荐使用场景

- 编制地保监测、运营期监测、基坑监测、结构健康监测等工程方案。
- 生成日报、周报、月报、总结报告、评审回复和技术说明。
- 把项目资料整理成 Markdown 知识库，并导出为 Word / PDF。
- 进行投标文件结构梳理、评分点分析、技术响应和表达优化。
- 整理部门周报、项目经营简报、风险清单和管理层汇报材料。
- 为企业沉淀可复用的 Skills、模板、规范条文和交付方法。

## 本地数据与隐私

WorkWise 优先使用本地工作区和本地配置。新安装默认使用 `workwise` 命名目录；从旧版本升级时，已有 `workgpt` 历史目录仍会被兼容读取，不会自动删除会话或文件：

| 数据 | 默认位置 |
| --- | --- |
| 默认工作区 | `~/.workwise/default_workspace` |
| 写作空间 | `~/.workwise/write_workspace` |
| 运行时与会话数据 | `~/.workwise/kun` 或系统应用数据目录 |
| 设置文件 | macOS: `~/Library/Application Support/WorkWise/workwise-settings.json`；Windows: `%APPDATA%\WorkWise\workwise-settings.json`；旧版 `workgpt-settings.json` 会自动兼容读取 |

卸载应用不会自动删除这些数据。彻底清理前，请确认不再需要历史会话、MCP 配置、Skills 和写作文件。

## 开发运行

```bash
git clone https://github.com/wangjiawei508/WorkWise.git WorkWise
cd WorkWise
npm install
npm run dev
```

常用命令：

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run generate:icons
```

打包命令：

```bash
npm run dist:mac
npm run dist:win
```

## 发布规则

- 公开 Release 只保留三个面向用户的安装包：macOS Apple Silicon、macOS Intel、Windows x64。
- 不发布 Linux 客户端。
- 不把 zip、blockmap、latest yml、中间构建文件作为公开下载资产。
- 安装包命名会明确标注 Apple Silicon、Intel 和 win-x64，方便用户选择。

## 路线图

WorkWise 会继续向三个方向演进：

- 行业智能体：从地铁监测扩展到基础设施巡检、城市更新、结构安全、投标辅助、项目经营和企业知识库。
- 文档交付：继续增强 Markdown 渲染、Word 导出、报告模板、图表生成和跨平台排版一致性。
- 插件生态：完善本地内置 Skill、可选在线更新、企业内部 Skill 管理和更多第三方工具接入；高级 MCP 不作为普通用户的默认使用前提。

## 反馈

欢迎在 [Issues](https://github.com/wangjiawei508/WorkWise/issues) 反馈问题或建议。为了更快定位，请尽量附上：

- WorkWise 版本号。
- 操作系统和芯片架构。
- 问题截图、错误日志或复现步骤。
- 如果是导出问题，请附最小 Markdown 样例。
- 如果是 Skill / MCP 问题，请说明安装来源、触发方式和报错内容。

维护者：[wangjiawei508](https://github.com/wangjiawei508)
