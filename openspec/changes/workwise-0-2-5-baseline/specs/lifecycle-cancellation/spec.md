## ADDED Requirements

### Requirement: Operations participate in hierarchical cancellation
Network, model, tool, subtask, approval, schedule, IM, SSE, MCP, and shell operations SHALL register beneath an app, window, workspace, thread, Turn, or job cancellation scope.

#### Scenario: Turn cancellation
- **WHEN** a user cancels a Turn
- **THEN** all child operations stop and pending items reach exactly one aborted, cancelled, or expired terminal state

### Requirement: Deletion cancels before removal
Deleting a thread, scheduled task, or IM channel SHALL cancel and await its registered work before removing durable state.

#### Scenario: Delete running thread
- **WHEN** a running thread is deleted
- **THEN** its model, tools, approvals, SSE, and process trees stop before thread files are removed

### Requirement: Application shutdown is deterministic
Application exit SHALL stop ingress, cancel work, close streams and servers, drain persistence, stop child runtimes, and close indexes within a bounded grace period.

#### Scenario: Quit with background work
- **WHEN** WorkWise quits while Turns, schedules, IM, or shells are active
- **THEN** no managed child process, listener, timer, or persistence lock remains after exit
