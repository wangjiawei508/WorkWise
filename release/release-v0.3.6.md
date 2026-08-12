# WorkWise 0.3.6

0.3.6 是从正式稳定版 `v0.3.5` 延续开发的补丁版本，重点修复应用内更新链路，并重新整理插件市场、特色 Skills 和界面可读性。

## 插件市场

- 插件市场改为紧凑的分类列表，提供精选、全部插件、已安装、可更新和需配置等状态筛选。
- 首批目录收录 34 个经过筛选的插件，其中 16 个进入精选；不会把本机扫描到的数百个 Skills 直接平铺到市场。
- 恢复招投标编制专家、RailWise 知识库、地铁保护区监测、运营期结构监测、PPT Master、文档配图助手、中文长文写作、中文人性化润色和女娲 Skill 等特色能力。
- 插件详情补齐产品类型、实现方式、权限、认证、许可证、来源、依赖、更新策略和健康状态。
- GitHub 使用官方远程 MCP，Postgres 由 DBHub 替代，Puppeteer 能力合并到 Playwright；Slack 和 Brave Search 按外部服务展示，不伪装成已安装插件。
- 保留旧插件配置、本地 Skills、凭据引用和迁移兼容，不静默删除用户数据。

## 应用内更新

- 修复更新元数据缓存策略，Stable 清单使用短缓存校验、ETag、Last-Modified 和 Range 请求。
- 更新错误按未签名构建、清单、网络、签名、下载和安装阶段分类，不再把自动更新失败伪装成官网跳转。
- 已撤回版本会明确提示状态，不会自动降级或干扰 Stable 版本判断。
- macOS Apple Silicon、macOS Intel 和 Windows x64 均已完成真实的 `0.3.5 -> 0.3.6` 应用内下载、退出安装、自动重启和用户数据保留验证。

## 界面与安全

- 侧边栏恢复实色高对比背景，移除过度透明和明显分隔阴影；玻璃效果仅用于启动窗口、标题栏和临时浮层。
- 插件凭据由安全存储管理，第三方更新默认需要用户确认，安装记录保留来源、版本、哈希、权限和更新策略。
- GitHub Skill 下载固定到不可变 commit，插件安装继续执行许可证、路径、哈希和权限检查。

## 安装包

- macOS Apple Silicon：`WorkWise-0.3.6-mac-Apple-Silicon.dmg`
- macOS Intel：`WorkWise-0.3.6-mac-Intel.dmg`
- Windows x64：`WorkWise-0.3.6-win-x64.exe`

macOS 安装包已通过 Developer ID 签名和 Apple 公证。应用内更新与官网下载使用同一组正式 Stable 产物。
