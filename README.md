# WorkWise

[English](./README.en.md) | 简体中文

> 让 AI 进入真实工作流。

WorkWise 是一个本地优先的桌面端 AI 工作台。它把 **Code**、**Write**、可复用 **Skills**、**MCP 插件**、本地工作区和文档交付放在同一个应用里，服务需要持续上下文、反复迭代和正式交付的真实工作。

- 产品官网：[www.railwise.cn/products/workwise](https://www.railwise.cn/products/workwise/)
- 站内下载镜像：[下载与安装](https://www.railwise.cn/products/workwise/#download)
- 官方文档：[kb.railwise.cn/products/workwise](https://kb.railwise.cn/products/workwise/)
- 公开 Release：[v0.2.4](https://github.com/wangjiawei508/WorkWise/releases/tag/v0.2.4)

## 当前版本

当前稳定版为 **v0.2.4**，仅提供下列三个面向用户的安装包：

| 平台 | 安装包 | 下载 |
| --- | --- | --- |
| macOS Apple Silicon | `WorkWise-0.2.4-mac-Apple-Silicon.dmg` | [站内镜像](https://www.railwise.cn/downloads/workwise/v0.2.4/WorkWise-0.2.4-mac-Apple-Silicon.dmg) |
| macOS Intel | `WorkWise-0.2.4-mac-Intel.dmg` | [站内镜像](https://www.railwise.cn/downloads/workwise/v0.2.4/WorkWise-0.2.4-mac-Intel.dmg) |
| Windows x64 | `WorkWise-0.2.4-win-x64.exe` | [站内镜像](https://www.railwise.cn/downloads/workwise/v0.2.4/WorkWise-0.2.4-win-x64.exe) |

站内镜像是官网主下载入口；GitHub Release 用于核对公开版本、历史版本和问题反馈。当前不提供 Linux 客户端、便携版或激活码。

## 为什么是 WorkWise

AI 不应只停留在临时问答。真实工作往往需要长期保留项目资料、文件、会话、方法和交付标准。

1. **上下文持续**：本地工作区、会话和文档围绕同一个任务组织，减少反复交代背景。
2. **写作到交付**：Markdown 写作、预览、富文本复制及 Word / PDF 等交付路径被放在同一条工作流中。
3. **经验可复用**：把常用方法、模板和规范沉淀为 Skills，让个人和团队不必每次从零编写 Prompt。
4. **扩展有边界**：MCP 与插件用于接入额外工具和数据源；应用只把已验证能力作为正式功能公开。

## 核心能力

### Code 工作台

围绕本地项目和资料目录协作，辅助理解、修改、测试、构建、审查与交付。会话、计划、Todo、目标和权限策略用于支撑较长的任务链，而不是替代人工判断。

### Write 写作工作台

用于 Markdown 和文档型工作的完整链路：

- 编辑、预览和整理 Markdown / 文本内容。
- 富文本复制，以及 HTML、PDF、DOC、DOCX 等交付路径。
- 通过 AI Word、去 AI 味写作、PPT Master 等 Skills 辅助结构整理、表达优化和成果复核。
- 正式提交前保留人工复核，尤其是图片、表格、版式和事实性内容。

详见：[Write 与文档导出](https://kb.railwise.cn/products/workwise/write-export/)。

### Skills 与 MCP

Skills 是 WorkWise 的可复用资产层，可用于封装高频方法、写作规范、模板和行业流程。MCP 与插件市场用于管理扩展的来源、用途和安装状态，适合在确认权限和适用范围后接入更多工具。

详见：[Skills 与模板](https://kb.railwise.cn/products/workwise/templates/)。

### 本地优先

工作区、会话和设置以本机为中心。模型调用需要使用你有权使用的 API Key 或兼容服务；请根据组织要求处理敏感资料、访问权限和本地清理。

详见：[本地数据与安全](https://kb.railwise.cn/products/workwise/security-data/)。

## 能力状态

| 状态 | 范围 |
| --- | --- |
| 正式可用 | Code、Write、模型配置、工作区会话、内置 Skills、下载入口、GUI 更新检查 |
| 预览能力 | 高级 MCP 插件市场、可选在线 Skill 更新、复杂 Markdown / DOCX 导出、移动端连接、定时任务 |
| 发展方向 | 企业知识库、投标辅助、经营分析与更多行业智能体套件 |

不把预览能力或发展方向描述为已稳定发布的功能。

## 快速开始

1. 下载与你的设备匹配的安装包并完成安装。
2. 在设置中配置 DeepSeek、Agnes AI 或其他 OpenAI 兼容服务。
3. 选择本地项目或资料目录作为工作区。
4. 在 Code 中处理项目任务，或在 Write 中开始文档工作。
5. 根据需要启用 Skills；正式导出前检查文档内容、图片、表格和排版。

- [快速开始](https://kb.railwise.cn/products/workwise/quickstart/)
- [安装指南](https://kb.railwise.cn/products/workwise/install-guide/)
- [常见问题](https://kb.railwise.cn/products/workwise/faq/)

### 安装提示

- **macOS**：首次打开遇到系统安全提示时，先确认安装包来源。必要时可在“系统设置 → 隐私与安全性”中允许打开；仍无法启动时，参考安装文档中的备用 `xattr` 方案。
- **Windows**：如出现 Defender 或 SmartScreen 提示，请先核对下载来源、文件名和版本，再按组织安全策略继续。
- **模型服务**：API Key、额度、模型可用性和计费规则由对应服务商及你的账户权限决定。

## 开发

```bash
git clone https://github.com/wangjiawei508/WorkWise.git
cd WorkWise
npm install
npm run dev
```

常用质量检查：

```bash
npm run openspec:validate
npm run verify:brand-boundary
npm run typecheck
npm run lint
npm run test
npm run build
```

本地智能体由 WorkWise Agent Runtime 提供，并通过稳定的 HTTP/SSE 边界与桌面应用协作。

## 发布规则

- 公开 Release 仅保留 macOS Apple Silicon、macOS Intel、Windows x64 三个用户安装包。
- 不公开中间构建文件，也不将未验证路线图写成已发布能力。
- 版本日志以 [GitHub Release](https://github.com/wangjiawei508/WorkWise/releases) 为准，官网与知识库同步产品版本和支持平台。
- 0.2.5 的公开行为基线见[公开行为差距表](docs/PUBLIC_BEHAVIOR_GAP_0.2.5.zh-CN.md)。

## 反馈

欢迎通过 [GitHub Issues](https://github.com/wangjiawei508/WorkWise/issues) 提交问题和建议。请尽量附上：

- WorkWise 版本、操作系统和芯片架构。
- 可复现的操作步骤、截图或错误日志。
- 文档导出问题的最小 Markdown 示例。
- Skills / MCP 的来源、触发方式和报错信息。

## 许可证

[MIT](./LICENSE)
