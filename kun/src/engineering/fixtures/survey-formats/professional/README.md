# Professional survey format fixtures

These files are synthetic, bounded parser fixtures. They exercise format detection,
record preservation, canonical-unit handling, and blocking behavior only. They are
not licensed vendor samples and do not establish vendor interoperability or
`adjustment-ready` status.

`manifest.json` records the intended format, parser evidence class, and whether a
fixture is expected to produce observations or a blocking diagnostic. The matrix
also includes independent SDR20/SDR33 layouts and a Trimble M5 record carried by
the commonly ambiguous `.dat` suffix. `survey-native-format-golden.test.ts`
keeps expected values separate from parser implementation code.
