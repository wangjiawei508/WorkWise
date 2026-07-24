## ADDED Requirements

### Requirement: Requested sources are reproducible and audited
WorkWise SHALL lock every imported GitHub Skill to an exact commit and SHALL audit archive paths, symlinks, large files, executable content, external network behavior, credential access, and license evidence before files enter bundled assets.

#### Scenario: GitHub source is reviewed
- **WHEN** a requested GitHub Skill is evaluated for bundling
- **THEN** its repository URL, exact commit, license result, package size, scripts, and product treatment are recorded before integration

#### Scenario: Source changes upstream
- **WHEN** the upstream default branch advances after the recorded commit
- **THEN** the packaged Skill remains reproducible and is not silently changed

### Requirement: Tender Master is available as an offline bundled Skill and Agent
WorkWise SHALL package the audited `tender-master` Skill with its instructions, portable Agent metadata, one-level references and local helper scripts, and SHALL expose an immutable native `tender-master` Agent profile with a workspace-write maximum trust level.

#### Scenario: Runtime provisions Tender Master
- **WHEN** WorkWise starts and the global Skill root does not contain an unmanaged package with the same id
- **THEN** WorkWise installs or repairs the complete audited package, writes bundled source metadata, refreshes the Skill catalog, and performs no network request

#### Scenario: Existing user Skill conflicts with startup provisioning
- **WHEN** the global Skill root already contains an unmanaged `tender-master` package
- **THEN** WorkWise leaves it untouched, records a diagnostic, and does not silently replace user files

#### Scenario: User selects the Tender Agent
- **WHEN** the user chooses “招投标编制专家” from the active chat composer
- **THEN** WorkWise assigns the immutable profile to that thread, disables send while the assignment is pending, refreshes the displayed selection, retries one exact revision conflict against the latest thread state, and prefers the installed `tender-master` Skill on the next Turn

#### Scenario: Preferred Skill cannot be loaded
- **WHEN** the built-in Tender Agent runs but the `tender-master` Skill is unavailable or invalid
- **THEN** it retains its native safety guardrails, reports the missing Skill resources, and does not claim that the package was loaded

### Requirement: Tender evidence and deviations remain truthful
Tender Master MUST NOT fabricate qualifications, cases, people, product parameters, prices, delivery terms, authorization, or commitments. It SHALL retain mandatory technical parameters and acceptance conditions in traceable responses, SHALL surface real deviations, and SHALL block final completion while required evidence, placeholders, unresolved deviations, or validated deliverables are missing.

#### Scenario: Evidence is missing
- **WHEN** a required qualification, case, person, parameter, price, or authorization cannot be verified
- **THEN** the working draft records an unresolved evidence item and the final-delivery gate remains blocked

#### Scenario: Requirement is not fully met
- **WHEN** available evidence shows a requirement is only partially met or not met
- **THEN** Tender Master reports the deviation and asks whether to remediate, clarify, or stop instead of rewriting it as compliant

#### Scenario: Internal risk item contains a hard requirement
- **WHEN** a mandatory parameter or acceptance condition is also recorded in the internal risk ledger
- **THEN** the risk label stays out of final prose but the original requirement and explicit response remain in the deliverable

### Requirement: Tender helper scripts are local and deterministic
The bundled Tender helper scripts SHALL perform no automatic network access and SHALL provide deterministic extraction, scoring, coverage, quality, fee-estimation, conversion, or DOCX behavior with explicit human-review notices.

#### Scenario: Quality checker finds a placeholder
- **WHEN** the quality checker scans a draft containing an unresolved placeholder
- **THEN** it writes a readable blocker report and exits with the documented blocker status

#### Scenario: Optional document dependency is unavailable
- **WHEN** DOCX conversion lacks its optional local dependency
- **THEN** the script reports the missing dependency and does not create or claim a valid final document

### Requirement: Document Illustrator is a WorkWise-native offline Skill
WorkWise SHALL bundle the MIT-licensed `document-illustrator` Skill with its license, exact upstream revision and visual references. Its adapted instructions SHALL use WorkWise document parsing and configured image generation, SHALL write real workspace-relative image files, and SHALL NOT read third-party `.env`, legacy Claude paths, or unregistered API credentials.

#### Scenario: User installs Document Illustrator
- **WHEN** the user installs “文档配图助手” from the Skill marketplace
- **THEN** WorkWise installs the Skill, license, upstream record and visual references with bundled source metadata and no legacy credential scripts

#### Scenario: Runtime provisions Document Illustrator
- **WHEN** WorkWise starts and no unmanaged same-id package blocks the global Skill target
- **THEN** the audited MIT package is available to the runtime without downloading code or requesting a third-party credential

#### Scenario: Image generation is configured
- **WHEN** a user asks for document illustrations and the configured image provider is available
- **THEN** the Skill creates an illustration plan, writes real image files to the requested workspace-relative insertion paths, records insertion locations, and exposes actionable artifacts; visual-capable models inspect pixels while non-visual models disclose that only metadata validation was performed

#### Scenario: Image generation is unavailable
- **WHEN** the configured image provider is disabled or incomplete
- **THEN** the Skill reports the missing capability and does not claim that images were delivered

### Requirement: Restricted upstream sources are not redistributed without authorization
WorkWise MUST NOT package Guizang Social Card, Guizang Material Illustration, or Logo Generator source files until valid redistribution authorization is recorded. Their marketplace cards SHALL state the applicable commercial or license blocker and MAY open the canonical project page.

#### Scenario: Candidate installer is built without new authorization
- **WHEN** the 0.3.2 candidate is packaged before written authorization is supplied
- **THEN** none of the three restricted source directories or files is present in bundled Skill assets or client installers

#### Scenario: User opens a restricted project card
- **WHEN** the user selects one of the restricted Skill cards
- **THEN** WorkWise shows readable Chinese or English authorization status and opens the canonical upstream project instead of presenting an install action

### Requirement: Marketplace copy is complete and localized
WorkWise SHALL provide Chinese-first titles, summaries, details, source status and actions for all five specialist packages, with equivalent English strings and no raw localization keys.

#### Scenario: Chinese marketplace is opened
- **WHEN** the application language is Chinese
- **THEN** the Tender, Document Illustrator, Social Card, Material Illustration and Logo Generator cards display concise Chinese product copy and accurate source status

### Requirement: Candidate validation covers packaged behavior
WorkWise SHALL validate Skill syntax, installation metadata, license boundaries, localized marketplace behavior, Tender Agent immutability, helper-script behavior, package contents and representative end-to-end prompts before candidate readiness is reported.

#### Scenario: A package violates its declared boundary
- **WHEN** a forbidden source directory, legacy credential script, missing license, invalid Skill, unresolved localization key, or failing scenario is detected
- **THEN** the candidate gate fails and no version tag or public Release is created
