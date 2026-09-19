## ADDED Requirements

### Requirement: AI-first engineering sessions

The Runtime and renderer MUST provide one primary Engineering AI thread per `workspace + project`, using the existing thread persistence, ChatState, SSE, attachment, and message restoration path. Engineering views MUST filter by `domain=engineering` and exact `projectId`; Code, Write, Design, Flow, and IM threads MUST NOT appear in the Engineering list or receive Engineering context.

#### Scenario: Open a project

- **WHEN** a user opens an existing Engineering project
- **THEN** the app selects or idempotently creates its Engineering AI thread, restores its messages, and shows the current production stage with a continuously mounted AI conversation

#### Scenario: Switch from Design or Code

- **WHEN** a user switches from Design or Code to Engineering and back
- **THEN** each route restores its own selected thread and timeline without moving, duplicating, or mixing messages

#### Scenario: Legacy thread metadata

- **WHEN** an old thread has no `domain` or `projectId` fields
- **THEN** it remains readable through the existing detail path and is not silently migrated into an Engineering project list

### Requirement: RAILWISE AI and Survey display naming

The renderer MUST use `RAILWISE AI` for platform references, `RAILWISE Survey` for the professional workbench, and `工程测量内业` / `Engineering Survey Processing` as its subtitle. Main entry labels MUST be 编程 / 内业 or Code / Survey. Shared display branding MUST NOT rename persisted technical identifiers. Existing persisted titles and records MUST remain unchanged unless a user explicitly edits them.

The D-04 naming boundary MUST NOT rename the package name, bundle ID, updater/feed, Runtime API paths, route IDs, storage locations, or thread `domain: "engineering"` discriminator during 0.5.0.

#### Scenario: Create a new Survey project thread

- **WHEN** the user opens a Survey project that has no existing project thread
- **THEN** the renderer creates a `Survey AI` titled thread and persists `domain: "engineering"` with the exact project ID

#### Scenario: Open an existing project thread after the naming update

- **WHEN** the user opens an existing 0.4.x or 0.5.0 project thread
- **THEN** its title, messages, metadata, routes, and storage records remain readable without a rewrite or migration

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

### Requirement: Professional survey source-format ingestion

The Runtime MUST identify survey source files by bounded content signatures before trusting an extension. It MUST maintain a versioned format registry and preserve the original attachment, source hash, vendor, format/version, detection confidence, raw-record locator, parser or converter version, parse diagnostics, and import disposition (`adjustment-ready`, `gnss-processing-required`, `converter-required`, or `archive-only`). Production admission MUST depend on correct parsing, explicit observation semantics and canonical units, completed datum and topology, deterministic strategy validation, closure/precision checks, and traceability; it MUST NOT depend on a manufacturer authorization for processing a user's local data. Unknown bytes or extension/signature conflicts MUST NOT be parsed as a generic delimited table.

P0 ingestion MUST cover COSA `.in1/.in2/.NET/.ou`, South DAT, and Leica GSI-8/GSI-16. A valid COSA `.in2` may be adjustment-ready only after its parsed controls, observations, units, datum and selected strategy are complete. COSA `.in1` MUST require an explicit mapping before it can be adjustment-ready. South DAT MUST require an explicit saved column/role/unit mapping and MUST NOT infer a column order. A valid Leica GSI source MAY enter strategy validation with canonical units and raw-record anchors, but it MUST remain blocked until the selected strategy has sufficient fixed controls and geometry.

Native field-observation import MUST cover Leica GSI-8/GSI-16 and HeXML; Trimble JobXML/JXL and DiNi/Zeiss M5 or recognized DAT; TDS/Carlson RAW/RW5; Sokkia SDR2x/SDR33; and LandXML survey observations. Parsed values MUST retain station/target/backsight/foresight roles, face, set/round, instrument and target heights, units, timestamps, quality flags, source record numbers, and unrecognized vendor fields.

The same registry MUST inspect Topcon GTS-7/FC-5, Nikon RAW, and Spectra Survey Pro sources without trusting their extension. A dialect without independently verified observation semantics MUST remain preserved and blocked rather than being normalized into invented station/target relationships.

GNSS ingestion MUST recognize RINEX 2.x/3.x/4.x observation, navigation, meteorological and clock files, Hatanaka/standard compressed wrappers, SINEX solutions, NMEA 0183 logs, RTCM 2.x/3.x streams, SP3/IONEX/ANTEX products, u-blox UBX, NovAtel OEM, Septentrio SBF, BINEX, Javad JPS, Topcon TPS, South STH, Hi-Target ZHD, CHCNAV HCN, and ComNav CNB receiver sources. Importing a GNSS raw-observation, correction stream, or auxiliary product MUST NOT claim that a baseline network has been adjusted. Only a validated solution/baseline with datum and covariance may enter the GNSS adjustment strategy; otherwise the source is retained with a stable `gnss-processing-required` blocker.

Opaque vendor formats including Trimble T00/T01/T02/T04/JOB, Leica DBX/MDB, and Spectra Survey Pro databases MUST use an allowlisted, locally executed converter whose identity, version, arguments, input hash, output hash, sandbox/network policy, and diagnostics are recorded. A locally user-supplied converter MAY be used for the user's local data without a WorkWise authorization or redistribution prerequisite, but WorkWise MUST NOT bundle a vendor binary or reverse-engineer an opaque proprietary format. A converted output MAY become adjustment-ready only through a recorded two-source conversion chain and the same parser, semantics, units, datum, topology, deterministic strategy, closure, precision, and traceability gates as a native source. Any converter that WorkWise later packages for redistribution separately requires license and redistribution review. If no valid converter is available, the source MUST remain intact and visible with a `converter-required` blocker.

#### Scenario: Leica or total-station source becomes adjustment-ready

- **WHEN** a valid GSI, HeXML, JobXML/JXL, M5/DAT, RAW/RW5, SDR, or LandXML source contains the observations required by the selected network strategy
- **THEN** the Runtime creates normalized points and observations with canonical units and raw-record anchors, shows parser diagnostics, and allows deterministic validation without altering the source file

#### Scenario: P0 COSA or South DAT reaches the production gate

- **WHEN** a valid COSA `.in2`, a mapped valid COSA `.in1`, or a South DAT with an explicit saved mapping provides complete observations for a selected strategy
- **THEN** the Runtime preserves its original records and mapping provenance, applies explicit canonical units and datum/topology validation, and permits adjustment only when deterministic closure and precision checks pass

#### Scenario: Locally converted opaque source is accepted

- **WHEN** a locally supplied, sandboxed converter produces a supported output from an opaque source
- **THEN** the Runtime records the converter and both source hashes, parses the converted output normally, and blocks it unless the same engineering-validity gates required of a native source pass

#### Scenario: GNSS raw data is not a baseline solution

- **WHEN** a user imports RINEX, RTCM, NMEA, T02, or T04 data that has no validated baseline vector covariance and fixed datum
- **THEN** the Runtime classifies and preserves the file, reports the required GNSS processing or converter step, and produces no apparently successful GNSS adjustment

#### Scenario: Extension and content disagree

- **WHEN** a file extension names one supported format but bounded signature inspection identifies another format or cannot identify it safely
- **THEN** the Runtime returns an explicit format-conflict or unknown-format blocker and never falls back to CSV parsing

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

#### Scenario: Professional source preflight

- **WHEN** a user adds a survey instrument or GNSS source file
- **THEN** the workbench shows detected vendor/format/version, confidence, source hash, observation/record summary, adjustment readiness, converter or GNSS-processing requirement, and recoverable diagnostics before enabling validation or adjustment

### Requirement: Safe compatibility
The implementation MUST preserve legacy attachment records, tool IDs, Skills, MCP configuration, credentials, and user files, and MUST use revision and idempotency checks for mutations.

#### Scenario: Repeated request
- **WHEN** the same mutation is submitted with the same idempotency key
- **THEN** the original result is returned without duplicate datasets, runs, or files


### Requirement: Compatible engineering task classification
The Runtime MUST support six explicit task types and optional task context for datum, measurement grade and standard version/clause. Legacy monitoringType records MUST remain readable without storage rewriting or unit changes. Unknown legacy types MUST NOT be silently mapped to deformation. Updates MUST preserve revision and idempotency checks.

#### Scenario: Read a legacy control network
- **WHEN** a control-network project lacks taskType
- **THEN** reads infer control-network without changing stored JSON or monitoring settings

### Requirement: Production stage and review status
The workspace MUST expose four production stages and keep its AI conversation mounted. A preview or draft manifest MUST NOT be shown as reviewed. Blocked source admission MUST take precedence over historical deliverables.

#### Scenario: Draft output exists
- **WHEN** a report preview or a draft manifest contains files
- **THEN** the summary calls it candidate output and retains its actual review status

### Requirement: Exact evidence questions
A question prepared from preflight, observations, residuals, closure, precision or delivery MUST retain its selected evidence reference across page navigation. The read-only conversation tool MUST resolve exact project-scoped observations, raw-record anchors, points and delivery records beyond summary row limits. Supplied network revisions and source hashes MUST be checked. Recorded output metadata MUST NOT be represented as a fresh file-integrity verification.

#### Scenario: Ask about a later observation
- **WHEN** a user selects observation 31 and changes the active page before sending
- **THEN** the selected reference survives, and the tool returns that observation and its corresponding residual and original record rather than the first 20 rows

#### Scenario: Evidence becomes stale or mismatched
- **WHEN** selected revision/hash, observation/anchor or project/delivery identifiers disagree
- **THEN** the read fails explicitly without substituting another record or executing a calculation

### Requirement: Runtime-owned plan effects
Tool risks MUST be derived from the deterministic implementation, not supplied by a model or API caller. Network validation, dataset checks and persisted analysis MUST be treated as writes. Legacy plans with understated risks MUST remain readable but require replanning before approval, start or resume.

#### Scenario: A caller labels export as read-only
- **WHEN** a draft labels report export or a persistent calculation as read-only
- **THEN** the saved plan shows the Runtime-defined export or write risk and resets approval to pending

#### Scenario: An old plan has an understated risk
- **WHEN** an old plan labels a mutating tool read-only
- **THEN** approval, start, resume and the execution allowlist reject it without rewriting the stored record
