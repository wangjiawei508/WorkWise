---
name: design
description: >
  Design workspace tools for creating and exporting SVG designs.
  Use when the user asks to create shapes, design slides, or export
  designs as PPTX from the Design workspace.
---

# Design Skill

This skill provides tools for the Design workspace. It lets you create
SVG shapes, export designs as native PPTX, and list available preset shapes.

## Available Tools

### design_create_shape

Create a shape element in an SVG file.

**Parameters:**
- `file_path` (required): Workspace-relative path to the target .svg file
- `shape_type` (required): One of `rect`, `ellipse`, `text`, `line`, `path`
- `x`, `y` (required): Position in pixels from top-left
- `w`, `h` (required): Width and height in pixels
- `fill` (optional): 6-digit hex color without # (e.g. `1E3A5F`)
- `text` (for text): Text content
- `font_size` (for text): Font size in pixels

**Example:**
```
design_create_shape({
  file_path: "designs/slide_01.svg",
  shape_type: "rect",
  x: 100, y: 100, w: 300, h: 200,
  fill: "1E3A5F"
})
```

### design_export_pptx

Export an SVG file or directory of SVG files as a native editable PPTX.

**Parameters:**
- `source_path` (required): Path to .svg file or directory
- `output_path` (optional): Path for output .pptx

### design_list_presets

List available DrawingML preset shape names (187 presets).

**Parameters:**
- `search` (optional): Substring to filter

## Guidelines

- Colors are 6-digit hex without # (e.g. `1E3A5F` for dark blue)
- All coordinates are in pixels, origin at top-left, Y pointing down
- For text shapes, always provide the `text` parameter
- Export to PPTX only when the user explicitly asks for PowerPoint format
- SVG files must have valid `<svg>` structure with `</svg>` closing tag
