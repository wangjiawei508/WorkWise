## ADDED Requirements

### Requirement: Design insertion into Write
WorkWise SHALL insert a rendered Design page into the current saved Write document as a workspace-relative image reference and SHALL rollback partial files or text when insertion fails.

#### Scenario: Insert at caret
- **WHEN** a user sends the current Design page to an unchanged Write document
- **THEN** WorkWise writes the image under the Write workspace, inserts relative Markdown at the saved caret, saves, and opens Write

#### Scenario: Stale Write selection
- **WHEN** the Write document or selection snapshot changed before insertion
- **THEN** WorkWise refuses the insertion and leaves both document and asset directory unchanged

### Requirement: Actionable Design artifacts
Design exports SHALL be delivered through result actions that can open, save as, and reveal the real file, with visible errors on failure.

#### Scenario: PPTX delivery
- **WHEN** a Design PPTX export succeeds
- **THEN** the user receives a real `.pptx` artifact with working open, save-as, and reveal actions

### Requirement: PowerPoint request acceptance
A request for PowerPoint SHALL only be accepted as complete when a validated `.pptx` is produced; HTML or an image preview may only be supplemental.

#### Scenario: HTML-only output
- **WHEN** a PowerPoint task produces only HTML
- **THEN** the task remains incomplete and reports the missing `.pptx` deliverable
