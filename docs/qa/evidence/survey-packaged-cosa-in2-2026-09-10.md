# Packaged COSA IN2 production evidence

Date: 2026-09-10 (Asia/Tokyo)

This is a private, directory-only arm64 package check. It is not a public release
and it is not GUI acceptance.

## Package

- App: `/private/tmp/workwise-gui-current-dist2/mac-arm64/mac-arm64/WorkWise.app`
- Package version: `0.4.2` (public version unchanged)
- Bundle ID: `com.wangjiawei508.workgpt`
- Electron: `43.1.1`; Node ABI: `148`; architecture: `arm64`
- `app.asar` SHA-256: `0683bc323312f972e94e801471bd936270f0a52b63b97cd3ebcc8417e4361aec`
- ASAR integrity: `18,364` files and `461` compiled output files; `codesign --verify --deep --strict` passed
- Packaged runtime modules were present and loaded, including `survey-cosa-ou2.js`.

## Source and reference

- Input: NAS `InPush(0704c10--0712c13).in2`
- Input SHA-256: `3a01828c195bc6a7cee89d4293f21c1957b51ad150d16066980d1066a2b40500`
- Reference: NAS `InPush(0704c10--0712c13).ou2`
- Reference SHA-256: `5c72252c90038bb3713c3d4bb0834cdd53cc693c3c99810f1b2d8ea6268934b7`
- Detection: COSA `.in2`, confidence `0.98`, parser `cosa-in2-parser@0.3.0`
- Preflight: `adjustment-ready`; source integrity `verified`; no blocking diagnostics

## Deterministic delivery result

- Observations: `160`; stations: `11`; output points: `33`; degrees of freedom: `87`
- Adjustment: `completed`, `valid`, `precision.passed=true`; algorithm `workwise-survey-adjustment-6`; iterations `3`
- Maximum standardized residual: `1.93381σ <= 3σ`
- OU2 comparison: `33` points, `0` mismatches
- Maximum planar coordinate difference: `0.00006341583922171748 m`
- Maximum combined normalized difference: `0.08899925199598996σ <= 1σ`
- Generated and validated: `report.docx`, `report.pdf` (4 pages), `evidence.xlsx`, and `manifest.json`
- Manifest: `valid=true`, `reviewStatus=draft`, runtime version `0.5.0`

This evidence closes the packaged-runtime portion for the COSA IN2 pairing only.
It does not close GUI acceptance, installation/updater acceptance, or the required
second vendor P0 format; those remain release blockers.
