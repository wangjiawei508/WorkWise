## ADDED Requirements

### Requirement: Agent profiles are versioned and scoped
WorkWise SHALL provide immutable General, Explore, Review, and Research profiles and SHALL load valid custom profiles from global and workspace Markdown files with workspace precedence.

#### Scenario: Workspace defines a custom profile
- **WHEN** a valid profile exists under `.workwise/agents`
- **THEN** it is available only in that workspace with an effective-permission preview

#### Scenario: Profile is invalid
- **WHEN** profile frontmatter or policy validation fails
- **THEN** WorkWise quarantines it from execution and reports a diagnostic

### Requirement: Agent permissions are bounded
An Agent's effective tool, MCP, model, and permission policy SHALL be the intersection of its profile and the containing workspace trust level.

#### Scenario: Explore Agent runs in a trusted workspace
- **WHEN** Explore is selected in a workspace that permits writes
- **THEN** Explore remains read-only

### Requirement: Child agents are persistent task children
WorkWise SHALL enable bounded child-agent execution with parent linkage, independent budget accounting, provider inheritance by default, cancellation, detach, and restart recovery.

#### Scenario: Parent restarts with child work active
- **WHEN** WorkWise restarts during an idempotent child task
- **THEN** the child is reconciled and its eventual result is attached to the parent task once
