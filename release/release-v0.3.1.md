# WorkWise 0.3.1

0.3.1 候选版完成 Design 设计工作台、Write/PPT 联动与直接 PNG/SVG 交付，同时把 Write 的 Word 导出升级为模板驱动。这个版本尚未创建标签或正式 Release；发布沿用 WorkWise 0.2.5–0.3.0 的历史标准：macOS 安装包可以未签名、未公证，但必须完成源码、三平台打包、两小时稳定性和可执行候选验收，并在发布页明确安装提示。

## Design 设计工作台

- 新增与 Code、Write 平级的 Design 工作区，支持多页画板、矩形/椭圆/线/路径/文本/图片、PPT Master preset、结构化组合、图层、属性编辑、撤销与重做。
- Design 文档与图片资源保存在当前工作区的 `.workwise/design`，使用 canonical containment、串行队列、临时文件、fsync、原子替换和 revision 冲突保护。
- 图片按资产 ID 管理，导入时校验普通文件、扩展名、MIME、文件签名、解码结果和体积；不把任意本地绝对路径写入画板。
- group 具备真实父子结构和派生边界，支持移动、缩放、旋转、复制、删除、页面复制和撤销/重做；循环引用、重复归属和恶意引用会被拒绝。

## Agent 画板联动

- Design 助手复用唯一的 WorkWise Agent Runtime，不增加第二套模型通道、Provider 切换器或诊断系统。
- Runtime 通过 `design_apply_canvas_commands` 向当前画板发送经过验证的 add/update/remove/group/ungroup 命令。
- 命令绑定 canonical workspace、文档、页面、expected revision 和幂等键；renderer 通过同一 store 操作应用、记录单步历史并保存。
- 冲突、离线、无活动文档、保存失败和不支持的操作会显示明确状态，不再另写一个无关 SVG 文件冒充画板修改。

## Write、PPT 与成果交付

- 当前 Design 页面可直接导出 PNG、SVG，或保存到当前 Write 工作区并插入 Markdown 相对引用。
- PNG 最长边限制 8192 px、总像素限制 40 MP；SVG 会内嵌经过验证的图片数据，缺失资源时拒绝生成破损文件。
- PPTX 导入保留支持范围内的页面顺序、层级、图片、旋转、结构化 group 和多路径 preset；不支持的滤镜、mask 或复杂 transform 返回可见保真警告。
- PPTX 导出调用固定审计的 PPT Master 转换器，并验证 OOXML、页面关系和媒体引用；HTML 或图片不能冒充 PowerPoint 成果。
- 成果继续使用 WorkWise 的“打开、另存为、显示位置”操作；失败必须显示具体原因。

## PPT Master 4.0.0

- 内置受控快照升级到官方 `v4.0.0`、提交 `6636fb141077d73c43385fd8e88cb32309237300`。
- 保留核心工作流、100 个文本参考、55 个顶层 Python 脚本及模块、76 个图表模板、5 个品牌、2 个 Deck、`presentation_core` 布局和轻量示例。
- 不分发大体积图标库、AI 对比 PNG、用户项目、生成导出、备份和私有 PPTX；来源、提交和文件清单记录在 `.workwise-skill-source.json`。
- 修复内置包安装后因通用 8 MiB 扫描限制而在重启后消失的问题：只有来源和提交匹配审计清单的内置快照才使用专用只读上限。

## Word 导出模板系统

- 新增导出对话框：Write 工具栏点击"导出 Word 文档"后，先选择模板和调整样式，再导出。
- 新增 4 个内置模板，样式值对齐中文排版规范：
  - 学术论文（默认）：标题居中、1.5 倍行距、宋体小四、首行缩进。
  - 行政公文：方正小标宋简体二号标题、黑体三号一级标题、仿宋_GB2312 三号正文、首行缩进 2 字符、固定行距。
  - 商务报告：微软雅黑 + Calibri、1.5 倍行距。
  - 技术文档：等线 + Segoe UI、多倍行距 1.2。
- 6 类元素（H1/H2/H3/正文/表格/代码块）可分别配置 14 项样式：中西文字体分离、字号（含中文字号名）、颜色、粗斜体、段前段后、行距（单倍/1.5/双倍/最小/固定/多倍）、对齐、缩进（含首行缩进 N 字符）。
- 支持用户自定义模板：在导出对话框里调整样式后"另存为新模板"，可设为默认、可删除。内置模板不可删除。
- 页边距随模板配置，公文模板使用标准 A4 页边距。
- 用户模板持久化保存在 `workwise-settings.json`，重启后保留；内置模板随应用分发，不依赖网络。

## 字体与兼容性

- 公文模板使用的方正小标宋简体、仿宋_GB2312 为特殊字体，需用户自行安装；未安装时 Word 会用系统字体兜底显示，不影响导出。
- 中西文字体分离是中文排版关键：西文字符用 ascii/hAnsi 字体，中文字符用 eastAsia 字体，docx 中标记 hint: eastAsia 确保正确渲染。
- 不传模板导出时，输出与 0.3.0 视觉一致（向后兼容）。
- 修复并发导出时模板样式可能串到另一份文档的问题；每次导出使用独立异步上下文。
- 修复表格模板的字体、粗斜体、对齐、缩进和行距没有完整应用的问题。

## 范围说明

- 本次模板系统覆盖 Markdown → DOCX 主路径。
- PDF 和 HTML 导出仍使用原有样式，模板化留作后续版本。
- 非 Markdown 文件的 DOCX 导出（html-to-docx 路径）暂不支持模板。

## 验证

- WorkWise 与 Runtime TypeScript 检查、ESLint、生产构建、品牌边界、文档依赖许可证和 OpenSpec strict 均通过。
- WorkWise 全量 Vitest：204 个测试文件通过、1 个跳过；1,457 项测试通过、1 项跳过；Runtime 65 个测试文件、580 项测试全部通过。
- Design 专项覆盖文档/资源安全、结构化 group、Agent 命令、SVG/PPTX 导入导出、PNG/SVG、Write 回滚、preset 和打包路径。
- PPT Master prompt/path/provenance 审计通过：161 个语料文件、0 个错误。
- macOS Apple Silicon 候选包构建、ASAR、Electron 原生依赖、MarkItDown 和 PPT Master sidecar 往返检查通过；真实候选应用已完成 Design 助手、撤销/重做、退出清理和重启恢复回归。
- 真实回归发现并修复旧测试 Runtime 占用端口后被新 UI 误连接的问题；客户端和 Runtime 现在通过固定协议版本握手，不再把缺少协议字段的旧服务静默视为兼容。
- 生产依赖安全审计在高危阈值下通过；已应用兼容的 `body-parser` 与 `fast-uri` 修复。仍有 2 项来自 MCP SDK 间接依赖的中危 Windows `serve-static` 报告，但 WorkWise 未使用该静态文件中间件，避免为消除不可达路径报告而强制降级 MCP SDK。
- 历史三平台候选运行 `30015706434` 已在目标提交 `37089736ac889c8414cc6b9a03da23fc5fa0013a` 上通过安装包、更新元数据、MarkItDown、ASAR 和原生依赖校验。两个 macOS 包与 0.2.5–0.3.0 一样未签名、未公证；正式发布页必须提示首次启动前执行 `xattr -dr com.apple.quarantine /Applications/WorkWise.app`。该候选已落后于后续修复，所以不能直接发布，必须基于最终提交重跑完整候选门禁。
- 最终产品代码提交 `93f97cf30dfd6b066b7a853bac5815b9b51cf3f2` 的两小时稳定性门禁已通过；后续提交 `6929d4e783f9d2fed1c79eaea02afd99923114b8` 只补充 CI 校验依赖，不改变客户端源码。
- 最终三平台候选运行 `30057460266` 全部通过；候选 artifact 只含三个客户端和内部校验清单，公开 `v0.3.1` Release 尚未创建。
- 最终客户端 SHA-256：
  - macOS Apple Silicon：`85ca0012994a3d2f744c28a16a39dbb73710bd60d1b3cbc0012520c1d5d75e2c`
  - macOS Intel：`b80ca896c683740378d5a89b7647ea64c65d063073ec195d9f943ada6242d458`
  - Windows x64：`ed9072113ac5f7dfd836f68cf01a27f9f3f28fefd7b92b72d0bd0e3c1ec5fe26`
- 独立下载复核确认两个 DMG、Windows NSIS、ASAR、MarkItDown、PPT Master 4.0.0、原生 SQLite、版本和内部更新元数据均正确；0.3.1 已达到可发布候选标准，但正式发布仍需用户再次确认。
