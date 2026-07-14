## ADDED Requirements

### Requirement: Spawn failures are contained and actionable
Managed process creation SHALL validate the executable and working directory, register only successfully spawned processes, and release all resources after EPERM, ENOENT, abort, or exit.

#### Scenario: Windows cwd is unavailable
- **WHEN** a requested working directory is missing or inaccessible
- **THEN** WorkWise uses a validated workspace or user-home fallback, or reports a structured error without leaving a session

### Requirement: Review targets a contained repository
Code review SHALL support a selected nested Git repository root contained by the workspace and SHALL run all Git queries relative to that root.

#### Scenario: Workspace contains nested repositories
- **WHEN** the active file belongs to a nested repository
- **THEN** review uses that repository and does not mix parent or sibling changes

### Requirement: Approval and Skill UI reflects current runtime state
Terminal Turns SHALL expire pending approval cards, and Skill catalog changes SHALL refresh the slash-command catalog using a generation snapshot.

#### Scenario: Skill installed while composer is open
- **WHEN** a Skill install increments the catalog generation
- **THEN** reopening or refreshing the slash menu shows the new Skill and the next Turn uses the same generation
