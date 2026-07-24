## Context

WorkWise bundles offline Skills from `src/asset/skills/`, installs them through the bounded `installBundledSkill` flow, and exposes selected capabilities through immutable built-in Agent profiles and a localized Skill marketplace. The requested sources include one user-owned ZIP and four public GitHub repositories, but public visibility does not itself grant redistribution rights.

The source audit produced this matrix:

| Package | Locked source | License result | Product treatment |
| --- | --- | --- | --- |
| Tender Master | User-supplied ZIP | User-authored package | Audited, corrected and bundled |
| Document Illustrator | `8344815d407cc25cc04c327557f36ed839f0aaef` | MIT | Adapted and bundled |
| Guizang Social Card | `cf4b810fac1c73fb65a2bb31d8c9278d82cbc4c5` | AGPL-3.0 plus separate commercial platform terms | Link only until written commercial authorization |
| Guizang Material Illustration | `cf26e194ce075cd205329abab29cc71fda3e78b2` | No repository license | Link only until written redistribution authorization |
| Logo Generator | `bf4e9ac4d4428bda261afcfe981871ceb92d94e6` | README mentions MIT; no formal LICENSE or complete notice | Link only until license is clarified |

## Goals / Non-Goals

**Goals:**

- Make Tender Master and Document Illustrator installable offline through the normal WorkWise Skill boundary.
- Keep exact upstream provenance, license evidence, Chinese-first marketplace copy, and deterministic installation tests.
- Adapt third-party instructions to WorkWise workspace, credential, image-generation, artifact, and completion rules.
- Prevent restricted or ambiguous sources from entering client installers while still making their project pages discoverable.
- Verify Tender Master safety and local scripts, Document Illustrator delivery semantics, localization, packaging, and Agent behavior before a candidate is considered publishable.

**Non-Goals:**

- Treating a public GitHub repository as permission to redistribute.
- Relicensing AGPL or unlicensed source, contacting authors, or purchasing a commercial license on the user's behalf.
- Shipping legacy Gemini scripts that read `.env` or `~/.claude/skills`.
- Adding a second image-provider credential path, hidden document upload, or automatic upstream self-update.
- Publishing 0.3.2 without a separate user confirmation after candidate acceptance.

## Decisions

### Use exact source revisions

GitHub sources are downloaded through the GitHub API and recorded by immutable commit SHA. The adapted bundled package records its source in `references/upstream.md`; marketplace cards link to the canonical repository.

Alternative considered: follow `main` automatically. Rejected because it makes installer contents non-reproducible and can import new license or security changes without review.

### Keep license-blocked projects out of packaged assets

Social Card, Material Illustration, and Logo Generator remain marketplace links with explicit authorization status. A regression test asserts that their source directories do not exist under `src/asset/skills/`.

Alternative considered: bundle the files with attribution only. Rejected because Social Card's commercial terms explicitly cover AI product and Agent-platform embedding, while the other two lack sufficient repository-level redistribution evidence.

### Adapt Document Illustrator to WorkWise instead of shipping its credential scripts

The MIT package retains the three visual-style references and license. Its runtime instructions are rewritten to use WorkWise document parsing, configured image generation, workspace-relative outputs, visual inspection, and real artifact cards. The upstream Python scripts are excluded because they read `GEMINI_API_KEY`, `.env`, and legacy Claude locations and call an external provider directly.

Alternative considered: ship the scripts disabled. Rejected because dormant credential paths are still easy for an Agent to invoke and create a second, unaudited exfiltration boundary.

### Preserve Tender Master truthfulness and final-delivery gates

The user-owned package is normalized into a valid Skill, retains seven local-only helper scripts, and adds a native `tender-master` profile. Mandatory parameters and acceptance conditions stay in final responses even when internal risk annotations are isolated. Missing evidence, real deviations, placeholders, or invalid deliverables block completion.

### Reuse existing installation and packaging paths

Both bundled packages use the existing bundled-Skill installer, source metadata, resource limits, Skill catalog refresh, and Electron asset inclusion. Runtime startup idempotently provisions the two audited packages into `~/.workwise/skills`; an unmanaged package with the same id is never overwritten. The marketplace install action remains available as an explicit repair or workspace-scoped copy path. No new IPC is introduced.

## Risks / Trade-offs

- [Risk] The user expects all four GitHub projects to be physically bundled. → Mitigation: expose the exact licensing evidence and keep the project cards visible; bundle immediately after valid written authorization is supplied and audited.
- [Risk] Document illustration can be selected without an image provider. → Mitigation: generate a plan, report the missing provider clearly, and never claim image files exist.
- [Risk] Tender heuristics may miss a requirement or scoring row. → Mitigation: label extraction as draft-only, retain anchors, and require human confirmation and final validation.
- [Risk] Upstream changes after the locked commits are not included. → Mitigation: upgrades are separate reviewed changes, not implicit marketplace updates.
- [Risk] A built-in Tender Agent can be selected while startup provisioning is unavailable or blocked by an unmanaged same-id package. → Mitigation: critical guardrails live in the Agent prompt, the profile declares `tender-master` as its preferred Skill, and missing Skill resources are reported instead of invented.

## Migration Plan

1. Ship the new bundled directories and marketplace/Agent entries in the next 0.3.2 candidate.
2. On runtime startup, idempotently provision the audited Tender Master and Document Illustrator packages into the WorkWise global Skill root; no document migration is required.
3. Already installed unmanaged user Skills are not overwritten; managed bundled copies may be repaired from the audited application assets.
4. Rollback removes the bundled assets, cards and Agent profile without deleting user documents or previously installed copies.
5. If valid authorization for a blocked source is later provided, create a separately audited change that records the authorization and exact files before changing its card to bundled.

## Open Questions

- Has the user obtained written platform-embedding authorization for Guizang Social Card?
- Will the authors add formal repository licenses for Material Illustration and Logo Generator, or provide equivalent written redistribution permission?
