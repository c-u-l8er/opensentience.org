# Architecture

> OTP supervision tree, GenServers, ETS caches, MCP server layout, and
> harness components for the `open_sentience` governance shim and agent harness.

---

## Overview

The `open_sentience` hex package is an OTP application that wraps arbitrary
`child_spec` processes with governance: permissions, lifecycle management,
graduated autonomy, and append-only audit logging.

It ships as a single supervision tree that can be added to any Elixir
application. The shim interposes between the host supervisor and the governed
agent processes, adding policy enforcement without modifying the agent code.

**Design constraint:** The shim must add less than 1% CPU overhead, less than
5 MB RSS, and less than 2 microseconds per permission check.

---

## Supervision Tree

```
OpenSentience.Application
  |
  +-- OpenSentience.Supervisor (one_for_one)
        |
        +-- OpenSentience.PermissionEngine     (GenServer + ETS)
        |
        +-- OpenSentience.AutonomyController   (GenServer + ETS)
        |
        +-- OpenSentience.AuditWriter          (GenServer, batched)
        |
        +-- OpenSentience.AgentSupervisor      (DynamicSupervisor)
        |     |
        |     +-- OpenSentience.AgentLifecycle  (GenStateMachine, per agent)
        |           |
        |           +-- <wrapped agent process> (the actual child_spec)
        |
        +-- OpenSentience.MCP.Server           (Hermes MCP server)
        |
        +-- OpenSentience.Harness.Supervisor  (DynamicSupervisor)
              |
              +-- OpenSentience.Harness.Session  (per task, supervised)
                    |
                    +-- Harness.PipelineEnforcer   (GenServer)
                    +-- Harness.QualityGate        (GenServer)
                    +-- Harness.ContractValidator   (GenServer + ETS)
                    +-- Harness.SprintController    (GenStateMachine)
                    +-- Harness.ContextManager      (GenServer)
```

Each component has a single responsibility. The supervision strategy is
`one_for_one` — a crash in the AuditWriter does not take down the
PermissionEngine, and vice versa. Harness sessions are supervised independently
under a DynamicSupervisor — each task gets its own isolated session.

---

## Component Details

### PermissionEngine (GenServer + ETS)

Manages the permission taxonomy and evaluates permission checks.

- **ETS table:** `:os_permissions` — keyed by `{agent_id, permission_type, resource}`
- **Evaluation order:** explicit deny > explicit allow > default deny
- **Glob support:** filesystem paths and network hosts support glob patterns
- **Hot path:** permission checks read directly from ETS (no GenServer call)
- **Cold path:** permission mutations go through the GenServer for serialization
- **Integrates with:** Delegatic policy PubSub for external policy updates

### AgentLifecycle (GenStateMachine)

One instance per governed agent. Manages the lifecycle state machine:

```
installed --> enabled --> running
                ^          |
                |          v
                +--- enabled (stop)
                       |
                       v
                    disabled --> removed
```

- **States:** `installed`, `enabled`, `running`, `disabled`, `removed`
- **Transitions:** validated by GenStateMachine callbacks
- **On enable:** starts the wrapped `child_spec` under AgentSupervisor
- **On disable:** graceful shutdown with configurable timeout, then force kill
- **On remove:** ensures disabled first, then cleans up ETS entries
- **Audit:** every transition emits an audit entry via AuditWriter

### AuditWriter (GenServer)

Append-only audit trail with batched writes.

- **Batching:** collects entries for a configurable interval (default 100ms),
  then flushes as a single write
- **Backends:** ETS (default, in-memory), file (append-only log), Ecto (optional)
- **Schema:** each entry contains id, timestamp, agent_id, event_type,
  operation, result, actor, reason, and metadata
- **Immutability:** entries can only be appended, never modified or deleted
- **Query:** supports filtering by agent_id, event_type, time range, and limit

### AutonomyController (GenServer + ETS)

Manages graduated autonomy levels per agent.

- **ETS table:** `:os_autonomy` — keyed by `agent_id`
- **Levels:** `observe`, `advise`, `act`
- **Enforcement:**
  - `observe` — agent generates recommendations, shim blocks execution
  - `advise` — agent prepares actions, shim queues for human approval
  - `act` — agent executes autonomously within granted permissions
- **Transitions:** every level change is audited
- **Default:** new agents start at `observe`

### AgentSupervisor (DynamicSupervisor)

Standard OTP DynamicSupervisor that hosts the per-agent AgentLifecycle
processes. No custom logic — supervision is delegated to the per-agent
GenStateMachine instances.

### MCP Server (Hermes)

Exposes the governance shim as MCP tools for LLM agents.

- **Transport:** stdio (default) or SSE
- **Seven tools:** `agent_install`, `agent_enable`, `agent_disable`,
  `agent_status`, `agent_audit`, `permission_check`, `autonomy_level`
- **Built on:** Hermes MCP library
- **Authentication:** delegates to host application (not handled by shim)

---

## Data Flow

### Permission Check (Hot Path)

```
Agent action
  --> PermissionEngine.check(agent_id, permission, resource)
  --> ETS :os_permissions lookup (< 2 microseconds)
  --> {allow | deny, reason}
  --> AuditWriter.append(permission_check entry)
```

### Agent Install Flow

```
agent_install(manifest)
  --> PermissionEngine: write grants/denials to ETS
  --> AgentSupervisor: start_child(AgentLifecycle)
  --> AgentLifecycle: initial state = :installed
  --> AuditWriter: log install event
```

### Autonomy Enforcement

```
Agent wants to execute action
  --> AutonomyController.level(agent_id) --> observe | advise | act
  --> observe: log recommendation, block execution
  --> advise:  queue action, notify human, await approval
  --> act:     PermissionEngine.check() --> allow? execute : block
```

---

## Integration Points

### Delegatic Policies

Delegatic publishes governance policies via PubSub. The PermissionEngine
subscribes and updates its ETS cache when policies change. This enables
centralized policy authoring with distributed enforcement.

### Graphonomous Wrapping

The governance shim can wrap a Graphonomous instance, adding `graph_access`
permissions (read/write) to control which agents can query or modify the
knowledge graph.

### Agentelic Manifests

Agent manifests from Agentelic declare required permissions. The `agent_install`
tool consumes these manifests, granting or denying permissions according to
the current policy.

### FleetPrompt Marketplace

Agents installed from the FleetPrompt marketplace enter the same governance
flow — `agent_install` with the marketplace manifest, starting at `observe`
autonomy.

---

## Harness Components (OS-008)

The harness layer sits above the governance shim components. It orchestrates
agent pipelines, enforces prerequisite ordering, and manages quality gates.

### PipelineEnforcer (GenServer)

Ensures pipeline stages execute in order. Blocks tool calls that violate
prerequisites.

- **Prerequisite model:** each tool call has a set of required prior stages
- **Key rule:** `retrieve_context` MUST complete before any write-class tool call
- **Stage tracking:** MapSet of completed `{stage, status}` tuples per session
- **Integration:** wraps above OS-006 permission checks — both must pass
- **Violations:** logged to audit trail with session_id and missing prerequisites

### QualityGate (GenServer)

Evaluator orchestrator. Spawns evaluator agents in isolated contexts to grade
generator output against acceptance criteria.

- **Separate context:** evaluator never sees generator reasoning (enforced)
- **Adversarial tuning:** system prompt emphasizes finding failures
- **Evidence required:** pass judgments must cite specific evidence
- **Iteration loop:** fail → feedback → generator iterates (up to max_iterations)
- **Escalation:** max iterations reached → escalate to human

### ContractValidator (GenServer + ETS)

Validates [&] Protocol governance blocks at runtime.

- **Hard constraints:** inviolable — action blocked if violated
- **Soft constraints:** logged as warnings if overridden
- **Escalation rules:** `escalate_when.confidence_below`, `escalate_when.cost_exceeds_usd`
- **Confidence gating:** coverage assessment must exceed threshold before dispatch

### SprintController (GenStateMachine)

Manages the planner → generator → evaluator loop as a state machine.

- **States:** `planned`, `generating`, `evaluating`, `passed`, `feedback`,
  `committed`, `escalated`, `completed`
- **Sprint contracts:** explicit agreements between roles with acceptance criteria,
  iteration limits, budget constraints, and provenance links
- **Tier adaptation:** local_small skips planner (single sprint), cloud_frontier
  gets full adversarial evaluation

### ContextManager (GenServer)

Monitors context window utilization and prevents quality degradation.

- **Compaction threshold:** 55% (triggers before 60% degradation point)
- **Overflow threshold:** tool results > 20K tokens offloaded to filesystem
- **Compaction strategy:** offload large results, summarize history, inject fresh
  Graphonomous retrieval
- **Subagent delegation:** tasks exceeding context limits spawn subagents via OS-006,
  sharing knowledge through Graphonomous (not parent context)

---

## The Dual Enforcement Stack

OS-006 and OS-008 operate as a layered enforcement stack:

```
Agent requests tool call
  │
  ▼
OS-008 PipelineEnforcer: Are prerequisites met?
  │ NO → Block with reason + audit log
  │ YES ↓
  ▼
OS-006 PermissionEngine: Does the agent have permission?
  │ NO → Block with audit log
  │ YES ↓
  ▼
Tool executes
  │
  ▼
OS-008 PipelineEnforcer: Update stage state
OS-006 AuditWriter: Log execution
```

---

## Performance Targets

| Metric | Target | Mechanism |
|--------|--------|-----------|
| Permission check latency | < 2 microseconds | Direct ETS read |
| CPU overhead | < 1% | No hot-path GenServer calls |
| Memory overhead | < 5 MB RSS | ETS tables, no large state |
| Audit write latency | < 1 ms (batched) | GenServer batching at 100ms intervals |
| Agent install latency | < 10 ms | Single ETS write + DynamicSupervisor start |
| Pipeline prerequisite check | < 5 microseconds | MapSet membership check |
| Context utilization tracking | < 1 ms per tool result | Token counting + threshold check |
