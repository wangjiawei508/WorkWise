## ADDED Requirements

### Requirement: Durable mutations are serialized per key
Concurrent mutations of settings, sessions, Memory, attachments, plans, artifacts, or workspace files SHALL execute through a per-key queue.

#### Scenario: Concurrent settings patches
- **WHEN** two settings patches overlap in time
- **THEN** they commit in order with monotonically increasing revisions and neither silently overwrites the other

### Requirement: Replacement writes preserve a complete old or new value
Replacement writes SHALL use exclusive sibling temporary files, durable flush, recoverable rename, and startup recovery, and SHALL never fall back to direct overwrite.

#### Scenario: Windows replacement is interrupted
- **WHEN** the process stops between backup and final rename
- **THEN** the next startup restores either the previous complete file or the new complete file

### Requirement: Append logs coordinate append and compaction
Thread item/event append, update, rewrite, and compaction SHALL share a queue and SHALL recover an incomplete trailing line.

#### Scenario: Crash during JSONL append
- **WHEN** WorkWise restarts after a partial final JSONL record
- **THEN** it removes only the incomplete tail and preserves all prior valid records
