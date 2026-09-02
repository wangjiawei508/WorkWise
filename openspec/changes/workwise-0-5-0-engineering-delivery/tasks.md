## Contracts and Runtime

- [x] Add monitoring contracts and export them from `kun/src/contracts/index.ts`.
- [x] Add SQLite repositories and authenticated engineering project/dataset/run routes.
- [x] Implement CSV/XLSX normalization, mapping, quality findings, deterministic analysis, and citation/manifest persistence.
- [x] Add chart, DOCX/PDF report, XLSX evidence, artifact validation, cancellation, resume, idempotency, and revision-conflict behavior.

## Integrations and UI

- [x] Add namespaced RailWise tool adapters while preserving existing tool IDs and agent-pack source metadata.
- [x] Add the classic Engineering workbench route, project/import/quality/analysis/deliverable/review views, and WorkbenchRegistry lazy loading as a compatibility surface.
- [x] Add the reusable monitoring-report Flow template using the same Runtime endpoints.

## AI-first Engineering redesign

- [x] Add additive `domain`/`projectId` thread metadata to the contract, file/SQLite index, Runtime list/create/update routes, and renderer mapper; preserve unknown legacy records.
- [x] Add Engineering thread selection and restoration actions to `ChatState`; opening Engineering must select/create one project thread, and route switching must preserve Code/Write/Design/Engineering timelines independently.
- [x] Replace `EngineeringAiCommandCenter` localStorage/provider/SSE shim with a real session shell that renders existing message blocks, attachments, queued sends, approvals, and runtime errors.
- [x] Add `EngineeringContextService` for bounded context snapshots, project/dataset/citation revisions, provenance, and Watch drafts; no raw 500k-row payloads are sent to the model.
- [x] Add `EngineeringAiOrchestrator` for typed plan parsing/validation, approval tokens, idempotency, revision conflicts, TaskRun submission, event projection, cancel, resume, and stale-plan handling.
- [x] Route approved Engineering steps through `TaskController`/`AgentLoop` and RailWise tool provider; remove direct AI completion/cancel/resume writes from `engineering_runs` while keeping deterministic service records compatible.
- [x] Add AI routes/events, evidence-card reads, and renderer cards for plans, approvals, findings, metrics, trends, citations, artifacts, and model/tool unavailable recovery.
- [ ] Add packaged UI acceptance for Engineering thread isolation, AI-first entry, classic fallback, loading/empty/partial/error/stale states, light/dark themes, narrow windows, keyboard/a11y, and a real CSV/XLSX-to-DOCX/PDF/XLSX/manifest run.

## Verification

- [x] Add unit, Runtime integration, Flow, renderer, artifact, and migration tests.
- [ ] Close the remaining 0.3.3 and specialist-skill acceptance tasks without modifying user data.
- [ ] Run typecheck, lint, full tests, build, strict OpenSpec validation, packaged GUI acceptance, and private 0.5.0-rc evidence collection.
