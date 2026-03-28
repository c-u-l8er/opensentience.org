# Skill 02 — Agent Lifecycle

> Managing agent lifecycle: the state machine, transitions, and
> GenStateMachine internals.

---

## Why This Matters

Every governed agent has a lifecycle. The state machine ensures agents cannot
skip steps — you cannot run an agent that has not been enabled, and you cannot
remove an agent that is still running. This prevents orphaned processes,
ungoverned execution, and permission leaks.

---

## The State Machine

```
installed --> enabled --> running
                ^          |
                |          v
                +--- enabled (stop)
                       |
                       v
                    disabled --> removed
```

### States

| State | Meaning | Process Running? |
|-------|---------|-----------------|
| `installed` | Registered with permissions, awaiting activation | No |
| `enabled` | Supervised process started | Yes (idle or working) |
| `running` | Actively executing a task | Yes |
| `disabled` | Process stopped, can be re-enabled | No |
| `removed` | Fully deregistered, permissions cleared | No |

### Valid Transitions

| From | To | Trigger | Tool |
|------|----|---------|------|
| `installed` | `enabled` | Operator activates agent | `agent_enable` |
| `enabled` | `running` | Agent begins work | Automatic |
| `running` | `enabled` | Agent completes work | Automatic |
| `enabled` | `disabled` | Operator stops agent | `agent_disable` |
| `running` | `disabled` | Operator force-stops agent | `agent_disable(force: true)` |
| `disabled` | `enabled` | Operator re-activates | `agent_enable` |
| `disabled` | `removed` | Operator deregisters | `agent_remove` |

Invalid transitions (e.g., `installed` directly to `running`, or `removed`
to any state) are rejected by the GenStateMachine.

---

## agent_install — Registering an Agent

### Manifest Schema

```json
{
  "agent_id": "my-worker",
  "name": "My Worker Agent",
  "child_spec": {"module": "MyApp.Worker", "args": []},
  "permissions": {
    "granted": [
      {"type": "filesystem", "access": "read", "resource": "/data/**"}
    ],
    "denied": [
      {"type": "filesystem", "access": "write", "resource": "/etc/**"}
    ]
  },
  "metadata": {
    "version": "1.0.0",
    "source": "agentelic"
  }
}
```

### What Happens on Install

1. PermissionEngine writes grants and denials to ETS
2. AgentSupervisor starts a new AgentLifecycle GenStateMachine
3. Initial state is set to `:installed`
4. AuditWriter logs the install event with full manifest

### Denied Permissions

Explicit denials take precedence over grants. If you grant `filesystem:read:/data/**`
but deny `filesystem:read:/data/secrets/**`, the denial wins for any path
matching `/data/secrets/**`.

---

## agent_enable — Starting the Agent

```
agent_enable(agent_id: "my-worker")
```

1. GenStateMachine validates the transition (must be in `installed` or `disabled`)
2. The wrapped `child_spec` is started under AgentSupervisor
3. State transitions to `enabled`
4. Audit entry is written
5. AutonomyController sets default level (`observe`) if not already set

---

## agent_disable — Stopping the Agent

### Graceful Stop

```
agent_disable(agent_id: "my-worker")
```

1. Sends a shutdown signal to the wrapped process
2. Waits for configurable timeout (default 5 seconds)
3. If process exits cleanly, state transitions to `disabled`
4. Audit entry records graceful shutdown

### Emergency Stop

```
agent_disable(agent_id: "my-worker", force: true)
```

1. Immediately kills the wrapped process (`:kill` signal)
2. State transitions to `disabled`
3. Audit entry records forced shutdown with reason

---

## GenStateMachine Internals

Each AgentLifecycle is a `gen_statem` process with the following structure:

- **State data:** agent_id, child_spec, current PID (when running), metadata
- **Callbacks:** `handle_event/4` for each valid transition
- **Invalid transitions:** return `{:keep_state_and_data, []}` with an error
  logged to the audit trail
- **Crash handling:** if the wrapped process crashes, the AgentLifecycle
  transitions back to `enabled` (not `disabled`) and the DynamicSupervisor
  restart strategy applies

---

## Common Lifecycle Patterns

### Install-and-Observe

The most conservative pattern. Install the agent, enable it at `observe`
level, review its recommendations in the audit trail, then gradually
promote to `advise` and `act`.

```
agent_install(manifest) --> agent_enable(agent_id) --> review audit --> autonomy_level(advise) --> review --> autonomy_level(act)
```

### Temporary Agent

Install, enable, run a specific task, disable, remove. Useful for one-off
jobs that should not persist.

```
agent_install --> agent_enable --> (task completes) --> agent_disable --> agent_remove
```

### Rolling Restart

Disable the agent, update its child_spec or permissions, re-enable.

```
agent_disable --> (update config) --> agent_enable
```

---

## Querying State

```
agent_status(agent_id: "my-worker")
```

Returns:

```json
{
  "agent_id": "my-worker",
  "state": "enabled",
  "autonomy_level": "observe",
  "permissions_granted": 3,
  "permissions_denied": 1,
  "installed_at": "2026-01-15T10:30:00Z",
  "last_transition": "2026-01-15T10:31:00Z"
}
```
