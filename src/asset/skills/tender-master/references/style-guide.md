# 标书 docx 排版规范（Style Guide）

中文技术标书的排版有相对固定的惯例，按这套规范走稳妥。所有数值都已经转换成 docx-js 的单位（半磅、DXA、缇）。

## 字体与字号

中文标书用"中文宋体 + 西文 Times New Roman"或"中文宋体 + 英文 Calibri"是惯例，标题用黑体加粗。docx-js 里 `size` 是半磅，例如 24 = 12pt。

| 元素 | 中文字体 | 字号（pt） | docx-js size | 加粗 |
|------|---------|-----------|--------------|------|
| 封面主标题 | 黑体 | 小初 36 | 72 | 是 |
| 封面副标题 | 黑体 | 二号 22 | 44 | 是 |
| 一级标题（Heading 1） | 黑体 | 三号 16 | 32 | 是 |
| 二级标题（Heading 2） | 黑体 | 小三 15 | 30 | 是 |
| 三级标题（Heading 3） | 黑体 | 四号 14 | 28 | 是 |
| 四级标题（Heading 4） | 黑体 | 小四 12 | 24 | 是 |
| 正文 | 宋体 | 小四 12 | 24 | 否 |
| 表格表头 | 黑体 | 五号 10.5 | 21 | 是 |
| 表格内容 | 宋体 | 五号 10.5 | 21 | 否 |
| 图表标题 | 黑体 | 五号 10.5 | 21 | 是 |
| 页眉页脚 | 宋体 | 小五 9 | 18 | 否 |

docx-js 里中文字体要用 `font: { name: "宋体", eastAsia: "宋体" }`，否则中文不会按指定字体渲染。

## 行距、段距

- 正文：1.5 倍行距，段前 0、段后 0；docx-js: `spacing: { line: 360, lineRule: "auto" }`（240 是单倍，360 是 1.5 倍）
- 一级标题：段前 240（12pt），段后 240
- 二三级标题：段前 180（9pt），段后 120（6pt）
- 段落首行缩进 2 个中文字符：`indent: { firstLine: 480 }`（480 DXA ≈ 2 个小四中文字宽）

## 页面与页边距

A4 标准，docx-js DXA：

```javascript
page: {
  size: { width: 11906, height: 16838 },  // A4
  margin: { top: 1440, right: 1800, bottom: 1440, left: 1800 }
  // 上下 2.54cm（1440），左右 3.18cm（1800）
}
```

## 章节编号

中文标书的传统是**手工编号**写进标题文字里（"1. 项目概述"、"1.1 项目背景"），不依赖 Word 自动编号——因为评委复制粘贴或抽取页码时自动编号容易丢失。

写法：

- 一级：`1. 标题` `2. 标题`
- 二级：`1.1 标题` `1.2 标题`
- 三级：`1.1.1 标题`
- 四级：`1.1.1.1 标题` 或用 `(1)`、`①` 替代

## 页眉页脚

- **页眉**：居中或居左写"{项目名称} 投标文件 - 技术标"
- **页脚**：居中页码"第 X 页 共 Y 页"
- **封面、投标函首页通常不显示页码**：用分节符把封面单独成节，节属性里关闭页码

## 表格样式

- 边框：全部黑色 0.5pt 实线
- 表头：浅灰底色（`shading: { fill: "D9D9D9" }`），黑体加粗
- 单元格内边距：上下 80 DXA，左右 100 DXA
- 数字右对齐，文字左对齐，表头居中
- 长表格在第一行设为"标题行重复"，跨页时表头自动重复

## 颜色

**全文以黑白为主**，仅在以下场景用彩色：

- 封面：可以用公司主色（用占位符 `{公司主色}` 让用户自己定）
- 关键提示框：浅色底（如浅蓝 `BDD7EE`）+ 黑字，用于"★ 完全响应"等强调
- 架构图：可适度配色，但保持专业克制

避免使用大红大紫、霓虹色、渐变。评委见过太多花哨标书，朴素反而显得稳重。

## 图

图通过外部文件嵌入：

- 架构图、流程图：先生成 PNG / SVG，再插入。建议用 mermaid + 浏览器截图，或用户自备 Visio/draw.io 图
- 图下方加图题：`图 X-Y XX 示意图`，居中、五号黑体
- 图表索引：长标书末尾可以加"图目录""表目录"

## 目录（TOC）

docx-js 支持自动 TOC：

```javascript
new TableOfContents("目录", {
  hyperlink: true,
  headingStyleRange: "1-4",  // 包含 1-4 级标题
})
```

注意：插入后要在 Word 里 F9 刷新一次目录才会显示页码。在交付提示里告知用户："打开后在目录上右键→更新域→更新整个目录。"

## 封面建议布局

```
（顶部留 1/4 页空白）

           {项目名称}
           投标文件
            技术标

  ─────────────────────

  招标编号：{招标编号}
  招标人：  {招标人}
  投标人：  {公司名称}（盖章）

  ─────────────────────

           {投标日期}
```

文字居中，主标题 36pt 黑体加粗，其余信息 14pt 宋体。

## 投标函样板

封面后第一节固定是"投标函"，文字相对模板化：

```
投标函

致：{招标人}

我方仔细研究了{项目名称}（招标编号 {招标编号}）的招标文件，
愿意按招标文件的要求承担本项目，并提交本投标文件。

我方承诺：
1. 投标有效期为 {投标有效期} 个日历日；
2. 投标报价详见商务文件；
3. 中标后按招标文件签订合同并履约。

投标人：{公司名称}（盖章）
法定代表人：{法定代表人}（签字或盖章）
日期：{投标日期}
```

## 用 docx-js 一次性生成的最小骨架

委托给 docx skill 时，把这些样式预设打包进 styles 配置，不用每段都设：

```javascript
const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: { name: "宋体", eastAsia: "宋体" }, size: 24 },
        paragraph: { spacing: { line: 360, lineRule: "auto" } }
      }
    },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: { name: "黑体", eastAsia: "黑体" }, size: 32, bold: true },
        paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: { name: "黑体", eastAsia: "黑体" }, size: 30, bold: true },
        paragraph: { spacing: { before: 180, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: { name: "黑体", eastAsia: "黑体" }, size: 28, bold: true },
        paragraph: { spacing: { before: 180, after: 120 }, outlineLevel: 2 } }
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1440, right: 1800, bottom: 1440, left: 1800 }
      }
    },
    children: [/* ... */]
  }]
});
```

## 校验

生成完用 docx skill 自带的：

```bash
python scripts/office/validate.py 输出.docx
```

确保文件能正常打开。中文标书因字体引用问题偶尔会有 XML 警告，按 docx skill 的修复流程处理。
