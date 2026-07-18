## ADDED Requirements

### Requirement: Requested artifacts are format-validated
WorkWise SHALL validate container structure and required relationships for requested PPTX, DOCX, and XLSX files and SHALL reject renamed text, HTML-only previews, corrupt archives, and missing required structures.

#### Scenario: PowerPoint request produces only HTML
- **WHEN** the acceptance contract requires PPTX and the task produces an HTML presentation
- **THEN** the task remains incomplete and continues or reports the missing PPTX deliverable

### Requirement: Artifact actions are reliable and contained
Every accepted artifact SHALL provide open, save-as, and reveal-location actions backed by canonical containment and SHALL show a localized actionable error on failure.

#### Scenario: User saves an accepted artifact
- **WHEN** the user selects Save As and confirms a destination
- **THEN** WorkWise atomically copies the validated artifact and reports success

### Requirement: Office previews are safe and readable
WorkWise SHALL provide bounded readable previews for PDF, Markdown, image, SVG, DOCX, PPTX, and XLSX, while identifying structural previews that are not pixel-perfect.

#### Scenario: User previews a PPTX
- **WHEN** a valid contained deck is selected
- **THEN** WorkWise shows slide count and bounded slide text/media cards and retains an open-in-system-app action
