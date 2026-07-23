## Why

The current Design workspace was reported as complete through phase D, but code review found that document persistence, real image/group behavior, import/export fidelity, and the Agent-to-canvas bridge are still incomplete. These gaps must be closed before the phase E Write/PPT integration can be treated as a reliable product capability or committed as the new baseline.

## What Changes

- Persist Design documents atomically in the active workspace and restore them after restart.
- Replace placeholder image and group behavior with real rendering, selection, movement, duplication, deletion, undo/redo, and page duplication semantics.
- Preserve supported image, group, ordering, transform, and preset-shape information across SVG/PPTX import and export, with explicit warnings for unsupported fidelity.
- Connect WorkWise Agent Runtime design tools to the active renderer document through a revisioned command/event bridge with undoable mutations.
- Add a genuine Design assistant rail that accepts natural-language canvas operations, reports pending/failed actions, and does not expose a false “AI” capability when the bridge is unavailable.
- Finish and verify Design-to-Write/PPT plus direct PNG/SVG delivery, including packaged runtime discovery and secure workspace containment.
- Correct prior progress documentation, remove generated caches, and add regression, production-build, and packaged-runtime checks.

## Capabilities

### New Capabilities

- `design-document-persistence`: Atomic workspace-scoped Design document save, recovery, revision handling, and recent-document restoration.
- `design-composite-elements`: Real image and group element behavior across editing, history, pages, serialization, and duplication.
- `design-agent-canvas-bridge`: Revisioned, undoable Agent commands that mutate the active Design canvas and expose reliable operation status.
- `design-import-export-integrity`: Validated SVG, PNG, and PPTX import/export with supported-fidelity preservation, warnings, and packaged runtime resolution.
- `design-delivery-integration`: Reliable Design-to-Write insertion and PPT delivery with actionable result cards and rollback on failure.

### Modified Capabilities

<!-- No existing OpenSpec capability currently defines Design workspace behavior. -->

## Impact

- Renderer Design store, canvas, properties, assistant rail, Workbench routing, and Write integration.
- Shared Design document/SVG contracts and `window.workwise` API.
- Main-process IPC, persistence, import/export, runtime path resolution, and workspace containment.
- WorkWise Agent Runtime design tools and renderer event mapping.
- PPT Master packaged assets, release configuration, tests, user documentation, and the Design architecture status record.
