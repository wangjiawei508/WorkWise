## Why

WorkWise 0.2.9 can mark a turn complete after reasoning-only output or a non-success stop condition, leaving long-running tasks unfinished with no reliable recovery. WorkWise 0.3.0 needs a persistent agent workbench that completes and verifies user outcomes while keeping technical execution details out of the default conversation view.

## What Changes

- Add a persistent task graph above model turns, with deterministic acceptance, checkpoints, leases, bounded retries, stall detection, cancellation, and application-restart recovery.
- Add concise, standard, and developer conversation modes; default to concise conversation while preserving approvals, failures, file changes, and deliverables.
- Add configurable built-in and user/workspace Agent profiles plus persistent child-agent execution and result recovery.
- Add canonical workspace trust levels, scoped MCP authorization, encrypted credential references, and persistent background Shell session diagnostics.
- Add safe Git checkpoints and rollback previews, a budgeted repository map, and TypeScript/JavaScript language intelligence.
- Add document parsing and preview through an embedded MarkItDown sidecar and optional local/private MinerU integration without automatic cloud upload.
- Add format-aware artifact validation so HTML or renamed text cannot satisfy requested PowerPoint, Word, Excel, or PDF deliverables.
- Add structured, privacy-redacted runtime diagnostics and release gates for reliability, licensing, packaging, and real-user workflows.
- **BREAKING** Internal runtime completion semantics change: a model `stop` is only a completion candidate and cannot directly complete a task.

## Capabilities

### New Capabilities
- `persistent-task-execution`: Durable task runs, nodes, checkpoints, leases, automatic continuation, deterministic completion, and unified cancellation.
- `concise-agent-conversation`: Conversation visibility modes, semantic progress, protected approvals/errors, and actionable artifact delivery.
- `agent-profile-orchestration`: Built-in/custom Agent profiles, effective permissions, child-agent execution, budgets, and recovery.
- `workspace-trust-and-integrations`: Canonical workspace trust, MCP V2 configuration/OAuth, credential protection, and background Shell ownership.
- `git-and-code-intelligence`: Safe checkpoints/rollback, nested repository boundaries, budgeted repo maps, and TypeScript/JavaScript language services.
- `document-understanding`: MarkItDown and MinerU routing, PDF/Office preview, local-first privacy, parsing cache, and document diagnostics.
- `artifact-acceptance`: Format-aware validation and reliable open/save/reveal actions for generated files.
- `structured-runtime-diagnostics`: Redacted spans, task health, document-engine status, and explicit stalled/failure reasons.

### Modified Capabilities
- `release-integrity`: 0.3.0 release gates add dependency/license SBOM checks, sidecar packaging verification, long-task recovery, and role-based installed-app testing.

## Impact

- Affects the managed runtime loop, persistence schema, renderer timeline/store, preload API, IPC validation, settings, MCP and Shell services, Git services, workspace preview, packaging workflows, and release verification.
- Adds versioned runtime/public types and SQLite migrations while preserving existing thread history and read-only legacy compatibility.
- Adds a per-platform MarkItDown helper to the three supported installers; MinerU remains optional and is not bundled.
- Requires audited Python document dependencies, PDF.js-based rendering, third-party notices, SBOM generation, and explicit MinerU attribution when used.
