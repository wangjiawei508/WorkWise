## 1. Baseline and contracts

- [x] 1.1 Audit the uncommitted Design, Write, PPT Master, runtime, and packaging changes and preserve unrelated user work
- [x] 1.2 Extend and validate the Design document contract for revisions, workspace assets, and acyclic group structure
- [x] 1.3 Add shared Design persistence, command, acknowledgement, and fidelity-warning API contracts

## 2. Durable Design documents

- [x] 2.1 Implement canonical workspace-scoped atomic Design load/save/index services with revision conflicts and recovery
- [x] 2.2 Register validated IPC/preload APIs and add containment, stale-write, and interrupted-write tests
- [x] 2.3 Add renderer autosave, flush, restore, workspace-switch, and visible save/error state

## 3. Images and groups

- [x] 3.1 Implement secure image asset import/read APIs and real image rendering
- [x] 3.2 Implement structural group validation, derived bounds, movement, deletion, duplication, and page-copy ID rewriting
- [x] 3.3 Cover image/group undo-redo, persistence, serialization, and malicious-source regressions

## 4. Agent Design rail

- [x] 4.1 Replace disconnected file-writing runtime behavior with validated active-canvas commands and idempotent acknowledgements
- [x] 4.2 Apply Agent commands through renderer store actions with expected-revision checks, one-step history, persistence, and result status
- [x] 4.3 Implement the honest Design assistant rail with semantic progress, unavailable/conflict states, and localized text

## 5. Import, export, and delivery integrity

- [x] 5.1 Preserve supported ordering, images, groups, transforms, and multipath presets in SVG/PPTX flows with explicit fidelity warnings
- [x] 5.2 Verify direct PNG/SVG export limits and Design-to-Write rollback behavior
- [x] 5.3 Verify real PPTX delivery, packaged PPT Master resolution, runtime diagnostics, and artifact actions

## 6. Documentation and quality gates

- [x] 6.1 Correct Design architecture and user documentation so completion claims match tested behavior
- [x] 6.2 Remove generated/cache files and ensure the audited PPT Master provenance and packaged asset allowlist are deterministic
- [x] 6.3 Pass OpenSpec strict validation, brand boundary, ESLint, TypeScript, full Vitest, production build, and platform packaging checks
- [x] 6.4 Perform real installed-app Design/Write/PPT smoke testing or record a concrete environment blocker with a reproducible fallback test
- [ ] 6.5 Commit the corrected implementation in reviewable commits and push the current feature branch without adding `.codex/config.toml` or ZCode session state
