# Workspace boundaries

## Requirement: Product workspaces are independent

Code, Write, and Design SHALL maintain independent active conversations and route-specific context while using the single WorkWise Runtime.

### Scenario: Design conversation does not enter Code

- **WHEN** a user sends a request from an open Design document
- **THEN** WorkWise sends it on the Design document's assistant thread
- **AND** returning to Code restores the previously selected Code thread without the Design request.

### Scenario: Write accepts a tender source document

- **WHEN** a user adds a supported PDF, DOCX, XLSX, PPTX, text, or image file from Write
- **THEN** the attachment uses the managed import and parsing lifecycle
- **AND** the Write assistant can retrieve its indexed sections without switching to Code.

### Scenario: Scheduled Tasks remains operable

- **WHEN** a user clicks Scheduled Tasks
- **THEN** WorkWise opens the Scheduled Tasks list and editor
- **AND** any Flow migration is presented as an explicit linked action rather than a silent redirect.

## Requirement: Preview capabilities are represented honestly

Flow and readable-first PPTX conversion SHALL expose capability and fidelity limits before a user depends on them.

### Scenario: PPTX conversion differs from source

- **WHEN** WorkWise imports a complex PowerPoint deck
- **THEN** each slide is preserved as a readable selectable visual reference
- **AND** source objects are not presented as individually editable
- **AND** the user can add or ask AI to add editable overlay elements.
