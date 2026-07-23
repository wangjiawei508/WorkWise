## Context

The uncommitted Design implementation has a usable canvas, history, pages, preset shapes, PPTX import/export, and phase E Write/PNG/SVG integration. Review found four architectural gaps: the renderer owns an ephemeral document, image/group elements are placeholders, runtime tools write unrelated SVG files, and import/export can silently lose unsupported structure. The existing workspace containment, atomic-write, IPC validation, cancellation, and revision patterns must remain authoritative.

## Goals / Non-Goals

**Goals:**

- Make the Design document durable, workspace-scoped, revisioned, and recoverable.
- Give image and group elements coherent editing and serialization semantics.
- Route Agent design operations to the active canvas as validated commands with acknowledgements.
- Make every export either preserve supported data or report explicit fidelity warnings.
- Keep Write insertion and PPTX delivery secure, atomic, undoable where applicable, and visible to users.
- Add tests that prove behavior instead of relying on progress labels.

**Non-Goals:**

- Vector path node editing or a general-purpose Illustrator replacement.
- Collaborative multi-user canvas editing.
- Silent cloud upload or a second live Agent runtime.
- Supporting every SVG filter, mask, animation, or PowerPoint effect in the first complete baseline.
- Upgrading PPT Master beyond the already audited v4.0 snapshot as part of this corrective change.

## Decisions

1. **Workspace files are the persistence boundary.** Each Design document is stored under `.workwise/design/<document-id>.workwise-design.json`, with a small atomic index for the last opened document. This follows existing workspace containment and atomic-write rules and avoids storing user content in global settings.

2. **The renderer remains the interactive owner, while the main process owns durable I/O.** IPC loads/saves validated `DesignDocumentV1` values with `expectedRevision`; stale saves fail instead of overwriting newer state. Renderer autosave is debounced, flushable, and exposes saving/error state.

3. **Image sources are workspace assets, not arbitrary paths.** Imported or generated images are copied into `.workwise/design/assets/`, referenced by workspace-relative paths, decoded through a safe main-process endpoint, and serialized as embedded data only for export.

4. **Groups are structural.** A group owns contained child IDs, derives its bounds from children, and applies move/duplicate/delete/page-copy operations recursively. Cycles, missing children, cross-page children, and multiple parents are rejected by document validation.

5. **Agent mutations use a command bridge.** Runtime tools publish validated `DesignCanvasCommandV1` commands to the active desktop session. The renderer applies them through the same store actions used by UI edits, creates one history entry, increments document revision, and returns an acknowledgement. Commands require matching workspace/document/revision and use idempotency keys.

6. **No renderer-owned HTTP server or second runtime is added.** The existing WorkWise Agent Runtime and Electron IPC/SSE boundary carry commands and acknowledgements.

7. **Fidelity loss is explicit.** Import results include warnings; unsupported constructs are never silently described as fully preserved. Export validates the produced container and returns warnings alongside the artifact.

8. **Packaged runtime discovery is deterministic.** Production resolves unpacked PPT Master resources before development paths. Python availability and conversion support are diagnosed before an operation starts.

## Risks / Trade-offs

- **Large embedded images can inflate memory and export size** → keep workspace-relative assets, enforce per-asset/document limits, and embed only during export.
- **Agent command acknowledgements can be lost on reload** → persist idempotency and task state in the runtime; renderer commands are replay-safe.
- **Group transformations can become complex** → first complete baseline supports group translation and recursive structural operations; resize/rotation transform children deterministically and is covered by geometry tests.
- **PPTX/SVG are not isomorphic** → return structured warnings and retain source metadata where possible.
- **Dirty worktree contains broad PPT Master changes** → preserve the user’s work, audit generated files and provenance, and commit the corrected baseline as focused commits.

## Migration Plan

1. Existing users without Design persistence start with a new document; no legacy user file is overwritten.
2. On first save, create `.workwise/design/` atomically inside the current canonical workspace.
3. Existing in-memory documents are normalized to add revision, asset references, and valid group membership before saving.
4. If a persisted document fails validation, keep it untouched, show a recovery error, and offer a new document rather than replacing it.
5. Rollback consists of reverting the feature commits; persisted JSON files remain user-readable and are ignored by older versions.

## Open Questions

- None blocking. PPT Master v4.1+ upgrade remains a separate audited change.
