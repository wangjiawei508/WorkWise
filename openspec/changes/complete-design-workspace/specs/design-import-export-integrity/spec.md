## ADDED Requirements

### Requirement: Validated SVG and PNG delivery
WorkWise SHALL export the current page as standards-compliant SVG and PNG with bounded dimensions, safe filenames, and nonempty output.

#### Scenario: Direct SVG export
- **WHEN** the user chooses SVG export
- **THEN** WorkWise saves an SVG matching the current page size and layer order

#### Scenario: Oversized PNG
- **WHEN** requested PNG dimensions exceed hard limits
- **THEN** WorkWise rejects the operation before allocating the oversized canvas

### Requirement: PPTX artifact integrity
WorkWise SHALL only report PPTX success when the produced file is a nonempty valid OOXML ZIP with matching supported page dimensions.

#### Scenario: Invalid converter output
- **WHEN** the converter exits successfully but produces a non-ZIP or empty file
- **THEN** WorkWise reports export failure and does not deliver the artifact

### Requirement: Explicit import and export fidelity
WorkWise SHALL preserve supported image, group, ordering, text, geometry, and preset-shape information and SHALL return warnings for unsupported constructs.

#### Scenario: Unsupported SVG construct
- **WHEN** an imported SVG contains an unsupported filter, mask, or effect
- **THEN** the import result identifies the fidelity warning instead of claiming full preservation

### Requirement: Packaged conversion runtime
WorkWise SHALL resolve the audited PPT Master runtime in packaged macOS Apple Silicon, macOS Intel, and Windows x64 installations without depending on the development checkout.

#### Scenario: Packaged export
- **WHEN** PPTX export runs from an installed client
- **THEN** WorkWise uses packaged unpacked resources and either produces a validated PPTX or reports a dependency diagnostic
