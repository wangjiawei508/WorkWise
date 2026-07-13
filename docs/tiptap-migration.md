# Tiptap 富文本编辑器迁移记录

状态：Phase 0–5 已完成。写作工作区、SDD 需求草稿、计划面板默认使用 Tiptap 富文本
模式（`rich`），CodeMirror 保留为源码模式与保真门禁/大文件兜底。本文档记录技术
验证结论与架构决策。

## Phase 0 结论：GO（带强制保真门禁）

验证环境：`@tiptap/*` 3.26.0（MIT），`@tiptap/markdown` 官方双向转换包（基于 marked，GFM 开启）。

### 往返保真审计（`scripts/tiptap-roundtrip-audit.mjs`）

对仓库 33 个真实 md 文件做 `parse → serialize → parse → serialize` 审计：

| 指标 | 结果 |
| --- | --- |
| 稳定（一轮后幂等） | 22/33 |
| 字节级一致 | 10/33 |
| 纯文本无损 | 22/33 |

已确认的上游问题（3.26.0）：

1. **有序列表内硬换行续行会吃字符**（文本丢失，最严重）。`2. ... a\n   new port` 序列化为 1 空格缩进续行，再解析时丢失字符。WYSIWYG 编辑不会产生这种文档形态，仅影响打开外部手写文件。
2. **原生 HTML 块降级为转义字面文本**，且字面文本中的 URL 会在下一轮解析时被 GFM 自动链接，导致不收敛。禁用 marked 的 `url` tokenizer 无效（falsy 回落默认行为）。
3. **行内代码相邻文本的下划线被错误转义**（`tool_call` → `tool\_call`）。
4. 表格列宽重排、列表缩进归一化等纯格式噪音（CJK 表格本身稳定收敛）。

简单/LLM 风格 markdown（标题、段落、列表、任务列表、代码块、GFM 表格、图片、链接、粗斜体、引用、CJK）**完美稳定往返**。

### Headless spike

- `getSchema([StarterKit, ...])` 无 DOM 构建 schema ✅
- ghost text 插件状态机（PluginKey meta 设置建议 → docChanged 清除 → mapping 映射位置）在纯 node 环境可测 ✅
- `MarkdownManager.parse/serialize` 不依赖 Editor 实例与 DOM ✅

### 架构决策

1. **双引擎**：Tiptap 为 `rich` 模式；CodeMirror 永久保留为 `source` 模式与兜底。
2. **逐文件保真门禁**：打开文件时跑 `serialize(parse(md))` 幂等性 + 纯文本无损检查。不通过的文件 rich 模式拒绝编辑（横幅提示 + 引导切 source 模式）。
3. **只有用户真实编辑过的文档才允许序列化落盘**；纯浏览绝不回写。
4. **行内 AI 全部自研**（ProseMirror decoration/plugin），不使用 Tiptap 付费 AI 产品；主进程 LLM 服务与 IPC 契约不变。
5. `@tiptap/*` 版本锁定，升级须重跑审计脚本。

## 模块布局（实际落地）

```
src/renderer/src/write/tiptap/
  markdown-manager.ts      解析/序列化单例 + auditWriteMarkdownFidelity 保真门禁
  markdown-projection.ts   markdown 投影（块级语法前缀 + 纯文本）+ 偏移↔PM 位置互转
  markdown-sync.ts         外部快照的块级 diff 局部同步（保光标/撤销栈/防回写循环）
  markdown-insert.ts       markdown 字符串 → PM 节点的区间替换工具
  recent-edits-pm.ts       PM 事务 → recent-edit 记录（投影坐标）
  local-image.ts           本地图片 NodeView（相对路径 → file://，原始 src 保留）
  paste-image.ts           剪贴板图片粘贴（复用 saveWorkspaceClipboardImage IPC）
  WriteRichEditor.tsx      与 WriteMarkdownEditor 同构 props 的编辑器组件
  extensions/
    inline-completion.ts   ghost text 补全（移植 CM 编排：防抖/冷却/Tab/Esc/edit 预览）
    term-propagation.ts    术语联动（appendTransaction）
    template-shortcuts.ts  @date 等模板 Tab 展开
```

## 关键机制

- **坐标系**：行内 AI、选区引用、行内编辑共用「markdown 投影」坐标。投影通过
  CodeMirror `EditorState` 喂给现有的 `buildInlineCompletionRequestContext`，
  策略/评分/payload 模块零重复复用；服务端 IPC 契约未变。
- **保真门禁**：每个从外部进入编辑器的文档（打开/盘上同步）都跑幂等性 + 纯文本
  无损审计；不通过则渲染 `fallback`（CodeMirror live 编辑器）并显示横幅。
  自身序列化输出不再复审。
- **外部回流**：agent 改盘上文件后，按顶层块 diff 做最小替换事务（meta 标记
  `writeRichExternalSyncMeta`），不进 undo 历史、不触发 onChange 回写。
- **接入点**：写作工作区（模式菜单新增「富文本」，render-safety 大文件自动回落
  源码模式）、SDD 草稿、计划面板。`readStoredPreviewMode` 默认 `'rich'`，
  用户显式选择的模式仍然尊重 localStorage。
- **行内编辑**：rich 模式下 `submitInlineEdit` 用投影文本构建请求，经
  `WriteRichEditorHandle.applyProjectedReplacement` 应用（带原文校验与
  markdown 解析插入）。

## 已知限制 / 后续

- 投影不含行内标记（`**`、`` ` ``、链接语法），补全上下文中当前行少量标记缺失；
  选区引用行号为投影行号，与文件行号在复杂文档上可能略有偏差。
- 代码块暂为纯样式 `<pre>`（无 shiki 高亮 NodeView）。
- 中文 IME 与 ghost text 的交互需在真机专项手测。
- `@tiptap/*` 固定 3.26.0；升级前必须重跑 `scripts/tiptap-roundtrip-audit.mjs`。
