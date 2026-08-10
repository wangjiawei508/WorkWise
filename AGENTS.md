# WorkWise Delivery Rules

## Release gate

- Do not change the public version, create or move a Git tag, publish or edit a GitHub Release, promote a stable or frontier feed, or update the official download page without explicit user approval naming the exact version and action.
- CI success, unit tests, a successful build, or a green GitHub Action is necessary evidence but is never release approval.
- Candidate builds must use a private, isolated feed and must never be promoted to `stable` or advertised as an official release.
- Before requesting release approval, install the final packaged application locally and record: package version, signature/notarization result, screenshots of the reviewed UI, a functional checklist, and a real updater round-trip report.
- The user must personally confirm the installed UI and required functions before any public release operation. The confirmation must identify the exact version to publish.
- A failed or incomplete local acceptance test blocks release. Do not replace it with a mocked updater test or a manual website download.

## Compatibility and migration

- Never silently delete an existing plugin, MCP configuration, Skill, credential reference, or user data during a catalog migration.
- Any plugin removal, replacement, license restriction, or default-state change requires a migration matrix showing the old item, new status, reason, data-preservation behavior, and user action.
- Keep legacy IPC/config readers as migration compatibility until the replacement has been exercised against real user data.

## UI acceptance

- Glass material is limited to approved window chrome, startup UI, and transient overlays. Work surfaces and navigation content must remain readable and opaque enough for scanning.
- A visual change is not complete until it has been checked in the packaged application at the supported themes and window sizes, then shown to the user for confirmation.
