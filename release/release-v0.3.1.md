# WorkWise 0.3.1

0.3.1 候选版完成 Design 设计工作台、Write/PPT 联动与直接 PNG/SVG 交付，同时把 Write 的 Word 导出升级为模板驱动。这个版本尚未创建标签或正式 Release；只有完成真实签名安装包验收后才进入发布流程。

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
- 全量 Vitest：202 个测试文件通过、1 个跳过；1,431 项测试通过、1 项跳过，没有失败项。
- Design 专项覆盖文档/资源安全、结构化 group、Agent 命令、SVG/PPTX 导入导出、PNG/SVG、Write 回滚、preset 和打包路径。
- PPT Master prompt/path/provenance 审计通过：161 个语料文件、0 个错误。
- macOS Apple Silicon 候选包构建和 ASAR 完整性检查通过。当前测试机升级到 macOS 26.5.2 后，会以系统策略拒绝新生成的本地临时签名应用及 Codex Computer Use Node；该环境阻断已记录，不能替代后续 Developer ID 正式签名安装包的真实界面验收。
