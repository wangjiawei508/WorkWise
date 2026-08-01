## MODIFIED Requirements

### Requirement: Supported desktop packages pass platform gates
WorkWise SHALL validate macOS arm64, macOS x64, and Windows x64 packages, their official updater artifacts, and channel metadata before a release is published. Stable macOS packages MUST use Developer ID signing and successful Apple notarization, and every promoted channel artifact MUST pass version, SHA-512, HTTPS download, and byte-range verification.

#### Scenario: Release workflow completes
- **WHEN** a release candidate is built from the committed tag
- **THEN** all three supported packages, ZIP/EXE/blockmap files, `latest.yml`/`latest-mac.yml`, signatures, notarization evidence, versions, hashes, full downloads, and Range downloads pass verification before publication

#### Scenario: Stable macOS candidate is unsigned or unnotarized
- **WHEN** Developer ID signing, hardened runtime, notarization, or stapling verification is missing or invalid
- **THEN** the release workflow fails and does not mark the macOS package as automatically installable

#### Scenario: Uploaded updater metadata is incomplete
- **WHEN** a manifest references a missing artifact, wrong version, wrong SHA-512, inaccessible HTTPS URL, or endpoint without required Range support
- **THEN** Stable promotion fails atomically and the previously promoted latest release remains active

#### Scenario: Verified release is promoted
- **WHEN** all platform and updater checks pass against immutable versioned R2 objects
- **THEN** the channel latest pointer is promoted atomically and the three most recent installable versions remain available for rollback
