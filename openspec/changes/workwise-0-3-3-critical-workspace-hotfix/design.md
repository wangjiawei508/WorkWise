# Design

## Workspace boundaries

Code owns project threads and software-delivery tools. Write owns document workspaces, requirements, tender-source attachments, drafting, review, and export. Design owns design documents, pages, canvas selection, imported visual references, and design-assistant threads. All three call the same authenticated WorkWise Runtime through separate thread identities and metadata.

## Design assistant

Each Design document receives a stable assistant thread ID. Opening or creating a design document selects/creates that thread without changing Code's remembered active thread. The panel renders the complete timeline for that design thread and sends canvas context, selected element IDs, revision, and idempotency key. Selecting canvas elements is the annotation mechanism: the panel must visibly list the selected element labels and state that AI actions target them.

## PPTX import

The structural SVG decomposition is approximate and cannot be represented as PowerPoint-faithful. The hotfix therefore uses a readable-first path: the bundled local converter emits self-contained SVG, an isolated no-network Electron renderer flattens each page to a bounded PNG/JPEG asset, and the canvas shows that complete page as a selectable visual reference. Users and AI can add annotations or rebuild editable elements above the reference, but the UI must not claim that source text, charts, or animations are individually editable. The legacy structural parser remains useful for page geometry, fidelity diagnostics, and bounded text labels, not as the default visual result.

## Write attachments

The Write assistant receives attachment state and callbacks from Workbench. It uses the existing streamed import, validation, parsing, indexing, status, retry, cancel, open, and removal lifecycle. Attachments are sent through the Write thread prompt metadata and stay available to attachment retrieval tools. The assistant width remains resizable and gains a larger default/minimum suitable for long-form drafting.

## Scheduling and Flow

Scheduled Tasks remains an explicit route and editor. Flow may link to or represent migrated scheduled flows, but clicking Scheduled Tasks cannot silently replace the screen with the Flow canvas. Flow remains Preview; validation and capability failures are shown before execution and unavailable actions are disabled with reasons.

## Navigation

“New requirement” is removed from Code navigation and placed in Write. Design and Flow do not show Code-only thread/project controls. Route-specific sidebars must not disguise one workspace as another.
