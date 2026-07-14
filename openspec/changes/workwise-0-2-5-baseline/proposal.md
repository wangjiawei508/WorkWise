## Why

WorkWise 0.2.4 still carries product-facing Kun/DeepSeek GUI/WorkGPT identities and has reliability gaps around filesystem containment, web fetching, cancellation, streaming limits, and crash-safe persistence. Version 0.2.5 establishes a WorkWise-owned, secure technical baseline before larger Design, Loop, and multimodal features are developed.

## What Changes

- Remove legacy product branding from the WorkWise UI, public APIs, paths, logs, assets, build scripts, and release metadata while retaining the audited MIT runtime and legal provenance boundary.
- Introduce WorkWise settings schema V2 with revisioned, one-way compatibility import from older WorkWise, WorkGPT, Kun, and DeepSeek GUI locations.
- Enforce canonical workspace containment across files, attachments, Skills, instructions, plans, artifacts, and nested Git review targets, including symbolic-link and Windows junction defenses.
- Harden Web Fetch against SSRF, unsafe redirects, DNS rebinding, private addresses, timeouts, and oversized downloads.
- Add hard limits for HTTP/SSE/model/tool/attachment/turn/process/cache resources and expose the effective limits through runtime diagnostics.
- Unify cancellation and shutdown cleanup for Turns, approvals, user input, child tasks, schedules, IM work, SSE, MCP, and background shells.
- Serialize and atomically replace durable state for settings, sessions, Memory, attachments, plans, artifacts, and workspace files.
- Fix Write draft persistence, file-scoped assistant sessions, rejected-send recovery, long fenced code rendering, list markers, selection actions, and settings response races.
- Fix Windows spawn failures, unavailable working directories, nested Git review, stale approval cards, and Skill slash-command refresh.
- Add OpenSpec, brand-boundary, security, resource-limit, shutdown, cross-platform, and release quality gates.

## Capabilities

### New Capabilities

- `workwise-product-identity`: WorkWise-owned branding, public API naming, paths, settings V2, and controlled legacy import.
- `filesystem-containment`: Canonical path, link/junction, attachment, Skill package, workspace instruction, plan, artifact, and review-root boundaries.
- `safe-web-fetch`: DNS- and redirect-aware SSRF prevention with timeout and response-size enforcement.
- `runtime-resource-governance`: Stable hard limits for requests, streams, turns, tools, processes, and caches.
- `lifecycle-cancellation`: Hierarchical cancellation and deterministic application shutdown cleanup.
- `durable-state-writes`: Serialized, crash-safe writes and recovery for WorkWise durable data.
- `write-reliability`: File-scoped Write assistant behavior, save-before-send, input recovery, rendering correctness, and response ordering.
- `cross-platform-runtime-stability`: Windows spawn/cwd behavior, nested Git review, approval expiry, and live Skill catalog refresh.
- `release-quality-gates`: OpenSpec validation, public behavior provenance, brand scanning, security regression, soak, packaging, and release checks.

### Modified Capabilities

None. This repository has no existing OpenSpec capability specifications.

## Impact

- Affects the Electron main/preload/renderer public boundary, bundled runtime adapters, local persistence, Write, Skill installation, Git review, Schedule/IM lifecycle, packaging, documentation, and GitHub Actions.
- Adds `@fission-ai/openspec` as a pinned development dependency and introduces WorkWise V2 settings/API contracts.
- Preserves `kun/`, `agents.kun`, legal provenance files, legacy migration fixtures, and the historical Windows upgrade identifier as explicit internal compatibility exceptions.
- Does not add Design, Loop, MiMo, MiniMax multimodal, or any post-MIT Kun source.
