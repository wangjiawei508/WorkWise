# Real Trimble/Zeiss M5 production evidence

Date: 2026-09-10 (Asia/Shanghai)

This evidence uses the mounted project files from the same leveling deliverable:

- Raw M5 aBFFB source: `/Volumes/MOVESPEED/中铁咨询/轨道精密测量/2014年宁波报奖/试验段评审/试验段-轨道基础控制网评估/望春桥站-泽明站-右线/工程项目/水准高程数据/s6g03-s7g48原始数据.DAT`
- Known-height control points: the paired `s6g03-s7g48原始数据.BM1`
- Independent published reference: the paired `s6g03-s7g48原始数据.ou1`

The run completed the deterministic local chain:

`M5 DAT import -> source preflight -> known-point mapping -> leveling adjustment -> DOCX/PDF/XLSX/manifest`

Results are stored in `result.json`.

- Format: `trimble-m5`, vendor `Trimble/Zeiss`, parser `trimble-m5-abffb-parser@0.2.0`
- Source: 90,748 bytes, 750 raw-record anchors, 148 linked aBFFB observations
- Preflight: `adjustment-ready`; `.dat` suffix/content conflict retained as a warning
- Adjustment: completed, valid, 148 observations, 78 points, 72 degrees of freedom, precision gate passed
- Reference: all 74 published OU1 points matched; maximum difference `0.111401 mm`; zero standard-error-envelope mismatches
- Extra adjusted points: 4 internal turning points retained for provenance but omitted from the published OU1 table
- Outputs: DOCX, PDF, XLSX evidence, and manifest all validated with hashes

The evidence is still isolated-runtime evidence. It does not by itself claim packaged GUI acceptance, signing/notarization, updater acceptance, or public release approval.
