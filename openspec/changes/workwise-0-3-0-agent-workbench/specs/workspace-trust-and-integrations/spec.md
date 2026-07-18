## ADDED Requirements

### Requirement: Workspace trust is canonical and explicit
WorkWise SHALL assign `workspace-write` to WorkWise-created roots, `read-only` to externally selected roots, require confirmation for elevation, and bind trust to the canonical root without link inheritance.

#### Scenario: External workspace is added
- **WHEN** the user adds an existing external directory
- **THEN** WorkWise stores read-only trust until the user explicitly elevates it

### Requirement: MCP configuration is scoped and secret-safe
WorkWise SHALL support versioned global/workspace MCP configurations, stdio cwd, HTTP transports, source metadata, tool policies, OAuth PKCE, and credential references without storing plaintext tokens in configuration.

#### Scenario: Encrypted credential storage is unavailable
- **WHEN** an MCP server requires a secret and system encryption cannot be used
- **THEN** WorkWise offers session-only authorization and refuses plaintext persistence

### Requirement: Background Shell work remains owned and bounded
WorkWise SHALL persist Shell session metadata and bounded output, terminate process trees at cancellation or exit, and mark prior running sessions interrupted on restart.

#### Scenario: Application exits with a background Shell
- **WHEN** WorkWise shuts down normally
- **THEN** the process tree is terminated, output is flushed, and the owning node is recoverable only according to its idempotency policy
