# Platform Compatibility

This skill is intentionally portable:

- The required entrypoint is `SKILL.md`.
- Optional context lives in `references/`.
- Optional deterministic checks live in `scripts/`.
- No MCP tool, cloud service, browser session, or proprietary API is required.

## Codex

Use one of these patterns:

- Keep this folder under a workspace skill directory and explicitly ask: `Use $tender-master ...`.
- Copy or sync the `tender-master` folder into the Codex skills directory used by your environment.
- Keep `agents/openai.yaml` for Codex UI metadata. It is optional for other agents.

## OpenClaw

OpenClaw skills are compatible with the same folder model: a skill directory with `SKILL.md` plus optional resources. Put this folder in an OpenClaw-discovered skills location or add the folder as an external skill path according to the current OpenClaw configuration.

## Hermes

Use the same folder as a file-backed skill or knowledge/tool instruction package. If Hermes expects a different manifest, keep `SKILL.md` as the canonical instruction source and map its metadata fields to the Hermes manifest:

- `name` -> skill/tool name
- `description` -> trigger and routing description
- body -> execution instructions
- `references/` -> lazily loaded supporting docs
- `scripts/` -> local tools, if Hermes allows command execution

## Compatibility Rules

- Do not depend on platform-specific UI prompts for correctness.
- Prefer plain Markdown, local files, and standard Python.
- Treat script execution as optional; the skill must still work by reading tender documents and producing ledgers/reviews manually.
- When a platform cannot run scripts, reproduce the same checks from `scripts/bid_quality_check.py` as a written checklist.
- When a platform cannot access local files, ask the user to upload tender text and generated drafts in batches.
