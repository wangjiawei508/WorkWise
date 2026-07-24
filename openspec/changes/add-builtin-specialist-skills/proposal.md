## Why

WorkWise needs useful specialist Skills to be available from the product rather than copied manually, but upstream GitHub packages cannot be redistributed merely because their source is public. This change integrates the user-owned Tender Master package and the permissively licensed Document Illustrator while making source, license, credential, and packaging checks a release requirement for requested third-party Skills.

## What Changes

- Bundle the audited Tender Master Skill and expose its immutable native Agent profile.
- Add a chat-composer Agent selector so built-in and configured Agents can actually be assigned to the active thread, with revision-safe retry behavior.
- Pull and lock the four requested `op7418` GitHub repositories to exact commits before reviewing or adapting them.
- Bundle the MIT-licensed Document Illustrator as a WorkWise-native Skill that uses the configured image provider instead of reading Gemini keys or legacy `.claude` paths.
- Show the Social Card, Material Illustration, and Logo Generator projects in the marketplace without redistributing their files until the required commercial or redistribution authorization is available.
- Add Chinese-first and English marketplace copy that explains whether a package is bundled or blocked by source licensing.
- Add regression tests for bundled installation, upstream revision and license retention, forbidden credential paths, restricted-source exclusion, Agent safety, and representative tender/document-illustration workflows.
- Keep the public 0.3.2 release blocked until the new packages and existing Design usability candidate pass the applicable gates.

## Capabilities

### New Capabilities

- `builtin-specialist-skills`: Audited offline specialist Skills, Tender Master Agent guidance, third-party source and license boundaries, marketplace discovery, and verified installation behavior.

### Modified Capabilities

None.

## Impact

- Adds or changes assets under `src/asset/skills/`, built-in Agent profiles, Skill marketplace cards, Chinese/English locale resources, tests, and OpenSpec evidence.
- Does not add new public IPC, background uploads, credential stores, or automatic upstream updates.
- Does not place AGPL or unlicensed upstream code in the three client installers without separate written authorization.
