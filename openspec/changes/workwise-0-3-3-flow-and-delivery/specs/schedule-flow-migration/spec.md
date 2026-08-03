## ADDED Requirements

### Requirement: Legacy scheduled tasks migrate idempotently to Flow
On first successful 0.3.3 Runtime startup, WorkWise SHALL convert each legacy scheduled task to a `schedule_trigger → agent` Flow exactly once.

#### Scenario: Existing task is migrated
- **WHEN** a legacy task has not previously been migrated
- **THEN** WorkWise creates and publishes one Flow preserving title, enabled state, model, reasoning, mode, prompt, workspace, next-run time, and historical thread reference

#### Scenario: Migration runs again
- **WHEN** startup or compatibility synchronization repeats for the same legacy task
- **THEN** WorkWise updates or reuses the same mapped Flow without creating a duplicate definition or published version with identical configuration

### Requirement: Migration preserves a one-version read-only backup
WorkWise SHALL persist the original legacy schedule settings as a read-only backup for one version and SHALL record a durable migration marker only after successful Flow synchronization.

#### Scenario: Runtime migration fails
- **WHEN** Flow synchronization does not complete successfully
- **THEN** WorkWise does not write the completion marker and leaves legacy execution available for retry

#### Scenario: Runtime migration succeeds
- **WHEN** all legacy tasks are represented by Flow
- **THEN** WorkWise writes the marker referencing the backup and prevents the legacy scheduler from executing tasks

### Requirement: Compatibility schedule operations route through Flow
After the migration marker exists, manual run, create, update, and delete operations through legacy schedule APIs SHALL forward to the mapped Flow behavior and SHALL NOT restart a parallel legacy execution loop.

#### Scenario: User manually runs a migrated task
- **WHEN** a legacy surface requests “run once” for a migrated task
- **THEN** WorkWise starts the mapped published Flow and returns its run reference

#### Scenario: User deletes a migrated task
- **WHEN** a compatibility delete operation succeeds
- **THEN** WorkWise archives the mapped Flow and removes the legacy compatibility entry without scheduling another run

### Requirement: Scheduled Flow timing remains deterministic
Migrated interval, daily, one-time, and manual schedules SHALL preserve their semantics, and a one-time trigger SHALL disable itself after execution.

#### Scenario: Daily task migrates
- **WHEN** a task configured for a local daily time is migrated
- **THEN** its Flow trigger computes the next future occurrence at that local time

#### Scenario: One-time task executes
- **WHEN** its scheduled timestamp becomes due
- **THEN** the Flow starts once and its trigger is disabled rather than computing a recurring execution
