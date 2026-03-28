# Quickstart

> Zero-to-value walkthrough: add `open_sentience` to your project, install an
> agent, configure permissions, and run it under governance.

---

## Prerequisites

- Elixir 1.16+ and OTP 26+
- An existing Mix project with a supervision tree

---

## 1. Add the Dependency

```elixir
# mix.exs
defp deps do
  [
    {:open_sentience, "~> 0.1.0"}
  ]
end
```

```sh
mix deps.get
```

---

## 2. Add to Your Supervision Tree

```elixir
# lib/my_app/application.ex
def start(_type, _args) do
  children = [
    # Your existing children...
    {OpenSentience.Supervisor, []}
  ]

  opts = [strategy: :one_for_one, name: MyApp.Supervisor]
  Supervisor.start_link(children, opts)
end
```

This starts the PermissionEngine, AutonomyController, AuditWriter,
AgentSupervisor, and MCP Server.

---

## 3. Install Your First Agent

Use the `agent_install` MCP tool (or call the Elixir API directly):

```elixir
OpenSentience.install_agent(%{
  agent_id: "my-worker",
  name: "My Worker Agent",
  child_spec: {MyApp.Worker, []},
  permissions: %{
    granted: [
      %{type: :filesystem, access: :read, resource: "/data/**"},
      %{type: :network, access: :outbound, resource: "api.example.com"}
    ],
    denied: [
      %{type: :filesystem, access: :write, resource: "/etc/**"}
    ]
  }
})
```

The agent is now in the `installed` state. It is registered but not running.

---

## 4. Check Permissions

Verify what the agent can and cannot do:

```elixir
OpenSentience.permission_check("my-worker", :filesystem, :read, "/data/input.csv")
# => {:allow, "explicit grant: /data/**"}

OpenSentience.permission_check("my-worker", :filesystem, :write, "/etc/passwd")
# => {:deny, "explicit denial: /etc/**"}

OpenSentience.permission_check("my-worker", :network, :inbound, "0.0.0.0:8080")
# => {:deny, "default deny: no matching grant"}
```

---

## 5. Enable and Run the Agent

```elixir
# Transition from installed to enabled
OpenSentience.enable_agent("my-worker")

# The agent starts under the AgentSupervisor.
# Default autonomy level is :observe — the agent can see but not act.
```

---

## 6. Change Autonomy Level

Progress the agent through graduated autonomy:

```elixir
# Check current level
OpenSentience.autonomy_level("my-worker")
# => :observe

# Promote to advise (agent queues actions for approval)
OpenSentience.set_autonomy_level("my-worker", :advise)

# After building trust, promote to act (autonomous within permissions)
OpenSentience.set_autonomy_level("my-worker", :act)
```

Each change is recorded in the audit trail.

---

## 7. Query the Audit Trail

```elixir
OpenSentience.audit("my-worker", type: :lifecycle_transition, limit: 10)
# => [
#   %{id: "...", timestamp: ~U[...], event_type: :lifecycle_transition,
#     operation: "installed -> enabled", result: :ok, actor: "system", ...},
#   %{id: "...", timestamp: ~U[...], event_type: :autonomy_change,
#     operation: "observe -> advise", result: :ok, actor: "operator", ...},
#   ...
# ]
```

The audit trail is append-only. Entries cannot be modified or deleted.

---

## 8. Lifecycle Transitions

Move agents through the full lifecycle as needed:

```elixir
# Graceful stop (running -> enabled -> disabled)
OpenSentience.disable_agent("my-worker")

# Re-enable later
OpenSentience.enable_agent("my-worker")

# Permanent removal (must be disabled first)
OpenSentience.remove_agent("my-worker")
```

---

## What Happens Next

- Read [architecture.md](architecture.md) to understand the OTP internals
- Read [skills/03_PERMISSIONS.md](skills/03_PERMISSIONS.md) for the full permission model
- Read [skills/04_AUTONOMY_LEVELS.md](skills/04_AUTONOMY_LEVELS.md) for autonomy details
- Read [skills/06_INTEGRATION.md](skills/06_INTEGRATION.md) to connect with Graphonomous,
  Delegatic, and the rest of the [&] ecosystem

---

## MCP Tool Equivalents

Every operation above is also available as an MCP tool for LLM agents:

| Elixir API | MCP Tool | Purpose |
|------------|----------|---------|
| `install_agent/1` | `agent_install` | Register agent with permissions |
| `enable_agent/1` | `agent_enable` | Start the governed process |
| `disable_agent/1` | `agent_disable` | Graceful stop |
| `agent_status/1` | `agent_status` | Current state and metadata |
| `audit/2` | `agent_audit` | Query audit trail |
| `permission_check/4` | `permission_check` | Evaluate a permission |
| `set_autonomy_level/2` | `autonomy_level` | Get or set autonomy |
