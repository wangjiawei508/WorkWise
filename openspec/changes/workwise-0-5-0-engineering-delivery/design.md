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

New numeric results use canonical metres and radians with per-closure and per-residual unit metadata. Read compatibility parses old result JSON and adds only deterministic defaults in memory; it does not persist a silent migration. Reports and evidence sheets explicitly label dimensionless `sigma0`/variance factors, linear precision, angular residuals and relative closures.

## Upstream policy

RAILWISE-CLI is the source for reviewed monitoring tools and Skills. `railwise-desktop` is reference-only. Sync uses a pinned commit manifest and allowlisted `.railwise/skill`, `.railwise/tool`, schema, and documentation paths. Existing WorkWise asset IDs, user Skills, MCPs, credentials, and data remain compatible and untouched.

Bundled specialist assets pass a generated provenance manifest before packaging. The manifest records repository, pinned commit, path hashes, license, scripts, dependencies, network and credential permissions, test evidence and package decision. Missing evidence is a blocking state, not an implicit approval.

## API and events

Add local-authenticated `GET/POST /v1/engineering/ai/threads`, `POST /v1/engineering/ai/plans`, `PATCH /v1/engineering/ai/plans/:id`, `POST .../validate`, `POST .../approve`, `POST .../start`, `GET /v1/engineering/ai/runs/:id`, cancel/resume, events with `Last-Event-ID`, context/evidence reads, and Watch rule routes. Existing deterministic project/dataset/analysis/chart/report routes remain compatible. Mutations require `expectedRevision` and `idempotencyKey`; duplicate keys replay the original result and stale revisions return `409 engineering_revision_conflict`.

The AI plan route uses the active provider/model and never changes credentials or model settings. If the provider cannot produce a typed plan or lacks required tool/vision capability, the run becomes `needs_attention` with a retry or classic-console action. No error request is sent to an incompatible model.
