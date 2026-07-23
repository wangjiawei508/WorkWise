## ADDED Requirements

### Requirement: Workspace-scoped durable Design documents
WorkWise SHALL store Design documents only under the canonical active workspace and SHALL restore the last valid document after application restart.

#### Scenario: Autosave and restart
- **WHEN** a user edits a Design document and the autosave flush succeeds
- **THEN** reopening the same workspace restores the document, active page, elements, and revision

#### Scenario: Workspace switch
- **WHEN** the user switches to a different workspace
- **THEN** WorkWise SHALL not load or overwrite Design documents belonging to the previous workspace

### Requirement: Atomic revisioned writes
WorkWise SHALL validate Design documents and use atomic, revision-checked persistence without replacing a newer or valid file on failure.

#### Scenario: Stale renderer save
- **WHEN** a renderer submits a save with an outdated expected revision
- **THEN** WorkWise rejects it as stale and returns the current revision

#### Scenario: Interrupted write
- **WHEN** a save is interrupted before atomic replacement completes
- **THEN** the previous complete Design document remains recoverable

### Requirement: Corrupt document recovery
WorkWise SHALL preserve invalid persisted files and present a recoverable error instead of silently discarding user content.

#### Scenario: Invalid JSON document
- **WHEN** a saved Design document cannot be parsed or validated
- **THEN** WorkWise leaves the file unchanged and allows the user to start a new document
