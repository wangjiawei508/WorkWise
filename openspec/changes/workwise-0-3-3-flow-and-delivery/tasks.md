## 1. Baseline and contracts

- [x] 1.1 Confirm the 0.3.2 post-fix baseline on `codex/workwise-0.3.3`, preserve existing image-wait and writing-export work, and add exact ignore rules for `/.codex/config.toml` and `/.zcode/` without ignoring tracked skills.
- [x] 1.2 Upgrade application, Runtime, package, installer, update-manifest, and release-note version metadata consistently to 0.3.3.
- [x] 1.3 Add `@xyflow/react` v12 with recorded MIT license verification and no second renderer/runtime framework.
- [x] 1.4 Add backward-compatible `AttachmentMetadataV2`, attachment limits, states, parser provenance, structure, index, and V1 image-upgrade contracts.
- [x] 1.5 Add versioned Flow definition, node, edge, port, registry, validation, run, node-run, event, trigger-state, credential-reference, and API contracts.

## 2. Secure document attachments

- [x] 2.1 Extend the Runtime attachment store for managed document originals, parsed artifacts, references, lifecycle states, and V1 image migration without retransmission.
- [x] 2.2 Implement main-process streamed staging with path containment, extension/MIME/signature, Office ZIP structure, compression, byte-limit, and SHA-256 validation.
- [x] 2.3 Implement local PDF/DOCX/XLSX/PPTX parsing through Document Engine and MarkItDown plus bounded TXT/MD/CSV readers and installed-MinerU fallback.
- [x] 2.4 Preserve page, heading, table, worksheet, and slide provenance and surface encrypted, corrupt, empty-text, OCR-degraded, and parser-warning states.
- [x] 2.5 Chunk parsed content near 1,200 tokens with 150-token overlap and persist bounded SQLite FTS plus lexical-fallback indexes.
- [x] 2.6 Add authenticated streamed import, cancel/retry/open-original, cleanup, list-section, read-section, and search-section Runtime/main-process interfaces.
- [x] 2.7 Add scope-authorized `list_attachment_sections`, `search_attachment`, and `read_attachment_section` tools with bounded output and provenance.
- [x] 2.8 Inject only an untrusted bounded document manifest and short summary into initial model context and explicitly deny document-based instruction or tool authority.
- [x] 2.9 Expand the composer picker and drag/drop to PDF, DOCX, XLSX, PPTX, TXT, MD, CSV, PNG, JPEG, and WebP while keeping clipboard import image-only.
- [x] 2.10 Build attachment cards with file type, size, progress, ready/degraded/failed states, send gating, cancellation, retry, removal, and open-original actions.
- [x] 2.11 Implement reference release on conversation deletion, 24-hour abandoned-import cleanup, and protection for all still-referenced business files.
- [x] 2.12 Add contract, store, parser, route, retrieval, prompt-injection, MIME spoof, ZIP bomb, capacity-boundary, lifecycle, and composer attachment tests.

## 3. Flow Runtime and migration

- [x] 3.1 Implement the complete capability-aware Flow node registry and explicit typed-port compatibility table.
- [x] 3.2 Implement deterministic validation for graph structure, required bindings/config, policies, capabilities, cycles, loop bounds, reachability, and recursion.
- [x] 3.3 Implement SQLite repositories for optimistic drafts, immutable hashed versions, runs, node runs, events, trigger state, credential references, replay nonces, and migration keys.
- [x] 3.4 Implement the durable executor with node input resolution, bounded parallelism, retries/backoff, timeout, error edges, checkpoints, cancellation, breakpoints, retry-from-node, and resumable restart recovery.
- [x] 3.5 Implement core manual/schedule/Webhook, Agent/subagent, retrieval, classification, extraction, HTTP, condition/Switch/Merge/Loop/Parallel, approval, output, publish, and archive adapters through the existing Runtime services.
- [x] 3.6 Implement the restricted JSON code child with default network/filesystem denial, source/protocol/time/CPU/memory limits, existing approval integration, and fail-closed extra permissions.
- [x] 3.7 Implement random safe-stored Webhook credentials, timestamp HMAC, timing-safe verification, five-minute replay prevention, persistent nonces, 60/minute limiting, and 1 MiB requests.
- [x] 3.8 Add authenticated Flow CRUD, validation, publication, versions, run, single-node test, history, cancellation, resume, retry, approval, Webhook, schedule, and redacted-export routes.
- [x] 3.9 Add the guarded `run_flow` Agent tool with published-version lookup, invocation-stack propagation, direct/indirect recursion rejection, and depth limit three.
- [x] 3.10 Migrate legacy schedules idempotently to `schedule_trigger → agent` Flow definitions while preserving enablement, model, reasoning, mode, prompt, workspace, next run, and history references.
- [x] 3.11 Persist the one-version legacy schedule backup and completion marker, disable duplicate legacy execution only after success, and route compatibility run/create/update/delete through Flow.
- [x] 3.12 Add Flow contract, registry, validator, repository, executor, condition/parallel/loop, retry/timeout, approval/breakpoint, recovery/cancel, Webhook security, recursion, API, and migration tests.

## 4. Flow renderer

- [x] 4.1 Add the default-visible `flow` Preview route, sidebar entry, Runtime client/state, localized labels, and Scheduled tasks redirect to the scheduled-Flow filter.
- [x] 4.2 Build the controlled React Flow canvas with custom typed nodes/handles, edges, node palette, selection, zoom, minimap, keyboard operations, and accessible status presentation.
- [x] 4.3 Display the complete categorized node catalogue and disabled reasons/configuration routes for unavailable integrations or generation capabilities.
- [x] 4.4 Build node configuration for bindings, model/provider, required values, timeout, retry/backoff, error branch, concurrency, resumability, and node-specific settings.
- [x] 4.5 Build draft save/revision handling, graph validation issues, publication, redacted export, Mock input, single-node test, breakpoints, full-run, and cancel controls.
- [x] 4.6 Build run history and per-node state/input/output/error inspection with approval/reject, retry-from-node, resume, and interrupted/failed recovery actions.
- [x] 4.7 Add responsive empty/loading/error states and consistent green/yellow/orange/red/blue engineering status semantics for normal, attention, approval/interruption, failure, and active work.
- [x] 4.8 Add route, schedule-navigation, canvas, typed-connection, validation, capability-disabled, accessibility, node-test, run-control, approval, retry, and history renderer tests.

## 5. In-app update and release delivery

- [x] 5.1 Bake official Stable and Frontier `railwise.cn` generic feed URLs into production metadata with development/enterprise override rules and HTTPS/downgrade/version validation.
- [x] 5.2 Preserve startup and 24-hour checks and change the top-bar updater to blue available, background download/progress, downloaded/restart, failed/retry, and current states.
- [x] 5.3 Keep General settings channel selection, manual check, versions, progress, retry, and diagnostics synchronized with the top-level control and remove website reinstall as the normal flow.
- [x] 5.4 Add restart-install preflight that flushes Write/Design/other editable content and lists active Agent, Flow, and schedule work before user confirmation.
- [x] 5.5 On confirmation, checkpoint recoverable work, stop Runtime services, invoke the platform updater, exit, replace the application, and automatically relaunch without opening a browser.
- [x] 5.6 Make the client reject non-HTTPS production feeds, downgrades, manifest/version mismatches, SHA-512 failures, and untrusted packages.
- [x] 5.7 Update the release pipeline to produce and upload versioned ZIP, EXE, blockmap, `latest.yml`, `latest-mac.yml`, and SHA-512 metadata to R2.
- [x] 5.8 Verify post-upload signing, notarization, versions, hashes, complete HTTPS downloads, and Range downloads before atomically promoting the channel latest pointer.
- [x] 5.9 Retain the three latest installable versions and provide verified channel-pointer rollback without mutating versioned artifacts.
- [x] 5.10 Fail Stable macOS arm64/x64 publication without valid Developer ID signing, hardened runtime, Apple notarization, stapling, and matching updater metadata.
- [x] 5.11 Add feed resolution, updater state, duplicate-check, download failure/retry, shutdown preflight, active-work confirmation, manifest/hash, promotion, retention, and signing-gate tests.

## 6. Integration, documentation, and release gates

- [x] 6.1 Add 0.3.3 release notes and user documentation for Flow Preview, supported attachments, local document retrieval, schedule migration, update channels, and the one-time 0.3.2 signed bootstrap.
- [x] 6.2 Run strict OpenSpec validation, full TypeScript checks, Runtime tests, desktop tests, production builds, package freshness, ASAR, native Runtime, and document-dependency verification.
- [x] 6.3 Complete the tender acceptance using a 100+ page PDF, page-cited clause retrieval, and generated bid DOCX while direct full-document model injection remains disabled.
- [x] 6.4 Complete the Flow acceptance for `schedule → tender retrieval → Agent preparation → DOCX → human approval → archive`, including retry, restart recovery, history, and redacted export.
- [x] 6.5 Complete 0.3.3 → test 0.3.4 in-app update acceptance on macOS arm64, macOS x64, and Windows x64 without browser access.
- [x] 6.6 Record official-domain, R2, signing, notarization, installer, manifest, hash, Range, and rollback evidence; explicitly leave Stable promotion blocked wherever external credentials or platform environments are unavailable.
