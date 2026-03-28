# Skill 05 — Audit Trails

> Append-only audit system: entry schema, event types, querying, compliance,
> and forensic reconstruction.

---

## Why This Matters

The audit trail is the immutable record of everything that happened under
governance. Without it, you have no evidence of what agents did, what was
blocked, or why autonomy levels changed. The audit trail serves compliance,
debugging, and trust verification.

---

## Audit Entry Schema

Every audit entry contains these fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (UUID or ULID) |
| `timestamp` | datetime | When the event occurred (UTC) |
| `agent_id` | string | Which agent this event belongs to |
| `event_type` | string | Category of event (see below) |
| `operation` | string | Human-readable description of what happened |
| `result` | string | Outcome: `ok`, `denied`, `error`, `blocked` |
| `actor` | string | Who triggered this: `system`, `operator`, agent_id |
| `reason` | string | Why this happened (permission rule, policy, operator note) |
| `metadata` | map | Structured additional data (varies by event type) |

---

## Event Types

| Event Type | When It Fires | Example Operation |
|------------|--------------|-------------------|
| `permission_check` | Every permission evaluation | `filesystem:read:/data/input.csv` |
| `lifecycle_transition` | Agent state changes | `installed -> enabled` |
| `autonomy_change` | Autonomy level is modified | `observe -> advise` |
| `action_executed` | Agent successfully performs an action (act mode) | `wrote file /data/output.csv` |
| `action_blocked` | Agent action denied by permission or autonomy | `network:outbound:evil.com denied` |
| `action_recommended` | Agent recommendation logged (observe mode) | `would write /data/output.csv` |

---

## agent_audit Tool

### Parameters

| Param | Required | Type | Description |
|-------|----------|------|-------------|
| `agent_id` | Yes | string | The agent to query |
| `type` | No | string | Filter by event_type |
| `since` | No | datetime | Only entries after this timestamp |
| `limit` | No | number | Maximum entries to return (default 50) |

### Example Calls

**All recent events for an agent:**
```
agent_audit(agent_id: "my-worker", limit: 20)
```

**Only permission denials:**
```
agent_audit(agent_id: "my-worker", type: "permission_check", limit: 50)
# Then filter results where result = "denied"
```

**Events since a specific time:**
```
agent_audit(agent_id: "my-worker", since: "2026-01-15T10:00:00Z")
```

**Lifecycle history:**
```
agent_audit(agent_id: "my-worker", type: "lifecycle_transition")
```

---

## Compliance Workflows

### Pre-Deployment Audit

Before promoting an agent to `act` autonomy:

1. Query all `action_recommended` entries from the `observe` period
2. Verify recommendations align with expected behavior
3. Check for any `permission_check` denials that indicate scope misconfiguration
4. Document the review in the autonomy change reason

### Incident Response

When an agent produces unexpected behavior:

1. Query the audit trail for the time window of the incident
2. Identify the sequence: permission check, autonomy check, action execution
3. Determine whether the action was within granted permissions
4. Check whether the autonomy level was appropriate
5. Review the metadata for contextual details

### Periodic Review

For ongoing compliance:

1. Aggregate `action_blocked` counts per agent per week
2. High block counts may indicate overly broad agent scope
3. Zero block counts on a highly active agent may indicate overly permissive grants
4. Review `autonomy_change` entries for unexpected demotions or promotions

---

## Forensic Reconstruction

The audit trail enables full reconstruction of an agent's actions:

```
Timeline for agent "my-worker":

10:30:00 lifecycle_transition  installed -> enabled       actor: operator
10:30:01 autonomy_change       (none) -> observe          actor: system
10:30:05 permission_check      filesystem:read:/data/**   result: ok
10:30:06 action_recommended    read /data/input.csv       result: logged
10:35:00 autonomy_change       observe -> advise          actor: operator
10:35:10 permission_check      filesystem:read:/data/**   result: ok
10:35:11 action_executed       read /data/input.csv       result: ok (approved)
10:40:00 permission_check      network:outbound:evil.com  result: denied
10:40:00 action_blocked        connect to evil.com        result: denied
```

Every action has a chain of evidence: who triggered it, what permission was
checked, what autonomy level was in effect, and what the outcome was.

---

## Audit Storage Backends

| Backend | Persistence | Performance | Use Case |
|---------|------------|-------------|----------|
| ETS | In-memory (lost on restart) | Fastest | Development, testing |
| File | Append-only log file | Fast writes, slow queries | Production with simple needs |
| Ecto | Database (Postgres, SQLite) | Indexed queries | Production with compliance requirements |

The backend is configured at application startup. The AuditWriter GenServer
abstracts the backend — callers do not need to know which is in use.

---

## Immutability Guarantee

Audit entries can only be appended. The AuditWriter API exposes no update
or delete operations. This is enforced at the module level — there are no
`update_audit/2` or `delete_audit/1` functions to call.

For the file backend, the log file is opened in append-only mode. For the
Ecto backend, the migration creates the table without UPDATE or DELETE
grants for the application role.

This immutability is a design requirement of OS-006, not an implementation
detail that might change.
