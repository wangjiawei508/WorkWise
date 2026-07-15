# release-integrity Specification

## Purpose
TBD - created by archiving change localize-menus-and-restore-updates. Update Purpose after archive.
## Requirements
### Requirement: Release dependencies pass the production security gate
WorkWise SHALL have no known high or critical vulnerabilities in production dependencies at release time.

#### Scenario: Release quality checks run
- **WHEN** the release candidate is validated
- **THEN** `npm audit --omit=dev --audit-level=high` succeeds using the committed lock file

### Requirement: Packaged application archives remain internally consistent
WorkWise SHALL produce an ASAR whose indexed packed and unpacked entries remain readable after all packaging hooks complete.

#### Scenario: Final package is inspected
- **WHEN** the final macOS or Windows application archive is validated
- **THEN** every ASAR entry can be read and all compiled `out` files match the production build byte-for-byte

### Requirement: Managed CLI operations are release-tested
WorkWise SHALL register and validate list, install, update, diagnose, and remove operations for every managed tool and SHALL preserve the previous version when installation fails.

#### Scenario: Managed tool is installed in an isolated directory
- **WHEN** a valid official release asset and checksum are supplied
- **THEN** WorkWise verifies the checksum, installs atomically, diagnoses the executable, records the manifest, and can remove it cleanly

#### Scenario: Official download is unavailable
- **WHEN** the upstream network request fails
- **THEN** WorkWise returns a concise network error without corrupting an existing installation

### Requirement: Supported desktop packages pass platform gates
WorkWise SHALL validate macOS arm64, macOS x64, and Windows x64 packages before a release is published.

#### Scenario: Release workflow completes
- **WHEN** a release candidate is built from the committed tag
- **THEN** all three supported packages and their update metadata pass artifact and checksum verification before publication
