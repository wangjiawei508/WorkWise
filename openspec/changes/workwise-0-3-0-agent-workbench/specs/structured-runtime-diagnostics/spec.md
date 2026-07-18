## ADDED Requirements

### Requirement: Runtime work emits structured spans
WorkWise SHALL record versioned redacted spans for task, turn, model, tool, MCP, child, Shell, validation, and document-engine phases with duration, routing, usage, retry, resource, and typed error data.

#### Scenario: Task stalls
- **WHEN** the task controller enters stalled state
- **THEN** diagnostics identify the last progress, retry/replan counts, blocking reason, and available recovery actions

### Requirement: Diagnostics protect user content and secrets
WorkWise MUST NOT persist prompt bodies, document bodies, tokens, raw authorization headers, or unrestricted absolute paths in default diagnostic spans.

#### Scenario: Tool call contains a credential
- **WHEN** a tool argument or error includes a recognized secret
- **THEN** the stored and displayed span replaces it with a redaction marker

### Requirement: Diagnostic detail follows conversation mode
WorkWise SHALL show aggregate status in concise mode, semantic spans in standard mode, and redacted operational spans in developer mode, with explicit user action required to export a bundle.

#### Scenario: User switches to developer mode
- **WHEN** developer mode is selected
- **THEN** redacted timing and tool details become available without revealing private reasoning
