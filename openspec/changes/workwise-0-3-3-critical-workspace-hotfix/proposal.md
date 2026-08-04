# WorkWise 0.3.3 critical workspace hotfix

## Why

The 0.3.3 release exposes Code, Write, Design, Flow, and Scheduled Tasks as finished product surfaces, but several routes still share Code conversation state or omit required controls. This makes Design requests appear in Code, prevents Write users from attaching tender documents, hides the existing Scheduled Tasks editor behind Flow, and overstates PPTX import fidelity and Flow readiness.

## What changes

- Establish Code, Write, and Design as separate workspaces backed by the single WorkWise Runtime.
- Give Design a document-scoped assistant conversation and visible selection/annotation context.
- Give Write a full-size assistant and the same document attachment import lifecycle as the main composer.
- Move “New requirement” out of Code and into Write.
- Restore Scheduled Tasks as an operable screen while retaining migration and links to scheduled Flow.
- Gate Flow as Preview and make non-executable states explicit instead of presenting incomplete controls as ready.
- Make PPTX import disclose fidelity limits and provide a readable fidelity-first representation before editable conversion is considered complete.
- Add installed-app acceptance tests for all corrected routes before republishing.

## Impact

This corrects the 0.3.3 release but ships as updater-visible 0.3.4 because the release system requires a strictly increasing `x.y.z` version and cannot safely replace an installed build with an equal version. It does not introduce a second Agent runtime or alter user project files. The planned Extension/DeepSeek feature release moves to 0.3.5.
