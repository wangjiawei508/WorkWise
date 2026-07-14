## ADDED Requirements

### Requirement: Write saves before assistant send
Write SHALL persist the current document before creating a Turn and SHALL retain the composer and quoted selections until a Turn is accepted.

#### Scenario: Save or send is rejected
- **WHEN** document save fails or the runtime does not return a Turn id
- **THEN** no accepted Turn is assumed and the original input and quotes remain available

### Requirement: Write assistant history is file-scoped
Write SHALL associate assistant conversations with canonical workspace and file identities, with a separate scratch scope when no file is active.

#### Scenario: Switch between documents
- **WHEN** the user moves from one file to another
- **THEN** WorkWise selects the second file's assistant thread without exposing the first file's history unless explicitly quoted

### Requirement: Markdown editing remains correct for large structures
Rich/live Markdown SHALL correctly handle long or unclosed fences, ordered and unordered list markers, and selection actions without scanning or rendering the full document on every edit.

#### Scenario: Large fenced block and moving selection
- **WHEN** a document contains a long fenced block and the editor scrolls or resizes with a selection
- **THEN** editing remains responsive, fences and markers render correctly, and the action toolbar stays within the visible editor

### Requirement: Stale settings responses cannot overwrite newer state
Renderer settings reads and writes SHALL use request generations and revisions to prevent an older asynchronous response from replacing a newer value.

#### Scenario: Responses complete out of order
- **WHEN** an older settings request resolves after a newer save
- **THEN** the older response is ignored and the newer revision remains active
