# WorkWise

[简体中文](./README.md) | English

> Put AI into real workflows.

WorkWise is a local-first desktop AI workbench. It brings **Code**, **Write**, reusable **Skills**, **MCP extensions**, local workspaces, and document delivery into one application for work that needs durable context, iteration, and a reviewable result.

- Product page: [www.railwise.cn/products/workwise](https://www.railwise.cn/products/workwise/)
- Direct mirror downloads: [Download and installation](https://www.railwise.cn/products/workwise/#download)
- Documentation: [kb.railwise.cn/products/workwise](https://kb.railwise.cn/products/workwise/)
- Public release: [v0.2.4](https://github.com/wangjiawei508/WorkWise/releases/tag/v0.2.4)

## Current release

The current stable release is **v0.2.4**. It has exactly three user-facing installers:

| Platform | Installer | Download |
| --- | --- | --- |
| macOS Apple Silicon | `WorkWise-0.2.4-mac-Apple-Silicon.dmg` | [Direct mirror](https://www.railwise.cn/downloads/workwise/v0.2.4/WorkWise-0.2.4-mac-Apple-Silicon.dmg) |
| macOS Intel | `WorkWise-0.2.4-mac-Intel.dmg` | [Direct mirror](https://www.railwise.cn/downloads/workwise/v0.2.4/WorkWise-0.2.4-mac-Intel.dmg) |
| Windows x64 | `WorkWise-0.2.4-win-x64.exe` | [Direct mirror](https://www.railwise.cn/downloads/workwise/v0.2.4/WorkWise-0.2.4-win-x64.exe) |

The website mirror is the primary download route. GitHub Releases remains the source for public release history and issue reports. There is currently no Linux client, portable edition, or activation-code flow.

## Why WorkWise

AI should do more than answer a one-off prompt. Real work needs project material, files, sessions, methods, and delivery standards to persist together.

1. **Persistent context**: local workspaces, conversations, and documents stay organized around the same task.
2. **Writing through delivery**: Markdown writing, preview, rich-text copying, and Word / PDF delivery live in one workflow.
3. **Reusable experience**: repeatable methods, templates, and standards can become Skills instead of one-off prompts.
4. **Bounded extensibility**: MCP and plugins add tools and data sources only after their purpose and permissions are understood.

## Core capabilities

### Code workbench

Collaborate around local projects and source material: understand, modify, test, build, review, and deliver. Sessions, plans, todos, goals, and permission settings support longer task chains without replacing human judgment.

### Write workbench

Use a complete document workflow for Markdown and text work:

- Edit, preview, and organize Markdown and text content.
- Copy rich text and deliver through HTML, PDF, DOC, and DOCX paths.
- Use Skills such as AI Word, humanized writing, and PPT Master to improve structure, expression, and review.
- Keep a human review step for facts, images, tables, layout, and formal delivery.

Read more: [Write and document export](https://kb.railwise.cn/products/workwise/write-export/).

### Skills and MCP

Skills are WorkWise reusable assets for high-frequency methods, writing rules, templates, and domain processes. The MCP and plugin market provides source, purpose, and installation-state context before additional tools are connected.

Read more: [Skills and templates](https://kb.railwise.cn/products/workwise/templates/).

### Local first

Workspaces, sessions, and settings are centered on the local machine. Model calls use API keys or compatible services that you are authorized to use. Handle sensitive material, access permissions, and local cleanup according to your organization’s rules.

Read more: [Local data and security](https://kb.railwise.cn/products/workwise/security-data/).

## Capability status

| Status | Scope |
| --- | --- |
| Available now | Code, Write, model configuration, workspace sessions, bundled Skills, download entry, GUI update checks |
| Preview | Advanced MCP marketplace, optional online Skill updates, complex Markdown / DOCX export, mobile connection, scheduled tasks |
| Direction | Enterprise knowledge base, bidding support, operations analysis, and more industry agent packs |

Preview and directional items are not described as stable released features.

## Quick start

1. Download the installer that matches your device and install it.
2. Configure DeepSeek, Agnes AI, or another OpenAI-compatible service in Settings.
3. Choose a local project or source-material directory as a workspace.
4. Work on project tasks in Code or start a document in Write.
5. Enable Skills when appropriate, then review content, images, tables, and layout before formal export.

- [Quick start](https://kb.railwise.cn/products/workwise/quickstart/)
- [Installation guide](https://kb.railwise.cn/products/workwise/install-guide/)
- [FAQ](https://kb.railwise.cn/products/workwise/faq/)

### Installation notes

- **macOS**: When macOS shows a first-open security prompt, verify the installer source first. You can allow the app in System Settings > Privacy & Security; the installation guide includes a fallback `xattr` path when needed.
- **Windows**: When Defender or SmartScreen appears, verify the source, file name, and version before continuing under your organization’s security policy.
- **Model services**: API-key availability, quotas, model access, and billing are controlled by the provider and your account.

## Development

```bash
git clone https://github.com/wangjiawei508/WorkWise.git
cd WorkWise
npm install
npm run dev
```

Common quality checks:

```bash
npm run openspec:validate
npm run verify:brand-boundary
npm run typecheck
npm run lint
npm run test
npm run build
```

The local agent is provided by WorkWise Agent Runtime through a stable HTTP/SSE boundary with the desktop application.

## Release policy

- Public releases retain only the macOS Apple Silicon, macOS Intel, and Windows x64 user installers.
- Intermediate build artifacts are not published, and unverified roadmap items are not presented as released capabilities.
- [GitHub Releases](https://github.com/wangjiawei508/WorkWise/releases) is the public release log; the website and knowledge base synchronize version and platform information from it.
- The 0.2.5 public behavior baseline is tracked in the [public behavior gap table](docs/PUBLIC_BEHAVIOR_GAP_0.2.5.zh-CN.md).

## Feedback

Please report issues or ideas through [GitHub Issues](https://github.com/wangjiawei508/WorkWise/issues). Include where possible:

- WorkWise version, operating system, and chip architecture.
- Reproducible steps, screenshots, or error logs.
- A minimal Markdown example for document-export issues.
- The source, trigger, and error message for Skills or MCP issues.

## License

[MIT](./LICENSE)
