## ADDED Requirements

### Requirement: Public behavior references contain no copied implementation
The upstream behavior gap table SHALL contain only feature description, problem manifestation, WorkWise acceptance behavior, and a public link.

#### Scenario: Add upstream reference
- **WHEN** a reference is added to the gap table
- **THEN** it contains exactly the four allowed fields and no copied post-MIT source or implementation detail

### Requirement: CI blocks unsafe or unverified releases
Pull request, push, and release workflows SHALL run OpenSpec strict validation, brand-boundary verification, security tests, typecheck, lint, tests, and production build before packaging or publication.

#### Scenario: Quality gate fails
- **WHEN** any required validation fails
- **THEN** GitHub Actions does not build or publish the 0.2.5 release

### Requirement: Release artifacts are cross-platform verified
The release SHALL build and verify macOS arm64/x64 and Windows x64 artifacts with WorkWise names, hashes, and update metadata.

#### Scenario: Version tag is published
- **WHEN** `v0.2.5` triggers the release workflow
- **THEN** only verified WorkWise artifacts and metadata are attached to the GitHub Release
