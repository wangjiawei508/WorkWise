<p align="center">
  <img src="src/asset/img/workgpt.png" width="96" alt="WorkWise 图标">
</p>

# WorkWise

工程、基础设施与企业运营场景的智能体工作台。

[English](./README.en.md) | 简体中文

[项目主页](https://github.com/wangjiawei508/WORKGPT) | [操作文档](./docs/USER_GUIDE.zh-CN.md) | [下载](https://github.com/wangjiawei508/WORKGPT/releases) | [问题反馈](https://github.com/wangjiawei508/WORKGPT/issues)

> Fork / attribution: this project is a renamed fork/import of `AdrianAndroid/DeepSeek-GUI`. See [FORK_NOTICE.md](./FORK_NOTICE.md).

WorkWise 0.2.0 是一次品牌和定位升级：它不再只围绕通用工作聊天或单一地铁监测场景，而是面向工程、基础设施、城市更新与企业运营中的高频交付工作，提供本地桌面会话、工程写作、内置 Skills、插件市场、Markdown 渲染导出和在线更新能力。

## 产品定位

WorkWise 的长期方向是成为工程行业可持续扩展的 AI 工作台：

- 工程与基础设施：地保监测、运营期监测、基坑、隧道、桥梁、巡检、结构安全和城市更新。
- 文档与交付：方案、日报、周报、月报、总结报告、评审回复、投标文件和技术说明。
- 数据与经营：监测数据分析、经营简报、资源调度、部门周报、项目交付和企业知识库。
- 智能体生态：内置行业 Skills，同时支持 GitHub 管理的 Skills 后续同步更新。

## 能力状态

| 状态 | 当前范围 |
| --- | --- |
| 正式可用 | Code 工作台、Write 写作工作台、模型配置、工作区会话、内置工程 Skills、帮助中心、下载入口和 GUI 更新检查 |
| 预览能力 | MCP 插件市场、GitHub Skill 同步、复杂 Markdown/DOCX 导出、连接手机和定时任务自动化 |
| 路线图 | 基础设施巡检、城市更新、数字孪生、经营分析、投标辅助、企业知识库和更多行业智能体套件 |

这个分层是有意保守的：当前版本先把第一批能稳定使用的能力做好，同时把更大的业务方向放进路线图，避免把尚未打磨完整的功能包装成已经成熟。

## 核心功能

- **Code 工作台**：选择项目目录后发起会话，查看推理、工具调用、Todo、文件变更和命令审批。
- **Write 写作模式**：管理 Markdown / TXT 文件，支持 Live、Source、Split、Preview 视图，提供写作助手、选中文本处理和跨文档上下文补全。
- **Markdown 渲染与导出**：支持导出 HTML、PDF、DOC、DOCX。PDF 使用内置 Chromium，DOC 使用 Word 兼容 HTML，DOCX 优先使用平台转换器并由 WorkWise 内置生成器兜底。
- **工程与基础设施 Skills**：内置地保监测、运营期监测、工程方案、数据分析、报告写作、投标知识、标准速查等行业能力。
- **写作增强 Skills**：内置多种去 AI 味、风格建模、公众号写作、文本审阅和表达优化 Skills。
- **插件市场**：可以查看 MCP 与 Skills 的详情页、来源链接、功能说明和安装状态。
- **连接手机**：可接入飞书 / Lark、微信或本地 webhook，让独立 IM Agent 和定时任务处理后台消息。
- **在线更新**：设置页可检查 GitHub Releases 或已配置更新源；正式安装包可在应用内下载或跳转手动安装。

## 内置行业能力

WorkWise 当前内置的行业资源覆盖：

- 地铁保护区 / 控制保护区第三方监测方案、日报、周报、月报、预警、消警、总结和评审回复。
- 城市轨道交通运营期结构长期变形监测，包括沉降、收敛、净空断面、三维扫描和控制网成果。
- 工程投标、技术方案、报告写作、数据平差、Excel 报表、Word 文档生成和可视化图表。
- 企业经营分析、部门周报、项目风险扫描、资源调度和知识库整理。

## 下载安装

从 [GitHub Releases](https://github.com/wangjiawei508/WORKGPT/releases) 下载最新版本。后续发布只保留三个安装包：

| 平台 | 文件名 |
| --- | --- |
| macOS Apple 芯片 | `WorkWise-版本号-mac-Apple-Silicon.dmg` |
| macOS Intel 芯片 | `WorkWise-版本号-mac-Intel.dmg` |
| Windows 64 位 | `WorkWise-版本号-win-x64.exe` |

当前不发布 Linux 客户端。首次启动时需要配置 DeepSeek API Key；如果使用兼容 DeepSeek / OpenAI 的服务，也可以在设置中修改 Base URL 和默认模型。

## 帮助与更新

应用内 **设置 -> 帮助** 已提供：

- 操作文档、README、GitHub 主页、下载页面、问题反馈和作者主页。
- 正式可用能力、预览能力和路线图说明。
- Markdown 导出、Skills、连接手机、在线更新和本地数据位置说明。

应用内 **设置 -> 通用 -> GUI 更新** 可检查新版本。正式 macOS 和 Windows x64 安装包支持下载更新；如果当前构建不支持自动安装，会打开下载页手动覆盖升级。

## 本地数据

为兼容旧版本，默认目录仍保留 `workgpt` 命名：

| 数据 | 默认位置 |
| --- | --- |
| 默认工作区 | `~/.workgpt/default_workspace` |
| 写作空间 | `~/.workgpt/write_workspace` |
| Kun 运行时与会话数据 | `~/.workgpt/kun` 或系统应用数据目录 |
| 设置文件 | macOS: `~/Library/Application Support/WorkWise/workgpt-settings.json`；Windows: `%APPDATA%\WorkWise\workgpt-settings.json` |

升级时 WorkWise 会尝试读取旧 `WORKGPT` / `workgpt` 应用数据目录中的设置，避免已有配置丢失。

## 开发运行

```bash
git clone https://github.com/wangjiawei508/WORKGPT.git
cd WORKGPT
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

## 发布规则

- 版本从 `0.2.0` 开始作为 WorkWise 品牌升级版。
- GitHub Release 公开资产只发布三个安装包：macOS Apple Silicon、macOS Intel、Windows x64。
- Linux、中间构建文件、blockmap、latest yml 和其他辅助文件不作为公开下载资产发布。
- Release workflow 会把构建产物重命名为用户可读的 Apple Silicon / Intel / win-x64 文件名。

## 贡献与反馈

反馈问题时建议提供：

- WorkWise 版本号。
- 操作系统和芯片架构。
- 问题截图、错误日志或复现步骤。
- 如果是导出问题，请附最小 Markdown 样例。
- 如果是 Skill / MCP 问题，请说明安装来源、触发方式和报错内容。

维护者：[wangjiawei508](https://github.com/wangjiawei508)。项目保留原始 fork 致谢，并感谢 DeepSeek、Kun/OpenClaw 相关生态以及所有反馈者。
