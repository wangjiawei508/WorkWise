## MODIFIED Requirements

### Requirement: Release dependencies pass the production security gate
WorkWise SHALL have no known high or critical vulnerabilities in production dependencies at release time, SHALL generate SBOMs for the application and document helper, and SHALL reject unapproved copyleft, non-commercial, or custom-license dependencies from distributed artifacts.

#### Scenario: Release quality checks run
- **WHEN** the release candidate is validated
- **THEN** `npm audit --omit=dev --audit-level=high` succeeds using the committed lock file and license/SBOM policy checks approve every distributed dependency

### Requirement: Packaged application archives remain internally consistent
WorkWise SHALL produce an ASAR and bundled MarkItDown helper whose indexed packed/unpacked entries remain readable and executable after all packaging hooks complete.

#### Scenario: Final package is inspected
- **WHEN** the final macOS or Windows application archive is validated
- **THEN** every ASAR entry can be read, compiled `out` files match the production build byte-for-byte, and the platform helper parses a fixture without system Python or network access

### Requirement: Managed CLI operations are release-tested
WorkWise SHALL register and validate list, install, update, diagnose, and remove operations for every managed tool and optional document engine and SHALL preserve the previous version when installation fails.

#### Scenario: Managed tool is installed in an isolated directory
- **WHEN** a valid official release asset and checksum are supplied
- **THEN** WorkWise verifies the checksum, installs atomically, diagnoses the executable, records the manifest, and can remove it cleanly

#### Scenario: Official download is unavailable
- **WHEN** the upstream network request fails
- **THEN** WorkWise returns a concise network error without corrupting an existing installation or disabling built-in document parsing

### Requirement: Supported desktop packages pass platform gates
WorkWise SHALL validate macOS arm64, macOS x64, and Windows x64 packages through automated and role-based installed-application scenarios before a release is published.

#### Scenario: Release workflow completes
- **WHEN** a release candidate is built from the committed tag
- **THEN** all three supported packages, update metadata, task recovery, concise conversation, artifact actions, and bundled helper pass checksum and installed-app verification before publication
