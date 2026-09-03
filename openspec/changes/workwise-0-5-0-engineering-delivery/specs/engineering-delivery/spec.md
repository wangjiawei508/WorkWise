## ADDED Requirements

### Requirement: AI-first engineering sessions

The Runtime and renderer MUST provide one primary Engineering AI thread per `workspace + project`, using the existing thread persistence, ChatState, SSE, attachment, and message restoration path. Engineering views MUST filter by `domain=engineering` and exact `projectId`; Code, Write, Design, Flow, and IM threads MUST NOT appear in the Engineering list or receive Engineering context.

#### Scenario: Open a project

- **WHEN** a user opens an existing Engineering project
- **THEN** the app selects or idempotently creates its Engineering AI thread, restores its messages, and shows the AI command center as the first surface

#### Scenario: Switch from Design or Code

- **WHEN** a user switches from Design or Code to Engineering and back
- **THEN** each route restores its own selected thread and timeline without moving, duplicating, or mixing messages

#### Scenario: Legacy thread metadata

- **WHEN** an old thread has no `domain` or `projectId` fields
- **THEN** it remains readable through the existing detail path and is not silently migrated into an Engineering project list

### Requirement: Typed plans and approvals

The Runtime MUST turn a non-empty Engineering goal into a bounded, versioned `EngineeringRunPlanV1` before any tool side effect. A plan step MUST use an allowlisted tool and explicit risk, dependencies, input hashes, and approval state. Read steps MAY be batch-approved; write/export/threshold/archive steps MUST require separate approval tokens bound to plan revision and context hash.

#### Scenario: Malformed or unsafe plan

- **WHEN** the provider returns empty, malformed, cyclic, unknown-tool, or unapproved plan content
- **THEN** the Runtime stores the response for user-visible recovery, returns a typed `engineering_plan_invalid`/`engineering_model_malformed` error, and executes zero steps

#### Scenario: Stale approval

- **WHEN** an approval token is replayed, expired, or references a previous plan/context revision
- **THEN** the Runtime rejects it with a stable approval error and leaves all side effects untouched

### Requirement: TaskRun is the only execution carrier

Engineering AI MUST enqueue approved work through `TaskController`, persist status in `TaskRunRepository`, and execute through `AgentLoop`. `EngineeringService` MUST remain deterministic data/artifact logic and MUST NOT create a second queue or mark an AI run completed outside TaskRun terminal handling.

#### Scenario: Cancel and resume

- **WHEN** a user cancels or resumes a run
- **THEN** the same TaskRun transitions through the existing cancellation/checkpoint path, emits deduplicable events, and resumes only from a valid checkpoint and revision

#### Scenario: Duplicate submission

- **WHEN** the same `inputHash + planHash + idempotencyKey` is submitted twice
- **THEN** the original TaskRun and outputs are returned without duplicate work or files

### Requirement: Deterministic monitoring dataset import
The Runtime MUST import CSV and XLSX attachments through the managed Attachment Store, support canonical RailWise fields and explicit user mappings, preserve unknown columns, and return source hashes and row provenance.

#### Scenario: Valid CSV import
- **WHEN** a user imports a UTF-8 CSV with project, point, timestamp, value, unit, and threshold fields
- **THEN** the Runtime stores a versioned dataset and normalized observations without sending raw rows to a model

#### Scenario: Invalid data
- **WHEN** rows contain missing identifiers, invalid numbers, duplicate observations, out-of-order timestamps, unit conflicts, or missing required thresholds
- **THEN** the Runtime returns structured findings with severity, row references, and blocking status

### Requirement: Reviewable analysis and deliverables
The Runtime MUST produce deterministic analysis, chart artifacts, DOCX/PDF reports, XLSX evidence packages, citations, and an immutable manifest tied to input hashes.

#### Scenario: Finalize reviewed report
- **WHEN** blocking findings are resolved and warnings are acknowledged
- **THEN** the Runtime validates outputs, records hashes and citations, and finalizes a new immutable deliverable manifest

#### Scenario: Blocking review
- **WHEN** a blocking finding remains unresolved
- **THEN** finalization is rejected and no deliverable is marked complete

### Requirement: Independent deterministic survey strategies

The Runtime MUST use one canonical numerical kernel for matrix operations, weighted least squares, rank and condition diagnostics, covariance propagation, standardized residuals and precision assessment. Leveling/height control, traverse, plane control, triangulation, CPIII free-station/resection, GNSS baselines and coordinate transforms MUST each have a typed validator and observation model. A strategy MUST NOT return a successful result by passing unsupported observations to a generic plane-network fallback.

#### Scenario: Incomplete specialized network

- **WHEN** a traverse lacks angular observations, a triangulation lacks valid station/left/right angle geometry, CPIII lacks at least three fixed targets and orientation observations, or GNSS lacks vector/covariance/datum data required by its selected calculation
- **THEN** the Runtime returns a stable blocking finding for that strategy and produces no apparently successful adjustment

#### Scenario: Reproducible specialized result

- **WHEN** a complete fixture for a supported network is adjusted
- **THEN** the Runtime returns the strategy ID, algorithm version, degrees of freedom, residuals, covariance/precision diagnostics and fixed expected numeric results independently verified against an approved reference calculation

### Requirement: Canonical adjustment units

The Runtime MUST normalize coordinates, heights, corrections, displacements and linear residuals to metres; direction and angle residuals to radians; relative closures and variance factors to dimensionless values; and standardized residuals to sigma multiples. Unit metadata MUST be present in new results and deliverables. Legacy results MUST remain readable through a non-destructive read adapter that infers only unambiguous units.

#### Scenario: Mixed plane observations

- **WHEN** one adjustment contains distance and angle/direction observations
- **THEN** each residual retains its own `m` or `rad` unit and the Runtime does not combine unlike dimensions into one residual norm

#### Scenario: Legacy adjustment result

- **WHEN** an existing stored adjustment lacks the new unit fields
- **THEN** the Runtime supplies compatible canonical units in the response without rewriting the stored record or user database

### Requirement: Audited specialist Skills

Only specialist Skills with a pinned source commit, file hashes, compatible redistribution license, reviewed scripts, network and credential permissions, dependency validation and a passing real-scenario test MUST be included in the packaged catalog. Existing user Skills, MCP configuration and credential references MUST remain untouched.

#### Scenario: Unreviewed or restricted Skill

- **WHEN** a bundled surveying, monitoring, tender, standards or report Skill lacks any required provenance, license, permission or test evidence
- **THEN** it remains visible as blocked with the exact reason and is excluded from the package without deleting or overwriting a user-installed copy

### Requirement: Explicit UI states and classic fallback

The Engineering UI MUST show project/thread scope, goal input, attachment boundary, typed plan, approvals, TaskRun timeline, evidence cards, report/artifact previews, and Copilot next actions. It MUST render loading, empty, partial, error, success, stale, and model-unavailable states with a recoverable action. The classic deterministic console MUST remain reachable without replacing or duplicating the AI thread.

#### Scenario: No project or no runtime

- **WHEN** the user opens Engineering without a project or while Runtime is offline
- **THEN** the UI explains the missing prerequisite, keeps typed input/attachments intact, and offers create-project or classic-console/retry actions without a blank surface

#### Scenario: Narrow window and theme

- **WHEN** the app runs in light/dark mode or supported narrow widths
- **THEN** the three-column surface collapses predictably, remains readable with 1px separators and opaque work surfaces, and exposes keyboard and accessible labels

### Requirement: Safe compatibility
The implementation MUST preserve legacy attachment records, tool IDs, Skills, MCP configuration, credentials, and user files, and MUST use revision and idempotency checks for mutations.

#### Scenario: Repeated request
- **WHEN** the same mutation is submitted with the same idempotency key
- **THEN** the original result is returned without duplicate datasets, runs, or files
