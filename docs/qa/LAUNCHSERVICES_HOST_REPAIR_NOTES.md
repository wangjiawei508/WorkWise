# macOS LaunchServices host repair notes (2026-09-09)

## Evidence (read-only checks)

- Host: macOS 26.6.2 (build 25G83), arm64.
- `mdutil -s /`, `/System/Volumes/Data`, `/System/Volumes/Preboot`, and `/System/Volumes/VM` all report: `Spotlight server is disabled.`
- `lsregister -lint` fails to scan both `/Applications/WorkWise.app` and the 0.5.0 candidate with `-10822 from spotlight`.
- `lsregister -dump` reports a newly initialized/unseeded store (`CacheSequenceNum: NOT FOUND`, `Path: NOT FOUND`, database path `?`).
- 0.5.0 candidate passes `codesign --verify --deep --strict`; its Info.plist is valid and the executable is present. Therefore this is not a candidate packaging or ASAR defect.
- 0.4.1 installed WorkWise and 0.5.0 candidate both abort in AppKit `RegisterApplication`, consistent with the broken host LaunchServices/Spotlight state.

## Minimal recovery sequence (run in a real native Terminal, not the Codex sandbox)

1. Quit WorkWise, Finder windows that reference the candidate, and other GUI test processes.
2. Check indexing state: `mdutil -s /` and `mdutil -s /System/Volumes/Data`.
3. Re-enable Spotlight indexing (requires administrator approval):
   `sudo mdutil -i on /`
   `sudo mdutil -i on /System/Volumes/Data`
4. Rebuild the volume index (index data only; does not delete user documents):
   `sudo mdutil -E /`
   `sudo mdutil -E /System/Volumes/Data`
5. Restart the per-host LaunchServices daemon: `killall lsd` (it is supervised and should relaunch).
6. Reseed registrations without deleting the database:
   `/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -seed`
7. Reboot macOS if `lsregister -lint <app>` still returns `-10822`; then re-run the lint check and candidate GUI test.

## Escalation only with explicit approval

`lsregister -kill -r -domain local -domain system -domain user` forcibly deletes/recreates the LaunchServices database and requires a reboot. Do not run this as the first step; preserve a copy of any user LaunchServices state and obtain approval before using it.

After recovery, re-run `lsregister -lint <candidate>`, `codesign --verify --deep --strict <candidate>`, then the packaged-app UI checklist. Do not mark release-gate GUI tasks complete until the native-window screenshots and updater round-trip are recorded.

## Recovery executed

Using administrator-approved local execution on 2026-09-09:

```text
lsregister -r -domain local -domain system -domain user
killall sharedfilelistd
killall lsd
killall Finder
```

Post-recovery checks:

- `mdutil -s /` -> `Indexing enabled`.
- `mdutil -s /System/Volumes/Data` -> `Indexing enabled`.
- `lsregister -lint /Applications/WorkWise.app <candidate>` -> exit 0.
- `open -n` for Terminal.app, installed WorkWise, and the 0.5.0 candidate -> exit 0.
- No new candidate crash report was created after the recovery.

This resolves the host registration failure. It does not by itself constitute GUI acceptance;
native-window interaction and screenshots are still required.
