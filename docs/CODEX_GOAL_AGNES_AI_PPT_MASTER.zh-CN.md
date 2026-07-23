# Codex Goal：Agnes AI 接入与 PPT Master 内置能力

请在 WorkWise 项目中完成一个可发布前评审的 MVP：新增 Agnes AI 文本模型 Provider 预设，加入 Agnes 文生图能力与提示词模板，并将 PPT Master 作为瘦身内置 Skill/工作流能力加入插件/技能市场。不要发布版本，除非用户另行明确要求。

## 背景

WorkWise 需要扩展两类能力：低门槛模型服务和高质量工作成果输出。Agnes AI 官方文档显示 `agnes-2.0-flash` 兼容 OpenAI Chat Completions，`agnes-image-2.1-flash` 可走 `/v1/images/generations` 文生图；PPT Master 官方仓库 `hugohe3/ppt-master` 可从 PDF/DOCX/URL/Markdown/PPTX 生成原生可编辑 PPTX。本次做文本模型、文生图和 PPT 生成工作流 MVP，不做视频生成。

## 目标一：Agnes AI 文本 Provider

实现 Agnes AI 作为内置模型 Provider 预设：

- Provider 名称：Agnes AI
- Base URL：`https://apihub.agnes-ai.com/v1`
- API Type：`chat_completions`
- 默认模型：`agnes-2.0-flash`
- 认证方式沿用 Bearer API Key

要求：

- 设置页/模型 Provider 添加流程中可选择或快速填入 Agnes AI。
- 默认模型列表中包含 `agnes-2.0-flash`。
- 请求最终走 `/v1/chat/completions`。
- `/v1/models` 拉取失败、缺少 API Key 或 Agnes 返回 401 时，不阻止手动模型使用。
- 帮助文档说明：Agnes 文本模型通过聊天 Provider 接入；生图走独立素材生成能力。
- 文案不要承诺永久免费，只写“以 Agnes 官方账户和额度规则为准”。

## 目标二：Agnes 文生图能力

增加一个独立的 Agnes 图片生成服务，不要混入聊天 Provider：

- Endpoint：`https://apihub.agnes-ai.com/v1/images/generations`
- 默认模型：`agnes-image-2.1-flash`
- 备选模型：`agnes-image-2.0-flash`
- 支持 `prompt`、`size`、URL 输出；必要时兼容 Base64 返回

在写作/素材生成场景提供入口，生成结果保存到当前工作区图片目录，并可插入 Markdown 或供 PPT Master 使用。至少内置 5 个提示词模板：

- 工程汇报封面
- 监测数据背景
- 施工/运维示意图
- 商务写作配图
- 图标式插画

模板要支持变量，如 `{主题}`、`{行业}`、`{画面主体}`、`{颜色}`、`{用途}`、`{比例}`。保留用户改写后的提示词，失败时显示可读错误。

## 目标三：PPT Master 瘦身内置 Skill

将 `hugohe3/ppt-master` 的 PPT 生成能力内置到 WorkWise，但绝不能打包官方全仓库、用户本地 `~/CODE/ppt-master/projects/`、全量 examples、exports、backup、重复 svg 输出或任何私有项目资料。

内置内容只允许保留核心能力：

- `skills/ppt-master/SKILL.md`
- `requirements.txt`
- `references/`
- `workflows/`
- `scripts/`，排除 `__pycache__`
- `scripts/confirm_ui/`、`scripts/docs/confirm_ui.md` 与 `scripts/server_common.py`
- `scripts/svg_editor/static/`
- `templates/design_spec_reference.md`
- `templates/spec_lock_reference.md`
- `templates/charts/`
- 少量必要通用 layout
- `examples/` 中 1-2 个轻量顶级咨询风示例，只保留 `design_spec.md` 与 `svg_final/`
- `projects/` 空占位目录和说明文件

明确排除：

- 官方全量 `examples/`
- 用户真实 `projects/`
- `exports/`
- `backup/`
- `svg_output/`
- 重复或大体积 SVG 输出；允许少量示例的 `svg_final/` 作为风格参考
- 全量 `templates/icons/`
- 用户个人 PPT、公司项目资料、客户资料
- Pandoc 依赖或 Pandoc 安装逻辑

为内置 Skill 增加 `.workwise-skill-source.json`，记录 GitHub 来源：

- owner：`hugohe3`
- repo：`ppt-master`
- path：`skills/ppt-master`
- ref：`main`
- autoUpdate：`true`
- includePaths 使用白名单，包含 `templates/layouts`，避免下载 600MB 全仓库和 1 万多个图标文件

PPT Master 新版的 Step 4 必须保留 localhost 视觉确认页：根据任务生成 `<project>/confirm_ui/recommendations.json`，默认运行 `scripts/confirm_ui/server.py <project> --daemon --wait`，让用户在本地页面选择风格、字体、受众、页数、配色、图片策略等；若浏览器、端口或 Flask 不可用，再回落到聊天确认。Step 6 的 `svg_editor` localhost 预览页也要保留。

## 插件市场与文档

在插件/技能市场增加 PPT Master 卡片和详情说明：

- 标题：PPT Master
- 描述：从文档、网页、Markdown 或已有 PPTX 生成原生可编辑 PowerPoint。
- 详情说明它适用于：方案汇报、评审 PPT、投标演示、项目总结、模板复用、PPT 美化。
- 详情页必须有 GitHub 链接：`https://github.com/hugohe3/ppt-master`
- 明确说明“内置的是工作流能力，只含少量轻量示例和空 projects 占位，不包含全量官方 examples、用户真实 projects 或私有 PPT”。
- 说明 Python 3.10+ 依赖；`svglib/reportlab` 为 Office 兼容模式可选依赖；MVP 不启用 Pandoc。

## 验收标准

- Agnes AI 能作为 Provider 被选择/创建，默认配置正确。
- Agnes 文本模型请求 URL 和 API 类型正确。
- Agnes 文生图入口可用，默认模型为 `agnes-image-2.1-flash`。
- 至少 5 个标准提示词模板可选择、可编辑、可用于生成图片。
- 生图结果可保存到工作区并插入 Markdown 或作为 PPT 素材。
- Agnes 文档和帮助页边界清楚：文本和文生图支持，视频和完整图生图编辑未实现。
- PPT Master 能在插件/技能市场中看到、打开详情并安装。
- 安装后的 Skill 能被 WorkWise Skill 扫描发现，可通过自然语言或斜杠命令触发。
- 安装内容不包含全量 examples、用户真实 projects、exports、backup、重复 svg 输出、用户私有资料或全量图标库。
- 至少有单元测试覆盖 Provider 默认值、Skill 元数据/安装路径或 marketplace 文案。
- 运行现有相关测试；若无法跑完整测试，说明原因。
- 必做 smoke test：使用冻结的本地 sidecar 执行 SVG → PPTX → SVG 往返验证，并检查生成的 `.pptx` 为非空且包含有效 OOXML 幻灯片结构。

## 开发约束

- 尊重现有 WorkWise 架构，不做大范围重构。
- 不修改或删除用户本地 `~/CODE/ppt-master/projects/`。
- 不把用户样例或私有项目复制进仓库。
- 不引入 Pandoc。
- 不新增 Agnes 视频 UI；图生图/多图编辑只做后续扩展说明。
- 完成后给出变更摘要、测试结果和剩余风险。
