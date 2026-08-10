# WorkWise Plugin and Skill Migration Matrix

This matrix is part of the release gate. Existing files and user-installed
Skills remain readable; an item is not removed or replaced silently.

| Existing item | WorkWise status | Reason | Data preservation | User action |
| --- | --- | --- | --- | --- |
| Schedule | Retained as a WorkWise-managed capability | Built into the application | Existing schedules and settings stay in the WorkWise data directory | None |
| Filesystem MCP | Retained | Official MCP package with explicit roots and permission review | Existing MCP V2 record is preserved | Review filesystem roots before enabling |
| Playwright / Puppeteer | Playwright retained; Puppeteer shown as merged | One maintained browser integration avoids duplicate execution paths | Existing Skill directories are left in place | Use Playwright for new installs |
| Context7 | Retained | Maintained documentation source | Existing install record is preserved | Review network permission |
| Memory | Retained | Official local memory server | Existing data directory is not deleted | Review storage permissions |
| Sequential Thinking | Retained | Official reasoning utility | Existing Skill or MCP record is preserved | None |
| GitHub MCP | Replaced by the official remote endpoint | The old package is no longer the supported official path | Old config remains as migration input; V2 stores the new endpoint | Re-authorize GitHub when prompted |
| Postgres MCP | Replaced by DBHub | DBHub is the maintained supported database route | Old config remains readable | Recheck read/write permissions |
| Brave Search | External / unavailable | No independently supported WorkWise install is claimed | No files are removed | Use an external service or leave disabled |
| Slack | External / unavailable | No independently supported WorkWise install is claimed | No files are removed | Configure an external integration if required |
| Lark CLI | WorkWise-managed | Managed toolchain already owns installation and credentials | Existing managed tool data is preserved | Use the managed tool status panel |
| OfficeCLI | WorkWise-managed | Managed document toolchain | Existing managed tool data is preserved | Use the managed tool status panel |
| Ego Browser | External managed integration | It is an external application, not a bundled installer | Existing external app is untouched | Keep the external app installed separately |
| MarkItDown | WorkWise-managed / bundled | Document engine is already managed by WorkWise | Existing conversion configuration is preserved | None |
| Engineering, bidding, document, data-analysis, PPT Master, Humanizer and other local Skills | Browse-only unless explicitly installed from a reviewed source | Local Skills must remain visible and auditable | `~/.agents/skills`, `~/.codex/skills`, `~/.workwise/skills`, project roots and bundled assets are scanned without deletion | Review duplicate, health and update-source labels |
| Restricted or unlicensed third-party content | Source/status only | License or redistribution terms are not sufficient for bundling | Source metadata remains visible | Install only after an independent license review |

## Migration Rules

- `mcp.json` is preserved as a read-only migration source; valid entries are
  copied to `mcp-v2.json` without copying plaintext environment credentials.
- If an existing V2 entry still points to an obsolete temporary WorkWise build,
  WorkWise repairs only the executable path from a matching valid legacy entry.
- Third-party GitHub Skills default to manual updates. Automatic updates are
  reserved for audited bundled sources and explicitly trusted sources.
- A replacement, removal, license restriction or permission expansion requires
  a new review and explicit user confirmation.
