## Context

WorkWise 0.3.2 already has a single bundled WorkWise Runtime, local HTTP/SSE authentication, image attachments, Document Engine/MarkItDown integration, scheduled tasks, writing exports, and an Electron updater boundary. The remaining gaps are connected: tender-document work needs non-image source files; repeatable work needs a durable orchestration model; scheduled work must converge on that model; and future releases need a trusted in-app delivery path.

The change crosses Runtime contracts and SQLite state, Electron main-process file/update boundaries, renderer navigation and editing, release automation, and platform signing. The primary stakeholders are engineering users preparing bids, operators relying on unattended schedules, administrators deploying WorkWise, and maintainers publishing signed desktop releases.

Constraints:

- Code, Write, Connect phone, attachments, and Flow must continue through the one WorkWise Runtime. No provider switcher, second runtime, or legacy updater may be introduced.
- Documents and webhook bodies are untrusted input. Document text cannot grant tool authority, and secrets cannot be embedded in Flow definitions or exports.
- Long documents must remain locally searchable without placing the entire document in model context.
- Stable auto-update is permitted only for signed, notarized, cryptographically verified packages delivered over HTTPS from the official domain.
- WorkWise 0.3.2 cannot safely bootstrap the new updater and therefore requires one final manual installation of signed 0.3.3.

## Goals / Non-Goals

**Goals:**

- Deliver a default-visible Preview Flow workspace with typed composition, deterministic validation, durable execution, approvals, recovery, history, and safe external triggers.
- Accept the specified document and image formats as first-class conversation attachments with streamed import, local parsing, provenance-preserving indexing, and bounded retrieval tools.
- Migrate existing scheduled tasks to Flow exactly once without duplicate execution or loss of model, prompt, workspace, timing, enablement, or history references.
- Provide a two-stage in-app update experience using official Stable/Frontier feeds, background download, explicit restart installation, and safe shutdown checkpoints.
- Make artifact signing, notarization, metadata, hashes, Range support, retention, and atomic feed promotion enforceable release gates.

**Non-Goals:**

- Running unavailable external integrations without their accounts, models, CLIs, or credentials.
- Uploading private documents to a remote parser without explicit workspace authorization.
- General-purpose arbitrary code execution, unrestricted filesystem/network access, or bypassing the existing approval model.
- Seamless auto-update directly from the unsigned/unconfigured public 0.3.2 build.
- Replacing the WorkWise Runtime, adding a second provider runtime, or keeping a parallel legacy scheduler/updater.

## Decisions

### 1. Flow uses versioned contracts and immutable published snapshots

`FlowDefinitionV1`, `FlowNodeV1`, `FlowEdgeV1`, `FlowRunV1`, node-run, event, trigger-state, and credential-reference records are persisted in Runtime SQLite. Drafts use optimistic revisions; publication creates an immutable snapshot and hash. Runs always reference a published version, so later edits cannot alter historical execution.

Alternative considered: persist renderer-only JSON files. Rejected because concurrent edits, schedules, webhooks, recovery, and agent invocation require one authenticated durable authority.

### 2. Node behavior is registry-driven and ports are strongly typed

The registry declares category, inputs, outputs, required capabilities, availability reason, timeout, retry, and resumability. Connections support string, number, boolean, JSON, table, file, document, image, and Agent message with an explicit compatibility table. Publication validates structure, required values, capability availability, cycles, loop bounds, recursive Flow calls, and policies.

The renderer uses `@xyflow/react` v12 with controlled nodes and edges, custom node rendering, minimap, selection, zoom, and keyboard operations. The full catalogue remains visible; unavailable nodes are disabled with a reason and configuration route.

Alternative considered: loosely typed arbitrary JSON edges. Rejected because errors would surface only during unattended execution and make document/output nodes unsafe to compose.

### 3. Flow execution is a durable state machine in the existing Runtime

The executor records run and per-node transitions, inputs, outputs, errors, attempts, events, and checkpoint revisions. It supports bounded parallelism, timeout, retry/backoff, error edges, approvals, breakpoints, cancellation, retry-from-node, and restart recovery. Application exit interrupts active nodes; only nodes declared resumable return to pending after restart.

Agent, subagent, document retrieval, and output nodes delegate to existing Runtime services. `run_flow` invokes published definitions with a propagated invocation stack; direct or indirect recursion is rejected and depth is capped at three.

Alternative considered: a second workflow service/process. Rejected because it would duplicate authentication, provider selection, tool approval, workspace policy, and lifecycle management.

### 4. External triggers and code nodes are capability-secured

Webhook triggers use a random per-trigger credential stored through platform safe storage, timestamped HMAC, a five-minute replay window, persistent nonce rejection, 60 requests/minute, and a 1 MiB body limit. Exports retain only credential references.

Restricted code runs in a child process with JSON-only stdin/stdout, no network or arbitrary filesystem access by default, and explicit CPU/time, memory, source, and protocol size bounds. Extra permissions must pass the existing approval mechanism and are rejected if the restricted runner cannot enforce them.

Alternative considered: executing JavaScript in the main Runtime process. Rejected because infinite loops, memory exhaustion, prototype mutation, filesystem access, and network access would share the agent trust boundary.

### 5. Attachment originals are streamed into a managed store and parsed locally

The main process performs containment-checked streamed copy into an application-owned staging directory and validates extension, MIME, magic bytes, Office ZIP structure, archive limits, size limits, and SHA-256. Runtime-owned final storage and `AttachmentMetadataV2` track kind, state, parser, provenance structure, degradation reasons, index state, and references. Existing image metadata is upgraded in place without retransmission.

PDF/DOCX/XLSX/PPTX reuse Document Engine and local MarkItDown; safe text readers handle TXT/MD/CSV. Low-quality PDFs prefer installed MinerU. Remote private parsing is disabled unless the workspace explicitly authorizes it. Parsing preserves pages, headings, tables, sheets, slides, and warnings.

Alternative considered: JSON Base64 transport. Rejected because 200 MiB files amplify memory use and cross the IPC/HTTP boundary multiple times.

### 6. Long documents use chunked retrieval, not prompt injection

Parsed text is chunked at approximately 1,200 tokens with 150-token overlap and indexed in SQLite FTS with a bounded lexical fallback. Initial model context receives only an untrusted manifest and short excerpt. `search_attachment`, `list_attachment_sections`, and `read_attachment_section` enforce attachment/thread/workspace authorization, bounded output, and page/sheet/slide provenance.

The manifest explicitly states that document content is reference material, not system instructions, tool authorization, approval, or executable commands.

Alternative considered: send the whole parsed tender document in every turn. Rejected because it wastes context, degrades retrieval quality, increases cost, and magnifies prompt-injection exposure.

### 7. Legacy schedules migrate to Flow and the old scheduler becomes compatibility-only

On the first successful 0.3.3 Runtime startup, every legacy scheduled task maps idempotently to a `schedule_trigger → agent` Flow. A migration key prevents duplicate definitions, a read-only one-version backup preserves the source settings, and a marker disables the legacy scheduling loop. Compatibility create/update/run/delete operations forward to Flow until the old surface is removed; the renderer’s Scheduled tasks entry opens the scheduled-Flow filter.

Alternative considered: keep both schedulers active for a release. Rejected because timing races can execute the same business task twice.

### 8. Updates use official generic feeds and an explicit two-stage UX

Production Stable and Frontier packages embed HTTPS generic feed URLs under `railwise.cn`; environment overrides are limited to development/enterprise deployment. Startup and 24-hour checks remain non-blocking. The first blue-icon action downloads in the background and reports progress. Only after download does the action become “Restart and update.”

Before installation, the renderer flushes editable documents and main process lists active Agent, Flow, and schedule work. With confirmation, resumable checkpoints are recorded, Runtime work is stopped, and the platform updater replaces and relaunches the application without opening a browser.

Alternative considered: continue downloading a DMG from the website. Rejected because it is disruptive, error-prone, and cannot provide coordinated shutdown or verified incremental delivery.

### 9. Release promotion is verified and atomic

The pipeline builds macOS arm64/x64 and Windows x64 artifacts, signs them, notarizes macOS, validates `latest.yml`/`latest-mac.yml`, ZIP/EXE/blockmap names, versions and SHA-512 hashes, uploads immutable version paths to R2, verifies HTTPS and Range downloads, then atomically promotes a `latest` pointer. The last three installable versions remain available. The client rejects downgrade, version mismatch, hash mismatch, non-HTTPS production feeds, and unsigned/unnotarized Stable macOS packages.

Alternative considered: upload manifests before all artifacts finish. Rejected because clients could observe an incomplete release.

### 10. Final acceptance launches the packaged GUI

Automated contract, Runtime, renderer, packaging, signing, and updater checks remain necessary but do not establish that the assembled desktop product is usable. Final acceptance therefore launches the exact signed package and performs evidence-backed interaction checks across the affected user journeys. Flow acceptance must confirm visible canvas nodes, not only persisted JSON; Write acceptance must paste a long instruction with a real attachment and inspect the rendered composer; Design acceptance must import a representative PPT and apply a targeted AI element change.

Alternative considered: treat unit tests and static markup assertions as sufficient. Rejected because they did not detect a blank React Flow canvas or an impractically compressed Write composer in the published application.

## Risks / Trade-offs

- [Flow scope is large for one release] → Keep Flow labeled Preview, ship core nodes fully executable, expose unavailable catalogue nodes honestly, and retain hard publication validation.
- [SQLite state or application exit can leave partial work] → Use transactional writes, immutable versions, per-node checkpoints, startup reconciliation, and explicit resumability declarations.
- [Large/malicious files can exhaust CPU, disk, or decompression limits] → Stream copies, cap per-file/batch size, validate ZIP structure and expansion, bound parsing/index reads, and clean abandoned imports after 24 hours.
- [Scanned PDFs may have no usable text] → Prefer local MinerU when installed and show a degraded/failed state with a precise reason rather than silently sending an empty attachment.
- [Document prompt injection can influence the model] → Minimize initial context, mark all document text untrusted, require existing tool approval, and never interpret document commands as authority.
- [Webhook secrets could leak through export/logging] → Store secrets separately, persist only references, redact run exports, and verify HMAC using timing-safe comparison.
- [Code sandbox enforcement differs by platform] → Use a narrow child protocol, explicit resource limits, platform tests, and fail closed when a requested permission cannot be enforced.
- [0.3.2 cannot safely self-update] → Document one final manual signed 0.3.3 installation and never weaken signature verification to bridge the gap.
- [Official infrastructure credentials may be unavailable during development] → Permit local/pre-release testing but keep Stable promotion blocked and record external acceptance gates separately.

## Migration Plan

1. Establish `codex/workwise-0.3.3`, exact ignore rules, 0.3.3 metadata, and the independent OpenSpec change.
2. Add backward-compatible attachment and Flow contracts before database or UI changes.
3. Ship attachment storage/import/index/query paths and retain the existing image upload contract.
4. Ship Flow repository/executor/triggers/APIs and validate startup reconciliation before exposing the renderer route.
5. On first healthy 0.3.3 Runtime startup, back up legacy schedule settings, migrate idempotently, write the completion marker, then disable legacy execution.
6. Enable the Preview Flow route and redirect the legacy Scheduled tasks entry to its schedule filter.
7. Bake the official updater feeds into signed packages and test 0.3.3 → 0.3.4 pre-release upgrades on all supported platforms.
8. Upload immutable artifacts, verify manifests/hashes/Range/signing/notarization, and atomically promote Stable only after every gate passes.

Rollback keeps the previous three immutable installable versions and can repoint the channel’s `latest` pointer to a previously verified version. Data migrations remain additive: attachment V1 reading remains compatible, published Flow versions remain immutable, and the legacy schedule backup is retained for one version.

## Open Questions

- The production R2 account, custom-domain binding, Apple Developer ID, and notarization credentials must be supplied before Stable promotion; absence is an explicit external blocker, not a reason to weaken gates.
- Cross-platform updater acceptance requires physical or CI-hosted macOS arm64, macOS x64, and Windows x64 environments and will be recorded separately from local implementation tests.
- MinerU availability varies by installation; the parser capability probe and user-facing degradation wording must remain deterministic when it is absent.
