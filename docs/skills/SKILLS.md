# OpenSentience — Agent Skills

> **Purpose:** Teach any LLM connected to the OpenSentience governance shim
> how to use its MCP tools correctly, idiomatically, and in the right sequence.
> Drop these files into your MCP client's context so the model knows *when*,
> *why*, and *how* to call each tool.

---

## Quick Orientation

OpenSentience is the **governance, diagnostic, and temporal layer** for the [&]
Protocol ecosystem. It publishes ten numbered protocols organized in two
layers — eight cognitive primitives (OS-001 through OS-008) and two
cross-cutting protocols (OS-009 PRISM diagnostic, OS-010 PULSE temporal) — and
ships three runtime artifacts: the `open_sentience` hex package implementing
OS-006 governance shim and OS-008 agent harness, the **PRISM benchmark engine**
(`/PRISM/`), and the **PULSE manifest standard** (`/PULSE/`).

The shim wraps OTP-supervised agents with:
- **Permissions** — what the agent may access
- **Lifecycle** — what state the agent is in
- **Autonomy** — how much independence the agent has
- **Audit** — an immutable record of everything that happened

### The Governance Loop

Every governed agent follows this rhythm:

```
1. INSTALL    → agent_install (register agent + declare permissions)
2. CONFIGURE  → permission_check (verify grants are correct)
3. ENABLE     → agent_enable (start the governed process)
4. MONITOR    → agent_status + autonomy_level (observe behavior)
5. AUDIT      → agent_audit (review the immutable trail)
```

---

## Skill Files

| File | What It Teaches |
|------|----------------|
| [01_PROTOCOLS_OVERVIEW.md](01_PROTOCOLS_OVERVIEW.md) | The ten protocols (eight cognitive primitives + OS-009 PRISM + OS-010 PULSE) and their cognitive science grounding |
| [02_AGENT_LIFECYCLE.md](02_AGENT_LIFECYCLE.md) | State machine: installed through removed |
| [03_PERMISSIONS.md](03_PERMISSIONS.md) | Permission taxonomy, evaluation order, glob patterns |
| [04_AUTONOMY_LEVELS.md](04_AUTONOMY_LEVELS.md) | Graduated autonomy: observe, advise, act |
| [05_AUDIT_TRAILS.md](05_AUDIT_TRAILS.md) | Append-only audit system and compliance workflows |
| [06_INTEGRATION.md](06_INTEGRATION.md) | Integrating with Graphonomous, Delegatic, and [&] ecosystem |
| [07_COGNITIVE_SCIENCE.md](07_COGNITIVE_SCIENCE.md) | Research foundations and citations |
| [08_ANTI_PATTERNS.md](08_ANTI_PATTERNS.md) | Common mistakes and how to avoid them |

---

## MCP Tool Inventory

### Agent Management Tools

| Tool | Purpose | Key Params |
|------|---------|------------|
| `agent_install` | Register an agent with permissions and child_spec | `manifest` (required): agent_id, name, child_spec, permissions |
| `agent_enable` | Start the governed agent process | `agent_id` (required) |
| `agent_disable` | Graceful stop of the agent process | `agent_id` (required), `force` (optional, default false) |
| `agent_status` | Query current lifecycle state and metadata | `agent_id` (required) |
| `agent_audit` | Query the append-only audit trail | `agent_id` (required), `type`, `since`, `limit` |

### Policy Tools

| Tool | Purpose | Key Params |
|------|---------|------------|
| `permission_check` | Evaluate whether an agent may perform an action | `agent_id`, `permission_type`, `access`, `resource` (all required) |
| `autonomy_level` | Get or set the agent's autonomy level | `agent_id` (required), `level` (optional: observe, advise, act) |

---

## Protocol Reference

| ID | Protocol | Specification |
|----|----------|--------------|
| OS-001 | Continual Learning | Episodic/semantic/procedural nodes, consolidation, memory timescales |
| OS-002 | Topological Routing | Kappa parameter, SCC detection, fast vs deliberate routing |
| OS-003 | Deliberation Orchestrator | Bid/debate/vote/commit pipeline, argumentation |
| OS-004 | Attention Engine | Survey/triage/dispatch cycle, salience scoring, goal bias |
| OS-005 | Model Tier Adaptation | local_small / local_large / cloud_frontier, escalation rules |
| OS-006 | Agent Governance Shim | Permissions, lifecycle, autonomy, audit |
| OS-007 | Adversarial Robustness | Threat detection, identity verification, circuit breakers |
| OS-008 | Agent Harness | Pipeline ordering, quality gates, sprint contracts, context management |
| **OS-009** | **PRISM** — Protocol for Rating Iterative System Memory | 9 CL dimensions, 4-phase evaluation loop (compose → interact → observe → reflect → diagnose), BYOR, IRT calibration |
| **OS-010** | **PULSE** — Protocol for Uniform Loop State Exchange | Loop manifest standard, 5 canonical phase kinds, 5 cross-loop tokens (CloudEvents v1), 7 invariants, 12-test conformance suite |

---

## Permission Taxonomy

| Type | Access Modes | Resource Format |
|------|-------------|-----------------|
| `filesystem` | read, write, execute | Glob paths: `/data/**`, `/tmp/*.csv` |
| `network` | outbound, inbound | Host patterns: `api.example.com`, `*.internal.net` |
| `tool_invocation` | allowed, denied | Tool names: `store_node`, `deliberate` |
| `graph_access` | read, write | Graph namespaces or `*` for all |

**Evaluation order:** explicit deny > explicit allow > default deny.

---

## Lifecycle State Reference

```
installed --> enabled --> running
                ^          |
                |          v
                +--- enabled (stop)
                       |
                       v
                    disabled --> removed
```

| State | Meaning |
|-------|---------|
| `installed` | Registered with permissions, not yet started |
| `enabled` | Process started under supervision |
| `running` | Actively executing (sub-state of enabled) |
| `disabled` | Process stopped, can be re-enabled |
| `removed` | Fully deregistered, permissions cleared |

---

## Autonomy Level Reference

| Level | Behavior | Use When |
|-------|----------|----------|
| `observe` | Generates recommendations, blocks execution | New or untrusted agents |
| `advise` | Queues actions for human approval | Building trust, sensitive domains |
| `act` | Executes autonomously within permissions | Proven agents in well-scoped domains |

Default for all new agents: `observe`.

---

## How to Use These Skills Files

**For system prompts:** Include `SKILLS.md` first, then whichever numbered
skill files are relevant to the task.

**For context injection:** Reference specific skill files when the user asks
about a capability (e.g., "see 03_PERMISSIONS.md for the permission model").

**For agent bootstrapping:** The governance loop (install, configure, enable,
monitor, audit) is the canonical workflow for any governed agent.

**Minimum viable context:** If you can only include one file, include this one.
