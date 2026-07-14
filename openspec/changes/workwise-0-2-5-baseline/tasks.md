## 1. Baseline and provenance

- [x] 1.1 Pin OpenSpec 1.6.0, add repository commands, and make strict validation pass
- [x] 1.2 Add the four-column public behavior gap table with public-source links only
- [x] 1.3 Add CI quality-gate jobs for OpenSpec, brand, security, type, lint, tests, and build

## 2. Product identity and configuration

- [x] 2.1 Add WorkWiseSettingsV2, revisioned settings commits, and stale-write handling
- [x] 2.2 Implement idempotent read-only legacy import with backup and V2 migration manifest
- [x] 2.3 Move newly written runtime, MCP, Skill, tool, workspace, Write, Plan, and SDD paths to WorkWise locations
- [x] 2.4 Introduce window.workwise and WorkWiseApi, retaining window.kunGui only as a deprecated preload proxy
- [x] 2.5 Rename WorkWise-owned runtime modules, IPC names, environment variables, logs, assets, packaging, and release scripts
- [x] 2.6 Remove user-visible legacy product wording and add the allowlisted verify:brand-boundary scanner

## 3. Filesystem and package security

- [x] 3.1 Implement shared canonical containment with symlink, junction, device-path, and create-parent checks
- [x] 3.2 Enforce attachment identity, workspace/thread scope, file-type, count, and size limits
- [x] 3.3 Preflight and postflight Skill packages with entry, depth, file-count, per-file, and aggregate limits
- [x] 3.4 Bound workspace instruction discovery to the canonical workspace and reject external references
- [x] 3.5 Apply containment to Plan, SDD, Artifact, Write, and repository review operations

## 4. Network and resource governance

- [x] 4.1 Publish RuntimeResourceLimitsV1 and return effective immutable ceilings in runtime diagnostics
- [x] 4.2 Bound general and attachment HTTP request bodies with structured 413 and resource errors
- [x] 4.3 Replace automatic Web Fetch redirects with DNS/IP validation, address pinning, timeouts, and byte limits
- [x] 4.4 Bound SSE events, buffers, batches, concurrency, and replay with replay_reset resynchronization
- [x] 4.5 Bound model frames/text, tool inputs/results, Turn duration/steps/concurrency, shell output, processes, and caches

## 5. Cancellation and shutdown

- [x] 5.1 Implement hierarchical CancellationRegistry scopes and the cancelOperation public API
- [x] 5.2 Register model, fetch, MCP, tool, subtask, approval, schedule, IM, SSE, and shell cleanup
- [x] 5.3 Make thread, schedule, and IM deletion cancel and await work before durable removal
- [x] 5.4 Implement the ordered five-second application shutdown sequence and child-process cleanup

## 6. Durable persistence

- [x] 6.1 Implement per-key serial write queues and crash-safe sibling temporary-file replacement
- [x] 6.2 Remove unsafe Windows direct-overwrite fallback and add backup/replacement recovery
- [x] 6.3 Serialize JSONL append, rewrite, and compaction and recover incomplete trailing records
- [x] 6.4 Move settings, sessions, Memory, attachments, artifacts, plans, Write files, and manifests onto durable queues
- [x] 6.5 Validate attachment/artifact/export formats before atomically replacing user-visible files

## 7. Write reliability

- [x] 7.1 Await flushSave before Turn creation and preserve composer/quotes until a Turn id is accepted
- [x] 7.2 Upgrade the Write assistant registry to canonical file-scoped V2 with rename, archive, and scratch behavior
- [x] 7.3 Include relative path, content hash, save revision, and quoted selection in Write prompts
- [x] 7.4 Fix long/unclosed fences, authentic list markers, viewport widgets, and selection-toolbar positioning
- [x] 7.5 Add settings generation tokens and expectedRevision retry-once field patching

## 8. Platform and live-state fixes

- [x] 8.1 Add safeSpawn validation, cwd fallback, structured EPERM/ENOENT errors, and reliable cleanup
- [x] 8.2 Discover contained nested Git repositories and add ReviewTarget.repositoryRoot selection
- [x] 8.3 Expire stale approvals from Turn snapshots, terminal SSE, decisions, cancellation, and timeout
- [x] 8.4 Add SkillCatalogSnapshot generation, skills:changed broadcasts, and slash-menu coalesced refresh

## 9. Verification and release

- [x] 9.1 Add brand, migration, containment, SSRF, resource-boundary, cancellation, persistence, Write, Windows, Git, approval, and Skill tests
- [x] 9.2 Pass OpenSpec strict validation, brand verification, ESLint, TypeScript, Vitest, Electron smoke, and production build
- [ ] 9.3 Verify macOS arm64/x64 and Windows x64 packaging with WorkWise artifact names and update metadata
- [x] 9.4 Complete short local stress verification and configure the two-hour pre-release and eight-hour nightly stability jobs
- [ ] 9.5 Update version and release notes to 0.2.5, commit the staged phases, push, merge, tag, and verify the GitHub Actions release
