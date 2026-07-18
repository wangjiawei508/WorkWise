# WorkWise 0.3.0 升级说明

0.3.0 会在不删除历史会话和文件的前提下启用新的 Agent 工作台数据结构。建议升级前正常退出 WorkWise，并备份重要工作区。

## 自动迁移

- 旧设置会只读导入 `WorkWiseSettingsV2`，新写入使用 `schema: workwise.settings`、`version: 2` 和递增 revision。
- 历史已完成会话保持原样；旧版本遗留的运行中 Turn 会进入“安全待恢复”，不会在未确认副作用的情况下自动重放。
- 旧 sandbox 设置映射为四级工作区信任。WorkWise 创建的目录默认“工作区写入”，外部目录默认“只读”。
- 旧 MCP 配置可迁移服务器定义，但不会复制明文 Token 或环境变量凭据。
- 旧路径和旧版渲染接口在 0.3.x 继续只读/转发兼容；新代码和新数据使用 WorkWise 命名。

## 新增本地数据

- 任务、节点、checkpoint、租约、Shell 会话和运行诊断保存在 WorkWise Runtime 的 SQLite 数据库。
- 全局 Agent 位于 `~/.workwise/agents`，工作区 Agent 位于 `.workwise/agents`。
- 工作区信任记录按 canonical path 保存，不通过符号链接或 junction 继承。
- 文档解析缓存按文件 SHA-256、引擎版本和选项生成；可安全清理后重新构建。

## 文档解析

MarkItDown 已随 macOS Apple Silicon、macOS Intel 和 Windows x64 客户端分发，不需要单独安装 Python。MinerU 不在安装包内；需要扫描件、复杂版式、公式或 OCR 时，可在设置中按需安装本地组件。WorkWise 不会自动上传到 MinerU 官方云端。

## 回退注意事项

可以重新安装 0.2.9，但旧版本无法识别 0.3.0 新增的任务、Agent、信任和文档引擎记录。回退不会自动删除这些记录；不要手工修改 SQLite 数据库。需要清理时先导出成果和诊断，再通过 WorkWise 提供的操作执行。
