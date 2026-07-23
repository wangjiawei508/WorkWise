## ADDED Requirements

### Requirement: Active-canvas Agent commands
The WorkWise Agent Runtime SHALL send validated Design commands to the active document instead of writing disconnected workspace SVG files.

#### Scenario: Agent adds a shape
- **WHEN** an authorized Agent requests a shape for the active workspace and document revision
- **THEN** the renderer adds it to the active page, records history, persists it, and acknowledges the resulting revision

#### Scenario: No active Design document
- **WHEN** an Agent issues a canvas mutation without an active matching document
- **THEN** the command fails explicitly and does not create an unrelated artifact

### Requirement: Safe replay and conflict handling
Design commands SHALL carry workspace, document, expected revision, and idempotency identifiers.

#### Scenario: Duplicate command delivery
- **WHEN** the same idempotency key is delivered twice
- **THEN** WorkWise applies the mutation at most once and returns the prior acknowledgement

#### Scenario: Stale command
- **WHEN** the expected document revision does not match the active revision
- **THEN** WorkWise rejects the command and reports the current revision for replanning

### Requirement: Honest Design assistant state
The Design assistant rail SHALL show semantic progress, approval or failure, and resulting canvas changes without exposing private reasoning or claiming availability when the command bridge is offline.

#### Scenario: Bridge unavailable
- **WHEN** the runtime command bridge is unavailable
- **THEN** the assistant rail disables submission and displays an actionable connection message
