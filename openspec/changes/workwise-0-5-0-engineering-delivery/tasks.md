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

## Canonical survey adjustment

- [x] Add canonical metre/radian unit metadata to adjustment results, per-observation residuals, closures, UI and DOCX/PDF/XLSX evidence, including non-destructive legacy-read compatibility.
- [x] Extract the single canonical matrix/WLS kernel with rank, condition, covariance, residual, precision, convergence and dimension-limit diagnostics.
- [x] Implement and verify independent leveling/height-control and ordered traverse strategies, including route-length/variance weights and angular/coordinate closures.
- [x] Implement and verify independent iterative plane-control and angle-network triangulation strategies; reject distance-only triangulation and malformed angle geometry.
- [x] Implement and verify CPIII free-station/resection with fixed-target geometry, station orientation parameters, slope/zenith processing and height evidence.
- [x] Implement and verify GNSS vector-baseline/covariance/fixed-datum adjustment, with stable blockers for incomplete scalar or covariance-free data.
- [x] Implement and verify coordinate transformation strategies for 2-D similarity, 3-D seven-parameter estimation/application, Gauss-Kruger conversion and height fitting without identity fallback.
- [x] Implement deformation epoch comparison for dX/dY/dH, settlement, horizontal displacement, tilt, convergence, rate and trend from immutable deterministic results.
- [ ] Replace generic multi-network fixtures with independent golden and negative fixtures for every supported strategy and record the approved reference calculation/source.

## Verification

- [x] Add unit, Runtime integration, Flow, renderer, artifact, and migration tests.
- [ ] Complete pinned-commit, file-hash, redistribution-license, script, dependency, network, credential and real-scenario audit for every bundled specialist Skill; exclude blocked assets without touching user copies.
- [ ] Close the remaining 0.3.3 and specialist-skill acceptance tasks without modifying user data.
- [ ] Run typecheck, lint, full tests, build, strict OpenSpec validation, packaged GUI acceptance, and private 0.5.0-rc evidence collection.
