## Context

The 0.2.9 runtime treats a model turn as the unit of work. Its completion guard infers deliverables from text and allows several non-success exits to become `completed`; renderer recovery reconnects event streaming but cannot restart backend work. Execution details are also rendered directly into the active conversation. Agent delegation exists internally but is disabled at the call site, Shell sessions are memory-only, and document preview is primarily text-oriented.

WorkWise ships Electron/React with a managed TypeScript runtime, SQLite persistence, versioned settings, canonical workspace containment, and macOS arm64/x64 plus Windows x64 packages. The local main checkout has divergent history, so implementation is isolated in a new worktree based on 0.2.9.

## Goals / Non-Goals

**Goals:**
- Make user intent and acceptance, rather than a single model response, the durable unit of work.
- Resume safe work across model limits, SSE reconnects, and application restarts without duplicate completion or side effects.
- Default to a concise conversation while keeping approvals, safety failures, changes, and artifacts actionable.
- Provide versioned Agent, trust, MCP, Shell, Git, code-intelligence, document-engine, and diagnostic contracts.
- Reuse audited open-source document parsers with local-first privacy and format-aware delivery validation.

**Non-Goals:**
- Design/Flow workbenches, MiMo, MiniMax multimodal support, or other post-0.3.0 roadmap capabilities.
- Preserving private chain-of-thought in any UI mode.
- Bundling MinerU models or automatically sending documents to a public cloud.
- Pixel-perfect Office rendering; native/system applications remain available for fidelity-critical viewing.

## Decisions

### Durable task controller above turns

A `TaskRunV1` owns an acceptance contract and a graph of `TaskNodeV1` records. Each model turn is an attempt leased by one runner. The agent loop returns typed outcomes (`candidate_complete`, `checkpoint`, `waiting_user`, `waiting_approval`, `recoverable_error`, `fatal_error`, `cancelled`) instead of a generic stop. A local acceptance evaluator verifies final text, required artifact formats, validation evidence, and absence of pending work before writing `completed`.

Task state, nodes, checkpoints, events, and leases live in SQLite and update in serialized transactions. Attempts checkpoint at existing step/time limits and automatically continue. Idempotent work may retry; unknown external side effects require confirmation. Progress fingerprints drive bounded replan and stall detection. Legacy active turns are imported as interrupted tasks that require a safe-resume decision.

### Semantic visibility instead of raw event exposure

Runtime events are normalized into public conversation messages, semantic progress, protected interactions, artifacts, and redacted diagnostic spans. `concise` is the default, `standard` exposes semantic operations, and `developer` exposes redacted tool/command details. Raw reasoning deltas never render as private chain-of-thought. Active work details collapse by default and live in a drawer; approvals, warnings, failures, diffs, and artifacts bypass visibility filtering.

### File-backed Agent profiles and bounded delegation

Built-ins are immutable definitions. Custom profiles use YAML frontmatter plus a Markdown prompt under global or workspace agent directories. Effective permissions are the intersection of Agent policy and canonical workspace trust. Delegation is enabled from the selected profile, and every child becomes a persisted task with independent budgets and parent linkage.

### Canonical trust and credential references

Workspace trust is keyed by final canonical root and never inherited through links. WorkWise-created roots default to workspace-write; externally selected roots default read-only. MCP V2 separates configuration from secrets. OAuth uses Authorization Code with PKCE; secrets are stored through Electron `safeStorage` backed by Keychain/DPAPI, or remain session-only when encryption is unavailable.

### Persistent metadata, not immortal processes

Background Shell metadata and bounded output persist, but application shutdown terminates process trees. Startup marks prior running sessions interrupted and lets the task controller retry only idempotent nodes. This avoids orphan processes while preserving diagnostics and resumability.

### Non-destructive Git checkpoints

Checkpoints record HEAD, baseline status/diffs, hashes, and before-images for task-owned writes. Rollback is previewed and applies only to paths whose current hashes still match task-produced state. Concurrent changes cause a conflict and optional rescue ref/branch instead of destructive reset.

### Budgeted code intelligence

Repository maps are cached by repository identity, HEAD, configuration, and file metadata. TypeScript/JavaScript language operations reuse the pinned TypeScript compiler/tsserver rather than adding a separate server. Nested repositories are explicit boundaries.

### MarkItDown built in; MinerU optional

CI creates per-platform PyInstaller `onedir` MarkItDown helpers containing only PDF/DOCX/PPTX/XLSX extras. Helpers accept a constrained one-job JSON contract, run without network access, and write structured results to a contained temporary directory. The OCR plugin is excluded because its current PyMuPDF dependency does not meet the distribution allowlist.

MinerU is a managed optional local engine or an explicitly configured private endpoint. It is never bundled and never routes to public cloud automatically. Auto mode tries MarkItDown first and selects MinerU for scans, garbled/low-density text, formulas, complex layout, or explicit accurate mode. PDF.js remains responsible for rendering and page navigation.

### Structured spans and schema-versioned APIs

All new records carry a schema version and revision. Mutations use `expectedRevision`; resumable operations use idempotency keys. Diagnostic spans store duration, routing, usage, retries, resource peaks, and redacted errors, not prompts or document bodies. Settings V2 gains defaulted sections rather than requiring a destructive settings rewrite.

## Risks / Trade-offs

- [Large cross-cutting migration] → Land capability slices behind runtime capability flags, keep historical thread rendering, and add forward-only idempotent DB migrations with backups.
- [Automatic continuation repeats external effects] → Retry only declared-idempotent nodes, persist idempotency keys, and require confirmation for unknown effects.
- [Task controller loops without progress] → Use progress fingerprints, bounded replans, explicit stall state, and hard resource budgets.
- [Concise UI hides useful evidence] → Never hide protected interactions/artifacts and provide standard/developer detail modes with redaction.
- [MarkItDown sidecar increases package size] → Include only four format extras, use `onedir`, verify all three packages, and report size budgets in CI.
- [MinerU hardware and custom-license burden] → Keep it optional, check resources before install, display attribution, and support local/private endpoints only.
- [Office preview is not layout-perfect] → Label structural previews and retain open-in-system-app actions.
- [Git rollback conflicts with external edits] → Hash-check every affected path and create rescue state instead of forcing rollback.

## Migration Plan

1. Add schema/versioned shared types, settings defaults, and SQLite migrations without enabling new execution.
2. Enable the task controller for new turns behind a runtime capability flag; migrate legacy active turns to interrupted tasks.
3. Switch renderer recovery and conversation visibility to task-aware APIs; preserve old event rendering for history.
4. Enable Agent profiles/delegation, trust/MCP V2, persistent Shell metadata, Git/code services, and document engines in separate guarded slices.
5. Run migration, crash-injection, packaging, license, and installed-app tests; then make the task engine and concise mode defaults for 0.3.0.
6. Rollback disables new capability flags while leaving new tables/files intact and readable; no downgrade deletes data.

## Open Questions

None. Product defaults are concise conversation, automatic safe continuation, workspace-write for WorkWise-created roots, read-only for external roots, bundled MarkItDown, and optional local/private MinerU.
