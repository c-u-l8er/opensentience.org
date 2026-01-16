# OpenSentience Portfolio Integration Spec
## Unified Architecture for OS → FP → GO → D → A2A

**Version:** 1.0  
**Date:** January 16, 2026  
**Status:** Design Complete / Ready for Implementation

---

## 0. Portfolio Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    webhost.system (Host VM)                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │        OpenSentience Core (Always Running)            │   │
│  │  • Catalog • Launcher • ToolRouter • AuditLog        │   │
│  │  • Admin UI (127.0.0.1:6767)                         │   │
│  └────────────────┬─────────────────────────────────────┘   │
│                   │                                          │
│         ┌─────────┴──────────┬──────────────┬──────────┐    │
│         ▼                    ▼              ▼          ▼    │
│  ┌──────────┐      ┌──────────────┐  ┌──────────┐  ┌─────┐ │
│  │FleetPrompt│      │ Graphonomous │  │Delegatic │  │ A2A │ │
│  │(Skills)  │      │  (Arcana RAG)│  │(Co-Agents)│  │Event│ │
│  └──────────┘      └──────────────┘  └──────────┘  └─────┘ │
│       │                    │               │           │     │
│       └────────────────────┴───────────────┴───────────┘     │
│                            │                                 │
│                 All run as OS Agents                         │
└─────────────────────────────────────────────────────────────┘

Local Resources Convention:
~/.opensentience/     # Core runtime
~/.fleetprompt/       # Skills/workflows/configs per project
~/Projects/*/         # Agent source projects
```

---

## 1. Core Architectural Principles

### 1.1 Unified Agent Model

**Every system component is an OpenSentience Agent:**

| System | Agent Type | Primary Function |
|--------|-----------|------------------|
| **OpenSentience** | Meta-Agent | Marketplace + Runtime Manager |
| **FleetPrompt** | Skill Agent | Reusable workflows/tools |
| **Graphonomous** | Knowledge Agent | RAG + Graph reasoning (Arcana) |
| **Delegatic** | Company Agent | Multi-agent orchestration groups |
| **A2A Traffic** | Event Agent | Inter-agent message routing |

### 1.2 Local Resource Convention: `~/.fleetprompt/`

**Every project can declare FleetPrompt resources:**

```bash
# Project structure
~/Projects/my_project/
├── opensentience.agent.json    # OS agent manifest
├── .fleetprompt/               # FleetPrompt resources (NEW)
│   ├── config.toml             # Project-specific FP config
│   ├── skills/                 # Skills this project provides
│   │   ├── skill_a.exs
│   │   └── skill_b.exs
│   ├── workflows/              # Workflows using FP skills
│   │   └── ci_pipeline.yml
│   ├── graphonomous/           # GO knowledge graph config
│   │   ├── collections.json    # Arcana collections
│   │   └── schemas/
│   ├── delegatic/              # Delegatic company config
│   │   └── company.json        # Multi-agent group definition
│   └── a2a/                    # A2A event subscriptions
│       └── subscriptions.json  # What events to listen for
└── mix.exs
```

**Benefits:**
- Discoverable resources without code execution
- Portable across projects (git commit `.fleetprompt/`)
- Agents self-describe their FP/GO/D/A2A capabilities
- OS core can index and validate without running agent

---

## 2. FleetPrompt Integration

### 2.1 FleetPrompt as OS Agent

**FleetPrompt runs as an OpenSentience agent** that provides:

```json
{
  "id": "com.fleetprompt.core",
  "name": "FleetPrompt Skills Engine",
  "version": "1.0.0",
  "capabilities": ["skills", "workflows", "marketplace"],
  "permissions": [
    "filesystem:read:~/.fleetprompt/**",
    "tool:invoke:*/skill_*"
  ]
}
```

### 2.2 Skill Discovery Flow

```
1. User installs agent from OS marketplace
   ↓
2. OS scans agent's .fleetprompt/skills/
   ↓
3. OS registers skills with FleetPrompt agent
   ↓
4. FleetPrompt validates + adds to catalog
   ↓
5. Skills become available via ToolRouter
```

### 2.3 `.fleetprompt/config.toml` Schema

```toml
[project]
name = "my-cool-agent"
version = "1.0.0"

[fleetprompt]
enabled = true
marketplace_publish = false  # Don't auto-publish to marketplace

[[skills]]
id = "analyze_logs"
name = "Log Analyzer"
entry = "skills/analyze_logs.exs"
permissions = ["filesystem:read:/var/log/**"]

[[workflows]]
id = "deploy_pipeline"
name = "Deploy to Production"
entry = "workflows/deploy.yml"
triggers = ["git:push:main"]

[graphonomous]
enabled = true
collections = ["project_knowledge", "customer_data"]

[delegatic]
company_id = "eng-team-alpha"
role = "worker"

[a2a]
subscribe = ["deploy.*.success", "test.*.failed"]
publish = ["build.*.complete"]
```

---

## 3. Graphonomous Integration (Arcana RAG)

### 3.1 Graphonomous as Knowledge Layer

**Graphonomous provides graph-native RAG for all agents** using Arcana:

```elixir
# Graphonomous agent = thin wrapper around Arcana
defmodule Graphonomous.Agent do
  use OpenSentience.Agent
  
  @impl true
  def tools do
    [
      %Tool{
        name: "graph_search",
        description: "Search knowledge graph with context",
        schema: %{
          "query" => %{"type" => "string"},
          "collections" => %{"type" => "array"},
          "graph_mode" => %{"type" => "boolean", "default" => true}
        }
      },
      %Tool{
        name: "graph_ingest",
        description: "Add documents to knowledge graph",
        schema: %{
          "content" => %{"type" => "string"},
          "collection" => %{"type" => "string"},
          "metadata" => %{"type" => "object"}
        }
      }
    ]
  end
  
  @impl true
  def handle_call("graph_search", %{"query" => q, "collections" => cols}) do
    # Direct passthrough to Arcana
    result = Arcana.search(q, 
      repo: tenant_repo(),
      collections: cols,
      graph: true
    )
    
    {:ok, result}
  end
end
```

### 3.2 `.fleetprompt/graphonomous/` Convention

**Each agent declares its knowledge needs:**

```json
// .fleetprompt/graphonomous/collections.json
{
  "collections": [
    {
      "id": "customer_docs",
      "description": "Customer technical documentation",
      "embedding_model": "text-embedding-3-small",
      "graph_enabled": true,
      "entity_types": ["product", "feature", "bug", "customer"],
      "retention_days": 365
    },
    {
      "id": "code_knowledge",
      "description": "Source code and API documentation",
      "embedding_model": "code-embedding-002",
      "graph_enabled": true,
      "entity_types": ["function", "module", "dependency"],
      "retention_days": null
    }
  ],
  "relationships": [
    {
      "from": "customer",
      "to": "bug",
      "type": "reported",
      "bidirectional": false
    },
    {
      "from": "product",
      "to": "feature",
      "type": "includes",
      "bidirectional": true
    }
  ]
}
```

### 3.3 Arcana Integration Points

**Graphonomous = Production-ready Arcana agent**

| Arcana Feature | Graphonomous Exposure | OS Permission |
|----------------|----------------------|---------------|
| `Arcana.ingest/2` | `graph_ingest` tool | `graph:write:collection` |
| `Arcana.search/2` | `graph_search` tool | `graph:read:collection` |
| `Arcana.Entity` | `graph_entities` tool | `graph:read:entities` |
| `Arcana.Agent` | Native LLM pipeline | `network:http:llm_api` |

**Multi-tenancy via Ecto repos:**
```elixir
# Each Delegatic company gets isolated knowledge
tenant_repo = MyApp.Tenant.repo_for("company-abc")
Arcana.search(query, repo: tenant_repo, collections: ["shared", "company-abc"])
```

---

## 4. Delegatic Integration (Multi-Agent Companies)

### 4.1 Delegatic as Agent Group Coordinator

**Delegatic creates "companies" = groups of cooperating agents**

```json
// .fleetprompt/delegatic/company.json
{
  "company_id": "marketing-automation-co",
  "name": "Marketing Automation Company",
  "description": "AI company that runs marketing campaigns",
  "agents": [
    {
      "agent_id": "com.fleetprompt.copywriter",
      "role": "content_creator",
      "permissions_override": ["filesystem:write:/campaigns/**"]
    },
    {
      "agent_id": "com.graphonomous.analyst",
      "role": "performance_analyst",
      "permissions_override": ["graph:read:analytics"]
    },
    {
      "agent_id": "com.opensentience.scheduler",
      "role": "campaign_scheduler",
      "permissions_override": ["network:http:write:social_apis"]
    }
  ],
  "shared_resources": {
    "graphonomous_collections": ["campaigns", "customer_insights"],
    "filesystem_paths": ["/campaigns", "/reports"],
    "secrets": ["SOCIAL_API_KEY", "ANALYTICS_TOKEN"]
  },
  "policies": {
    "max_agents": 10,
    "restart_policy": "exponential_backoff",
    "health_check_interval": 30000
  }
}
```

### 4.2 Delegatic Company Lifecycle

```
1. User creates company via OS Admin UI
   ↓
2. OS provisions isolated workspace:
   - Dedicated Postgres schema (multi-tenant)
   - Graphonomous collections namespace
   - Filesystem sandbox
   ↓
3. OS installs + enables company agents
   ↓
4. Delegatic agent starts all company agents
   ↓
5. Agents communicate via A2A event bus
```

### 4.3 Permission Inheritance

**Company-level permissions cascade to member agents:**

```elixir
# Delegatic enforces: agent permissions ⊆ company permissions
company_perms = ["graph:read:*", "filesystem:write:/campaigns/**"]
agent_requested = ["graph:read:customer", "filesystem:write:/campaigns/draft/**"]

# ✅ Allowed (subset)
Delegatic.authorize(company, agent, agent_requested)

agent_requested = ["network:http:write:external_api"]
# ❌ Denied (not in company permissions)
```

---

## 5. A2A Traffic Integration (Inter-Agent Events)

### 5.1 A2A as Event Router Agent

**A2A provides pub/sub event bus for all agents:**

```json
{
  "id": "com.a2atraffic.core",
  "name": "Agent-to-Agent Event Router",
  "capabilities": ["pubsub", "routing", "filtering"],
  "permissions": [
    "event:subscribe:*",
    "event:publish:*",
    "audit:log:events"
  ]
}
```

### 5.2 `.fleetprompt/a2a/subscriptions.json`

**Agents declare event interests:**

```json
{
  "subscriptions": [
    {
      "pattern": "deploy.*.success",
      "handler": "on_deploy_success",
      "filters": {
        "environment": ["production", "staging"]
      }
    },
    {
      "pattern": "customer.*.created",
      "handler": "on_new_customer",
      "priority": "high"
    }
  ],
  "publications": [
    {
      "event": "analysis.report.complete",
      "schema": {
        "report_id": "string",
        "metrics": "object",
        "timestamp": "datetime"
      }
    }
  ]
}
```

### 5.3 Event Flow Architecture

```
Agent A                    A2A Router                   Agent B
   │                           │                            │
   ├─ publish("deploy.success")────────────────┐            │
   │                           │                │            │
   │                      [Match patterns]      │            │
   │                           │                │            │
   │                      [Apply filters]       │            │
   │                           │                │            │
   │                      [Check perms]         │            │
   │                           │                │            │
   │                           ├─────────── deliver event ──>│
   │                           │                             │
   │                           │<──── ack/handler result ────┤
   │                           │                             │
   │<─────────── ack ──────────┤                             │
   │                           │                             │
   [Audit Log: event published & delivered to 1 subscriber]
```

### 5.4 Security Model

**A2A enforces event permissions:**

```elixir
# Agent must have permission to publish event type
permission_required = "event:publish:deploy.*.success"

# Subscribers must have permission to receive event type
subscriber_perm = "event:subscribe:deploy.*.success"

# A2A checks both before routing
A2ATraffic.publish(event, 
  publisher_id: "agent-123",
  require_perms: [permission_required]
)
```

---

## 6. Permission Model (Complete Taxonomy)

### 6.1 OpenSentience Core Permissions

```json
{
  "permissions": [
    // Filesystem
    "filesystem:read:/path/to/dir",
    "filesystem:write:/path/to/dir",
    "filesystem:execute:/path/to/binary",
    
    // Network
    "network:http:read",
    "network:http:write",
    "network:tcp:connect:host:port",
    "network:dns:resolve",
    
    // Process
    "process:spawn",
    "process:signal:PID",
    
    // Environment
    "env:read:VAR_PATTERN",
    "env:write:VAR_PATTERN",
    
    // Tool invocation
    "tool:invoke:agent_id/tool_name",
    "tool:invoke:*/tool_name",  // Any agent's tool
    
    // FleetPrompt extensions
    "fleetprompt:skill:read",
    "fleetprompt:skill:execute",
    "fleetprompt:workflow:trigger",
    
    // Graphonomous extensions
    "graph:read:collection",
    "graph:write:collection",
    "graph:query:advanced",
    "graph:entity:create",
    "graph:entity:link",
    
    // Delegatic extensions
    "company:create",
    "company:agent:add",
    "company:resource:share",
    
    // A2A extensions
    "event:subscribe:pattern",
    "event:publish:pattern",
    "event:filter:set"
  ]
}
```

### 6.2 Permission Enforcement Points

| Layer | Enforces | How |
|-------|----------|-----|
| **OS Core** | All base permissions | ToolRouter + Launcher |
| **FleetPrompt** | Skill execution | Delegates to OS ToolRouter |
| **Graphonomous** | Graph access | Wraps Arcana with permission checks |
| **Delegatic** | Company resources | Enforces company ⊇ agent perms |
| **A2A** | Event routing | Checks pub/sub permissions before delivery |

---

## 7. Implementation Roadmap

### Phase 1: OpenSentience Core + FleetPrompt (Weeks 1-4)

**Deliverables:**
- [ ] OS Core MVP (catalog, launcher, admin UI)
- [ ] `.fleetprompt/` convention support
- [ ] Skill discovery from agent projects
- [ ] Basic permission model
- [ ] Unix socket protocol

**Success Metric:** Can install an agent from marketplace, discover its skills, and run a skill.

### Phase 2: Graphonomous + Arcana (Weeks 5-8)

**Deliverables:**
- [ ] Graphonomous agent (Arcana wrapper)
- [ ] `.fleetprompt/graphonomous/` collections config
- [ ] Multi-tenant knowledge graphs
- [ ] Graph search tool in ToolRouter
- [ ] Permission model for graph access

**Success Metric:** Agent can ingest docs to its graph and search them via chat UI.

### Phase 3: Delegatic + A2A (Weeks 9-12)

**Deliverables:**
- [ ] Delegatic company provisioning
- [ ] Multi-agent group coordination
- [ ] A2A event router agent
- [ ] `.fleetprompt/a2a/subscriptions.json` support
- [ ] Event-driven agent triggers

**Success Metric:** Create a "company" with 3 agents that coordinate via events.

### Phase 4: Integration + Polish (Weeks 13-16)

**Deliverables:**
- [ ] End-to-end demo: company creation → knowledge ingest → event-driven workflow
- [ ] Admin UI for all systems (FP/GO/D/A2A)
- [ ] Chat UI with full streaming + tool visibility
- [ ] Security audit + hardening
- [ ] Documentation + example projects

**Success Metric:** Public demo showing full portfolio integration.

---

## 8. Data Flow Example: Complete Workflow

### Scenario: "Marketing Campaign Company"

```
1. User creates Delegatic company:
   Company: "marketing-automation-co"
   Agents: [copywriter, analyst, scheduler]
   
2. OS provisions company workspace:
   - Postgres schema: company_marketing_automation_co
   - Graphonomous collections: [campaigns, customer_insights]
   - Filesystem: /companies/marketing-automation-co/
   
3. Graphonomous ingests customer data:
   Tool: graph_ingest
   Collection: customer_insights
   Permission: graph:write:customer_insights (approved)
   
4. Copywriter agent generates ad copy:
   Tool: generate_copy
   Reads: graph_search(customer_insights)
   Writes: /companies/.../campaigns/ad-001.md
   Permission: filesystem:write:/companies/marketing-automation-co/**
   
5. Copywriter publishes event:
   Event: campaign.draft.complete
   Payload: {campaign_id: "ad-001", status: "ready"}
   
6. A2A routes event to analyst:
   Pattern match: campaign.*.complete
   Permission check: analyst can subscribe to campaign.*
   Delivery: analyst receives event
   
7. Analyst runs performance prediction:
   Tool: predict_performance
   Reads: graph_search(customer_insights) + draft content
   Publishes: campaign.analysis.complete
   
8. Scheduler receives analysis event:
   Pattern match: campaign.analysis.complete
   Action: Schedule campaign if score > threshold
   Tool: schedule_post
   Permission: network:http:write:social_apis
   
9. Audit log records full chain:
   - Company provisioned
   - Graph write (customer data)
   - File write (ad copy)
   - Event: campaign.draft.complete
   - Tool: predict_performance
   - Event: campaign.analysis.complete
   - Network: POST to social API
```

---

## 9. Repository Structure

```
opensentience.org/
├── apps/
│   ├── opensentience_core/        # Core daemon
│   ├── opensentience_web/         # Admin UI (Phoenix)
│   ├── fleetprompt/               # Skills engine agent
│   ├── graphonomous/              # Arcana RAG agent
│   ├── delegatic/                 # Company coordinator agent
│   └── a2a_traffic/               # Event router agent
├── libs/
│   ├── opensentience_agent_sdk/   # Agent behaviour + protocol client
│   ├── opensentience_protocol/    # Wire protocol definitions
│   └── opensentience_permissions/ # Permission model + enforcement
├── config/
│   ├── config.exs
│   ├── dev.exs
│   └── prod.exs
├── priv/
│   └── registry/                  # Example remote registry
└── examples/
    ├── hello_world_agent/         # Minimal agent
    ├── rag_agent/                 # Uses Graphonomous
    ├── company_agent/             # Multi-agent company
    └── event_driven_agent/        # A2A integration
```

---

## 10. Open Questions (Resolve Before Implementation)

1. **Arcana version compatibility:** Target v0.1.x or wait for v1.0?
2. **Multi-tenancy strategy:** Schema-per-tenant or database-per-tenant for Delegatic companies?
3. **Event persistence:** Should A2A store events for replay/audit?
4. **GraphQL API:** Should admin UI use REST or GraphQL for real-time updates?
5. **Authentication:** How do external tools auth with OS? API keys? OAuth?

---

## 11. Success Metrics (MVP)

**Technical:**
- [ ] 5 agents running simultaneously
- [ ] <100ms p95 tool invocation latency
- [ ] GraphRAG queries in <500ms
- [ ] Event delivery in <50ms
- [ ] Zero permission bypasses in audit log

**User Experience:**
- [ ] Install agent from marketplace in <2 minutes
- [ ] Create Delegatic company in <5 clicks
- [ ] See streaming chat responses in UI
- [ ] Understand tool invocations via graph visualization

**Portfolio Integration:**
- [ ] FleetPrompt skills work via OS ToolRouter
- [ ] Graphonomous provides RAG to 3+ agents
- [ ] Delegatic company with 3+ agents coordinates via A2A
- [ ] Full workflow demo: install → configure → run → event-driven outcome

---

## 12. Next Steps

1. **Review & approve this spec** (this document)
2. **Resolve open questions** (section 10)
3. **Set up monorepo** (section 9)
4. **Implement Phase 1** (section 7)
5. **Create example agents** using SDK

**Timeline:** 16 weeks to full portfolio integration  
**Team Size:** 1-2 developers (MVP), 3-5 (production)  
**Budget:** $0 (self-funded) to $50k (contractor support)

---

**This spec is ready for implementation. Let's build it! 🚀**
