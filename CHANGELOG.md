# Changelog

WorkWise 的正式版本变更记录。各版本的完整说明同时保存在 `release/` 目录。

## [0.4.1] - 2026-08-24

### Changed

- 补充 DeepSeek Harness 的实际接入说明，区分模型请求中的结构化附件与本机视觉证据分析器的内部数据传递。

### Fixed

- 修复从 Finder 启动 WorkWise 时插件市场找不到 `npm` 或 `git`，导致 npm、GitHub Skill 和 Git 目录插件均无法安装的问题。
- 修复 0.4.0 被客户端内置判定为“已撤回”、从而阻止正常应用内更新的问题；撤回版本现在只由显式运行时配置决定。

### Compatibility

- 不删除、不替换或迁移现有插件、MCP、Skill、凭据引用和用户数据；0.4.0 可直接原位升级到 0.4.1。
