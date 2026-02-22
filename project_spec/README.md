# OpenSentience.org — Product Specification

**Date:** February 22, 2026
**Status:** v1.1
**Author:** [&] Ampersand Box Design
**License:** MIT
**Repository:** github.com/c-u-l8er/opensentience.org

---

## Executive Summary

OpenSentience is an **open-source, local-first agent runtime** built in Elixir/OTP. It governs what AI agents can do, executes them on the user's own hardware, and provides complete observability into every action. No cloud dependency, no data leaving the device, no implicit trust.

OpenSentience is the **runtime layer** of the [&] Ampersand Box portfolio:

```
SpecPrompt (Standards)    → defines agent behavior as versioned specs
    ↓
Agentelic (Engineering)   → builds, tests, deploys agents against specs
    ↓
OpenSentience (Runtime)   → governs, executes, observes agents locally  ← THIS
    ↓
Graphonomous (Memory)     → continual learning knowledge graphs
    ↓
FleetPrompt (Distribution) · Delegatic (Orchestration)
```

---

## 1. The Problem

Every major agent framework in 2026 — LangChain, CrewAI, AutoGen, OpenAI Agents SDK — assumes cloud connectivity and third-party APIs. User data flows through external infrastructure. Agent permissions are opaque. There is no standard governance layer for agents running locally.

On February 5, 2026, OpenAI launched **Frontier** — an enterprise platform for building, deploying, and managing AI agents as "AI coworkers." Fortune described it as OpenAI's bid to become the "operating system of the enterprise." Salesforce has **AgentForce**, Microsoft has the **Agent Framework** (public preview). They all share the same assumption: agents run on *their* infrastructure, governed by *their* policies.

According to LangChain's State of AI Agents 2026 survey (1,300+ respondents), **57% of organizations now have agents in production**, with 32% citing quality as the #1 barrier. Meanwhile, Palo Alto Networks, Token Security (AI Privilege Guardian), and AccuKnox all confirm: agents need runtime identity, least privilege, and egress controls — "governance has to operate at the same speed as the agents themselves."

The Sentient Foundation launched February 19, 2026 with the explicit mission of keeping AGI open-source and decentralized. OpenSentience embodies this principle at the runtime layer: intelligence infrastructure must be open, local, and user-governed.

---

## 2. Design Principles

1. **Local-first** — Agents run on the user's hardware. No cloud required.
2. **Explicit permissions** — Nothing is auto-granted. Users approve capabilities.
3. **Process isolation** — Each agent is a supervised BEAM process.
4. **MCP-native** — The MCP protocol is the primary API surface.
5. **Auditable** — Every tool call, file access, and network request is logged.
6. **Composable** — Agents can connect to Graphonomous, FleetPrompt, or any MCP server.

---

## 3. Competitive Positioning

| Dimension | OpenSentience | OpenAI Frontier | Salesforce AgentForce | Goose (Block) | CrewAI | Microsoft Agent Framework |
|-----------|---------------|-----------------|----------------------|---------------|--------|--------------------------|
| Runtime model | Local-first | OpenAI cloud | Salesforce cloud | Local | Cloud/local | Azure cloud |
| Permission model | Explicit, fine-grained | IAM-based | Role-based | None | None | Azure IAM |
| Process isolation | BEAM VM | Sandboxed | Shared runtime | Single process | Python threads | Container-based |
| Protocol | MCP-native | OpenAI API | Proprietary | MCP | Custom | A2A + MCP |
| Audit trail | Built-in, queryable | Logs | Salesforce audit | None | None | Azure Monitor |
| Continual learning | Graphonomous | Feedback loops | None | None | None | None |
| Vendor lock-in | None (MIT) | OpenAI | Salesforce | None (MIT) | Minimal | Microsoft/Azure |
| Price | Free (open source) | Enterprise sales | Enterprise sales | Free | Free/Paid | Azure pricing |

---

## 4. Architecture

### 4.1 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Language | Elixir 1.17+ / OTP 27 | Fault-tolerant, concurrent, distributed-native |
| MCP Server | hermes_mcp (v0.8+) | Most mature Elixir MCP SDK |
| Storage | SQLite via exqlite | Zero-config, portable, edge-friendly |
| Hot Cache | ETS | In-memory cache for active agent state |
| Admin UI | Phoenix LiveView | Localhost-only, real-time dashboard |
| Telemetry | :telemetry | Observable by default |

### 4.2 Core Components

| Component | Responsibility | OTP Pattern |
|-----------|---------------|-------------|
| `OpenSentience.Daemon` | Core supervisor, lifecycle management | Application |
| `OpenSentience.Registry` | Agent discovery and routing | Registry |
| `OpenSentience.Permissions` | Permission engine, capability checking | GenServer |
| `OpenSentience.Agent` | Individual agent process | GenServer |
| `OpenSentience.Audit` | Audit trail, event logging | GenServer |
| `OpenSentience.MCP.Server` | MCP tool/resource exposure | Hermes.Server |
| `OpenSentience.Admin` | Phoenix LiveView admin dashboard | Endpoint |

### 4.3 Supervision Tree

```elixir
defmodule OpenSentience.Application do
  use Application

  def start(_type, _args) do
    children = [
      # Storage (SQLite)
      {OpenSentience.Store, store_config()},

      # Permission engine
      OpenSentience.Permissions,

      # Audit trail
      {OpenSentience.Audit, audit_config()},

      # Agent registry + dynamic supervisor
      {Registry, keys: :unique, name: OpenSentience.AgentRegistry},
      {DynamicSupervisor, name: OpenSentience.AgentSupervisor, strategy: :one_for_one},

      # MCP Server (primary API)
      {OpenSentience.MCP.Server, mcp_config()},

      # Optional: Admin UI (localhost only)
      maybe_start_admin()
    ] |> List.flatten() |> Enum.reject(&is_nil/1)

    opts = [strategy: :rest_for_one, name: OpenSentience.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
```

### 4.4 Permission Model

```elixir
defmodule OpenSentience.Schema.Permission do
  @type capability ::
    :filesystem_read | :filesystem_write |
    :network_http | :network_socket |
    :shell_execute |
    :mcp_tool | :mcp_resource |
    :agent_communicate

  @type t :: %__MODULE__{
    agent_id: String.t(),
    capability: capability(),
    scope: String.t(),       # e.g., "~/projects/**" for filesystem
    granted_at: DateTime.t(),
    granted_by: :user | :manifest | :admin,
    expires_at: DateTime.t() | nil
  }
end
```

Permissions are:
- **Explicit** — agents declare required capabilities in their manifest
- **Reviewable** — users see and approve permissions before agent activation
- **Revocable** — permissions can be revoked at any time via CLI or admin UI
- **Scoped** — filesystem access can be limited to specific paths
- **Audited** — every permission check is logged

### 4.5 Agent Manifest

```json
{
  "name": "code-reviewer",
  "version": "1.0.0",
  "description": "Reviews code changes and suggests improvements",
  "runtime": "opensentience",
  "author": "ops-team",
  "source": "fleetprompt/code-reviewer",
  "permissions": {
    "required": [
      {"capability": "filesystem_read", "scope": "~/projects/**"},
      {"capability": "mcp_tool", "scope": "git:*"}
    ],
    "optional": [
      {"capability": "network_http", "scope": "api.github.com"}
    ]
  },
  "mcp_servers": [
    {
      "name": "graphonomous",
      "transport": "stdio",
      "command": "graphonomous",
      "args": ["--db", "~/.opensentience/graphonomous/knowledge.db"]
    }
  ],
  "spec": "SPEC.md"
}
```

### 4.6 File System Layout

```
~/.opensentience/
├── config.toml              # Global configuration
├── agents/
│   ├── code-reviewer/
│   │   ├── manifest.json    # Agent manifest
│   │   ├── SPEC.md          # SpecPrompt specification
│   │   └── permissions.json # Granted permissions
│   └── data-analyst/
│       └── ...
├── sockets/
│   └── <agent_id>.sock      # Unix domain sockets
├── audit/
│   └── 2026-02-22.log       # Daily audit logs
├── graphonomous/
│   └── knowledge.db          # Shared knowledge graph
└── store.db                  # Agent state, registry
```

---

## 5. MCP Server Design

### 5.1 Tools

| Tool | Description | Input |
|------|------------|-------|
| `os_agent_list` | List all registered agents | `{}` |
| `os_agent_start` | Start a registered agent | `{agent_id: string}` |
| `os_agent_stop` | Stop a running agent | `{agent_id: string}` |
| `os_agent_install` | Install agent from FleetPrompt | `{source: string}` |
| `os_agent_status` | Get agent status and metrics | `{agent_id: string}` |
| `os_permission_grant` | Grant a capability to an agent | `{agent_id, capability, scope}` |
| `os_permission_revoke` | Revoke a capability | `{agent_id, capability}` |
| `os_audit_query` | Query the audit trail | `{agent_id?, since?, action?}` |
| `os_delegate` | Send a task to a specific agent | `{agent_id, task, context?}` |

### 5.2 Resources

```
resources://os/agents              → All registered agents
resources://os/agents/{id}         → Agent details + status
resources://os/agents/{id}/audit   → Agent audit trail
resources://os/permissions/{id}    → Agent permissions
resources://os/stats               → Runtime statistics
```

---

## 6. Ecosystem Integration

| Product | How It Uses OpenSentience |
|---------|--------------------------|
| **Agentelic** | Deploys tested agents to OpenSentience runtime via manifest |
| **SpecPrompt** | Agent manifests reference SPEC.md for permission derivation |
| **Graphonomous** | Agents connect via MCP for continual learning |
| **FleetPrompt** | Agent install/update pipeline flows through the runtime |
| **Delegatic** | Multi-agent orchestration via inter-agent MCP communication |

---

## 7. Gap Analysis & Competitive Landscape

### 7.1 Market Gap: No Local-First Agent Governance

Agent Zero, OpenClaw, Goose (Block), LocalAI, and Moltworker/Moltbot are open-source local agents but **none provide a governance layer** with explicit permissions, audit trails, and process isolation. OpenSentience is the first runtime focused on governance, not just execution. This gap is validated by the enterprise security community: Palo Alto Networks, Token Security (AI Privilege Guardian, open-source), and AccuKnox all confirm agents need "runtime identity, least privilege, and egress controls."

### 7.2 Open-Source Agent Runtimes

| Project | Focus | Gap OpenSentience Fills |
|---------|-------|------------------------|
| Goose (Block) | Development agent | No governance, no permissions, single process |
| OpenClaw (Moltbot) | Local AI assistant | No process isolation, no spec support, Node.js only |
| Agent Zero | General automation | Crypto-focused governance, no enterprise features |
| AutoGPT | Goal decomposition | No local-first, no MCP, research-oriented |
| CrewAI | Multi-agent | Cloud-primary, no audit trail, limited governance |
| LocalAI + LocalAGI | Local inference + agents | No permission model, no process isolation |
| Superagent | Guardrails framework | Defined roles/permissions but service-based, not daemon |
| Moltworker | Cloudflare-hosted agent | Not truly local-first (Cloudflare infra) |

### 7.3 Enterprise Agent Platforms (Indirect Competitors)

| Platform | Focus | OpenSentience Differentiator |
|----------|-------|------------------------------|
| **OpenAI Frontier** (Feb 2026) | Enterprise agent OS | Local-first, no vendor lock-in, open source |
| Salesforce AgentForce | CRM agents | Not CRM-specific, MCP-native, MIT licensed |
| Microsoft Agent Framework | Multi-agent orchestration | No Azure dependency, BEAM isolation |

### 7.4 Industry Validation

1. **OpenAI Frontier** (Feb 5, 2026): Enterprise agent platform launch validates the agent governance market. OpenSentience is the open, local-first alternative.
2. **Sentient Foundation** (Feb 19, 2026): Nonprofit to keep AGI open-source — validates OpenSentience's open-source runtime thesis.
3. **Token Security AI Privilege Guardian** (Jan 2026): Open-source agent permission scoping tool — validates permission-first approach.
4. **Palo Alto Networks / AccuKnox** (Feb 2026): Runtime AI governance guides emphasizing least privilege, egress controls, and enforcement.
5. **LangChain State of AI Agents 2026**: 57% of orgs have agents in production; 89% have observability — runtime governance is table stakes.
6. **MCP Adoption**: Now governed by Linux Foundation's Agentic AI Foundation — validates MCP-first architecture.

---

## 8. Implementation Roadmap

| Phase | Weeks | Deliverables |
|-------|-------|-------------|
| 0: Foundation | 1–4 | Project scaffold, SQLite store, agent process lifecycle, basic permission engine |
| 1: Core Runtime | 5–10 | Permission model, audit trail, agent manifest format, CLI (init, start, stop) |
| 2: MCP Server | 11–14 | Hermes MCP server, all tools/resources, Claude Desktop integration test |
| 3: Admin UI | 15–18 | Phoenix LiveView dashboard, real-time monitoring, permission management |
| 4: Marketplace | 19–22 | FleetPrompt integration, agent install/update, trust scores |
| 5: Federation | 23–28 | Multi-instance agent communication, Delegatic integration |

---

## 9. Revenue Model

| Stream | Price | Target |
|--------|-------|--------|
| Open Source Runtime | Free (MIT) | Individual developers, hobbyists |
| Pro Support | $29/mo | Teams needing SLA and priority support |
| Enterprise License | Custom | Compliance features, SSO, audit exports |
| Managed Hosting | via webhost.systems | PostgreSQL-backed, managed infrastructure |

---

## 10. Success Criteria

| Metric | MVP (6 months) | PMF (18 months) |
|--------|----------------|-----------------|
| GitHub stars | 500+ | 3,000+ |
| Active installations | 100+ | 1,000+ |
| FleetPrompt agents | 20+ | 200+ |
| Contributors | 10+ | 50+ |
| Production deployments | 5+ | 50+ |

---

*[&] Ampersand Box Design — opensentience.org*
