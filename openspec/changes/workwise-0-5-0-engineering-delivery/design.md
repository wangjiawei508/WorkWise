## Architecture

WorkWise Electron remains the only desktop shell and Kun remains the only Agent Runtime. Engineering is a domain-aware view over the existing thread system, not a second chat database. The renderer selects an Engineering thread by `domain + projectId`; `ChatState` owns its blocks, live deltas, queued messages, approvals, and restoration exactly as it does for Code and Design.

```text
Workbench route
  -> engineering thread selector (domain/project filter)
  -> existing ChatState + SSE + attachment store
  -> Engineering AI routes (context/plan/approval)
  -> TaskController -> TaskRunRepository -> AgentLoop
  -> allowlisted railwise.* tools -> EngineeringService
  -> evidence cards -> report/artifact validators -> immutable manifest
```

The seven-page deterministic console stays lazy-loaded as a compatibility panel. It reads the same EngineeringService records and never owns a second AI conversation or queue. Originals stay in Attachment Store; project/run metadata stays in `.workwise/engineering`; generated files stay in `.workwise/deliverables/<projectId>/<runId>`.

## Naming and compatibility boundary

D-04 separates product naming from compatibility-sensitive implementation identifiers. User-facing platform references remain `WorkWise`; the fifth workbench is shown as `Survey` or `WorkWise Survey`; and `RAILWISE Survey` is reserved for commercial-distribution surfaces. New default project-thread titles use `Survey AI`, while an existing persisted title remains unchanged and is never rewritten by a display migration.

The naming update does not rename the package, bundle ID, updater/feed, Runtime API paths, route IDs, persisted storage locations, or the thread `domain: "engineering"` discriminator. This keeps 0.4.x records and the 0.5.0 upgrade chain readable while allowing the visible workbench identity to evolve independently.

## Contracts

Add `EngineeringAiThreadMetaV1`, `EngineeringContextSnapshotV1`, `EngineeringRunPlanV1`, `EngineeringEvidenceCardV1`, `EngineeringApprovalV1`, and `EngineeringWatchRuleV1` under `kun/src/contracts/engineering-ai.ts`. Additive thread fields are `domain` (`code | write | design | engineering | flow | claw`) and optional `projectId`; old records parse with `domain` omitted and continue to behave as Code/primary threads.

Keep the existing deterministic contracts `RailwiseProjectV1`, `MonitoringDatasetV1`, `MonitoringObservationV1`, `QualityFindingV1`, `MonitoringAnalysisV1`, `ChartArtifactV1`, `KnowledgeCitationV1`, and `DeliverableManifestV1`. Reuse `TaskRunV1`, `FlowRunV1`, `RuntimeSpanV1`, and artifact validators. All new records have `schemaVersion: 1`; unknown fields are retained on read and invalid writes are rejected.

## Data flow and state

```text
goal + attachments
  -> bounded ContextSnapshot (40k chars / 200 rows / 20 doc fragments)
  -> draft Typed Run Plan (no side effects)
  -> validate (allowlist, dependencies, revision, model capability)
  -> approve read steps in batch; approve write/export/threshold/archive individually
  -> TaskRun queued/running; each step emits evidence.created
  -> report preview + artifact validation
  -> human review -> immutable manifest/archive
```

Engineering status is projected from the one TaskRun: `draft`, `validating`, `awaiting_approval`, `queued`, `running`, `needs_attention`, `stale`, `completed`, `failed`, `cancelled`. Forbidden transitions (`completed/cancelled/stale -> running`) are rejected. A changed project, dataset, analysis, or citation revision invalidates the context hash and makes a plan stale; replanning creates a new plan revision instead of mutating an old run.

Models may write narrative text only. Numeric values, thresholds, warning states, citations, hashes, and artifact paths come from structured Runtime output. Missing thresholds are “待确认” and block finalization when required. Files are untrusted input; text in a CSV, document, or image can never create a tool call.

## Survey numerical kernel and strategies

`kun/src/engineering` owns the only executable survey-math kernel. It provides bounded dense/sparse matrix primitives, weighted least-squares and constrained solves, rank/condition diagnostics, covariance propagation, normalized residuals, cancellation checkpoints and deterministic hashing. Agent Pack tools and `railwise.*` aliases become adapters to this kernel; copied tool-local matrix implementations are not authoritative.

Each supported network has its own typed strategy boundary:

- leveling/height control builds height-difference equations and uses inverse route-length or supplied variance weights;
- traverse validates an ordered traverse, angular control and distance observations before solving coordinates and reporting angular/coordinate closure;
- plane control builds distance, absolute-direction and station/left/right angle equations and iterates to convergence;
- triangulation requires angle-network geometry and uses angle equations rather than accepting arbitrary distance-only input;
- CPIII free-station/resection solves station coordinates, height where supported and one orientation parameter per occupied station from fixed CPIII targets;
- GNSS uses baseline vector components and covariance against a fixed datum, and blocks scalar or covariance-free data when it cannot support the selected result;
- coordinate transform distinguishes 2-D similarity, 3-D seven-parameter and height-fit inputs and reports the actual solved parameterization;
- deformation results are derived from immutable adjusted epochs and never from model-authored numbers.

Shared matrix code is allowed; shared strategy validation or an observation-model fallback is not. Every strategy is accepted only through a golden fixture with independent expected values and negative fixtures for incomplete, singular and unsupported data.

## Professional survey-format pipeline

Professional source ingestion is a separate boundary before network validation:

```text
Attachment Store original
  -> bounded magic/header/archive sniffing
  -> SurveyFormatRegistry driver
  -> raw-record ledger + diagnostics
  -> normalized point/observation draft
  -> user confirms datum/units/roles
  -> typed network validator
  -> canonical survey-math strategy
```

Drivers expose `detect`, `inspect`, and `normalize` operations and never select a numerical strategy themselves. Detection reads only bounded prefixes, archive entry names, and declared text encodings. The registry resolves extension/content conflicts explicitly and does not pass an unknown file to the delimited parser.

Native drivers are grouped by observation semantics rather than filename alone. P0 covers COSA `.in1/.in2/.NET/.ou`, South DAT with an explicit column/role/unit mapping, and Leica GSI; the wider set covers Leica HeXML; Trimble JobXML/JXL and DiNi/Zeiss M5/DAT; TDS/Carlson RAW/RW5; Sokkia SDR2x/SDR33; Topcon GTS-7/FC-5; Nikon RAW; Spectra Survey Pro; and LandXML. A valid COSA `.in2` may become adjustment-ready when its parsed controls, observations, units, datum and selected strategy are complete. A COSA `.in1` additionally requires its explicit mapping; South DAT never guesses a column order and remains mapping-dependent. Leica GSI may proceed to strategy validation when its record semantics and canonical units are valid, but is blocked until the chosen strategy has adequate fixed controls and geometry. GNSS drivers cover RINEX 2/3/4, SINEX, NMEA, RTCM 2/3, SP3, IONEX, ANTEX, u-blox UBX, NovAtel OEM, Septentrio SBF, BINEX, Javad JPS, Topcon TPS, South STH, Hi-Target ZHD, CHCNAV HCN, and ComNav CNB. Raw GNSS observations/corrections and auxiliary products stop at `gnss-processing-required` unless a separately audited local processing adapter produces datum-bound baseline vectors and covariance. Unverified field-controller dialects stop at `archive-only`. Standard gzip/ZIP and Hatanaka wrappers are expanded with size, nesting, path, and record limits before the inner driver runs.

Opaque Trimble T00/T01/T02/T04/JOB, Leica DBX/MDB, and Spectra Survey Pro database inputs use `SurveyConverterAdapter` rather than reverse-engineered fallback parsing. A locally user-supplied adapter may process the user's local source without a WorkWise manufacturer-authorization gate; it runs with network disabled, bounded time/output, explicit arguments, and hashed input/output. Its output becomes eligible for import only after a deterministic conversion chain records both sources and the normal parser, semantic, unit, datum, topology, closure, precision, and traceability gates succeed. WorkWise does not bundle or redistribute vendor binaries; any future bundled converter package separately requires license and redistribution review. Missing or invalid adapters produce a reviewable blocker while retaining the original attachment.

`SurveySourceFileV1`, `SurveyFormatDetectionV1`, `SurveyImportDiagnosticV1`, and `SurveyRawRecordAnchorV1` carry provenance into the network, evidence package and manifest. Unknown vendor fields are retained in a bounded raw-record payload or sidecar, while numeric values sent to the canonical kernel use explicit metre/radian conversions. The workbench preflight card shows detection, parser/converter identity, readiness and failures before the user can run validation.

New numeric results use canonical metres and radians with per-closure and per-residual unit metadata. Read compatibility parses old result JSON and adds only deterministic defaults in memory; it does not persist a silent migration. Reports and evidence sheets explicitly label dimensionless `sigma0`/variance factors, linear precision, angular residuals and relative closures.

## Upstream policy

RAILWISE-CLI is the source for reviewed monitoring tools and Skills. `railwise-desktop` is reference-only. Sync uses a pinned commit manifest and allowlisted `.railwise/skill`, `.railwise/tool`, schema, and documentation paths. Existing WorkWise asset IDs, user Skills, MCPs, credentials, and data remain compatible and untouched.

Bundled specialist assets pass a generated provenance manifest before packaging. The manifest records repository, pinned commit, path hashes, license, scripts, dependencies, network and credential permissions, test evidence and package decision. Missing evidence is a blocking state, not an implicit approval.

## API and events

Add local-authenticated `GET/POST /v1/engineering/ai/threads`, `POST /v1/engineering/ai/plans`, `PATCH /v1/engineering/ai/plans/:id`, `POST .../validate`, `POST .../approve`, `POST .../start`, `GET /v1/engineering/ai/runs/:id`, cancel/resume, events with `Last-Event-ID`, context/evidence reads, and Watch rule routes. Existing deterministic project/dataset/analysis/chart/report routes remain compatible. Mutations require `expectedRevision` and `idempotencyKey`; duplicate keys replay the original result and stale revisions return `409 engineering_revision_conflict`.

The AI plan route uses the active provider/model and never changes credentials or model settings. If the provider cannot produce a typed plan or lacks required tool/vision capability, the run becomes `needs_attention` with a retry or classic-console action. No error request is sent to an incompatible model.


## Consolidated plan implementation amendment (2026-09-19)

Display branding comes from src/shared/product-brand.json; it must not change app.setName or production bundle/data identity. taskType is optional on legacy reads and inferred only for recognized historical types. Unknown values remain unclassified and readable. New tasks default to control-network. Optional taskContext carries coordinate/height datum, grade and standard/version/clause, and participates in the existing project revision/context hash boundaries. Four production stages retain internal Tab IDs for compatibility and keep one mounted AI conversation. Candidate output cannot become reviewed merely by containing files.

Acceptance now includes all items in the appended consolidated-baseline task list. Prior test totals or released 0.5.0 evidence do not close the new candidate gate. External acquisition, point-cloud and long-tail-format expansion waits for P0 acceptance; this restriction does not block every P1 implementation task.

## XY error ellipse increment

Algorithm 7 adds `xyErrorEllipse` to solved point results for plane, traverse, triangulation, CPIII and GNSS. The 2×2 block comes directly from the strategy's parameter indices, is scaled by the solver variance factor, and carries explicit units/axis conventions. The old `point.covariance` is preserved with its historical meaning and is never used to infer the new field. Algorithm 6 remains a separately selected, ellipse-free output path for exact replay of existing immutable evidence; algorithms other than the current 7 and retained 6 are not newly admitted. Eigenvalues are computed using normalized symmetric matrices, with a determinant-based minor eigenvalue to reduce cancellation. Equal axes and zero scale have null orientation. This standard ellipse is not a confidence region; GNSS coordinates are not silently projected to ENU. No public app version or storage migration is involved.
