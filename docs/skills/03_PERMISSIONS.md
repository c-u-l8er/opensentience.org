# Skill 03 — Permissions

> The permission taxonomy, evaluation order, glob patterns, and ETS hot cache.

---

## Why This Matters

Permissions are the core enforcement mechanism. Without them, governance is
advisory only. The permission system ensures agents can only access what they
have been explicitly granted, with explicit denials always winning.

---

## Permission Taxonomy

### filesystem

Controls access to the local filesystem.

| Access | Meaning |
|--------|---------|
| `read` | Read file contents, list directories |
| `write` | Create, modify, or delete files |
| `execute` | Execute files as processes |

**Resource format:** Glob paths. Examples: `/data/**`, `/tmp/*.csv`,
`/home/agent/workspace/`

### network

Controls network communication.

| Access | Meaning |
|--------|---------|
| `outbound` | Make HTTP/TCP requests to external hosts |
| `inbound` | Accept incoming connections |

**Resource format:** Host patterns. Examples: `api.example.com`,
`*.internal.net`, `0.0.0.0:8080`

### tool_invocation

Controls which MCP tools the agent may call.

| Access | Meaning |
|--------|---------|
| `allowed` | Agent may invoke this tool |
| `denied` | Agent is blocked from invoking this tool |

**Resource format:** Tool names. Examples: `store_node`, `deliberate`,
`agent_install`

### graph_access

Controls access to the Graphonomous knowledge graph.

| Access | Meaning |
|--------|---------|
| `read` | Query nodes, edges, retrieve context |
| `write` | Store nodes, store edges, run consolidation |

**Resource format:** Graph namespaces or `*` for all.

---

## Evaluation Order

Permission checks follow a strict precedence:

```
1. Explicit DENY  → if any denial matches, result is DENY (highest priority)
2. Explicit ALLOW → if a grant matches, result is ALLOW
3. Default DENY   → if nothing matches, result is DENY (lowest priority)
```

This means:
- Granting `filesystem:read:/data/**` allows reading anything under `/data/`
- Adding a denial for `filesystem:read:/data/secrets/**` overrides the grant
  for that subtree
- A resource with no matching grant or denial is denied by default

---

## Glob Patterns

Both filesystem paths and network hosts support glob matching:

| Pattern | Matches | Does Not Match |
|---------|---------|---------------|
| `/data/**` | `/data/foo.csv`, `/data/sub/bar.json` | `/etc/data` |
| `/tmp/*.csv` | `/tmp/report.csv` | `/tmp/sub/report.csv` |
| `*.example.com` | `api.example.com`, `www.example.com` | `example.com` |
| `10.0.0.*` | `10.0.0.1`, `10.0.0.255` | `10.0.1.1` |

The glob engine uses Elixir's `Path.wildcard/1` semantics for filesystem
paths and a simple wildcard matcher for network hosts.

---

## permission_check Tool

### Parameters

| Param | Required | Type | Description |
|-------|----------|------|-------------|
| `agent_id` | Yes | string | The agent to check |
| `permission_type` | Yes | string | `filesystem`, `network`, `tool_invocation`, `graph_access` |
| `access` | Yes | string | Access mode (type-specific) |
| `resource` | Yes | string | The resource being accessed |

### Example Calls

```
permission_check(
  agent_id: "my-worker",
  permission_type: "filesystem",
  access: "read",
  resource: "/data/input.csv"
)
# => {allow, "explicit grant: /data/**"}
```

```
permission_check(
  agent_id: "my-worker",
  permission_type: "network",
  access: "outbound",
  resource: "malicious.example.com"
)
# => {deny, "default deny: no matching grant"}
```

---

## ETS Hot Cache

Permission checks are performance-critical — they happen on every agent
action. The PermissionEngine uses ETS for microsecond lookups:

- **Table:** `:os_permissions`, type `:bag`
- **Key:** `{agent_id, permission_type, access}`
- **Value:** `{:grant | :deny, resource_pattern}`
- **Lookup:** `permission_check/4` reads directly from ETS (no GenServer call)
- **Mutation:** permission changes go through the GenServer for serialization,
  then update ETS

This design means permission checks never block on GenServer mailbox
contention. Thousands of checks per second are possible with no measurable
overhead.

---

## Delegatic Policy Integration

When Delegatic is connected, policies propagate via PubSub:

1. Delegatic publishes a policy change event
2. PermissionEngine subscribes and receives the event
3. ETS table is updated atomically
4. All subsequent permission checks use the new policy
5. Audit entry records the policy update with source

Cache invalidation is immediate — there is no TTL or polling delay.

---

## Permission Change Propagation

When permissions change for a running agent:

- New permissions take effect immediately (ETS is the source of truth)
- In-flight actions that already passed a permission check are not revoked
- The next action will be checked against the updated permissions
- An audit entry records the permission change

This is eventually consistent at the action level: a permission revocation
does not kill running operations, but blocks all subsequent ones.

---

## Best Practices

1. **Least privilege:** Grant only what the agent needs. Start narrow, widen
   as trust builds.
2. **Explicit denials for sensitive paths:** Even if the grant does not cover
   them, explicit denials serve as documentation and defense in depth.
3. **Use glob specificity:** `/data/reports/*.csv` is better than `/data/**`
   when the agent only needs CSV reports.
4. **Audit permission checks:** The audit trail records every check. Review
   denials periodically — they may indicate misconfiguration or scope creep.
5. **Combine with autonomy:** Permissions control *what* is allowed; autonomy
   controls *how* it is allowed. Use both together.
