# 上游来源与 WorkWise 适配

- 上游仓库：`https://github.com/op7418/Document-illustrator-skill`
- 固定提交：`8344815d407cc25cc04c327557f36ed839f0aaef`
- 上游许可证：MIT，完整文本见技能根目录 `LICENSE`
- 审计日期：2026-07-25

WorkWise 保留了上游三种视觉风格参考，并重写了运行说明以适配 WorkWise 的文档解析、工作区边界、图片生成设置、成果卡和 PPT/Write 联动。

未分发上游的第三方图片服务 Python 脚本。原因是这些脚本会从本地环境文件、系统环境变量和旧版第三方 Agent 配置目录读取 API 密钥，并直接连接外部图片服务；WorkWise 统一使用产品设置中已授权的图片生成提供商，避免重复凭据路径和隐式文档外发。
