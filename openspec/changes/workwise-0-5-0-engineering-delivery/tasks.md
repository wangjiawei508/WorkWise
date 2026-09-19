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

## D-04 product naming compatibility

- [x] Apply the WorkWise / Survey / RAILWISE Survey naming boundary to new user-visible workbench and project-thread labels; preserve package, bundle, updater, API, route, storage, and `domain: "engineering"` compatibility identifiers with regression coverage.

## Canonical survey adjustment

- [x] Add canonical metre/radian unit metadata to adjustment results, per-observation residuals, closures, UI and DOCX/PDF/XLSX evidence, including non-destructive legacy-read compatibility.
- [x] Extract the single canonical matrix/WLS kernel with rank, condition, covariance, residual, precision, convergence and dimension-limit diagnostics.
- [x] Implement and verify independent leveling/height-control and ordered traverse strategies, including route-length/variance weights and angular/coordinate closures.
- [x] Implement and verify independent iterative plane-control and angle-network triangulation strategies; reject distance-only triangulation and malformed angle geometry.
- [x] Implement and verify CPIII free-station/resection with fixed-target geometry, station orientation parameters, slope/zenith processing and height evidence.
- [x] Implement and verify GNSS vector-baseline/covariance/fixed-datum adjustment, with stable blockers for incomplete scalar or covariance-free data.
- [x] Implement and verify coordinate transformation strategies for 2-D similarity, 3-D seven-parameter estimation/application, Gauss-Kruger conversion and height fitting without identity fallback.
- [x] Implement deformation epoch comparison for dX/dY/dH, settlement, horizontal displacement, tilt, convergence, rate and trend from immutable deterministic results.
- [x] Replace generic multi-network fixtures with independent golden and negative fixtures for every supported strategy and record the approved reference calculation/source.

## Verification

- [x] Add unit, Runtime integration, Flow, renderer, artifact, and migration tests.
- [x] Complete pinned-commit, file-hash, redistribution-license, script, dependency, network, credential and real-scenario audit for every bundled specialist Skill; exclude blocked assets without touching user copies.
- [x] Close the remaining 0.3.3 and specialist-skill acceptance tasks without modifying user data.
- [ ] Run typecheck, lint, full tests, build, strict OpenSpec validation, packaged GUI acceptance, and private 0.5.0-rc evidence collection.

## Professional survey source formats

- [x] Add versioned source-file, format-detection, raw-record anchor, parser/converter provenance, diagnostics, and import-disposition contracts; persist them without rewriting existing networks.
- [x] Implement the bounded `SurveyFormatRegistry`, content-signature conflict handling, canonical-unit contracts, and safe archive-only/blocking dispositions without promoting an unverified vendor format to adjustment-ready.
- [x] Implement and independently validate native Leica GSI-8/GSI-16/HeXML, Trimble JobXML/JXL/M5/DAT, TDS/Carlson RAW/RW5, Sokkia SDR2x/SDR33, and LandXML drivers against licensed or synthetic golden fixtures before any format can become adjustment-ready.
- [x] Implement and independently validate GNSS RINEX 2/3/4, compressed/Hatanaka wrapper, SINEX, NMEA, RTCM 2/3, SP3/IONEX/ANTEX, u-blox UBX, NovAtel OEM, Septentrio SBF, BINEX, Javad JPS, Topcon TPS, South STH, Hi-Target ZHD, CHCNAV HCN, and ComNav CNB inspection/import states; require datum-bound baseline vectors and covariance before GNSS adjustment.
- [x] Complete the deterministic local-converter chain for Trimble T01/T02/T04/JOB, Leica DBX/MDB, and Survey Pro databases: accept only locally user-supplied, allowlisted sandboxed converters; retain both source hashes and provenance; do not bundle vendor binaries or reverse-engineer opaque formats; and apply normal parser, semantics, units, datum, topology, closure, precision, and traceability gates to converted output without a manufacturer-authorization requirement.
- [x] Add the professional import preflight UI, format/readiness filters, raw-record and diagnostic views, accessible recovery actions, and replace the CSV/XLSX/JSON-only survey copy and file picker.
- [ ] Add redistributable or synthetic format fixtures for every advertised vendor/receiver family, parser golden/negative tests, decompression-bomb and malformed-record limits, Runtime/UI/artifact provenance tests, and real-project production acceptance: at least two P0 measurement formats must run import -> preflight -> deterministic adjustment -> DOCX/PDF/XLSX/manifest in the packaged candidate, with closure/precision comparison evidence. Do not treat a source as accepted merely because its vendor family is named.

## RAILWISE AI / Survey convergence baseline (2026-09-19)

The user-provided consolidated plan supersedes the earlier D-04 platform naming and AI-only first-screen design. Historical checkmarks above describe the earlier scope, not completion of this baseline.

- [ ] Complete six typed engineering jobs, non-destructive legacy mapping, editable task context (datum, grade, standard version/clause), and migration integration tests.
- [ ] Complete four production stages, persistent AI conversation, stage tools, localized summary and readiness-driven actions; never label preview files reviewed.
- [ ] Verify ordinary questions, modification confirmation cards, typed execution approvals, evidence-to-record navigation and model-offline manual operation.
- [ ] Centralize RAILWISE AI / RAILWISE Survey display naming, migrate menus/settings/startup/about/candidate display and brand assets; retain technical identifiers and record the migration matrix.
- [ ] Complete Survey English/Chinese locale validation, theme/window/accessibility acceptance in the exact packaged candidate.
- [ ] Complete current-head desktop and Runtime tests, lint, typecheck, build and strict specification validation with separate command evidence.
- [ ] Complete candidate signing/notarization, isolated install, two P0 format GUI delivery runs, restart and real private updater round trip; obtain human UI/professional confirmation.
- [ ] P1 after P0 acceptance: versioned standards and GB/T 24356-2023 quality chain, residual-to-record navigation, replay/signatures, advanced adjustment methods and second-batch format admission.
- [ ] P2 after P0 acceptance: GeoCOM, coordinate/engineering expansion, DXF/point clouds/3D, outward MCP, audited binary converters, Survey/Write/Design/Flow collaboration.
- [ ] Record measured production metrics (traceable projects, first-result time, import success, 30-minute leveling workflow, reproducibility, provenance and one-click evidence questions).
