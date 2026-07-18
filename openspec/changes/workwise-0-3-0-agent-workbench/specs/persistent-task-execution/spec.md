## ADDED Requirements

### Requirement: User work persists beyond a model turn
WorkWise SHALL represent every submitted request as a versioned task run whose attempts, nodes, acceptance contract, checkpoints, and lease survive renderer and application restarts.

#### Scenario: Application restarts during safe work
- **WHEN** WorkWise starts with a task whose current idempotent node was running
- **THEN** it reacquires the expired lease, restores the checkpoint, and continues without adding a duplicate user message

### Requirement: Completion is deterministic
WorkWise MUST NOT complete a task unless its acceptance contract is satisfied, a non-empty final response exists when required, all mandatory nodes are complete, and no protected work remains pending.

#### Scenario: Model emits reasoning without a final answer
- **WHEN** a model attempt ends after producing reasoning but no final assistant response
- **THEN** WorkWise checkpoints and continues or reports a typed failure instead of completing the task

#### Scenario: Attempt reaches a resource boundary
- **WHEN** an attempt reaches its step or duration limit before acceptance
- **THEN** WorkWise creates a continuation attempt within the task budget instead of silently completing

### Requirement: Retry and stall behavior is bounded
WorkWise SHALL retry only recoverable or declared-idempotent work, replan after three progress-free attempts, and enter an explicit stalled state after two progress-free replans.

#### Scenario: Task cannot make progress
- **WHEN** two replans produce no new node transition, tool evidence, or artifact
- **THEN** WorkWise displays the stall reason and offers continue, switch-model, and adjust-request actions

### Requirement: Cancellation covers the task tree
WorkWise SHALL cancel the task's model stream, tools, child tasks, Shell processes, approvals, input waits, timers, and leases, and SHALL write terminal events exactly once.

#### Scenario: User cancels a running parent task
- **WHEN** the user cancels a task with active child and Shell work
- **THEN** all owned work terminates and no later completion event is emitted
