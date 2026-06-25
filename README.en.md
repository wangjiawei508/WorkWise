<p align="center">
  <img src="src/asset/img/workgpt.png" width="104" alt="WorkWise icon">
</p>

# WorkWise

An AI workbench for engineering, infrastructure, and business operations.

[简体中文](./README.md) | English

[Product & Download](https://www.railwise.cn/products/workwise/) · [User Guide](./docs/USER_GUIDE.zh-CN.md) · [GitHub Home](https://github.com/wangjiawei508/WorkWise) · [Issues](https://github.com/wangjiawei508/WorkWise/issues) · [Maintainer](https://github.com/wangjiawei508)

WorkWise is a desktop AI workbench for engineering professionals, project teams, operations managers, and people who need to turn complex work into reliable deliverables. It brings together a code workbench, a writing workbench, bundled industry Skills, Markdown rendering/export, optional online updates, and advanced MCP extensions in one desktop app.

The goal is not to provide another generic chat box. WorkWise is designed for long-running, context-heavy workflows such as engineering project delivery, infrastructure monitoring, technical documentation, business operations, and reusable enterprise knowledge.

## Why WorkWise

Engineering and monitoring services are moving from single-project delivery toward broader digital operations. Teams now need to handle a connected workflow:

- Understand standards, bidding requirements, risk points, and site conditions before the project starts.
- Produce daily, weekly, and monthly reports, monitoring summaries, warning records, review responses, and technical notes during delivery.
- Create project summaries, reusable templates, knowledge bases, and business reviews after delivery.
- Turn team experience into reusable Skills, templates, and agent workflows that can be updated over time.

WorkWise therefore uses a "desktop workbench + industry Skills + marketplace + local data" model. You can begin with a simple question, then gradually organize project documents, team workflows, writing templates, and domain knowledge into a reusable work system.

## Design Principles

### 1. Local-first continuity

WorkWise runs as a desktop app and works around local folders, files, sessions, settings, Skills, and plugin configuration. It is suitable for projects that last weeks or months, not just one-off prompts.

### 2. Honest capability layers

The app separates ready-now features, preview features, and roadmap items. Stable capabilities are polished first; features that need more real-world validation remain in preview.

### 3. Skills are reusable assets

WorkWise treats domain knowledge as reusable Skills. Core capabilities such as protection-area monitoring, operation-period monitoring, report writing, bidding knowledge, standards lookup, business analytics, and writing polish are bundled with the installer and do not depend on GitHub or npm by default. Online updates are optional; when the network is unavailable, WorkWise uses the bundled local version.

### 4. Writing is a first-class workflow

Many engineering and business tasks end in a document. WorkWise includes a dedicated Write workspace with Markdown editing, live preview, context-aware writing actions, export to PDF/DOC/DOCX/HTML, and writing enhancement Skills.

### 5. Marketplace items should be understandable

MCP tools and Skills include detail pages with descriptions, source links, installation state, and intended usage. Users should be able to decide what an extension does before installing it.

## Capability Status

| Status | Scope |
| --- | --- |
| Ready now | Code workbench, Write workbench, model settings, workspace sessions, bundled engineering Skills, Help center, download links, GUI update checks |
| Preview | Advanced MCP marketplace, optional online Skill updates, complex Markdown/DOCX export, phone connection, scheduled automation |
| Roadmap | Infrastructure inspection, urban renewal, digital twins, operations analytics, bidding support, enterprise knowledge bases, more industry agent packs |

## Key Features

### Code Workbench

Useful for development, code review, requirements breakdown, scripts, and repository-based automation.

- Choose a local project folder and start a session.
- Review reasoning, tool calls, todos, command approvals, and file changes.
- Collaborate on implementation, testing, building, and release tasks.
- Use it for software projects or document/template repositories.

### Write Workbench

Useful for Markdown writing, engineering documents, report drafting, knowledge notes, and export.

- `Live`, `Source`, `Split`, and `Preview` editing modes.
- Markdown / TXT file management with cross-document context.
- Rewrite, polish, expand, shorten, restructure, and align selected text.
- Export to `HTML / PDF / DOC / DOCX`.
- Suitable for technical plans, monitoring reports, review responses, bids, articles, and internal knowledge bases.

### Markdown Rendering and Export

WorkWise treats Markdown as a deliverable workflow:

- PDF export uses bundled Chromium for fixed-layout output.
- DOC export uses Word-compatible HTML for quick editing in Word or WPS.
- DOCX export prefers platform converters and falls back to the built-in WorkWise generator.
- Relative images are resolved from the Markdown file location.

Complex tables, fully consistent cross-platform layout, and highly customized Word styles are still being improved. For formal delivery, always review the exported file.

### Bundled Engineering and Business Skills

Current bundled Skills cover:

- Protection-area monitoring plans, daily/weekly/monthly reports, warnings, clearances, summaries, and review responses.
- Long-term deformation monitoring for urban rail transit operation, including settlement, convergence, clearance sections, 3D scanning, and control network analysis.
- Engineering monitoring plans, report writing, data adjustment, Excel reporting, Word document generation, charts, and visualization.
- Bidding knowledge, standards lookup, technical document review, and engineering writing polish.
- Business analytics, weekly reports, project risk scanning, resource dispatch, and knowledge-base organization.

### Writing Enhancement Skills

WorkWise bundles writing-focused Skills for better, more credible output:

- Reduce obvious AI-like phrasing, empty language, and repetitive structures.
- Build and apply writing styles that sound more natural and professional.
- Support long-form articles, titles, structure, reader experience, and pre-publish review.
- Review facts, compress wording, add concrete examples, and align tone.

### Plugin Marketplace

The marketplace manages Skills and advanced MCP tools:

- View functionality, source links, installation state, and usage descriptions.
- Bundled Skills are shipped with the installer and work locally by default.
- Online updates are optional and do not block the bundled local version.
- MCP tools are advanced extensions and may require external network access, authorization, API keys, or a local runtime.
- Prepare future integrations with enterprise tools, repositories, document systems, and knowledge bases, preferably through controlled bundled or mirrored sources.

### Phone Connection and Background Tasks

WorkWise can connect to Feishu / Lark, WeChat, or local webhooks:

- Create a dedicated IM Agent with name, role, user context, and reply rules.
- Connect by QR scan or webhook depending on the platform.
- Configure one-time, daily, interval, or manual scheduled tasks.

This area is still in preview and should be tested first in low-risk scenarios.

### Online Updates

Use `Settings -> General -> GUI Update` to check for new versions. The manual download action opens the [WorkWise product page](https://www.railwise.cn/products/workwise/) by default. Automatic update metadata and installer downloads require a real static file directory or object-storage domain configured at release time, such as `WORKWISE_PUBLIC_BASE_URL` or `WORKWISE_UPDATE_URL`. If no update feed is configured, WorkWise reports that updates are unavailable instead of pretending to connect to a server.

## Quick Start

### 1. Download

Go to the [WorkWise product page](https://www.railwise.cn/products/workwise/) for product information and downloads. Automatic update files still need to be deployed separately to your real website static directory, server, CDN, or object-storage public domain. GitHub is kept mainly as the project home, source collaboration space, issue tracker, and developer release record.

| Platform | Installer |
| --- | --- |
| macOS Apple Silicon | `WorkWise-version-mac-Apple-Silicon.dmg` |
| macOS Intel | `WorkWise-version-mac-Intel.dmg` |
| Windows x64 | `WorkWise-version-win-x64.exe` |

Linux clients and intermediate build files are not published as public release assets.

### 2. Configure Models

On first launch:

- Add a DeepSeek API key, or choose the built-in Agnes AI preset / another OpenAI-compatible model service.
- The Agnes AI preset uses `https://apihub.agnes-ai.com/v1`, `chat_completions`, and `agnes-2.0-flash`; API keys, quota, and billing follow Agnes account rules.
- Set Base URL, default model, and proxy settings if needed.
- Check GUI updates to confirm you are on the latest version.

### 3. Use Code Workbench

1. Select a local project or document folder.
2. Ask a task such as "review this release configuration" or "organize these monitoring report templates".
3. Inspect analysis, commands, file changes, and todos in the timeline.
4. Approve sensitive commands only after reading the prompt.

### 4. Use Write Workbench

1. Create or open a Markdown / TXT file.
2. Write in `Live` or `Split` mode.
3. Select text and ask WorkWise to rewrite, polish, expand, shorten, or align style.
4. Use Agnes AI prompt templates to generate cover images, monitoring-data backgrounds, construction/operations diagrams, business-writing illustrations, or icon-style artwork and insert them into the current Markdown file.
5. Export to PDF, DOC, DOCX, or HTML.
6. Review formal deliverables manually before sending.

Agnes image generation is a separate material-generation feature, not part of the chat Provider. This MVP supports text-to-image; video generation, full image-to-image editing, and multi-image composition are future extensions.

### 5. Use Skills and Plugins

1. Open Skills or the marketplace from Settings.
2. Read the extension details and confirm it fits your task.
3. Install or enable the Skill; configure advanced MCP only when an external system is actually needed.
4. Use it in Code, Write, phone connection, or scheduled tasks.

PPT Master is bundled as a built-in Skill for turning Markdown, reports, plans, web pages, or existing PPTX files into natively editable PowerPoint decks. The bundle keeps only the core workflow, localhost confirmation page, SVG live preview, reusable charts/layouts, two lightweight top-consulting examples, and an empty `projects` placeholder; it excludes the full official examples set, real user projects, exports, backups, large icon libraries, and private PPT files. Python 3.10+ is required for scripts. Pandoc is not enabled in the MVP.

## Suggested Use Cases

- Draft monitoring plans for rail protection areas, operation-period monitoring, pits, and structural health monitoring.
- Produce daily, weekly, monthly, summary, review-response, and technical-report documents.
- Organize project materials into a Markdown knowledge base and export to Word / PDF.
- Analyze bidding documents, scoring points, technical responses, and writing quality.
- Prepare department weekly reports, business briefs, risk lists, and management updates.
- Build reusable Skills, templates, standards references, and delivery methods for a team.

## Local Data and Privacy

WorkWise is local-first. New installs use `workwise` directories by default. Upgrades remain compatible with existing historical `workgpt` directories and do not delete prior sessions or files:

| Data | Default path |
| --- | --- |
| Default workspace | `~/.workwise/default_workspace` |
| Write workspace | `~/.workwise/write_workspace` |
| Runtime and sessions | `~/.workwise/kun` or the OS app-data directory |
| Settings | macOS: `~/Library/Application Support/WorkWise/workwise-settings.json`; Windows: `%APPDATA%\WorkWise\workwise-settings.json`; legacy `workgpt-settings.json` is read automatically |

Uninstalling the app does not automatically delete these files. Before a full cleanup, make sure you no longer need historical sessions, MCP configuration, Skills, or writing files.

## Development

```bash
git clone https://github.com/wangjiawei508/WorkWise.git WorkWise
cd WorkWise
npm install
npm run dev
```

Useful commands:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run generate:icons
```

Packaging:

```bash
npm run dist:mac
npm run dist:win
```

## Release Rules

- Public releases contain only three user-facing installers: macOS Apple Silicon, macOS Intel, and Windows x64.
- Linux clients are not published.
- zip files, blockmaps, latest yml files, and intermediate artifacts are not published as user-facing assets.
- Installer names explicitly identify Apple Silicon, Intel, and win-x64.

## Roadmap

WorkWise will continue to evolve in three directions:

- Industry agents: infrastructure inspection, urban renewal, structural safety, bidding support, project operations, and enterprise knowledge bases.
- Document delivery: Markdown rendering, Word export, report templates, chart generation, and cross-platform layout consistency.
- Plugin ecosystem: bundled Skills, optional online updates, enterprise-internal Skill management, and more third-party integrations. Advanced MCP should not be the default path for everyday users.

## Feedback

Please use [Issues](https://github.com/wangjiawei508/WorkWise/issues) for feedback. Helpful reports include:

- WorkWise version.
- Operating system and CPU architecture.
- Screenshot, logs, or reproduction steps.
- A minimal Markdown sample for export issues.
- Skill / MCP source, trigger method, and error message for extension issues.

Maintainer: [wangjiawei508](https://github.com/wangjiawei508)
