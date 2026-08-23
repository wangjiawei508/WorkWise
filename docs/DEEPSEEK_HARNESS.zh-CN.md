# WorkWise 的 DeepSeek Harness 接入说明

本文只记录 WorkWise 0.4.0 实际接入的内容。`DeepSeek Harness` 是上游项目名称；本文不把上游仓库的全部能力、最新变更或官方模型能力自动归入 WorkWise。

## 0.4.0 使用的内容

WorkWise Runtime 使用自己的 DeepSeek 兼容模型适配器、结构化附件合约和 Agent Loop：

- 默认模型配置包含 `deepseek-v4-pro`、`deepseek-v4-flash`；`deepseek-v4-flash-vision-exp` 配置声明支持 `text` 与 `image` 输入。
- 附件先通过 `attachmentIds` 进入 Runtime，不把图片直接写入线程 JSONL。模型请求根据能力构造结构化 `text` 和 `image_url` 消息部分。
- 文本模型不能直接接收图片时，Runtime 调用配置的 `VisionEvidencePort`。本机回环分析器返回 OCR、布局、语义、视觉摘要和不确定性字段，再以不可信证据注入模型上下文。
- 视觉证据分析使用缓存、并发请求共享、超时、取消、图片大小/MIME 校验和回环地址校验。分析器不可用、超时、返回无效数据或失败时，本回合进入明确的 `attachment_analysis_unavailable` 失败终态。
- 视觉证据被标记为不可信资料，只能帮助回答用户问题，不能覆盖系统指令、授权工具或审批边界。

## 两种数据边界

“不把图片退回为 Base64”只针对模型提示和模型请求：

1. 发送给支持图片的模型时，WorkWise 使用结构化图片消息部分，不把图片拼进普通文本。
2. 发送给文本模型时，WorkWise 发送结构化 OCR、布局、语义和视觉证据，不发送图片 Base64 文本。
3. 本机视觉分析器的内部 HTTP 输入可以使用 `dataBase64` 传输图片字节。这是受回环地址、大小和 MIME 校验保护的本地传输格式，不是模型上下文，也不是对外宣传的模型能力。

## 当前没有宣称的内容

- 客户端没有把上游 DeepSeek Harness 仓库作为独立 npm 依赖或源码副本打包进安装包。
- 0.4.0 没有宣称自动获得上游项目的全部新功能，也没有把上游更新日期当作 WorkWise 版本能力。
- DeepSeek 官方文档、第三方兼容服务和用户账户的模型可用性、额度、计费与接口行为仍以对应服务为准。
- Responses、Anthropic 或其他协议只有在 WorkWise 的适配器、配置和验收证据覆盖时才会被写入稳定能力；不能仅因代码存在兼容分支就宣传为默认路径。

## 实现与验收索引

- Runtime 入口与模型能力配置：[managed-runtime-process.ts](../src/main/managed-runtime-process.ts)
- DeepSeek 兼容模型适配：[deepseek-compat-model-client.ts](../kun/src/adapters/model/deepseek-compat-model-client.ts)
- 附件分流与失败契约：[agent-loop.ts](../kun/src/loop/agent-loop.ts)
- 视觉证据合约：[vision-evidence.ts](../kun/src/contracts/vision-evidence.ts)
- 本机回环分析器客户端：[vision-evidence-service.ts](../kun/src/vision/vision-evidence-service.ts)
- 真实图片与 OCR 验收：[WORKWISE_REAL_VISION_OCR_ACCEPTANCE_2026-08-22.zh-CN.md](./qa/WORKWISE_REAL_VISION_OCR_ACCEPTANCE_2026-08-22.zh-CN.md)
- 计划完成审计：[WORKWISE_PLAN_COMPLETION_AUDIT_2026-08-19.zh-CN.md](./qa/WORKWISE_PLAN_COMPLETION_AUDIT_2026-08-19.zh-CN.md)

上游 DeepSeek Harness 的接口、代码和更新以其官方开源仓库及发布说明为准。WorkWise 只有在完成自身实现、测试和真实服务验收后，才会把对应能力加入产品介绍或稳定能力列表。
