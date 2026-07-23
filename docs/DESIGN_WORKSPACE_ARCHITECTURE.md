# WorkWise Design 工作区架构

本文记录 WorkWise 0.3.1 开发分支上的真实 Design 实现。它用于代码审查和后续维护，不把“代码已写”冒充“安装包已验收”。

## 1. 产品边界

Design 是与 Code、Write 平级的一级工作区，使用 SVG 作为可编辑画布模型。

- Design、Write 和 PPT 共用 WorkWise Agent Runtime，不增加第二套 Agent 提供商、模型切换器或诊断系统。
- Design 画板负责结构化编辑；PPT Master 负责 PowerPoint 语义、模板、导入导出和质量检查。
- 请求 PowerPoint 时必须交付经过验证的 `.pptx`，HTML 或图片预览不能替代 PPTX。
- PNG、SVG 和 Write 插图是直接导出能力，不依赖 PPTX 转换成功。

## 2. 文档与资源模型

共享模型位于 `src/shared/design-document.ts`。

```ts
type DesignDocumentV1 = {
  schemaVersion: 'v1'
  id: string
  revision: number
  name: string
  format: DesignCanvasFormat
  pages: DesignPage[]
  assets: DesignAsset[]
  designTokens?: {
    colors?: string[]
    fonts?: string[]
    spacing?: number[]
  }
  createdAt: number
  updatedAt: number
}
```

每个页面包含有序元素。支持矩形、椭圆、线、路径、文本、图片、PowerPoint preset 和结构化 group。

关键约束：

- `revision` 单调递增，用于阻止旧窗口或旧 Agent 命令覆盖新画板。
- 图片元素只保存 `imageAssetId`，不保存任意本地绝对路径。
- group 通过 `childIds` 建立结构，必须无环、无重复归属；边界由后代元素计算。
- 复制页面时会重写元素、group 和后代引用的 ID。
- 颜色在数据层使用规范化十六进制，渲染和 SVG 序列化时补 `#`。

## 3. 持久化

主进程服务位于 `src/main/services/design-document-service.ts`。每个工作区写入：

```text
<workspace>/.workwise/design/
├── index.json
├── <document-id>.workwise-design.json
└── assets/
    └── <document-id>/
        └── <asset-id>.<ext>
```

持久化保证：

- 工作区根、文档路径和资源路径经过 canonical containment 检查。
- 拒绝路径逃逸、符号链接替换和非法 ID/文件名。
- 文档与索引使用同目录临时文件、fsync 和原子替换。
- 写入前再次检查父目录，降低 TOCTOU 风险。
- 同一工作区的写入通过串行队列执行。
- `expectedRevision` 不匹配时返回 `stale_request`，不覆盖磁盘数据。
- 启动读取可恢复原子写入遗留文件；损坏文件返回明确状态，不创建空文档覆盖。

Renderer 在工作区切换时加载活动文档，编辑后自动保存；导出、切换和联动 Write 前会先 `flush`。

## 4. 图片和 group

图片导入支持 PNG、JPEG、WebP 和 GIF：

- 单文件上限 12 MiB。
- 必须是普通文件，拒绝符号链接。
- 主进程验证扩展名、MIME、文件签名和 Electron 解码结果。
- 存入当前工作区的 Design 资源目录，再通过受限 API 读取为 data URL。

group 是真实结构，不只是 UI 选区：

- 移动、缩放、旋转 group 会变换后代元素。
- 删除 group 会按操作语义处理后代；复制会重写引用。
- 撤销/重做把一次 group 或 Agent 操作记录为一个历史步骤。
- SVG、PNG、PPTX 和持久化使用同一结构化文档。

## 5. Agent Design Rail

Runtime 工具位于 `kun/src/adapters/tool/design-tool-provider.ts`，正式工具为 `design_apply_canvas_commands`。

命令只针对用户当前打开的：

- canonical workspace；
- document ID；
- page ID；
- expected revision。

支持的操作为 add、update、remove、group 和 ungroup。工具参数经过共享 schema 验证，并带幂等键。Runtime 不直接另写一份 SVG 文件冒充画板变更。

执行流程：

1. Agent 返回经过验证的 `DesignCanvasCommandV1`。
2. runtime mapper 将命令作为结构化结果交给 renderer。
3. renderer 校验当前工作区、文档、页面、revision 和幂等键。
4. store 原子应用整批操作，写入一个 undo 历史步骤。
5. `flushSave()` 成功后记录 acknowledgement；冲突或保存失败会显示明确状态。

Design 助手复用 WorkWise 的会话、模型、审批、任务状态和诊断。界面只显示简洁进度和结果，不显示私有思维链。

## 6. PPT Master 4.0.0

内置快照固定为：

- 上游：`hugohe3/ppt-master`
- Release：`v4.0.0`
- Commit：`6636fb141077d73c43385fd8e88cb32309237300`

受控快照保留核心工作流、100 个文本参考、55 个顶层 Python 脚本及模块、76 个图表模板、5 个品牌、2 个 Deck、`presentation_core` 布局和 187 个 preset shape 定义。

为控制安装包体积，不分发大体积图标 SVG 库、AI 对比 PNG、用户项目、生成导出物、备份和私有 PPTX。缺失的图标库不会导致整个 PPT 任务失败；工作流使用原生形状、项目内图标或已授权来源。

来源与差异记录在：

```text
src/asset/skills/ppt-master/.workwise-skill-source.json
```

`scripts/prompt_audit_manifest.json` 是 WorkWise 瘦身包适配层；它不参与 runtime prompt，只用于验证路径、引用、注册表和 Token 预算。审计不得出现缺失路径或错误。

## 7. PPTX 导入

主进程通过官方 `pptx_to_svg.py` 转换源文件，再由 `src/shared/design-svg-parser.ts` 解析为 Design 文档。

已支持的保真范围：

- 页面顺序和元素 z-order；
- 基础形状、文本、路径和多路径 preset；
- 图片资源提取、签名校验、工作区存储和 ID 重映射；
- 支持的 transform/rotation；
- 可识别 group 的结构和边界。

导入安全限制：

- 最多 64 个图片资源；
- 单图片最多 12 MiB，合计最多 48 MiB；
- 拒绝绝对路径、NUL、路径逃逸、符号链接和错误文件签名。

不支持或可能降级的滤镜、mask、复杂嵌套 transform 等必须返回 `DesignFidelityWarning`，不能静默声称无损。

## 8. 导出

### SVG

`documentToSvgStrings` 直接从当前文档序列化。图片必须能从工作区资源解析为安全 data URL；可见图片缺失或签名不合法时导出失败，不生成破损文件。

### PNG

Renderer 使用当前 SVG 和真实资源渲染 PNG。导出限制为最长边 8192 px、总像素 40 MP，避免主进程或 renderer 内存失控。

### PPTX

导出前要求：

- 至少一页；
- 所有页面尺寸一致；
- 每边在 PowerPoint 支持范围；
- 可见图片资源完整。

服务把每页写入临时 `svg_output`，调用固定快照中的 PPT Master 转换器，并验证结果是可解包且结构完整的 PPTX。失败时返回错误，不用 HTML 兜底冒充。

### Write 联动

Design 页面可以作为 PNG 或 SVG 保存到当前 Write 工作区并插入 Markdown。步骤为：

1. flush 当前 Design 文档；
2. 生成目标格式；
3. 原子写入 Write 资源目录；
4. 更新 Markdown；
5. 任一步失败时不报告成功，并保留可恢复的原文档。

## 9. API

公开接口通过 `window.workwise` 暴露：

- `loadDesignDocument`
- `saveDesignDocument`
- `importDesignImageAsset`
- `readDesignAsset`
- `importDesignFromPptx`
- `exportDesignToPptx`
- `saveDesignAssetToWrite`
- `listDesignPresetShapes`
- `renderDesignPresetShape`

所有 payload 由 IPC schema 校验。renderer 业务代码不直接访问内部 Runtime 路径或任意主机文件。

## 10. 验收状态

代码完成不等于发布完成。以下各项全部通过后，才可以在发布说明中称为可用：

- 文档结构、持久化、图片、group、Agent 命令、导入导出和 Write 联动单元/集成测试；
- PPT Master prompt/path/provenance 审计；
- TypeScript、ESLint、Vitest、生产构建、品牌边界和 OpenSpec strict；
- 打包后真实 WorkWise 应用中完成新建、编辑、重启恢复、Agent 改图、导入 PPTX、导出 PPTX/PNG/SVG、插入 Write 和成果卡操作；
- 发布包只包含允许的产品文件和受控 Skill 资源。

若真实安装包测试受环境阻断，必须记录具体阻断和可复现替代测试，不能把它写成“已完成”。
