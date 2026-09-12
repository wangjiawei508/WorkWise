# DeepSeek-V4.1-Flash 默认模型变更

用户要求将新发布的 DeepSeek-V4.1-Flash 设为 WorkWise 默认模型。

## 官方依据

2026-09-10 读取官方 [英文模型与价格](https://api-docs.deepseek.com/quick_start/pricing)
和 [中文模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)：

- 正式 API 模型名是 `deepseek-flash`，对应 DeepSeek-V4.1-Flash；不使用推测的 `deepseek-v4.1-flash`。
- 支持文本、视觉输入、工具调用、默认思考模式、JSON、Responses API；上下文 1M，最大输出 384K。
- FIM 继续要求非思考模式，沿用现有请求适配。
- 官方仍接受旧的 `deepseek-v4-flash`、`deepseek-v4-flash-vision-exp`，并在服务端转接新 Flash。
- 官方计划北京时间 2026-09-14 12:00 后将 V4 Pro 请求转接 Flash；本变更不提前改写用户明确选择的 Pro。

## 迁移矩阵

| 原项目/状态 | 新状态 | 原因 | 数据保留行为 | 用户操作 |
| --- | --- | --- | --- | --- |
| 新安装或未配置的桌面默认 `deepseek-v4-pro` | `deepseek-flash` | 用户指定 V4.1 Flash 为默认 | 不修改历史会话和持久化模型选择 | 无；配置已有 DeepSeek API Key 后使用 |
| 未配置的独立 Runtime 默认 `deepseek-v4-pro` | `deepseek-flash` | 与桌面默认一致 | 明确的配置、环境变量、命令行模型继续优先 | 无 |
| Write 无显式模型时的 Flash 回退 | `deepseek-flash` | 使用正式新名称，支持 FIM | 保留显式补全模型和继承规则 | 无 |
| `/model flash`、定时任务模型推断回退 | `deepseek-flash` | 新建操作使用当前 Flash | 已保存任务模型不被批量改写；显式旧 Flash 命令仍可读写 | 原模型可继续选择 |
| 官方 DeepSeek 的 auto 图片输入 | `deepseek-flash` | 新模型已支持视觉 | 保留附件与历史会话 | 无 |
| 用户保存的 Pro、旧 Flash、视觉实验版或自定义模型 | 保留 | 不能将明确选择当作未配置默认 | 模型目录保留旧选项；第三方已配置或探测到的旧视觉 ID 原样使用 | 想切换既有配置时选择 `deepseek-flash` |
| 插件、MCP、Skill、凭据引用与工程资料 | 保留 | 本次仅更新模型默认与能力 | 无删除、替换或凭据迁移 | 无 |

## 配套支持

- 桌面与 Runtime 均配置新模型 1M 上下文、384K 输出、视觉消息部件和工具能力。
- 官方 DeepSeek 请求中的默认思考模式与工具历史 `reasoning_content` 回传包含新模型。
- 调度/手机模型设置可保存新 ID；旧显式模型选择继续受支持。
- `deepseek-flash` 费用估算使用本地估算时刻判断 UTC 工作日 01:00–04:00、06:00–10:00
  的高峰时段；其余为空闲时段。美元空闲价格每百万 tokens 为缓存命中 0.003、
  未命中 0.15、输出 0.6；人民币分别为 0.02、1、4，高峰均翻倍。
  估算时间可显式传入，提供商的实际计费时间和账单为准。未重算历史已保存费用；
  原有旧模型费率表仍保留兼容，本次新费率仅用于正式新 ID。第三方服务不套用官方价格。

## 验证与包验收范围

- 桌面端全量：304 文件通过、2 文件跳过；2,440 项通过、2 项跳过。
- Runtime 全量：136 文件通过、2 文件跳过；1,586 项通过、3 项跳过。
- 根项目与 Runtime typecheck、生产 build、957 输入新鲜度、OpenSpec strict 11/11 通过。
- lint 0 error，保留 Workbench.tsx:1402 既有 Hook warning；`git diff --check` 通过。
- 回归覆盖新模型默认值与显式选择保留、打包配置能力元数据、默认思考回传、官方/第三方
  图片模型选择、价格时段边界，以及历史 Write Flash 配置仍继承主模型。
- 未用真实 API Key 发起付费模型推理；模型标识和能力依据官方文档，协议链通过本地回归验证。

此前候选 `912e4d30b065` 不包含这次插播功能，不能用它
证明新默认值的打包 GUI 验收。Task 15、29、36 的签名、公证、真实私有 updater 和
完整 UI/专业交付验收要求继续有效。公共版本保持 `0.4.2`，未执行公开发布。
