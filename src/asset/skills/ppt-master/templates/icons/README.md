# Icon resources in WorkWise

The upstream PPT Master icon catalog is intentionally not bundled in WorkWise because the complete SVG corpus is large. PPT Master remains fully usable without that catalog:

- prefer editable native PowerPoint shapes for simple symbols;
- use project-local icons supplied by the user;
- use an authorized icon source through an installed tool or Skill;
- keep imported SVG files inside the current project workspace.

Do not assume a global icon file exists. When an icon cannot be resolved, use a simple native shape or ask the user for an asset instead of failing the whole presentation.
