## Context

WorkWise is an Electron application with a bundled single Kun runtime retained from the last audited MIT baseline. The product shell already uses WorkWise in many places, but public preload names, legacy paths, release fallbacks, logs, settings schema V1, and several renderer helpers still expose older identities. Security and persistence controls are spread across the Electron main process and bundled runtime, with inconsistent treatment of non-existent path parents, links, redirects, request sizes, cancellation, and Windows atomic replacement.

The implementation must preserve the single bundled runtime required by `docs/AGENTS.md`, keep `agents.kun` as the persistence boundary, preserve user data during upgrade, and avoid using post-MIT Kun source. Existing user worktree changes must not be overwritten.

## Goals / Non-Goals

**Goals:**

- Make WorkWise the only product identity visible or newly written by the desktop application.
- Define versioned settings and compatibility imports that never require compatibility symlinks.
- Centralize containment, network, resource, cancellation, and durability policies.
- Make foreground and background work terminate deterministically and recover cleanly after crashes.
- Resolve the enumerated Write, Windows, Git, approval, and Skill refresh regressions.
- Enforce the baseline through automated tests and release gates.

**Non-Goals:**

- Replacing or adding a second bundled agent runtime.
- Renaming the audited runtime source under `kun/` or removing its provenance.
- Adding Design, Loop, MiMo, MiniMax multimodal, or post-MIT upstream implementation.
- Destructively deleting legacy user data during the compatibility window.

## Decisions

1. **WorkWise identity outside the runtime boundary.** Public preload and WorkWise-owned modules use WorkWise/runtime names. A small compatibility adapter retains `window.kunGui`, legacy environment reads, `agents.kun`, and migration inputs through 0.3.x. A static scanner prevents new leakage outside an explicit allowlist. This avoids both misleading product branding and a risky rewrite of the audited runtime.

2. **Settings V2 with revisioned commits.** The disk envelope includes `schema`, `version`, and `revision`. Partial saves carry an optional expected revision; successful commits increment it. Compatibility candidates are imported only when the WorkWise file is absent. This provides race detection without maintaining two writable schemas.

3. **Canonical containment is a shared service.** Reads resolve the target; creates resolve and inspect the nearest existing ancestor. Writes re-check containment before replacement and reject link/reparse traversal below the canonical root. Lexical `relative()` checks alone are insufficient for non-existent descendants.

4. **Safe web requests own redirects and connections.** WorkWise resolves every hostname, rejects non-public addresses, manually follows a bounded redirect chain, and pins a verified address to the socket while preserving Host/SNI. Relying on automatic fetch redirects cannot prevent private-address redirects or DNS rebinding.

5. **Limits are immutable ceilings.** A central contract publishes ceilings; configuration may only reduce them. Limit errors are structured and non-fatal. Replay overflow causes snapshot resynchronization instead of unbounded buffering.

6. **Cancellation is hierarchical.** App, window, workspace, thread, turn, and job controllers form parent/child scopes. Registered cleanup callbacks cover network streams, approvals, child work, timers, and processes. Terminal state is persisted through an idempotent finalizer.

7. **Durability uses serialized atomic commits.** A per-key queue prevents lost updates. Replacement writes use exclusive sibling temp files, fsync, a recoverable Windows backup sequence, and startup recovery. Direct overwrite fallback is prohibited. Append logs serialize append and compaction and tolerate only a recoverable partial tail.

8. **Write conversations are file-scoped.** The registry key is canonical workspace plus active file, with a scratch scope when no file is open. Sending awaits a successful document save and only consumes the composer snapshot after the runtime accepts a Turn.

9. **Cross-platform behavior is explicit.** Spawn validates cwd and executable before registration; Git review selects a contained repository root; approval lifecycle is reconciled from terminal Turn state; Skill catalogs carry a generation and change event.

10. **Release requires quality gates.** OpenSpec, brand scanning, security tests, type/lint/build, cross-platform packaging, and smoke tests run before the version tag is allowed to publish artifacts.

## Risks / Trade-offs

- **Large product-boundary rename can introduce missed references** → Keep a temporary compatibility adapter and make the brand scanner block unapproved occurrences.
- **Canonical link checks cannot eliminate every filesystem race** → Re-check immediately before rename, use exclusive temps, and reject link-bearing mutation paths.
- **Pinned-address HTTP handling is more code than fetch** → Isolate it behind a small adapter with DNS/redirect/IP test fixtures.
- **Hard limits can reject previously accepted oversized work** → Return explicit errors, preserve composer input, and expose effective limits in diagnostics.
- **Atomic Windows replacement may fail while antivirus holds a file** → Bounded retry and recoverable backup preserve the prior file rather than degrading to direct writes.
- **Legacy callers still rely on old preload/config names** → Read/forward compatibility lasts through 0.3.x and is covered by migration tests.

## Migration Plan

1. Introduce WorkWise V2 types, paths, public API, and compatibility readers before changing callers.
2. Move WorkWise-owned callers to the new API and names, then enable the brand scanner.
3. On first V2 startup, copy/import eligible legacy state to WorkWise locations, write a migration manifest, and leave source data untouched.
4. Add containment, safe fetch, resource, cancellation, and atomic storage services behind existing ports.
5. Migrate Write and background runtimes to the new lifecycle and persistence behavior.
6. Run compatibility, crash recovery, Windows, macOS, and packaging tests.
7. Rollback uses the untouched legacy source and preserved pre-replacement backups; V2 never rewrites legacy files.

## Open Questions

None. Product-level Kun cleanup, compatibility through 0.3.x, repository-pinned OpenSpec, and direct 0.2.5 stable release are confirmed.
