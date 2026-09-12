# Open-format survey research samples

These files were retrieved through `ego-browser` from fixed public Git
commits on 2026-09-06. `MANIFEST.json` records the immutable source URL,
repository commit, Git blob SHA-1, local SHA-256, byte length, and the
repository's declared license.

The samples are retained in an isolated research directory. They are used for
parser detection, raw-record anchors, encoding, and provenance regression
only. A public repository license does not prove that a file was captured in
the field, does not provide a manufacturer interoperability warranty, and
does not supply a datum or covariance. WorkWise therefore keeps every sample
`archive-only` and never uses it as an adjustment-ready network.

| File | Source | License | Intended coverage |
| --- | --- | --- | --- |
| `pynadjust-gsisample.gsi` | [PynAdjust `804e0376`](https://github.com/icsm-au/PynAdjust/tree/804e0376aa995fe05976aeb47bf9dea2ff974408) | Apache-2.0 | Leica GSI16 lexer/parser regression |
| `osgeolab-labor.gsi` | [OSGeoLabBp tutorials `8809157e`](https://github.com/OSGeoLabBp/tutorials/tree/8809157e57a35d61ae85b3d324c8ca3a71a35e20) | CC0-1.0 | Leica GSI16 unit/record regression |
| `osgeolab-sample.m5` | [OSGeoLabBp tutorials `8809157e`](https://github.com/OSGeoLabBp/tutorials/tree/8809157e57a35d61ae85b3d324c8ca3a71a35e20) | CC0-1.0 | Trimble/Zeiss M5 tagged-record inspection |
| `trimble-jobxml-test.jxl` | [JobXML `1039859f`](https://github.com/KubaSzostak/JobXML/tree/1039859fb52e3747f48ae86bef0a33e515e55f3a) | MIT | Trimble JobXML XML detection and anchor regression |
| `openbim-landxml-example.xml`, `openbim-landxml-client.xml` | [openBIM-surveyor `e88e0e79`](https://github.com/louistrue/openBIM-surveyor/tree/e88e0e79931eae92401c79c824ca0fde1495e119) | AGPL-3.0 | LandXML root, points, Units, and source-anchor regression |
| `orekit-hatanaka.crx`, `orekit-sinex.snx`, `orekit-antex.atx`, `orekit-sp3.sp3` | [Orekit `53842a2e`](https://github.com/CS-SI/Orekit/tree/53842a2e4f272bb732b10f7cb1d97bd755a926d1) | Apache-2.0 | Hatanaka, SINEX, ANTEX, and SP3 GNSS inspection regression |
