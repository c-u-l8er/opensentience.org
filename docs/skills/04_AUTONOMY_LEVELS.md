# Skill 04 — Autonomy Levels

> Graduated autonomy: observe, advise, act. Trust-building workflows,
> enforcement mechanics, and when to use each level.

---

## Why This Matters

Autonomy levels solve the trust problem in agent deployment. You do not want a
newly installed agent executing actions unsupervised. You also do not want a
proven agent waiting for human approval on every routine task. Graduated
autonomy provides the middle ground — a progression from observation to
full autonomy, with audit at every step.

---

## The Three Levels

### Observe

The agent generates recommendations but takes no action.

- All proposed actions are logged to the audit trail as `action_recommended`
- No side effects are produced
- The operator reviews recommendations and manually executes if appropriate
- Useful for: new agents, untrusted agents, sensitive domains

**Enforcement:** The AutonomyController intercepts the action dispatch and
replaces execution with a recommendation log entry.

### Advise

The agent prepares actions and queues them for human approval.

- Proposed actions are placed in an approval queue
- The operator receives a notification (via MCP or PubSub)
- The operator approves or rejects each queued action
- Approved actions execute with full permission checking
- Rejected actions are logged as `action_blocked` with the rejection reason

**Enforcement:** The AutonomyController holds the action in a GenServer queue.
A separate approval interface (MCP tool or Elixir API) resolves the queue.

### Act

The agent executes autonomously within its granted permissions.

- Actions proceed directly to the PermissionEngine for checking
- Permitted actions execute immediately
- Denied actions are blocked and logged as `action_blocked`
- No human approval step
- All actions are still audited as `action_executed`

**Enforcement:** The AutonomyController forwards the action directly to the
PermissionEngine. No queuing or interception.

---

## Trust-Building Workflow

The recommended progression for any new agent:

```
1. Install at observe (default)
   --> Review audit trail for 1-2 sessions
   --> Verify recommendations are sensible

2. Promote to advise
   --> Review and approve queued actions
   --> Build confidence in the agent's judgment
   --> Track approval/rejection ratio

3. Promote to act (when ready)
   --> Agent operates autonomously within permissions
   --> Continue monitoring audit trail
   --> Demote immediately if behavior degrades
```

This progression is not mandatory. An operator who trusts the agent's
provenance (e.g., a well-tested internal tool) can skip directly to `act`.
But the audit trail always records the autonomy level at every action.

---

## autonomy_level Tool

### Get Current Level

```
autonomy_level(agent_id: "my-worker")
# => {ok, "observe"}
```

### Set Level

```
autonomy_level(agent_id: "my-worker", level: "advise")
# => {ok, "autonomy changed: observe -> advise"}
```

### Parameters

| Param | Required | Type | Description |
|-------|----------|------|-------------|
| `agent_id` | Yes | string | The agent to query or update |
| `level` | No | string | New level: `observe`, `advise`, or `act`. Omit to query. |

---

## Enforcement Mechanics

### Observe Mode — Intercept and Recommend

```
Agent proposes action
  --> AutonomyController checks level = observe
  --> Action is NOT executed
  --> AuditWriter logs: event_type=action_recommended, operation=<action details>
  --> Agent receives: {blocked, "autonomy: observe — action logged as recommendation"}
```

### Advise Mode — Queue and Await Approval

```
Agent proposes action
  --> AutonomyController checks level = advise
  --> Action is queued in GenServer state
  --> Notification sent via PubSub
  --> Operator approves/rejects via MCP or API
  --> Approved: PermissionEngine.check() --> execute or block
  --> Rejected: AuditWriter logs action_blocked with rejection reason
```

### Act Mode — Forward to Permissions

```
Agent proposes action
  --> AutonomyController checks level = act
  --> PermissionEngine.check(agent_id, type, access, resource)
  --> allow: execute action, log action_executed
  --> deny: block action, log action_blocked
```

---

## When to Use Each Level

| Scenario | Recommended Level | Reason |
|----------|------------------|--------|
| Agent just installed, source unknown | `observe` | Build trust before granting power |
| Agent from FleetPrompt marketplace | `observe` | Third-party code needs vetting |
| Internal tool, well-tested | `advise` or `act` | Known provenance reduces risk |
| Agent operating in production | `act` | Approval latency is unacceptable |
| Agent accessing sensitive data | `advise` | Human oversight for high-stakes operations |
| Debugging or investigating behavior | `observe` | See what the agent would do without consequences |

---

## Audit Trail for Autonomy Changes

Every autonomy level change is recorded:

```json
{
  "id": "aud_...",
  "timestamp": "2026-01-15T10:35:00Z",
  "agent_id": "my-worker",
  "event_type": "autonomy_change",
  "operation": "observe -> advise",
  "result": "ok",
  "actor": "operator",
  "reason": "Agent demonstrated consistent recommendations over 3 sessions",
  "metadata": {
    "previous_level": "observe",
    "new_level": "advise",
    "sessions_at_previous_level": 3
  }
}
```

---

## Demotion

Autonomy demotion is always available and immediate. If an agent at `act`
level produces unexpected behavior, the operator can demote to `observe`
instantly:

```
autonomy_level(agent_id: "my-worker", level: "observe")
```

The agent's next action will be intercepted and logged as a recommendation
instead of executed. No restart is required.
