## 1. Contracts, persistence, and migration

- [x] 1.1 Add versioned task, conversation, Agent, trust, MCP, Shell, Git, diagnostic, document-engine, preview, and artifact contracts
- [x] 1.2 Extend WorkWise settings defaults and revision-safe persistence for conversation mode and document parsing preferences
- [x] 1.3 Add idempotent SQLite migrations and repositories for task runs, nodes, checkpoints, task events, leases, Shell sessions, and runtime spans
- [x] 1.4 Add legacy active-turn reconciliation without changing completed thread history

## 2. Reliable task execution

- [x] 2.1 Implement the task controller, lease ownership, serialized state transitions, checkpointing, and exactly-once terminal events
- [x] 2.2 Replace generic agent-loop stop handling with typed attempt outcomes and remove non-success-to-completed mappings
- [x] 2.3 Implement deterministic acceptance for final text, pending work, and requested artifact formats
- [x] 2.4 Implement automatic continuation, bounded retry/replan, progress fingerprinting, and explicit stalled state
- [x] 2.5 Integrate unified task-tree cancellation and application-start/exit reconciliation
- [x] 2.6 Add regression and crash-recovery tests for reasoning-only completion, limits, retries, restart, cancellation, and duplicate prevention

## 3. Concise conversation and artifact delivery

- [x] 3.1 Add concise/standard/developer visibility settings, selectors, and per-task override
- [x] 3.2 Normalize runtime events into semantic progress and keep active technical work collapsed by default
- [x] 3.3 Prevent verbatim private reasoning display and add redaction for secrets and absolute user paths
- [x] 3.4 Add a work-details drawer while keeping approvals, failures, changes, and artifacts visible
- [x] 3.5 Unify artifact cards and implement tested open, Save As, reveal, and localized failure actions
- [x] 3.6 Add renderer tests for visibility, deduplication, protected interactions, and artifact actions

## 4. Agent profiles and child orchestration

- [x] 4.1 Implement built-in Agent profiles and global/workspace Markdown profile loading, validation, precedence, and diagnostics
- [x] 4.2 Add Agent Center UI for role, prompt, model, tools, MCP, permission, and budget configuration
- [x] 4.3 Enable delegation from effective Agent policy and persist child task linkage, budgets, detach, terminate, and result recovery
- [x] 4.4 Add Agent permission and child recovery tests

## 5. Trust, MCP, Shell, Git, and code intelligence

- [x] 5.1 Implement canonical four-level workspace trust, source-sensitive defaults, migration, elevation confirmation, and effective-policy calculation
- [x] 5.2 Implement MCP V2 scope/cwd/source/tool-policy configuration, encrypted credential references, OAuth PKCE, diagnostics, and migration
- [x] 5.3 Persist bounded Shell session metadata/output and integrate cancellation, shutdown, interrupted-startup reconciliation, and diagnostics
- [x] 5.4 Implement non-destructive Git checkpoints, rollback preview, conflict detection, rescue state, and nested-repository binding
- [x] 5.5 Implement budgeted cached Repo Map and TypeScript/JavaScript definition, reference, symbol, diagnostic, and hover requests
- [x] 5.6 Add cross-platform trust, MCP, Shell, Git, and code-intelligence tests

## 6. Document understanding and preview

- [x] 6.1 Add MarkItDown sidecar source, constrained job protocol, dependency lock, build scripts, license policy, and platform packaging hooks
- [x] 6.2 Implement document-engine discovery, status, cancellation, hashing/cache, MarkItDown adapter, and network-denial safeguards
- [x] 6.3 Implement optional MinerU local/private configuration, resource checks, managed installation contract, attribution, and local-first privacy gates
- [x] 6.4 Implement auto/fast/accurate routing, quality diagnostics, fallback behavior, and page/block references
- [x] 6.5 Add safe PDF.js and Markdown/image/SVG/Office structural previews with bounded resources
- [x] 6.6 Add OOXML artifact validators and connect validation evidence to task acceptance
- [x] 6.7 Add fixture, cancellation, privacy, license/SBOM, malicious-file, and three-platform helper tests

## 7. Structured diagnostics and public APIs

- [x] 7.1 Implement redacted runtime span storage, aggregation, retention, and explicit diagnostic-bundle export
- [x] 7.2 Add task, Agent, trust, MCP, Shell, Git, code, document, and preview methods to validated IPC/preload APIs
- [x] 7.3 Add settings and diagnostics UI for task health, document engines, MinerU attribution, and recovery actions
- [x] 7.4 Add schema, revision-conflict, idempotency, redaction, and API compatibility tests

## 8. Release preparation

- [x] 8.1 Update package and runtime version to 0.3.0, notices, Chinese-first documentation, migration notes, and release notes
- [x] 8.2 Pass OpenSpec strict validation, brand boundary, lint, typecheck, unit/integration, Electron smoke, production build, and production audit
- [x] 8.3 Build and verify macOS arm64, macOS x64, and Windows x64 packages including MarkItDown helper and update metadata
- [ ] 8.4 Complete role-based installed-app scenarios plus two-hour release and eight-hour nightly stability gates before tagging
