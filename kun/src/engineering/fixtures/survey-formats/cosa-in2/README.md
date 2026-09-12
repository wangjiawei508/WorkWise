# COSA `.in2` synthetic parser fixtures

These fixtures are **synthetic test inputs only**. They were written from the
project's documented COSA `.in2` grammar for A-05 parser groundwork; they are
not copied from a project, instrument, or COSA distribution, and are not
vendor-certified format samples.

## Scope and conventions

- The three values on line 1 represent direction prior sigma (arc-seconds),
  distance constant prior sigma (millimetres), and distance ppm prior sigma.
- A three-field `point,X,Y` line is a known point. A one-field line starts a
  station block. The first `L` record in every block is the backsight reset
  record and must have a compact DMS value of `0`.
- `L` is a direction; `S` is a distance. `S,0` deliberately represents a
  known edge, not a zero-length observation.
- All input files deliberately contain no comments so a parser can test only
  the file grammar. See `manifest.json` for expected parser outcomes.

## Important limits

The golden files are minimal structural examples, not survey results and not
third-party interoperability evidence. They must not be used to claim that a
future writer has been accepted by COSA. Production or cross-software claims
still require separately authorized, de-identified real fixtures and the
third-party verification required by A-06.
