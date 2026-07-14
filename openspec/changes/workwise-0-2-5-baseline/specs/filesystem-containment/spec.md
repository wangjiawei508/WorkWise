## ADDED Requirements

### Requirement: Filesystem access remains inside a canonical root
Every workspace, attachment, Skill, instruction, plan, artifact, and review-root access SHALL validate the canonical target against its canonical allowed root.

#### Scenario: Link escapes the workspace
- **WHEN** a requested path traverses a symbolic link or Windows junction to a location outside the workspace
- **THEN** the operation fails with `unsafe_path` before reading or mutating the target

### Requirement: Creation paths inspect existing ancestors
The system SHALL canonicalize and inspect the nearest existing ancestor of a new target and SHALL re-check the boundary before atomic replacement.

#### Scenario: Non-existent child below an escaping link
- **WHEN** a new file path is lexically inside the workspace but its existing parent resolves outside it
- **THEN** the create operation is rejected

### Requirement: Packages and instructions have bounded trusted inputs
Skill packages and workspace instructions SHALL reject unsafe entry types and SHALL enforce file-count, depth, per-file, and aggregate byte limits.

#### Scenario: Unsafe Skill package
- **WHEN** a Skill package includes traversal, a link, a junction, a device entry, or exceeds a hard limit
- **THEN** installation fails before replacing any installed Skill
