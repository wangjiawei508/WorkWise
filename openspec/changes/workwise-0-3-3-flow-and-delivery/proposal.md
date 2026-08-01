## Why

WorkWise 0.3.2 can prepare tender documents, but users cannot attach the PDF/DOCX/XLSX source material that drives that work, cannot compose repeatable multi-step work visually, and must still reinstall each desktop release manually. Version 0.3.3 closes those delivery gaps while preserving the single WorkWise Runtime architecture and establishing a safe update path for later releases.

## What Changes

- Add WorkWise Flow as a default-visible Preview workspace with typed visual composition, validation, durable execution, approvals, recovery, history, safe triggers, and a guarded `run_flow` agent tool.
- Upgrade chat attachments from image-only transfer to managed local import, validation, parsing, indexing, and bounded retrieval for PDF, DOCX, XLSX, PPTX, TXT, Markdown, CSV, PNG, JPEG, and WebP.
- Migrate existing scheduled tasks idempotently into published Flow definitions while retaining one-version read-only compatibility data and preventing duplicate scheduling.
- Replace normal website/DMG reinstall updates with an official Stable/Frontier in-app check, background download, explicit restart-and-update, and signed release promotion workflow.
- Upgrade application, Runtime, package, update manifest, and release documentation metadata to 0.3.3.
- Keep one bundled WorkWise Runtime; do not introduce another runtime, provider switcher, legacy updater, or permissive signature bypass.

## Capabilities

### New Capabilities

- `workwise-flow`: Versioned Flow definitions, typed node catalogue and canvas, validation, durable execution, triggers, approvals, recovery, history, export, and agent invocation.
- `document-chat-attachments`: Secure managed import, local parsing, provenance-preserving indexing, bounded retrieval, lifecycle, and composer behavior for supported document and image formats.
- `schedule-flow-migration`: Idempotent conversion of legacy scheduled tasks to Flow plus compatibility routing and read-only backup behavior.
- `in-app-update-delivery`: Official channel feeds, staged client download/install UX, shutdown preflight, cryptographic release validation, atomic R2 promotion, and retention.

### Modified Capabilities

- `release-integrity`: Make signed/notarized updater artifacts, official manifests, hash checks, Range availability, and Stable promotion verification mandatory for 0.3.3.
- `user-visible-updates`: Present update availability, progress, failure, retry, channel, and restart installation inside the application instead of treating website download as the normal path.

## Impact

- Adds versioned Flow contracts, SQLite repositories, node adapters, trigger routes, attachment metadata V2, streamed import/query APIs, and `run_flow` tooling to `kun`.
- Adds main-process attachment staging/parser orchestration, safe credential launch integration, schedule migration bridging, updater preflight, and release scripts.
- Adds `@xyflow/react` v12, a Flow route and sidebar entry, document attachment cards/states, and a two-stage top-bar update control to the renderer.
- Requires the official `railwise.cn` update domain, R2 publication credentials, Apple Developer ID signing/notarization, and cross-platform installer artifacts before Stable promotion.
