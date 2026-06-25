# WorkWise PRD：Agnes AI 模型接入与 PPT Master 内置能力

日期：2026-06-21  
状态：待开发  
目标版本：下一功能版本

## 1. 背景

WorkWise 已经完成基础重命名、工程/基础设施智能体套件、写作增强 Skill、Markdown 导出和插件市场能力。下一阶段需要补齐两类能力：

1. 新增低门槛模型提供方，降低用户试用和日常使用成本。
2. 增强“工作成果输出”能力，尤其是可编辑 PPTX 汇报材料。

本 PRD 聚焦两个补充方向：接入 Agnes AI 文本模型与生图能力；内置 PPT Master 的 PPT 生成工作流能力。

## 2. 产品目标

- 让用户可在 WorkWise 设置中直接选择 Agnes AI 作为模型服务商。
- 在不改动核心 Agent 架构的前提下，支持 Agnes 文本模型用于聊天、写作和智能体任务。
- 在写作和汇报材料场景中加入 Agnes 生图能力，提供常用提示词模板，帮助用户快速生成配图、封面图和示意图素材。
- 将 PPT Master 作为内置 Skill/工作流能力加入 WorkWise，用于从方案、报告、网页、Markdown、PPTX 模板生成可编辑 PPT。
- 明确避免打包 PPT Master 全仓库、全量示例、用户自己的 `projects/`、导出 PPT 和大体积图标库；仅保留少量轻量示例作为风格参考。

## 3. Agnes AI 接入范围

### 3.1 MVP 范围

新增一个模型 Provider 预设：

- 名称：Agnes AI
- Base URL：`https://apihub.agnes-ai.com/v1`
- API Type：`chat_completions`
- 默认模型：`agnes-2.0-flash`
- 认证：`Authorization: Bearer <API_KEY>`
- 文档入口：
  - `https://agnes-ai.com/doc/overview`
  - `https://agnes-ai.com/doc/agnes-20-flash`
  - `https://agnes-ai.com/doc/quick-start`

Agnes 官方文档显示 `agnes-2.0-flash` 支持 OpenAI Chat Completions 风格请求、多轮对话、流式输出、工具调用、Agent workflow、编码和推理任务。WorkWise 现有 Provider 机制已支持自定义 `baseUrl`、`apiKey` 和 `chat_completions`，因此 MVP 不需要新增协议适配层。

同时新增 Agnes 生图服务，作为独立的素材生成能力，而不是混入聊天 Provider：

- 生图 Endpoint：`https://apihub.agnes-ai.com/v1/images/generations`
- 默认模型：`agnes-image-2.1-flash`
- 备选模型：`agnes-image-2.0-flash`
- 输入：`model`、`prompt`、`size`
- 输出：优先 URL；必要时支持 Base64
- 支持场景：文生图、图生图、多图合成的后续扩展

MVP 先做文生图：用户可在写作模块或素材生成入口选择提示词模板，生成图片后保存到当前工作区图片目录，并可插入 Markdown/PPT 资料。

### 3.2 生图提示词模板

内置一组面向工作场景的标准提示词模板，作为 Agnes 生图亮点：

| 模板 | 用途 | 提示词结构 |
| --- | --- | --- |
| 工程汇报封面 | 方案、评审、项目总结封面 | 主体 + 工程场景 + 专业摄影/渲染风格 + 留白区域 + 色调 |
| 监测数据背景 | 报告/PPT 的章节页或配图 | 城市轨道/基础设施 + 数据网格/传感器元素 + 克制科技感 |
| 施工/运维示意图 | 表达工况、流程、作业场景 | 场景对象 + 作业动作 + 安全规范 + 清晰构图 |
| 商务写作配图 | 公众号、汇报摘要、产品说明 | 主题隐喻 + 真实办公/城市环境 + 干净背景 |
| 图标式插画 | 文档小图、卡片配图 | 单一概念 + 扁平/等距/线性风格 + 透明或浅色背景 |

模板应支持变量，例如 `{主题}`、`{行业}`、`{画面主体}`、`{颜色}`、`{用途}`、`{比例}`。界面不应只展示一段长提示词，而要让用户能选择场景并填写关键字段。

示例提示词：

```text
为“城市轨道交通结构健康监测方案”生成一张专业汇报封面图：画面主体为现代地铁区间与城市道路剖面，叠加少量传感器节点和数据线，风格真实、克制、工程咨询感，蓝灰主色，右上角保留标题留白，16:9。
```

### 3.3 非 MVP 范围

以下能力暂不在 MVP 内实现，仅在文档或代码注释中预留：

- Agnes Video V2.0 异步视频生成任务。
- 图生图、多图合成的完整编辑 UI。
- 视频生成 UI、任务队列、结果轮询和下载管理。

原因：Agnes 视频走 `/v1/videos` + 结果查询，和聊天模型协议不同。图生图/多图合成也需要素材管理和预览交互，MVP 先聚焦文生图。

### 3.4 Agnes 验收标准

- 设置页或模型 Provider 添加流程中能选择/快速填入 Agnes AI。
- 新 Provider 默认填充 Agnes Base URL、API 类型和默认模型。
- 用户输入 API Key 后，运行时请求命中 `https://apihub.agnes-ai.com/v1/chat/completions`。
- `/v1/models` 拉取失败或无 Key 时，不影响手动配置 `agnes-2.0-flash`。
- 写作或素材生成入口可调用 `agnes-image-2.1-flash` 进行文生图。
- 至少内置 5 个生图提示词模板，支持用户改写后生成。
- 生成结果保存到当前工作区，并能插入 Markdown 或作为 PPT Master 的素材来源。
- 文档和帮助页明确说明：MVP 支持文本模型和文生图；视频、图生图完整编辑为后续扩展。
- 不宣传“永久免费”，只表述为 Agnes 官方页面宣称有免费额度/免费模型，实际以 Agnes 账户和官方规则为准。

## 4. PPT Master 内置范围

### 4.1 定位

PPT Master 不是普通 PPT 模板填充器，而是一套 “harness + model = agent” 的工作流。它将 PDF/DOCX/URL/Markdown/PPTX 等资料转为 Markdown 和设计规范，再生成 SVG 页面，最终导出原生可编辑 PPTX。

官方仓库：`https://github.com/hugohe3/ppt-master`  
许可证：MIT  
最新调研版本：v2.11.0

### 4.2 MVP 范围

将 PPT Master 作为 WorkWise 内置 Skill 加入插件/技能市场，建议名称：

- 展示名称：PPT Master
- Skill 名称：`ppt-master`
- 功能描述：从文档、网页、Markdown 或已有 PPTX 生成原生可编辑 PowerPoint。

内置内容采用“瘦身核心版”，只保留运行工作流所需内容：

- `skills/ppt-master/SKILL.md`
- `skills/ppt-master/requirements.txt`
- `skills/ppt-master/references/`
- `skills/ppt-master/workflows/`
- `skills/ppt-master/scripts/`，排除 `__pycache__`
- `skills/ppt-master/scripts/confirm_ui/` 与 `scripts/docs/confirm_ui.md`，用于 Step 4 localhost 视觉确认页
- `skills/ppt-master/scripts/svg_editor/static/`，用于 Step 6 SVG 实时预览页
- `skills/ppt-master/templates/design_spec_reference.md`
- `skills/ppt-master/templates/spec_lock_reference.md`
- `skills/ppt-master/templates/charts/`
- `skills/ppt-master/templates/layouts/` 中少量官方通用布局
- `skills/ppt-master/examples/` 中 1-2 个轻量顶级咨询风示例，只保留 `design_spec.md` 与 `svg_final/`
- `skills/ppt-master/projects/` 空占位目录，用于说明默认项目输出结构
- `.workgpt-skill-source.json`，记录上游 GitHub 来源和白名单同步路径

明确禁止内置：

- 官方仓库根目录全量 ZIP。
- 官方 `examples/` 全量内容。
- 本机 `~/CODE/ppt-master/projects/` 的任何真实项目。
- 用户自己生成过的 PPT、项目资料、`exports/`、`backup/`、`svg_output/`。
- 全量 `templates/icons/` 图标库。
- 任何包含公司、客户、项目、个人信息的样例。

### 4.3 工作流能力

MVP 通过 Skill 方式触发，不强制新增完整 PPT 工作台。用户可在聊天/写作中表达：

- “用这份方案生成一份评审汇报 PPT”
- “把这个 Markdown 做成 10 页 PPT”
- “套这个 PPT 模板做一版项目汇报”
- “优化这份 PPT，但保留原页数和文字”

Skill 应覆盖以下路径：

- 主流程：资料转 PPT。
- `confirm_ui`：根据任务在 localhost 页面选择风格、字体、受众、页数、配色、图片策略等；失败时回落到聊天确认。
- `live-preview`：生成 SVG 时启动 localhost 实时预览页面。
- `template-fill`：用已有 PPTX 模板填充新内容。
- `beautify`：保留原 PPTX 页数、顺序和文字，只优化版式。
- `create-template`：将公司模板沉淀为可复用模板。

### 4.4 依赖策略

- 需要 Python 3.10+。
- `flask` 用于 localhost 确认页和 SVG 实时预览页。
- 不启用 Pandoc，MVP 只承诺 PDF、DOCX、XLSX、PPTX、Markdown、HTML/网页等 Python 原生可处理路径。
- `svglib/reportlab` 可作为可选依赖，用于 Office 兼容模式 PNG fallback；原生 PPTX 导出可先跑通。
- 插件详情页需要提示依赖检查和安装建议。

### 4.5 PPT Master 验收标准

- 插件/技能市场出现 PPT Master 内置 Skill 卡片，有详情页、GitHub 链接、能力说明和限制说明。
- 一键安装后，目标 Skill 目录中包含瘦身核心文件、`confirm_ui`、`svg_editor` 静态页、通用 layouts、两个轻量示例和空 `projects` 占位；不包含全量 examples、真实 projects、exports、backup、svg_output 或用户私有资料。
- Skill 能被 WorkWise 发现，并能通过斜杠命令或自然语言触发。
- Step 4 默认能启动 localhost 确认页，支持风格、字体、受众、页数等选择；启动失败时有聊天确认 fallback。
- 使用本地已有 SVG 示例或最小测试项目可执行 `svg_to_pptx.py --no-compat --only native` 并导出 `.pptx`。
- 文档说明“PPT Master 内置的是能力，不是打包用户样例或官方全仓库”。
- 自动同步只同步白名单路径；若受文件数/体积限制，应失败可读，不破坏已安装版本。

## 5. 实施阶段

### 阶段一：MVP

- Agnes AI Provider 预设。
- Agnes 文生图服务和提示词模板。
- PPT Master 瘦身内置 Skill。
- 插件市场卡片、详情页和帮助文档。
- 基础单元测试与本地 smoke test。

### 阶段二：体验增强

- PPT 生成向导：资料选择、页数、受众、风格、是否套模板。
- Python 依赖诊断。
- PPT 导出结果在 WorkWise 中展示、打开、定位文件。

### 阶段三：多模态扩展

- Agnes 图生图、多图合成和图片历史管理。
- Agnes 视频生成异步任务队列。
- PPT Master 模板库和图标库按需下载。

## 6. 风险与对策

- Agnes 免费额度和模型排名可能变化：文案必须保守，链接官方文档。
- Agnes 工具调用兼容性需真实 Key 验证：无 Key 时只做协议级测试。
- Agnes 生图耗时和返回格式可能变化：封装独立服务层，UI 显示失败原因并保留用户提示词。
- PPT Master 体积大：只内置核心，禁止全仓库和用户样例。
- Python 依赖不完整：提供诊断和安装提示，MVP 不默认安装 Pandoc。
- PPT 生成质量依赖模型能力：文档中说明推荐大上下文模型，WorkWise 只保证工作流可用。
