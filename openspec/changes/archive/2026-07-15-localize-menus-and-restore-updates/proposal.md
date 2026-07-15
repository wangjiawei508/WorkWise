## Why

WorkWise 当前在中文环境中仍显示英文原生菜单和未解析的 CLI 国际化键，帮助入口与更新能力也不完整，导致安装后的核心操作难以发现。GitHub 首页文档同时缺少以中文为默认入口的完整产品说明，需要与应用内体验统一。

## What Changes

- 让应用原生菜单、托盘菜单和相关提示随 WorkWise 语言设置实时切换，中文设置下完整显示中文。
- 补齐 CLI 市场中英文翻译，禁止把 `pluginCliTitle` 等国际化键直接呈现给用户。
- 在帮助菜单加入 WorkWise 主页、软件介绍和检查更新入口。
- 恢复启动后的后台自动检查与可见更新提醒，并在“通用”设置提供手动检查、当前版本和更新状态。
- 重写并美化 GitHub README 与产品介绍，以中文为默认内容并保留英文入口。
- 增加菜单本地化、翻译完整性和更新交互回归测试。
- 将发布产物完整性纳入门禁：生产依赖不得残留 high/critical 漏洞，ASAR 必须可完整读取，托管 CLI 通道必须端到端验证，并由 macOS/Windows 双平台构建确认最终产物。

## Capabilities

### New Capabilities

- `localized-application-shell`: 应用菜单、托盘、帮助入口及插件市场文案遵循当前语言且不泄漏翻译键。
- `user-visible-updates`: 后台更新提醒、手动检查和设置页更新状态形成一致的更新体验。
- `chinese-first-product-documentation`: GitHub 首页和产品介绍默认以中文清晰呈现，并提供必要的使用与帮助入口。
- `release-integrity`: 发布前验证生产依赖、ASAR、托管 CLI 和跨平台安装包，任何阻断项未关闭时不得发布。

### Modified Capabilities

无。

## Impact

- Electron 主进程菜单、托盘、窗口生命周期和更新器初始化。
- preload/IPC 更新接口、renderer 语言状态与“通用”设置界面。
- 中英文翻译资源、CLI 插件市场展示和相关测试。
- 根目录 README、英文 README、产品介绍及帮助链接。
- 依赖锁文件、after-pack 流程、CLI 安装测试和 GitHub Actions 发布门禁。
