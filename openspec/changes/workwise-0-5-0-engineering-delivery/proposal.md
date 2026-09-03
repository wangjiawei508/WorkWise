## Why

WorkWise already has the Electron shell, Kun Runtime, attachments, Flow, Design, and RailWise specialist assets. The current engineering screen still makes the user drive a form-heavy console and the existing AI command center keeps its own `localStorage` thread pointer and SSE subscription. That makes Engineering look separate from the AI product and makes a Design/Code-style conversation impossible to recover reliably.

0.5.0 therefore makes the engineering project conversation the primary surface. A user states an engineering goal in natural language, attaches data, reviews a typed plan, approves risk-bearing steps, and watches deterministic analysis produce evidence and deliverables. The model explains and coordinates; it never becomes the source of numeric truth.

## What Changes

- Add an AI-first Engineering session that uses the existing `/v1/threads`, `ChatState`, SSE, attachment store, and message restoration path. Engineering threads carry additive `domain: "engineering"` and `projectId` metadata and are isolated from Code, Write, Design, Flow, and IM threads.
- Replace the component-local engineering chat shim with a renderer session shell: project/thread sidebar, AI timeline and typed-plan cards in the center, evidence/Copilot inspector on the right, and a clearly labeled classic deterministic console fallback.
- Add versioned Runtime contracts and local authenticated APIs for context snapshots, typed plans, approvals, TaskRun projection, evidence cards, Watch drafts, deterministic analysis, charts, reports, and immutable manifests.
- Add one canonical survey-math kernel and independent typed strategies for leveling/height control, traverse, plane control, triangulation, CPIII free-station/resection, GNSS baselines, coordinate transforms, and deformation results. Unsupported or incomplete networks must be blocked instead of being reported through a generic plane-network fallback.
- Record canonical linear/angular units on every adjustment result, closure and observation residual, and carry those units into the UI, DOCX/PDF narrative, XLSX evidence and legacy-read compatibility path.
- Audit the bundled surveying, monitoring, tender, standards and report Skills against pinned source commits, licenses, scripts, network access and credential access before including them in a candidate package.
- Make `TaskController`/`TaskRunRepository`/`AgentLoop` the only execution path. `EngineeringService` remains the deterministic data and artifact layer and is called by allowlisted RailWise tools; it must not create a parallel engineering queue or mark a run complete without TaskRun completion.
- Reuse existing Attachment Store, artifact validation, RailWise tool IDs, Skills, MCP configuration, credentials, and knowledge sources. No second desktop shell, Runtime, provider switcher, or hidden credential path.
- Ship DOCX/PDF reports, XLSX evidence packages, and `manifest.json` in 0.5.0. PPTX remains a 0.5.1 follow-up using the existing Design/PPT Master path.
- Preserve existing files, threads, logs, plugins, Skills, MCPs, credentials, attachments, and legacy tool IDs. Migrations are additive, lazy, revision-safe, and reversible via the existing feature-flag/settings path.

## Capabilities

### New Capabilities

- `engineering-delivery`: AI-first engineering-survey sessions, deterministic survey adjustment and monitoring analysis, reviewed specialist Skills, and traceable DOCX/PDF/XLSX/manifest delivery.

### Modified Capabilities

- None.

## Impact

- Adds engineering AI contracts, survey contracts and canonical units, independent survey strategies, thread metadata and filtering, context/orchestration services, TaskRun projection, authenticated AI routes/events, evidence cards, renderer session components, specialist-Skill provenance, golden fixtures, and tests.
- Keeps the old seven-page Engineering console available behind an explicit compatibility entry; it is not the default route.
- Does not change provider credentials, DeepSeek model selection, Electron/Tauri architecture, public version metadata, release feeds, or download pages.
