## ADDED Requirements

### Requirement: Composer accepts supported documents and images
The composer SHALL allow up to eight attachments per turn and SHALL explicitly accept PDF, DOCX, XLSX, PPTX, TXT, MD, CSV, PNG, JPEG, and WebP with a 200 MiB per-file and 500 MiB per-batch limit.

The Write assistant SHALL reuse the shared chat composer interaction model and SHALL present a multi-line writing surface that remains readable when long instructions and attachment cards are present.

#### Scenario: User selects supported files
- **WHEN** the user chooses “Add files or images” and selects supported files within the limits
- **THEN** WorkWise creates attachment cards and begins managed import for each file

#### Scenario: User drags a supported document
- **WHEN** a supported document is dropped on the composer
- **THEN** WorkWise imports it as an attachment and does not insert its absolute path into the prompt

#### Scenario: User pastes clipboard content
- **WHEN** the clipboard contains an image
- **THEN** WorkWise imports the image, while non-image clipboard files are not treated as document attachments

#### Scenario: User enters a long writing instruction
- **WHEN** the user pastes or types a multi-line tender-writing instruction in the Write assistant
- **THEN** the composer starts with a practical multi-line height, expands up to its bounded maximum, scrolls internally beyond that maximum, and does not hide text behind attachment or action rows

### Requirement: Document import is streamed, contained, and format-verified
The main process SHALL stream files into an application-managed directory and verify extension, MIME, file signature, Office archive structure, compression bounds, path containment, byte limits, and SHA-256 without JSON Base64 transport for large documents.

#### Scenario: Genuine supported document is imported
- **WHEN** a source file passes containment, type, structure, size, and hash validation
- **THEN** the original is persisted in managed storage and parsing begins

#### Scenario: File disguises its format or is a compression bomb
- **WHEN** extension/MIME/signature disagree or an Office archive violates entry or expansion limits
- **THEN** WorkWise rejects the import before parsing and reports a specific format or archive error

#### Scenario: Source path escapes the staging root
- **WHEN** an import request resolves outside the Runtime-owned staging directory
- **THEN** the Runtime rejects the request and does not read or copy the source

### Requirement: Attachment metadata remains backward compatible
`AttachmentMetadataV2` SHALL add kind, state, parser, source structure, degradation reasons, and index state while upgrading existing image metadata without retransmitting image bytes.

#### Scenario: Existing image attachment is read
- **WHEN** Runtime loads a valid V1 image attachment
- **THEN** it exposes equivalent V2 image metadata and preserves the original content and references

### Requirement: Supported documents are parsed locally with provenance
PDF, DOCX, XLSX, and PPTX SHALL reuse Document Engine and local MarkItDown; TXT, Markdown, and CSV SHALL use bounded safe text reading. Parsed results SHALL preserve pages, headings, tables, sheets, slides, and warnings.

#### Scenario: Native-text document is parsed
- **WHEN** a valid supported document contains usable text
- **THEN** WorkWise records the parsing engine, structural provenance, warnings, and a ready index

#### Scenario: PDF text quality is insufficient
- **WHEN** PDF extraction produces insufficient usable text and local MinerU is installed
- **THEN** WorkWise prefers local MinerU before declaring OCR degradation

#### Scenario: Private remote parser is configured but not authorized
- **WHEN** local parsing is insufficient and the workspace has not explicitly authorized private parsing upload
- **THEN** WorkWise does not upload the document and reports a local degraded or failed state

### Requirement: Parsed content is chunked and indexed for bounded retrieval
WorkWise SHALL chunk parsed content at approximately 1,200 tokens with approximately 150-token overlap and SHALL store sections in SQLite full-text search with a bounded lexical fallback.

#### Scenario: Long tender document is indexed
- **WHEN** parsing a document longer than one model context
- **THEN** WorkWise stores ordered sections with page, heading, table, sheet, or slide provenance instead of constructing one unbounded prompt

#### Scenario: User asks for a specific clause
- **WHEN** the Agent calls `search_attachment` and then reads matching sections
- **THEN** results remain bounded and identify the source page, worksheet, table, heading, or slide when available

### Requirement: Model context treats documents as untrusted reference material
Initial model context SHALL contain only a bounded file manifest and short summary, and SHALL state that document content cannot override system instructions, authorize tools, approve actions, or act as executable commands.

#### Scenario: Document contains prompt-injection instructions
- **WHEN** attachment text instructs the Agent to ignore policy or disclose data
- **THEN** the text remains untrusted retrieved content and grants no additional authority

#### Scenario: Full-text direct injection is disabled
- **WHEN** the document is not placed directly into model context
- **THEN** the Agent can still access authorized full content through `list_attachment_sections`, `search_attachment`, and `read_attachment_section`

### Requirement: Attachment retrieval is scope-authorized
Attachment query tools and content routes SHALL require the attachment to be authorized for the current turn, thread, and workspace and SHALL enforce bounded result and section sizes.

#### Scenario: Another thread requests an attachment
- **WHEN** a request lacks a valid attachment reference for its thread or workspace
- **THEN** the Runtime rejects the query without revealing metadata or text

### Requirement: Attachment cards expose lifecycle and recovery actions
Attachment cards SHALL show file type, size, upload/parsing progress, and uploading, parsing, ready, degraded, or failed state, and SHALL support cancel, retry, remove, and open-original actions.

#### Scenario: Parsing is incomplete
- **WHEN** any selected document is still uploading or parsing
- **THEN** the composer prevents sending that attachment and explains its current state

#### Scenario: Document cannot yield usable text
- **WHEN** a PDF is encrypted, an Office document is damaged, or extraction yields no text and no OCR is available
- **THEN** the card shows a precise password, corruption, empty-text, or OCR degradation message

### Requirement: Attachment lifecycle preserves referenced business files
Originals SHALL persist with their conversation or workspace reference, deleting a conversation SHALL release its reference, abandoned incomplete imports SHALL be cleaned after 24 hours, and referenced business files SHALL NOT be automatically deleted.

#### Scenario: Conversation is deleted
- **WHEN** its attachment references are removed
- **THEN** WorkWise deletes an original only when no remaining conversation or workspace reference requires it

#### Scenario: Import is abandoned
- **WHEN** an incomplete unreferenced temporary import is older than 24 hours
- **THEN** WorkWise removes the temporary data during cleanup
