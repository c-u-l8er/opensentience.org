# Skill 06 — Integration

> Integrating OpenSentience with Graphonomous, Delegatic, AgenTroMatic,
> Agentelic, FleetPrompt, and WebHost.Systems.

---

## Why This Matters

OpenSentience is designed to work standalone, but its full value emerges when
integrated with the [&] ecosystem. Each integration point adds a governance
dimension that the shim enforces at runtime.

---

## Wrapping Graphonomous Instances

### What It Does

The governance shim wraps a Graphonomous instance as a governed agent, adding
`graph_access` permissions to control which agents can query or modify the
knowledge graph.

### How to Configure

```elixir
OpenSentience.install_agent(%{
  agent_id: "graphonomous-primary",
  name: "Primary Knowledge Graph",
  child_spec: {Graphonomous.Application, []},
  permissions: %{
    granted: [
      %{type: :graph_access, access: :read, resource: "*"},
      %{type: :graph_access, access: :write, resource: "*"},
      %{type: :filesystem, access: :read, resource: "/data/knowledge.db"},
      %{type: :filesystem, access: :write, resource: "/data/knowledge.db"}
    ]
  }
})
```

### Permission Granularity

Graph access can be scoped by namespace:
- `graph_access:read:*` — read all namespaces
- `graph_access:write:goals` — write only to the goals namespace
- `graph_access:read:episodic` — read only episodic nodes

This enables multi-tenant knowledge graphs where different agents have
different access levels.

---

## Delegatic Policy Consumption

### What It Does

Delegatic is the policy authoring layer. It publishes governance policies
that the PermissionEngine consumes and enforces.

### Integration Flow

```
Delegatic policy change
  --> PubSub broadcast: {:policy_update, agent_id, changes}
  --> PermissionEngine subscribes
  --> ETS permission table updated atomically
  --> Audit entry: policy_update from delegatic
  --> Immediate enforcement on next permission check
```

### Cache Invalidation

Policy updates are push-based via PubSub — there is no polling or TTL.
When Delegatic publishes a change, the PermissionEngine receives it within
milliseconds. The ETS table is the single source of truth for enforcement;
Delegatic is the source of truth for authoring.

### Fallback Behavior

If Delegatic is unavailable, the PermissionEngine continues enforcing the
last-known policy from ETS. No permissions are loosened due to connectivity
issues — the shim fails closed.

---

## AgenTroMatic Deliberation Governance

### What It Does

AgenTroMatic implements OS-003 (Deliberation Orchestrator). The governance
shim controls which agents may participate in deliberation and what tools
they may invoke during the process.

### Permission Configuration

```elixir
%{
  granted: [
    %{type: :tool_invocation, access: :allowed, resource: "deliberate"},
    %{type: :tool_invocation, access: :allowed, resource: "topology_analyze"}
  ],
  denied: [
    %{type: :tool_invocation, access: :denied, resource: "store_node"}
  ]
}
```

This allows the agent to participate in deliberation and analyze topology,
but prevents it from writing to the knowledge graph during the deliberation
phase.

---

## Agentelic Manifest Import

### What It Does

Agentelic publishes agent manifests — declarations of what an agent needs to
run. The `agent_install` tool consumes these manifests directly.

### Import Flow

```
Agentelic manifest
  --> agent_install(manifest)
  --> PermissionEngine: evaluate grants against current policy
  --> Some grants may be denied if policy is more restrictive
  --> AgentLifecycle: start in installed state
  --> Audit: log install with manifest provenance
```

### Permission Negotiation

The manifest declares *requested* permissions. The governance shim may grant
fewer permissions than requested if the current Delegatic policy restricts
them. The audit trail records which requested permissions were granted and
which were denied, with reasons.

---

## FleetPrompt Marketplace Agents

### What It Does

Agents installed from the FleetPrompt marketplace follow the same governance
flow as any other agent. The marketplace manifest feeds into `agent_install`.

### Trust Defaults

Marketplace agents start at the most restrictive defaults:
- Autonomy level: `observe`
- Permissions: only what the manifest requests, subject to policy
- Lifecycle: `installed` (must be explicitly enabled)

The operator reviews the agent's manifest, adjusts permissions if needed,
then progresses through the trust-building workflow (observe, advise, act).

---

## WebHost.Systems Deployment

### What It Does

WebHost.Systems is the deployment platform for the [&] ecosystem. The
governance shim integrates as an OTP application within the deployed release.

### Configuration

The shim is configured via application environment:

```elixir
# config/runtime.exs
config :open_sentience,
  audit_backend: :ecto,
  audit_repo: MyApp.Repo,
  delegatic_pubsub: MyApp.PubSub,
  default_autonomy: :observe
```

### Health Checks

WebHost.Systems health checks include:
- PermissionEngine ETS table exists and is populated
- AuditWriter GenServer is alive and responsive
- AgentSupervisor is running
- MCP Server is accepting connections

---

## Cross-Product Audit Trails

When multiple [&] products are governed by the same OpenSentience instance,
the audit trail provides a unified view across all agents:

```
agent_audit(agent_id: "graphonomous-primary", type: "permission_check")
agent_audit(agent_id: "deliberation-agent", type: "action_executed")
agent_audit(agent_id: "marketplace-worker", type: "action_blocked")
```

Each entry includes the agent_id, so cross-product queries can aggregate
by agent or by event type to build a complete governance picture.
