## ADDED Requirements

### Requirement: Real image elements
WorkWise SHALL render supported workspace image assets and preserve their bounds, opacity, rotation, ordering, and source reference across save, undo/redo, page duplication, SVG export, and Write insertion.

#### Scenario: Add and reopen image
- **WHEN** a user adds a supported image and reopens the Design document
- **THEN** the same image appears at the saved position and layer order

#### Scenario: Unsafe image source
- **WHEN** an image source escapes the workspace or is not an allowed regular file
- **THEN** WorkWise rejects it with an actionable error

### Requirement: Structural group elements
WorkWise SHALL implement groups as validated parent-child structures and apply group move, duplicate, delete, page-copy, undo, and redo operations coherently.

#### Scenario: Duplicate grouped elements
- **WHEN** a user duplicates a group
- **THEN** WorkWise creates new IDs for the group and all descendants and rewrites child references to the duplicated descendants

#### Scenario: Invalid group cycle
- **WHEN** a document contains cyclic or cross-page group membership
- **THEN** document validation rejects the structure

### Requirement: Deterministic composite transformations
WorkWise SHALL transform grouped descendants deterministically and keep derived group bounds synchronized.

#### Scenario: Move a group
- **WHEN** a user moves a selected group
- **THEN** every descendant moves by the same delta and one undo operation restores the prior state

### Requirement: Canvas interaction isolation
The Design canvas SHALL own pan and zoom gestures inside its viewport while preserving a small explicit desktop drag region outside the canvas.

#### Scenario: Pan the empty canvas stage
- **WHEN** the user drags the empty stage or canvas background
- **THEN** the canvas content pans and the application window remains fixed

#### Scenario: Zoom and fit
- **WHEN** the user uses the zoom controls or trackpad zoom gesture
- **THEN** WorkWise changes the canvas scale within bounded limits and can restore a fitted centered view
