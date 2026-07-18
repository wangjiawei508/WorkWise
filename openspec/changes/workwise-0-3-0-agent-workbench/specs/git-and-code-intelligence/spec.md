## ADDED Requirements

### Requirement: Task writes can be checkpointed without destroying prior work
WorkWise SHALL record repository identity, HEAD, baseline status, relevant hashes, and before-images before task writes, and SHALL preview rollback before applying it.

#### Scenario: User changes a task-modified file concurrently
- **WHEN** current content no longer matches the task-produced hash
- **THEN** WorkWise refuses automatic rollback and offers rescue state instead of overwriting the user change

### Requirement: Repository boundaries are explicit
WorkWise SHALL discover contained repositories within bounded depth/count and SHALL bind review, checkpoint, diff, and code-intelligence operations to one canonical `repositoryRoot`.

#### Scenario: Active file belongs to a nested repository
- **WHEN** the workspace contains parent and nested repositories
- **THEN** WorkWise selects the nearest repository and excludes parent/sibling changes

### Requirement: Repository maps are budgeted and cached
WorkWise SHALL build a symbol/import/test map within file, byte, time, and token budgets and SHALL invalidate cache entries when repository identity, HEAD, configuration, or source metadata changes.

#### Scenario: Repository exceeds map budget
- **WHEN** indexing reaches a hard budget
- **THEN** WorkWise returns a usable partial map and an explicit truncation diagnostic

### Requirement: TypeScript and JavaScript language intelligence is available
WorkWise SHALL provide definition, references, symbols, diagnostics, and hover through the pinned TypeScript service, with a file-index fallback when no project configuration exists.

#### Scenario: Workspace has no tsconfig
- **WHEN** a JavaScript file is queried outside a configured project
- **THEN** WorkWise returns bounded file-index results instead of failing the task
