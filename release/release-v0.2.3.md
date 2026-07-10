# WorkWise 0.2.3

## 新增能力

- 技能市场默认打开 Skill 标签并记住上次选择，新增 CLI 标签。
- 新增 Agent Reach 与 Ian 小黑插画的 GitHub Skill 安装和自动更新；Ian 排除大型示例图片。
- guizang-material-illustration 因上游暂无许可证，仅提供官方 GitHub 外部安装入口。
- PPT Master 在技能市场和 Write 起始页、编辑器工具栏均可直接发现；首次使用自动安装内置受控快照并预填提示词，不自动发送。
- 新增 WorkWise 托管工具中心：Lark CLI、OfficeCLI 和 ego-browser，工具位于 `~/.workwise/tools`，不会修改系统全局 PATH。
- Write 默认启用 RailWise 官方知识库混合检索。Knowledge API 不可用时自动回退 `https://kb.railwise.cn/llms-full.txt`，并与本地写作 RAG 合并。

## 安全与兼容性

- Lark CLI 与 OfficeCLI 使用官方 GitHub Release 和 SHA-256 校验，临时目录安装并原子切换。
- Lark 凭据继续由官方 CLI 和系统钥匙串管理，WorkWise 不读取或保存 token。
- RailWise 知识库请求仅包含压缩关键词，不发送全文、文件路径或客户资料；远程链接限制为官方域名。
- PPT Master 固定审计快照 `3ba0fca6741adef2998ceca7e38989f822023f2d`，后续同步仅允许脚本、工作流、文字 references、charts 和轻量 layouts。
- 保留 macOS Dock 图标尺寸与透明留白修正。

## 安装包

本次已准备本地 macOS arm64/x64 安装包。Windows x64 继续由既有 GitHub Actions `windows-latest` Release Job 构建；本次仅完成工作流与版本配置验证，不推送代码、不触发 Actions，也不创建 GitHub Release。
