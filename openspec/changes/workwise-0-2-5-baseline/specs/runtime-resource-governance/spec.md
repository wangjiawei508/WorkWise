## ADDED Requirements

### Requirement: Runtime resources have immutable hard ceilings
Requests, attachments, SSE, model streams, tools, Turns, background processes, and caches SHALL enforce the 0.2.5 resource ceiling contract and user configuration SHALL only reduce those values.

#### Scenario: Resource crosses a ceiling
- **WHEN** a request or running operation exceeds a hard ceiling
- **THEN** it is rejected or terminated with `payload_too_large` or `resource_limit` without crashing the application

### Requirement: Effective limits are observable
Runtime diagnostics SHALL expose the effective resource limits used by the current process.

#### Scenario: Diagnostics query
- **WHEN** the renderer requests runtime information
- **THEN** the response includes a validated `RuntimeResourceLimitsV1` snapshot

### Requirement: Replay overflow resynchronizes safely
SSE replay SHALL be bounded and SHALL instruct the renderer to load a thread snapshot when the replay window is exceeded.

#### Scenario: Cursor is older than replay window
- **WHEN** replay would exceed its event or byte ceiling
- **THEN** WorkWise emits `replay_reset` and resumes after the renderer loads the latest thread sequence without duplicate messages
