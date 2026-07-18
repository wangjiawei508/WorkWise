## ADDED Requirements

### Requirement: MarkItDown is the built-in fast document engine
WorkWise SHALL ship isolated per-platform MarkItDown helpers for PDF, DOCX, PPTX, and XLSX that require no system Python, cannot access arbitrary network locations, and return versioned structured results.

#### Scenario: Electronic PDF is parsed offline
- **WHEN** the user parses a contained electronic PDF in fast or auto mode
- **THEN** the helper returns normalized Markdown and metadata without a network request

### Requirement: MinerU is optional and local-first
WorkWise SHALL support an optional managed local MinerU engine and an explicitly configured private endpoint, SHALL NOT bundle MinerU, and SHALL NOT route documents to a public cloud automatically.

#### Scenario: Accurate parsing is requested without MinerU
- **WHEN** accurate mode is selected but no approved MinerU engine is available
- **THEN** WorkWise offers installation/configuration and does not upload the document elsewhere

### Requirement: Auto mode uses quality-aware routing
WorkWise SHALL try MarkItDown first and SHALL select an available approved MinerU engine for scans, garbled or low-density text, complex layout, formulas, or explicit accurate mode, while retaining an explainable fallback result.

#### Scenario: MinerU fails after MarkItDown succeeds
- **WHEN** the enhanced parse returns an error
- **THEN** WorkWise returns the MarkItDown result with an explicit quality warning and engine diagnostic

### Requirement: PDF rendering and semantic parsing are separated
WorkWise SHALL use PDF.js for contained page rendering/search and document engines for Agent/RAG content, preserving page/block references whenever the selected engine provides them.

#### Scenario: User opens a parsed PDF citation
- **WHEN** a result includes a page reference
- **THEN** the preview navigates to the corresponding page without exposing an unrestricted file URL

### Requirement: Document dependencies meet distribution policy
WorkWise MUST exclude the current MarkItDown OCR plugin and any unapproved copyleft/non-commercial transitive dependency from distributed packages and SHALL disclose MinerU attribution when used.

#### Scenario: Release dependency scan finds an unapproved license
- **WHEN** the sidecar SBOM contains an unapproved dependency
- **THEN** release packaging fails before artifacts are published
