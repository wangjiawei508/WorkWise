<div align="center">
  <img src="./src/asset/img/workwise.png" width="112" alt="WorkWise 图标" />
  <h1>WorkWise</h1>
  <p><strong>让 AI 进入真实工作流。</strong></p>
  <p>本地优先的桌面 AI 工作台，把代码、写作、技能与交付放在一个应用里。</p>
  <p>
    简体中文 · <a href="./README.en.md">English</a>
  </p>
  <p>
    <a href="https://www.railwise.cn/products/workwise/">产品主页</a> ·
    <a href="./docs/product-introduction.zh-CN.md">软件介绍</a> ·
    <a href="./docs/USER_GUIDE.zh-CN.md">使用指南</a> ·
    <a href="https://github.com/wangjiawei508/WorkWise/releases">版本与下载</a> ·
    <a href="https://github.com/wangjiawei508/WorkWise/issues">问题反馈</a>
  </p>
</div>

---

WorkWise 面向需要长期上下文、反复修改和正式交付的工作。它不只是一个聊天窗口：项目文件、会话、文档、方法和扩展能力围绕同一个本地工作区组织，让 AI 真正参与从理解任务到交付成果的完整过程。

## 一眼看懂

| Code 工作台 | Write 写作工作台 |
| --- | --- |
| 理解项目、修改文件、运行工具、审查变更 | 编写 Markdown、调用写作助手、预览并导出文档 |
| ![WorkWise Code 工作台](./src/asset/img/code.gif) | ![WorkWise Write 写作工作台](./src/asset/img/write.gif) |

## 你可以用它做什么

- **处理本地项目**：围绕真实目录理解文件、规划任务、执行修改、运行测试并审查结果。
- **完成正式文档**：在 Write 中编辑和预览 Markdown，并通过 HTML、PDF、DOC、DOCX 等路径交付。
- **复用自己的方法**：把模板、规范和高频流程沉淀为 Skills，减少重复说明。
- **扩展外部能力**：通过 MCP、命令行工具和插件市场连接经过确认的工具与数据源。
- **连接行业知识**：写作可结合本地资料与 RailWise 官方知识库，结果保留来源链接供复核。
- **保持数据边界**：工作区、会话和设置以本机为中心；敏感资料是否发送给模型由用户配置和权限决定。

## 核心体验

### Code：从任务到可审查的修改

Code 工作台适合开发、资料整理、自动化和长链路任务。会话、计划、Todo、审批、文件变更和工具输出集中在一条时间线中；涉及写入或外部操作时，仍由用户确认权限和最终结果。

### Write：从草稿到可交付文档

Write 提供 Markdown 编辑、实时预览、选区助手、知识检索和多种文档导出。PPT Master、写作优化、行业报告等 Skills 可补充方法与模板，但事实、图片、表格和正式版式仍需人工复核。

### Skills、MCP 与命令行工具

插件市场把能力分为三类，界面保持简单：

1. **Skills**：可复用的工作方法和专业流程。
2. **MCP**：连接外部工具与数据源的标准接口。
3. **命令行工具**：由 WorkWise 隔离管理，或引导安装配套应用。

内置项目会显示来源、安装方式和安全状态；未通过路径、体积或包结构检查的 Skill 不会被安装。

## 三步开始

1. 从 [GitHub Releases](https://github.com/wangjiawei508/WorkWise/releases) 下载与你的电脑匹配的安装包。
2. 首次启动时选择语言，配置你有权使用的模型 API Key，并选择本地工作区。
3. 在 Code 中处理项目，或在 Write 中创建文档；需要时再添加 Skills、MCP 或命令行工具。

### 支持平台

| 平台 | 架构 | 安装包 |
| --- | --- | --- |
| macOS | Apple Silicon | `WorkWise-*-mac-Apple-Silicon.dmg` |
| macOS | Intel | `WorkWise-*-mac-Intel.dmg` |
| Windows | x64 | `WorkWise-*-win-x64.exe` |

当前不提供 Linux 桌面客户端和便携版。请始终从 [GitHub Releases](https://github.com/wangjiawei508/WorkWise/releases) 或 [WorkWise 产品主页](https://www.railwise.cn/products/workwise/)进入下载。

## 更新与帮助

WorkWise 默认从官方 GitHub Releases 检查新版本：

- 启动后在后台检查，发现新版本时显示提醒。
- 可从“帮助 → 检查更新”或“设置 → 通用 → 软件更新”手动检查。
- 支持自动安装的构建可在应用内完成更新；其他情况会打开版本下载页。
- 帮助菜单同时提供产品主页、个人主页、软件介绍、GitHub 项目和日志目录。

## 能力状态

| 状态 | 说明 |
| --- | --- |
| 稳定能力 | Code、Write、工作区会话、模型配置、内置 Skills、软件更新检查 |
| 预览能力 | 高级 MCP 编排、在线 Skill 更新、复杂 DOCX 导出、连接手机、定时任务 |
| 后续方向 | Design、Loop、多模态模型、企业知识库和更多行业智能体 |

预览能力和后续方向不会被描述为已经稳定交付的功能。详细边界见[软件介绍](./docs/product-introduction.zh-CN.md)。

## 本地数据与安全

- 新版数据默认存放在 `~/.workwise`，项目计划和规范存放在工作区内的 `.workwise`。
- WorkWise 不要求激活码；模型调用的账号、额度和计费由相应服务商管理。
- 使用客户资料、商业文件或内部知识前，请遵循组织的数据分级和授权要求。
- 安装第三方 Skill、MCP 或命令行工具前，请核对来源、许可证和所需权限。

更多说明：[本地数据与安全](https://kb.railwise.cn/products/workwise/security-data/)。

## 开发与贡献

```bash
git clone https://github.com/wangjiawei508/WorkWise.git
cd WorkWise
npm install
npm run dev
```

提交前建议运行：

```bash
npm run openspec:validate
npm run verify:brand-boundary
npm run typecheck
npm run lint
npm run test
npm run build
```

- [开发说明](./docs/DEVELOPMENT.zh-CN.md)
- [贡献指南](./docs/CONTRIBUTING.zh-CN.md)
- [0.2.5 公开行为差距表](./docs/PUBLIC_BEHAVIOR_GAP_0.2.5.zh-CN.md)

## 反馈

欢迎在 [GitHub Issues](https://github.com/wangjiawei508/WorkWise/issues) 提交问题和建议。为了更快定位，请附上 WorkWise 版本、操作系统与架构、复现步骤、截图或必要日志；不要公开 API Key、客户资料或其他敏感信息。

## 许可证与来源

WorkWise 以 [MIT License](./LICENSE) 发布。历史来源与第三方声明见仓库内许可证及来源说明文件。
