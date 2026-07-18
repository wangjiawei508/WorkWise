## ADDED Requirements

### Requirement: Conversation visibility has three modes
WorkWise SHALL provide `concise`, `standard`, and `developer` conversation modes, SHALL default to concise, and SHALL persist the global setting with an optional per-task override.

#### Scenario: User runs a tool-heavy task in concise mode
- **WHEN** tools produce commands, scripts, arguments, and output
- **THEN** the main conversation shows semantic progress while raw technical details remain in the work-details drawer

### Requirement: Private reasoning is not rendered
WorkWise MUST NOT display private chain-of-thought in any mode and SHALL expose only runtime-generated semantic summaries and redacted operational evidence.

#### Scenario: Model streams reasoning deltas
- **WHEN** the runtime receives internal reasoning events
- **THEN** the renderer excludes their verbatim content from all conversation modes

### Requirement: Protected information remains actionable
WorkWise SHALL show approvals, security warnings, failures, file changes, user-input requests, and artifact actions regardless of the selected visibility mode.

#### Scenario: An approval is required in concise mode
- **WHEN** a running task needs approval
- **THEN** an actionable approval card appears in the main conversation

### Requirement: Progress is compact and deduplicated
WorkWise SHALL merge repeated progress into a current semantic status and SHALL keep completed technical details collapsed by default.

#### Scenario: A fourteen-slide deck is generated
- **WHEN** multiple execution events update slide progress
- **THEN** the conversation updates one concise progress item rather than appending repetitive tool messages
