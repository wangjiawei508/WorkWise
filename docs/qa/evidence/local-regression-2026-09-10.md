# Local regression evidence (2026-09-10)

## Scope

This record covers the current working tree after rebuilding the local
`better-sqlite3` module for the host Node ABI. It does not replace packaged
GUI, installer/updater, signing/notarization, or real multi-format acceptance.

## Environment correction

The first run loaded a native module built for Node ABI 148 while the host test
runner uses ABI 147. The resulting failures occurred while opening SQLite and
were not application assertions. The module was rebuilt locally with:

```text
npm rebuild better-sqlite3 --build-from-source
```

After the rebuild, `require('better-sqlite3')` succeeds under the host Node
runtime.

## Results

| Check | Result |
| --- | --- |
| `npm --prefix kun test` | 138 files; 1574 passed; 1 skipped |
| `npm test -- --maxWorkers=2` | 304 files; 2438 passed; 2 skipped |
| `npm run typecheck -- --pretty false` | passed |
| `npm run lint` | 0 errors; 1 existing Hook dependency warning |
| `npm run openspec:validate` | 11/11 strict items passed |
| `npm run verify:document-licenses` | passed |
| `npm run verify:specialist-skills` | 25 skills, 2 aliases passed |
| `npm run verify:build-freshness` | 957 production inputs passed |
| `npm run build` | passed |
| `npm run verify:brand-boundary` | 1514 files passed |
| `git diff --check` | passed |

The brand-boundary scanner now explicitly allows `docs/qa/evidence/` so exact
legacy identifiers in audit records, such as the historical bundle ID, remain
readable without weakening product-facing source checks.

## Remaining release gates

The three release blockers remain: packaged GUI interaction and screenshots,
installed signed/notarized candidate plus real updater round-trip, and a second
independent P0 vendor format completed in the packaged application. No public
version, tag, release, stable/frontier promotion, or download page was changed.
