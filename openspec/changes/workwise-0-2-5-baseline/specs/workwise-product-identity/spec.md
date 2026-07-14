## ADDED Requirements

### Requirement: WorkWise is the product identity
The desktop application SHALL use WorkWise for all user-visible names, public APIs, newly written paths, logs, build metadata, assets, and release artifacts.

#### Scenario: Fresh installation
- **WHEN** WorkWise 0.2.5 starts with no previous data
- **THEN** it displays and writes only WorkWise-owned product names and locations

### Requirement: Legacy identities are read-only compatibility inputs
The application SHALL import supported WorkGPT, Kun, and DeepSeek GUI data without writing back to legacy files or creating compatibility links.

#### Scenario: Upgrade from a legacy installation
- **WHEN** WorkWise V2 data is absent and a supported legacy settings file exists
- **THEN** the application imports it once, preserves the source, and records a WorkWise migration manifest

### Requirement: Product identity boundary is enforced
The repository SHALL fail validation when a legacy product identifier occurs outside the audited runtime, provenance, migration, compatibility, or immutable platform-identifier allowlist.

#### Scenario: New legacy brand reference
- **WHEN** a contributor adds an unapproved Kun, DeepSeek GUI, or WorkGPT product reference
- **THEN** the brand-boundary verification command fails with the matching file and line
