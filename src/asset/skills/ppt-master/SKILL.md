---
name: ppt-master
description: 生成和导出 PPT 的专业工作流 Skill。适用于把 Markdown、报告、方案、会议材料或已有文档整理为演示文稿，按策略规划、设计规范、SVG 页面生成和 PPTX 导出步骤执行。
---

# PPT Master for WorkWise

这是 WorkWise 内置的 PPT Master 3.1.0+ 瘦身版，以官方 v3.1.0 为基线并包含其后的已审计更新，用于把资料、提纲、报告或 Markdown 内容转成结构化演示文稿。它保留核心工作流、脚本、参考规范、通用图表模板、常用布局、localhost 确认页和两个轻量顶级咨询风 examples；不内置全量官方示例、用户 projects、导出结果、备份目录、大体积 icon 库或私有 PPT 文件。

## 适用场景

- 用户要求“做 PPT”“生成演示文稿”“把这份方案转成 PPT”“把 Markdown 做成汇报材料”。
- 需要把工程方案、项目汇报、经营分析、产品介绍、培训材料整理成 16:9 或其他比例的演示文稿。
- 需要先确定受众、页数、风格、配色、图表表达，再生成可导出的 PPTX。

## WorkWise 约束

- 用户要求 PPT、PowerPoint、演示文稿或幻灯片时，最终成果必须是 `.pptx` 文件。HTML、SVG、图片、Markdown 大纲和预览页只能作为中间产物，不能冒充 PPT 交付。
- SVG 页面完成后，使用 WorkWise 提供的 `ppt_master_export` 工具导出真正的 PPTX。该工具只接受当前工作区内的 PPT Master 项目目录，不需要也不得通过通用 Shell 执行导出脚本。
- 如果 `ppt_master_export` 不可用或导出失败，应明确报告具体阻断原因并保留项目文件，不能静默改交 HTML；只有用户明确要求网页演示时才可交付 HTML。
- 不使用 Pandoc。文档转换优先使用 Python 原生路径；不支持的旧格式应请用户转为 Markdown、DOCX、PDF、HTML、XLSX 或 PPTX 后再处理。
- 不读取或打包用户本地 `projects/`、全量官方 `examples/`、`exports/`、`backup/` 等目录；内置 `examples/` 只作为少量风格参考，内置 `projects/` 只是空占位目录。
- 不默认使用大体积 `templates/icons/` 图标库。需要图标时优先使用当前项目已有素材、简洁 SVG 形状或用户明确提供的图标资源。
- 如果用户提供公司私有材料，只在当前工作区生成项目文件，不写入内置 Skill 目录。
- 生成图片素材时，优先使用 WorkWise 的 Agnes AI 生图能力或用户指定素材；不得臆造真实现场照片。

## 核心流程

1. 明确输入：确认主题、受众、页数范围、语言、比例和交付格式。
2. 整理资料：将用户提供的 Markdown、报告正文、PDF/DOCX 转换或摘要为可用于分页的内容。
3. 创建项目：用 `scripts/project_manager.py` 初始化项目目录，项目应放在用户当前工作区。
4. 本地确认页：先写入 `<project>/confirm_ui/recommendations.json`，默认启动 `scripts/confirm_ui/server.py <project> --daemon --wait`，让用户在 localhost 页面选择风格、字体、受众、页数、配色、图片策略等；浏览器不可用时再回落到聊天确认。
5. 策略规划：读取 `references/strategist.md` 和 `templates/design_spec_reference.md`，结合 `confirm_ui/result.json` 输出设计规范、内容大纲和执行锁定文件。
6. 页面生成：启动 `scripts/svg_editor/server.py` 作为 localhost 实时预览，然后按页生成 SVG 页面；每页遵守 `spec_lock.md`，需要图表时参考 `templates/charts/charts_index.json`。
7. 质量检查：运行 SVG 检查、修复尺寸和资源引用，必要时逐页修正。
8. 导出 PPTX：调用 `ppt_master_export`，传入工作区内的项目目录和 `.pptx` 输出路径；导出成功后验证成果文件存在，再向用户交付。

## 常用脚本

| 脚本 | 用途 |
| --- | --- |
| `scripts/project_manager.py` | 初始化、校验和管理 PPT 项目 |
| `scripts/confirm_ui/server.py` | Step 4 本地确认页，用于选择风格、字体、受众、页数、配色、图片策略等 |
| `scripts/svg_editor/server.py` | Step 6 本地 SVG 实时预览页 |
| `scripts/svg_to_pptx.py` | 将 SVG 页面导出为 PPTX |

WorkWise 中不要直接执行上表脚本；这些脚本由受控工具封装。PPT 导出统一调用：

```json
{
  "project_path": "presentation-project",
  "output_path": "AI-Agent-编程入门指南.pptx",
  "source": "output",
  "format": "ppt169"
}
```
| `scripts/finalize_svg.py` | SVG 后处理 |
| `scripts/svg_quality_checker.py` | SVG 质量检查 |
| `scripts/update_spec.py` | 批量更新设计规范相关字段 |
| `scripts/total_md_split.py` | 拆分讲稿或长 Markdown |
| `scripts/source_to_md/pdf_to_md.py` | PDF 转 Markdown |
| `scripts/source_to_md/doc_to_md.py` | DOCX/HTML/EPUB/IPYNB 等原生路径转 Markdown |
| `scripts/source_to_md/excel_to_md.py` | XLSX/XLSM 转 Markdown |
| `scripts/source_to_md/ppt_to_md.py` | PPTX 转 Markdown |
| `scripts/source_to_md/web_to_md.py` | 网页转 Markdown |

## 执行要点

- 在动手生成前，默认使用 `confirm_ui` 本地页面完成 8 项确认；如果启动失败或用户明确不需要页面，再用聊天方式确认同一组字段。
- `confirm_ui` 默认端口为 `5050`，被占用时会自动尝试 `5051` 等后续空端口；实际 URL 以脚本输出为准。
- 用户在页面点击 Confirm 后，读取 `<project>/confirm_ui/result.json`，不需要再要求用户在聊天里二次确认。
- 如果用户已在聊天中明确确认这些要素，可以直接进入项目创建和生成，但仍应记录关键选择到 `design_spec.md` 与 `spec_lock.md`。
- 长文档或大页数时，建议分阶段：先完成策略和 `design_spec.md`，再继续生成 SVG 和 PPTX。
- 每页 SVG 生成前都要重新读取 `spec_lock.md`，避免长任务中风格漂移。
- 图表页优先复用 `templates/charts/` 的通用结构，并根据实际数据改写，不要为了好看牺牲数据含义。

## 内置参考

- `examples/` 保留两个轻量顶级咨询风示例，仅含 `design_spec.md` 和 `svg_final/`，用于参考风格、页面节奏和信息密度。
- `projects/` 是默认输出位置的占位目录。正式运行时应在用户当前工作区创建项目，不要把用户材料写回内置 Skill 目录。
- `templates/layouts/` 保留少量官方通用布局；`templates/icons/` 全量图标库仍不内置。

## 依赖

运行脚本前可按需安装：

```bash
pip install -r ${SKILL_DIR}/requirements.txt
```

如果只是把现成 SVG 导出为 PPTX，通常只需要 `python-pptx`。本地确认页和实时预览需要 `flask`。PDF、DOCX、Excel、网页和图片处理能力按任务需要安装对应 Python 包。
