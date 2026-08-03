## ADDED Requirements

### Requirement: Flow is a default-visible Preview workspace
WorkWise SHALL expose a `flow` main route and sidebar entry by default, label it Preview, and use `@xyflow/react` v12 for a controlled visual editor with custom nodes, zoom, box selection, minimap, and keyboard operations.

#### Scenario: User opens Flow
- **WHEN** the user selects Flow from the sidebar
- **THEN** WorkWise opens the Preview Flow workspace without requiring a feature flag

#### Scenario: User opens Scheduled tasks
- **WHEN** the user selects the legacy Scheduled tasks entry
- **THEN** WorkWise opens Flow with the scheduled-Flow filter active

### Requirement: Flow definitions and runs are versioned and durable
The Runtime SHALL persist versioned Flow definitions, nodes, edges, variables, immutable published versions, runs, node runs, events, trigger state, and credential references in SQLite.

#### Scenario: Published Flow is edited
- **WHEN** a user edits a Flow after publication
- **THEN** existing runs continue referencing the immutable published snapshot and the edits remain a new draft revision

#### Scenario: Concurrent draft update uses a stale revision
- **WHEN** a client saves a Flow with an outdated expected revision
- **THEN** the Runtime rejects the update with a revision conflict and preserves the newer draft

### Requirement: Flow exposes a complete capability-aware node catalogue
The node registry SHALL include manual, schedule, Webhook, Feishu, WeChat, Agent, subagent, knowledge retrieval, classification, parameter extraction, HTTP, restricted code, condition, Switch, Merge, Loop, Parallel, human approval, alert confirmation, DOCX, XLSX, PDF, PPTX, publish, archive, image, speech, music, video, OfficeCLI, Lark CLI, and ego-browser nodes.

#### Scenario: Required external capability is missing
- **WHEN** a catalogue node depends on an unconfigured account, model, CLI, or capability
- **THEN** the node remains visible but disabled with a precise reason and configuration route

#### Scenario: Flow depends on an unavailable node
- **WHEN** publication validation finds an enabled node whose capability is unavailable
- **THEN** publication is rejected and identifies that node and missing capability

### Requirement: Flow connections are strongly typed
Flow ports SHALL support string, number, boolean, JSON, table, file, document, image, and Agent message types and SHALL accept only identical types or explicitly registered conversions.

#### Scenario: Compatible ports are connected
- **WHEN** the user connects ports with the same type or an allowed conversion
- **THEN** the editor accepts the edge and persists its source and target ports

#### Scenario: Incompatible ports are connected
- **WHEN** the user attempts a connection with no declared conversion
- **THEN** the editor and Runtime validator reject the edge before publication

### Requirement: Flow publication performs deterministic validation
Before publication the Runtime SHALL validate graph structure, unique identifiers, reachability, trigger placement, required ports and bindings, required configuration, capability availability, policy values, loop boundaries, illegal cycles, and recursive Flow invocation.

#### Scenario: Unbounded or illegal cycle exists
- **WHEN** a graph cycle is not bounded by exactly one configured Loop node
- **THEN** publication fails with an illegal-cycle issue

#### Scenario: Flow is valid
- **WHEN** all structural, configuration, type, capability, recursion, and loop checks pass
- **THEN** the Runtime creates a hashed immutable published version and activates its triggers

### Requirement: Nodes support configurable execution policy and bindings
Every executable node SHALL support variable or literal input binding, timeout, retry attempts and backoff, error behavior, concurrency limit, resumability, and relevant model/provider selection.

#### Scenario: Node fails transiently
- **WHEN** a retryable node attempt fails before its configured maximum
- **THEN** the Runtime records the failed attempt, waits the configured backoff, and retries without losing prior event history

#### Scenario: Node exceeds timeout
- **WHEN** node execution exceeds its configured timeout
- **THEN** the Runtime aborts the attempt and records a timeout failure that can follow the configured error path

### Requirement: Flow execution is checkpointed and controllable
The Runtime SHALL record per-node states and bounded inputs/outputs, support cancellation, breakpoints, approval waits, retry from a failed node, and restart recovery only for nodes declared resumable.

#### Scenario: Application exits during active execution
- **WHEN** WorkWise shuts down while a Flow node is active
- **THEN** the Runtime checkpoints the run, marks active work interrupted, and resumes only declared-resumable nodes after restart

#### Scenario: User retries from a failed node
- **WHEN** the user selects retry from a failed node
- **THEN** that node and its downstream nodes are reset while completed upstream results remain available

#### Scenario: Approval node waits
- **WHEN** execution reaches a human approval or alert confirmation node
- **THEN** the run pauses durably until an authorized approve or reject decision is recorded

### Requirement: Flow supports testing and auditable history
The Flow workspace SHALL support Mock input, single-node testing, full runs, per-node input/output inspection, run history, failure continuation, approval actions, and redacted export.

#### Scenario: User tests one node
- **WHEN** the user supplies valid Mock JSON and selects single-node test
- **THEN** only the selected node adapter executes under its normal capability and resource policy and returns bounded output

#### Scenario: User exports a Flow
- **WHEN** a Flow definition is exported
- **THEN** secrets, tokens, absolute paths, and local attachment contents are removed while placeholders, relative resources, and capability requirements remain

### Requirement: Published Flow can be invoked through the existing Runtime
The Runtime SHALL expose authenticated Flow CRUD, validation, publication, execution, cancellation, recovery, history, approval, and trigger routes and SHALL expose published Flow through one guarded `run_flow` Agent tool.

#### Scenario: Agent invokes a published Flow
- **WHEN** `run_flow` receives an authorized published Flow identifier and bounded input
- **THEN** the Runtime starts the Flow using the same Agent Runtime, workspace policy, approvals, and invocation stack

#### Scenario: Flow invocation is recursive
- **WHEN** a Flow calls itself directly or indirectly or invocation depth would exceed three
- **THEN** the Runtime rejects the invocation before starting another run

### Requirement: Webhook triggers are authenticated and replay-resistant
Webhook triggers SHALL use random per-trigger credentials in system safe storage, timestamped HMAC, timing-safe comparison, a five-minute replay window, persistent nonce rejection, a limit of 60 requests per minute per trigger, and a 1 MiB body limit.

#### Scenario: Valid Webhook request arrives
- **WHEN** a request has a valid timestamp, unique nonce, HMAC, size, and rate budget
- **THEN** the Runtime starts the matching published Flow and records the nonce and trigger event

#### Scenario: Webhook request is replayed or oversized
- **WHEN** a nonce was already accepted, the timestamp is outside the window, or the body exceeds 1 MiB
- **THEN** the Runtime rejects the request without executing the Flow

### Requirement: Restricted code executes in an isolated bounded process
The code node SHALL run in a separate process, accept and return JSON only, disable network and arbitrary filesystem access by default, and enforce source, protocol, time/CPU, and memory limits.

#### Scenario: Code requests no extra authority
- **WHEN** JSON-only code stays within configured resource limits and uses no forbidden capability
- **THEN** the child process returns bounded JSON output to the Flow executor

#### Scenario: Code requests additional authority
- **WHEN** code requests network or filesystem access
- **THEN** WorkWise requires explicit existing approval and fails closed if the restricted runner cannot enforce the approved scope
