---
name: web-article-extractor
description: 使用 Chrome DevTools MCP 提取网页正文、保存 Markdown、下载文章图片或分析页面结构时调用。适用于博客、新闻站、微信公众号等文章页面；当用户要求“提取文章”“抓网页正文”“保存为 markdown”“连图片一起保存”时使用。
---

# Web Article Extractor

目标很简单：**先拿到干净正文，再按用户需要决定输出成纯文本、结构化 JSON，还是 Markdown + 图片。**

## 前置条件

确保已配置 `chrome-devtools` MCP 服务器：

```bash
claude mcp add chrome-devtools npx -y chrome-devtools-mcp@latest -- \
  --disable-blink-features=AutomationControlled \
  --disable-web-security \
  --disable-features=IsolateOrigins,site-per-process
```

## 基本原则

- 默认优先 `Readability.js`，不要一上来就手写大段选择器。
- 用户要的是“保存为 Markdown”时，不要只返回正文字符串，直接走 Markdown 导出链路。
- 遇到公众号、知乎这类安全限制页面，再读平台专用说明，不要把平台细节堆在主流程里。
- 多链接批量提取时，串行处理，避免风控。

## 选择哪条提取路径

### 1. 普通网页正文提取

默认走：

- 脚本：`scripts/readability_extractor.js`
- 需要细调参数时再读：
  - [references/readability-guide.md](references/readability-guide.md)
  - [references/config-options.md](references/config-options.md)

适用场景：

- 提取博客、新闻、专栏正文
- 返回标题、作者、正文、图片、阅读时长等结构化信息

### 2. 导出为 Markdown，并尽量保留图片

直接走：

- 转换脚本：`scripts/markdown_converter.js`
- 图片落盘脚本：`scripts/save_with_images.js`
- 使用说明：
  - [references/markdown_usage.md](references/markdown_usage.md)

适用场景：

- 用户明确说“保存成 markdown”
- 需要把图片下载到本地并重写 Markdown 图片路径

### 3. Readability 不稳定，改走轻量提取或手工选择器

**何时切换到回退路径**：
- Readability 返回的 `content` 字段为空或字数 < 100
- 提取的正文明显不完整（如只有开头几段，但页面实际有完整文章）
- 页面结构特殊（如单页应用、动态加载内容未被捕获）

回退路径：

- 轻量提取脚本：`scripts/extract_article.js`
- 选择器参考：
  - [references/selector_patterns.md](references/selector_patterns.md)
  - [references/platform-specific.md](references/platform-specific.md)

适用场景：

- 页面 DOM 很怪，Readability 抽不准
- 需要按平台特征补自定义选择器

## 标准流程

### 1. 打开页面并等待正文稳定

- 导航到目标 URL
- 等页面加载完成
- 如果正文节点迟迟不出现，额外等 2-3 秒再提取

### 2. 先判断输出形态

- 用户只要”看内容”：
  - 提取正文并直接返回摘要/结构化内容
- 用户要”保存为 Markdown”：
  - 直接走 `markdown_converter.js` + `save_with_images.js`
  - 调用示例：
    ```javascript
    // 先转换为 Markdown 结构
    const mdData = await markdownConverter(extractedContent);
    // 下载图片并更新路径
    await saveWithImages(mdData, { outputDir: 'docs/', downloadImages: true });
    ```
- 用户要”分析页面结构”：
  - 先读 [references/selector_patterns.md](references/selector_patterns.md)

### 3. 完成后输出确认

提取完成后，必须向用户明确报告：
- 提取的文章标题
- 字数统计
- 保存路径（如果有落盘）
- 是否成功下载图片（如果有）

### 4. 微信公众号特殊处理

只有在目标页面确实是公众号链接时，才启用特殊处理：

- 优先读 [references/platform-specific.md](references/platform-specific.md)
- 必要时模拟微信 `User-Agent`
- 必要时追加等待逻辑，确保 `#js_content` 真正加载完成

不要把公众号逻辑默认套在所有网页上。

## 输出要求

### 纯提取结果

至少包含：

- `title`
- `author`
- `content`
- `url`
- `wordCount`

### Markdown 输出

至少包含：

- 正文 `.md`
- 图片资源目录或本地图片文件
- 图片路径已回写到 Markdown

## 参考资料导航

- Readability 原理与限制：
  - [references/readability-guide.md](references/readability-guide.md)
- Readability 可调参数：
  - [references/config-options.md](references/config-options.md)
- 平台专用说明：
  - [references/platform-specific.md](references/platform-specific.md)
- Markdown 保存链路：
  - [references/markdown_usage.md](references/markdown_usage.md)
- 常见选择器模式：
  - [references/selector_patterns.md](references/selector_patterns.md)
- 实际调用示例：
  - [references/usage_examples.md](references/usage_examples.md)
- 提取成功率与排错：
  - [references/best-practices.md](references/best-practices.md)

## 脚本清单

- `scripts/readability_extractor.js`
  - 主提取脚本，默认入口
- `scripts/readability_loader.js`
  - 负责在运行时加载提取逻辑
- `scripts/extract_article.js`
  - 轻量回退提取器
- `scripts/markdown_converter.js`
  - 转成 Markdown 数据结构
- `scripts/save_with_images.js`
  - 下载图片并落盘
- `scripts/Readability.js`
  - Readability 运行库，不直接改调用方式

## 常见问题

- 需要登录的内容：
  - 使用已登录浏览器实例，不要假设匿名可读
- 公众号提示“请在微信中打开”：
  - 先读 [references/platform-specific.md](references/platform-specific.md)，不要直接硬改全局流程
- 提取失败或内容不完整：
  - 先读 [references/best-practices.md](references/best-practices.md)，再决定是否切换到 `extract_article.js`
