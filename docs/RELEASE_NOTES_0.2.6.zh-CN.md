# WorkWise 0.2.6 发布说明

0.2.6 聚焦中文使用体验、更新可发现性与发布可靠性。该版本恢复并完善了用户安装后最常用、最容易感知的桌面端入口。

## 主要更新

- 应用菜单、托盘菜单和帮助菜单跟随 WorkWise 语言设置切换；选择中文后无需重启即可显示中文。
- 帮助菜单新增个人主页、软件介绍和检查更新入口。
- 恢复启动后的后台更新检查与新版本提醒，并在“设置 → 通用”中显示当前版本、更新状态和手动检查按钮。
- 修复插件市场直接显示 `pluginCliTitle`、`pluginSkillAgentReachTitle` 等内部翻译键的问题。
- 简化 CLI 与 Skill 卡片的名称、说明、徽标和错误提示，补齐 Agent Reach、Ian 小黑插画、归藏素材、Lark CLI、OfficeCLI 与 ego-lite 的中英文文案。
- README 改为中文优先的产品首页，并补充独立的软件介绍、安装、更新、安全和帮助文档入口。

## 稳定性与发布质量

- 修复最终安装包中 ASAR 索引与文件内容不一致的问题，并增加完整归档读取校验。
- 增加 Lark CLI、OfficeCLI 和 ego-browser 的安装、校验、诊断、更新、失败回滚与卸载测试。
- 完成 macOS Apple Silicon、macOS Intel 和 Windows x64 构建验证。
- 发布前生产依赖高危与严重漏洞审计结果为 0。

## 升级说明

- 支持从 WorkWise 0.2.5 直接升级，现有工作区、会话、设置和托管工具数据保持不变。
- 应用内更新使用 GitHub Release 稳定通道；也可从“帮助 → 检查更新”或“设置 → 通用”手动检查。
- 若 macOS 安装包未使用 Apple Developer ID 签名，请按发布页提示清除隔离属性后首次启动。

完整安装包、更新元数据和 SHA-256 校验文件以 [GitHub Release](https://github.com/wangjiawei508/WorkWise/releases/tag/v0.2.6) 为准。
