# PULSE — Protocol for Uniform Loop State Exchange

**OpenSentience Specification OS-010 v0.1**

**Date:** April 10, 2026
**Status:** Draft (sibling to OS-009 PRISM)
**Author:** [&] Ampersand Box Design
**License:** Apache 2.0
**Stack:** language-agnostic protocol; Elixir/OTP reference implementation
**Canonical URL:** `pulse.opensentience.org`

> "[&] composes agents. PRISM measures them. PULSE gives them a heartbeat."

---

## 0. One-Paragraph Summary

PULSE is the **temporal algebra** of the [&] Protocol stack. Where [&] declares
*what* agents can compose with each other (a structural DAG), PULSE declares
*how* their processes cycle over time (a circulatory system of closed loops).
A PULSE manifest specifies a loop's phases, cadence, substrate references,
invariants, and cross-loop signaling. Conforming runtimes (any language, any
scheduler) execute manifests against any conforming substrate (Graphonomous
for memory, Delegatic for policy, OpenSentience OS-006 for permissions).
PULSE makes the circulatory system between [&] products **legible,
validatable, and portable** without prescribing the runtime.

---

## 1. Why a Loop Protocol Now

The [&] portfolio contains at least 11 closed-loop processes operating at
cadences from sub-millisecond (Delegatic policy lookup) to monthly (PRISM
benchmark cycles). Three nesting levels are already in production:

```
PRISM (outer)        compose → interact → observe → reflect → diagnose
  └─ Graphonomous    retrieve → route → act → learn → consolidate
       └─ Deliberation    survey → triage → dispatch → act → learn
```

OS-008 (Agent Harness) may add a fourth outer layer above PRISM.
Without a uniform way to declare loop topology, every product reinvents:

| Concern                  | Today (per-product)                      | With PULSE                          |
|--------------------------|------------------------------------------|-------------------------------------|
| Phase ordering           | Hardcoded in supervision tree            | Declared in `phases[]`              |
| Cadence                  | Cron, GenServer timer, Broadway, custom  | Declared in `cadence{}`             |
| Cross-loop signaling     | Phoenix.PubSub, NOTIFY, ad-hoc           | Declared in `connections[]`         |
| Audit correlation        | Per-substrate log, no shared trace_id    | Mandated `trace_id` propagation     |
| Reputation semantics     | 5 incompatible definitions               | Canonical `ReputationUpdate` token  |
| Consolidation timing     | 4 uncoordinated schedulers               | Declared `cadence: idle` + heartbeat |
| Observability for PRISM  | Bespoke per system                       | PRISM reads PULSE manifests directly |

PULSE does not replace any of these implementations. It is the *declarative
layer* that lets PRISM, Delegatic, OpenSentience, and customer code understand
each other's loops without a custom integration per pair.

### 1.1 The Founding Insight

A closed loop is a **circulatory system, not a pipeline**. Pipelines have an
input and an output. Loops have phases that *return* — outcomes flow backward
through the system to inform the next iteration. The protocol must therefore
make the *closure point* explicit: which phase emits the signal that becomes
the next iteration's input.

Three structural truths fall out of that insight:

1. **Loops have variable phase counts** — observed phase counts in the
   portfolio range from 5 (Graphonomous, PRISM, TickTickClock, GeoFleetic,
   FleetPrompt) to 8 (WebHost.Systems). A protocol that hardcodes 5 phases
   breaks on day one.
2. **Loops nest arbitrarily** — PRISM contains Graphonomous contains
   Deliberation. OS-008 may contain PRISM. The protocol cannot hardcode
   nesting depth.
3. **Loops share substrates** — every loop reads from and writes to the same
   knowledge graph, governed by the same policy tree, audited into the same
   append-only log. The protocol must reference these substrates rather than
   mandate implementations.

---

## 2. Related Work

| System / Standard         | Relationship to PULSE                                          |
|---------------------------|----------------------------------------------------------------|
| **AsyncAPI**              | Describes message-driven APIs. PULSE describes *cyclic processes*, not channels. |
| **CloudEvents (CNCF)**    | Standard for event envelopes. PULSE adopts CloudEvents-compatible signaling for `connections[]`. |
| **OpenTelemetry**         | Distributed tracing. PULSE mandates `trace_id` propagation through every phase. |
| **Temporal / Cadence**    | Workflow runtimes. PULSE is a *manifest standard*; Temporal is one of many conforming runtimes. |
| **BPMN**                  | Business process modeling notation. PULSE is narrower (closed loops, agent processes) and machine-first. |
| **Petri nets**            | Formal model for concurrent systems. PULSE invariants are inspired by Petri-net safety properties. |
| **Statecharts (Harel)**   | Hierarchical state machines. PULSE phases are statechart-compatible but not required to be. |
| **OS-001 (CL)**           | PULSE formalizes the loop topology that OS-001 prescribes for a single memory loop. |
| **OS-002 (κ-Routing)**    | PULSE encodes κ-triggered routing as a phase-transition invariant. |
| **OS-003 (Deliberation)** | PULSE encodes quorum-before-commit as a deliberation invariant. |
| **OS-004 (Attention)**    | PULSE allows `cadence: idle` and `cadence: cross_loop_signal` for attention triggers. |
| **OS-006 (Governance)**   | PULSE mandates policy-check on every `act` phase. |
| **OS-008 (Harness)**      | PULSE describes the loops that the harness orchestrates. |
| **OS-009 (PRISM)**        | PULSE provides PRISM the manifest format it needs to evaluate any loop. |

---

## 3. Core Concepts

### 3.1 Loop

A **loop** is a named, cyclic process composed of ordered phases that close
back on themselves. Every PULSE manifest describes exactly one loop.
Multi-loop systems are described by multiple manifests plus their
`connections[]`.

### 3.2 Phase

A **phase** is an atomic, idempotent step inside a loop. Each phase has a
`kind` drawn from a small canonical vocabulary plus an optional `custom`
escape hatch. The five canonical kinds are:

| Kind          | Meaning                                                      |
|---------------|--------------------------------------------------------------|
| `retrieve`    | Read from a substrate to gather context for the iteration.   |
| `route`       | Decide what to do next based on retrieved context.           |
| `act`         | Mutate the world or a substrate (write).                     |
| `learn`       | Update beliefs/confidence/reputation from outcome.           |
| `consolidate` | Compress, merge, or promote state across timescales.         |

These kinds match Graphonomous v0.4's machine architecture and PRISM v3.0's
phase taxonomy, ensuring zero translation cost for the two reference loops.

A loop **may** include phases of any kind, in any order, any number of
times. A loop **must** include at least one `retrieve` and at least one
`act`, and the closure path **must** route at least one `learn` or
`consolidate` outcome back to a `retrieve`.

Custom kinds (`compose`, `interact`, `observe`, `reflect`, `diagnose`,
`bid`, `negotiate`, `survey`, `triage`, `dispatch`, etc.) are declared via
`kind: "custom"` with a `custom_kind` string. PRISM, AgenTroMatic, and
WebHost.Systems use custom kinds; the canonical five remain stable.

### 3.3 Cadence

A **cadence** is the trigger that initiates a new iteration of the loop.
Six cadence types are defined:

| Type                | Trigger                                                  | Example                         |
|---------------------|----------------------------------------------------------|---------------------------------|
| `event`             | An external or substrate event arrives                   | WebHost invocation              |
| `periodic`          | A wall-clock interval elapses                            | TickTickClock anomaly tick      |
| `streaming`         | A continuous stream emits a value                        | Sensor ingest                   |
| `idle`              | The runtime detects an idle period                       | Graphonomous consolidation      |
| `cross_loop_signal` | Another loop's phase emits a signal                      | Actuarial → Intake re-pricing   |
| `manual`            | A human or external system invokes the loop              | PRISM benchmark kickoff         |

Cadence declarations may compose: `cadence: { type: "periodic", params: { interval: "weekly" }, fallback: { type: "manual" } }`.

### 3.4 Substrate

A **substrate** is a referenced (not implemented) infrastructure layer that
the loop reads from or writes to. PULSE defines six substrate slots:

| Slot        | Provided By (Reference)        | Purpose                              |
|-------------|--------------------------------|--------------------------------------|
| `memory`    | Graphonomous (OS-001)          | Shared knowledge graph               |
| `policy`    | Delegatic (OS-006 partial)     | Authorization, cost enforcement      |
| `audit`     | Delegatic / OpenSentience      | Append-only mutation log             |
| `auth`      | OpenSentience OS-006           | Permission shim, agent lifecycle     |
| `transport` | MCP / A2A / direct             | How phases call each other           |
| `time`      | TickTickClock (optional)       | Multi-timescale reasoning            |

A conforming runtime **must** provide substrate implementations for at least
`memory`, `policy`, `audit`, and `auth`. The other slots are optional.

### 3.5 Connection

A **connection** declares that one phase emits a signal which becomes
another loop's trigger. Connections are CloudEvents-compatible envelopes
typed by one of the five canonical signal tokens (see §6).

### 3.6 Nesting

A loop **may** declare a `parent_loop` (the loop that contains it) and
`inner_loops[]` (loops that run inside it triggered by a phase). Nesting
depth is **unbounded**. The protocol enforces only one structural rule:
*the outer loop must wait for the inner loop to stabilize before observing
the inner loop's substrate state*.

---

## 4. The Loop Manifest

A PULSE manifest is a JSON (or YAML) document with the following top-level
shape. The full JSON Schema is published as `pulse-loop-manifest.schema.json`
alongside this specification.

```jsonc
{
  "$schema": "https://opensentience.org/schemas/pulse-loop-manifest.v0.1.json",
  "pulse_protocol_version": "0.1",

  "loop_id": "graphonomous.continual_learning",
  "loop_name": "Graphonomous Continual Learning Loop",
  "version": "0.4.0",
  "owner": "ampersandboxdesign.com",
  "workspace_scope": "required",            // | "optional" | "global"

  "description": "Per-turn memory loop that retrieves context, routes by topology, acts on the graph, learns from outcomes, and consolidates during idle.",

  "phases": [
    {
      "id": "retrieve_ctx",
      "kind": "retrieve",
      "description": "Pull semantic, episodic, and procedural context for the current query.",
      "inputs":  { "from": "external", "schema": "RetrieveRequest" },
      "outputs": { "to": "phase:route_topology", "schema": "RetrieveResult" },
      "idempotent": true,
      "signature": "hash(query, workspace_id, k)",
      "timeout_ms": 500,
      "on_failure": "retry",
      "max_retries": 2
    },
    {
      "id": "route_topology",
      "kind": "route",
      "description": "Compute κ; route to act or deliberate.",
      "inputs":  { "from": "phase:retrieve_ctx", "schema": "RetrieveResult" },
      "outputs": { "to": "phase:act_store", "schema": "RouteDecision" },
      "idempotent": true,
      "invariant": "kappa_routing"
    },
    {
      "id": "act_store",
      "kind": "act",
      "description": "Persist the agent's action and outcome envelope.",
      "inputs":  { "from": "phase:route_topology", "schema": "RouteDecision" },
      "outputs": { "to": "substrate:memory", "schema": "Mutation" },
      "idempotent": false,
      "policy_check": "delegatic.check_policy",
      "audit_event": "node.created"
    },
    {
      "id": "learn_outcome",
      "kind": "learn",
      "description": "Update confidence on causal parents from outcome signal.",
      "inputs":  { "from": "external|signal:OutcomeSignal", "schema": "OutcomeSignal" },
      "outputs": { "to": "substrate:memory", "schema": "ConfidenceUpdate" },
      "idempotent": true,
      "invariant": "feedback_immutability"
    },
    {
      "id": "consolidate_idle",
      "kind": "consolidate",
      "description": "Merge similar nodes, promote across timescales.",
      "inputs":  { "from": "substrate:memory", "schema": "ConsolidationCandidate[]" },
      "outputs": { "to": "substrate:memory", "schema": "ConsolidationEvent" },
      "idempotent": true
    }
  ],

  "closure": {
    "from_phase": "consolidate_idle",
    "to_phase":   "retrieve_ctx",
    "via":        "substrate:memory",
    "guarantee":  "eventual"                // | "immediate" | "next_tick"
  },

  "cadence": {
    "type":   "event",
    "params": { "trigger": "agent_query" },
    "fallback": { "type": "idle", "params": { "min_idle_ms": 60000 } }
  },

  "nesting": {
    "parent_loop": null,
    "inner_loops": [
      {
        "loop_id": "graphonomous.deliberate",
        "trigger": "phase:route_topology when kappa > 0",
        "wait":    "until_stable"
      }
    ]
  },

  "substrates": {
    "memory":    "graphonomous://workspace/{ws_id}",
    "policy":    "delegatic://workspace/{ws_id}",
    "audit":     "delegatic://workspace/{ws_id}/audit",
    "auth":      "open_sentience://workspace/{ws_id}",
    "transport": "mcp",
    "time":      null
  },

  "invariants": {
    "phase_atomicity":         true,
    "feedback_immutability":   true,
    "append_only_audit":       true,
    "kappa_routing":           true,
    "quorum_before_commit":    false,        // no inner consensus loop
    "outcome_grounding":       true,
    "trace_id_propagation":    true
  },

  "connections": [
    {
      "id": "outcome_to_prism",
      "emit_phase":     "learn_outcome",
      "emit_condition": "status in ['success','failure']",
      "envelope":       "cloudevents.v1",
      "token":          "OutcomeSignal",
      "to_loop":        "prism.benchmark",
      "to_phase":       "observe_judgments",
      "cadence":        "async",
      "delivery":       "at_least_once"
    }
  ],

  "telemetry": {
    "namespace": "graphonomous",
    "phase_metrics":  ["duration_ms", "input_size", "output_size", "status"],
    "loop_metrics":   ["closure_rate", "iteration_count", "kappa_distribution"]
  }
}
```

The schema is intentionally **flat enough to read** and **strict enough to
validate**. Every field has either a stable type or a free-form string namespace
(e.g. `cadence.params`).

---

## 5. Phase Semantics (Normative)

A conforming runtime **must** uphold the following semantics for every phase:

### 5.1 Atomicity

A phase either completes all of its declared outputs or none of them.
Partial output is a failure. The runtime is responsible for transactional
boundaries (DB transactions, two-phase commit, idempotency keys).

### 5.2 Idempotency

If `phase.idempotent` is `true`, a runtime **must** detect duplicate
invocations via `phase.signature` and return the same output without
re-executing side effects. If `phase.idempotent` is `false`, the runtime
**must** still emit a `signature` for downstream deduplication, even though
re-execution will produce a new mutation.

### 5.3 Ordering

Phases run in the order declared in `phases[]` *unless* `route` phases
explicitly redirect via their `outputs.to` field. Routing decisions are
recorded as audit events with `event_type: phase.routed`.

### 5.4 Failure Handling

`phase.on_failure` declares one of: `retry`, `rollback`, `escalate`,
`skip`, `abort_loop`. The runtime **must** respect this directive.
`retry` honors `max_retries` with exponential backoff. `escalate` emits
a `signal: EscalationRequest` to the parent loop or human channel.

### 5.5 Trace Propagation

Every phase invocation **must** carry a `trace_id` that propagates into
every substrate call. Substrates **must** echo the `trace_id` in their
own audit logs. PULSE thereby provides cross-substrate trace correlation
without inventing a new tracing system.

### 5.6 Signature Computation

`phase.signature` is a deterministic hash of the phase's inputs plus its
`workspace_id`. Recommended algorithm: BLAKE3 over a canonical JSON
serialization. The signature is the deduplication key for at-least-once
delivery semantics.

---

## 6. The Five Canonical Tokens

PULSE defines five canonical type tokens that flow between loops via
`connections[]`. These tokens are the protocol's **shared vocabulary**.

### 6.1 TopologyContext

Emitted by `retrieve` phases, consumed by `route` phases. Carries the
SCC structure and κ value from a Graphonomous-style memory substrate.

```jsonc
{
  "token": "TopologyContext",
  "version": "0.1",
  "trace_id": "...",
  "nodes": [{ "id": "...", "type": "...", "confidence": 0.83 }],
  "edges": [{ "src": "...", "dst": "...", "type": "causal" }],
  "sccs": [
    { "id": "scc_001", "members": ["..."], "kappa": 1, "routing": "deliberate", "budget": { "max_iterations": 2 } }
  ],
  "max_kappa": 1,
  "routing": "deliberate"   // | "fast"
}
```

### 6.2 DeliberationResult

Emitted by inner deliberation loops after consensus. Carries the verdict,
evidence chain, and dissent record. Compatible with Deliberatic and
AgenTroMatic outputs.

```jsonc
{
  "token": "DeliberationResult",
  "version": "0.1",
  "trace_id": "...",
  "verdict": "approve",
  "confidence": 0.87,
  "consensus_type": "fast_path",   // | "conflict_path"
  "reasoning_path": ["node_1", "node_5", "node_12"],
  "dissents": [{ "agent_id": "...", "position": "...", "weight": 0.12 }],
  "evidence_chain_merkle_root": "blake3:..."
}
```

### 6.3 OutcomeSignal

Emitted by `learn` phases when an action's result is known. Carries the
causal attribution back to the beliefs that justified the action.

```jsonc
{
  "token": "OutcomeSignal",
  "version": "0.1",
  "trace_id": "...",
  "action_id": "act_42",
  "status": "success",            // | "partial" | "failure" | "timeout"
  "causal_parent_ids": ["node_5", "node_12"],
  "evidence": { "metric": "...", "value": 0.94 },
  "timestamp": "2026-04-10T12:00:00Z"
}
```

### 6.4 ReputationUpdate

Emitted by any loop that adjusts trust/confidence/reputation. **This token
is canonical** — all five existing reputation models in the portfolio
(Graphonomous confidence, AgenTroMatic ELO, Deliberatic domain ELO,
FleetPrompt trust score, TickTickClock anomaly confidence) **must** map
their internal updates to this shape when emitting cross-loop signals.

```jsonc
{
  "token": "ReputationUpdate",
  "version": "0.1",
  "trace_id": "...",
  "subject_id": "agent_a7",
  "subject_type": "agent",        // | "node" | "model" | "scenario"
  "domain": "code",               // | "medical" | "business" | ...
  "delta": +0.04,
  "calibration_adjustment": -0.01,
  "source_loop": "deliberatic.argumentation",
  "evidence_ref": "trace_id:..."
}
```

### 6.5 ConsolidationEvent

Emitted by `consolidate` phases. Notifies other loops that memory has
been compressed, merged, or promoted across timescales.

```jsonc
{
  "token": "ConsolidationEvent",
  "version": "0.1",
  "trace_id": "...",
  "timescale": "medium",          // | "fast" | "slow" | "glacial"
  "affected_node_ids": ["..."],
  "merged_into_ids": ["..."],
  "convergence_status": "stable", // | "unstable" | "diverged"
  "metric_deltas": { "graph_size": -12, "avg_confidence": +0.02 }
}
```

---

## 7. The Seven Invariants

A conforming runtime **must** enforce all seven invariants for every loop
declared with `invariants.<invariant>: true`.

### 7.1 Phase Atomicity

No two phases of the same loop iteration may run concurrently against the
same substrate without explicit transactional isolation. Inter-iteration
parallelism is permitted; intra-iteration parallelism within a single
phase is permitted; cross-phase parallelism within a single iteration
requires opt-in via `phase.parallel: true`.

### 7.2 Feedback Immutability

A `learn` phase **must not** rewrite history. It may only update
confidence on existing nodes or append new nodes. Outcome attribution
via `causal_parent_ids` is append-only.

### 7.3 Append-Only Audit

Every phase transition, every substrate mutation, and every cross-loop
signal **must** produce an audit event with `trace_id`, `phase_id`,
`timestamp`, and `signature`. Audit events are never updated or deleted.
GDPR erasure is handled via the substrate (`act(action: "gdpr_erase")` in
Graphonomous, equivalent in others), not by audit-log rewriting.

### 7.4 κ-Routing

If a `route` phase has access to a `TopologyContext` with `max_kappa > 0`,
the route decision **must** be `deliberate` (or a custom kind that
compiles to deliberation). This invariant encodes OS-002 as a
phase-transition rule rather than a runtime check.

### 7.5 Quorum Before Commit

If a loop contains an inner deliberation loop, the outer `act` phase
**must not** commit until the inner loop emits a `DeliberationResult`
with `confidence >= quorum_threshold`. The default `quorum_threshold` is
0.66; loops may override.

### 7.6 Outcome Grounding

Every `act` phase **must** record `causal_parent_ids` so that the
corresponding `learn` phase can attribute outcomes to specific beliefs.
This is the foundation of closed-loop learning and the metric PRISM uses
to compute "loop closure rate".

### 7.7 trace_id Propagation

Every substrate call from inside a phase **must** include the current
`trace_id`. Substrates **must** echo the `trace_id` in their own audit
events. This enables cross-substrate trace reconstruction and is
non-negotiable for PRISM evaluation.

---

## 8. Cadence Primitives

### 8.1 `event`

```jsonc
{ "type": "event", "params": { "trigger": "<event_name>", "filter": "<predicate>?" } }
```

The loop iterates when an external event matching the trigger arrives.
Used by: WebHost invocation, Agentelic spec change, FleetPrompt publish.

### 8.2 `periodic`

```jsonc
{ "type": "periodic", "params": { "interval": "1h", "phase_offset": "0s" } }
```

The loop iterates at fixed wall-clock intervals. Used by: PRISM cycle
manager, Delegatic policy refresh.

### 8.3 `streaming`

```jsonc
{ "type": "streaming", "params": { "stream": "<stream_uri>", "batch_size": 1 } }
```

The loop iterates per stream tick. Used by: TickTickClock ingest,
GeoFleetic GPS feed.

### 8.4 `idle`

```jsonc
{ "type": "idle", "params": { "min_idle_ms": 60000, "max_iteration_per_idle": 1 } }
```

The loop iterates when the runtime detects an idle period exceeding
`min_idle_ms`. Used by: Graphonomous consolidation, TickTickClock
multi-timescale promotion.

### 8.5 `cross_loop_signal`

```jsonc
{ "type": "cross_loop_signal", "params": { "from_loop": "...", "from_phase": "...", "token": "..." } }
```

The loop iterates when another loop emits a matching signal. Used by:
Actuarial loops responding to claims outcomes.

### 8.6 `manual`

```jsonc
{ "type": "manual", "params": { "interface": "mcp:tool_name", "rate_limit": "10/min" } }
```

The loop iterates only when invoked by a human or external system.
Used by: PRISM benchmark kickoff, BendScript canvas edit.

---

## 9. Substrate Interface Contracts

A conforming substrate implementation **must** expose the following
operations. These contracts are minimal — implementations may expose
additional operations.

### 9.1 `memory` substrate

| Operation         | Inputs                              | Outputs                       | Idempotent |
|-------------------|-------------------------------------|-------------------------------|------------|
| `retrieve_context`| `(query, workspace_id, k, trace_id)` | `[Node]`, `TopologyContext`  | yes        |
| `store_node`      | `(Node, trace_id)`                  | `node_id`, `audit_event_id`   | no (returns existing on duplicate signature) |
| `store_edge`      | `(src, dst, type, trace_id)`        | `edge_id`                     | yes        |
| `learn_from_outcome` | `(OutcomeSignal, trace_id)`      | `ConfidenceUpdate[]`          | yes        |
| `consolidate`     | `(scope, trace_id)`                 | `ConsolidationEvent`          | yes        |
| `topology_analyze`| `(node_ids?, trace_id)`             | `TopologyContext`             | yes        |

Reference implementation: Graphonomous v0.4 (`mcp__graphonomous__retrieve`,
`act`, `learn`, `consolidate`, `route` machines).

### 9.2 `policy` substrate

| Operation        | Inputs                                 | Outputs              |
|------------------|----------------------------------------|----------------------|
| `check_policy`   | `(actor, action, resource, trace_id)`  | `allow` \| `deny` + reason |
| `compute_effective` | `(org_id, trace_id)`                | `EffectivePolicy`    |

Reference implementation: Delegatic.

### 9.3 `audit` substrate

| Operation          | Inputs                          | Outputs       |
|--------------------|---------------------------------|---------------|
| `append_event`     | `(AuditEvent, trace_id)`        | `event_id`    |
| `query_by_trace`   | `(trace_id, since?, until?)`    | `[AuditEvent]`|

Reference implementation: Delegatic AuditWriter (Broadway pipeline) or
OpenSentience OS-006 audit log.

### 9.4 `auth` substrate

| Operation          | Inputs                                  | Outputs               |
|--------------------|-----------------------------------------|-----------------------|
| `permission_check` | `(agent_id, operation, trace_id)`       | `allow` \| `deny`     |
| `agent_lifecycle`  | `(agent_id, trace_id)`                  | `lifecycle_state`     |

Reference implementation: OpenSentience OS-006.

### 9.5 `time` substrate (optional)

| Operation         | Inputs                      | Outputs                 |
|-------------------|-----------------------------|-------------------------|
| `at_timescale`    | `(timescale, trace_id)`     | `timescale_state`       |
| `forecast`        | `(stream, horizon, trace_id)`| `Forecast`             |

Reference implementation: TickTickClock.

---

## 10. Cross-Loop Connections

Connections are CloudEvents-compatible envelopes carrying canonical tokens
between loops.

### 10.1 Envelope Format

```jsonc
{
  "specversion": "1.0",
  "type":        "org.opensentience.pulse.OutcomeSignal",
  "source":      "loop:graphonomous.continual_learning/phase:learn_outcome",
  "subject":     "trace_id:abc123",
  "id":          "evt_xyz789",
  "time":        "2026-04-10T12:00:00Z",
  "datacontenttype": "application/json",
  "data": {
    "token": "OutcomeSignal",
    "version": "0.1",
    /* token payload from §6 */
  }
}
```

### 10.2 Delivery Semantics

| Mode               | Guarantee                      | Use Case                      |
|--------------------|--------------------------------|-------------------------------|
| `at_least_once`    | No loss, possible duplicates   | Default. Idempotency required.|
| `at_most_once`     | No duplicates, possible loss   | Telemetry only.               |
| `exactly_once`     | No loss, no duplicates         | Financial / compliance.       |

`exactly_once` requires both endpoints to support deduplication via
`signature`.

### 10.3 Backpressure

Connections **may** declare a `max_inflight` and `overflow_policy`
(`block`, `drop_oldest`, `drop_newest`, `escalate`). Runtimes are
responsible for enforcement.

---

## 11. Nesting

### 11.1 Declaration

```jsonc
"nesting": {
  "parent_loop": "prism.benchmark",
  "inner_loops": [
    {
      "loop_id": "graphonomous.deliberate",
      "trigger": "phase:route_topology when kappa > 0",
      "wait":    "until_stable"
    }
  ]
}
```

### 11.2 Wait Modes

| Mode          | Semantics                                                       |
|---------------|-----------------------------------------------------------------|
| `until_stable`| Outer phase blocks until inner loop emits a stability signal.   |
| `until_done`  | Outer phase blocks until inner loop completes one iteration.    |
| `fire_forget` | Outer phase continues immediately; inner runs asynchronously.   |
| `bounded`     | Outer phase waits up to `timeout_ms` then continues regardless. |

### 11.3 Stability Signal

A loop reports stability via a `ConsolidationEvent` with
`convergence_status: "stable"`. Outer loops with `wait: "until_stable"`
**must** consume this signal before proceeding.

### 11.4 Unbounded Depth

There is no maximum nesting depth. The reference runtime supports at
least 8 levels. Real-world workloads have so far required 3 (PRISM →
Graphonomous → Deliberation) with OS-008 expected to add a 4th.

---

## 12. Conformance Test Suite

A runtime claims PULSE v0.1 conformance only if it passes all 12
conformance tests. The full test suite ships at
`pulse/conformance/v0.1/`.

| #  | Test Name                          | What It Verifies                                       |
|----|------------------------------------|--------------------------------------------------------|
| 1  | `phase_atomicity_under_concurrency`| Two concurrent invocations of the same phase do not interleave outputs. |
| 2  | `feedback_path_cannot_be_skipped`  | A `learn` phase that has no preceding `act` is rejected. |
| 3  | `nesting_wait_until_stable`        | Outer loop blocks until inner loop emits stability.    |
| 4  | `kappa_routes_to_deliberate`       | A retrieve returning `max_kappa > 0` forces `route → deliberate`. |
| 5  | `quorum_before_commit`             | Outer `act` does not commit before inner `DeliberationResult.confidence >= 0.66`. |
| 6  | `audit_event_per_phase`            | Every phase transition produces exactly one audit event. |
| 7  | `idempotent_retry_identical`       | Re-running an idempotent phase with the same signature returns identical output. |
| 8  | `cross_loop_signal_delivery`       | A signal emitted by phase A reaches phase B within declared cadence. |
| 9  | `substrate_unavailable_degrades`   | When a substrate is unreachable, the loop circuit-breaks rather than spinning. |
| 10 | `multi_tenant_isolation`           | Two workspaces' loops cannot read each other's substrate data. |
| 11 | `trace_id_propagates_to_substrates`| `trace_id` set on a phase appears in every substrate audit event for that iteration. |
| 12 | `manifest_validates_against_schema`| The loop manifest validates against `pulse-loop-manifest.v0.1.json`. |

A passing implementation publishes a conformance report including
`pulse_version`, `runtime_name`, `test_results`, and a signed attestation.

---

## 13. PRISM Integration

PRISM (OS-009) is the canonical observer of PULSE-conforming loops. PRISM's
`compose` phase reads PULSE manifests directly to:

1. Discover the loop's phases and their signatures
2. Inject test scenarios at the loop's `retrieve` boundary
3. Observe outcomes via the loop's `learn` phase or audit substrate
4. Compute loop closure rate from `causal_parent_ids` chains
5. Calibrate IRT difficulty from manifest-declared cadence and complexity
6. Evolve scenarios using gap analysis on the loop's behavior

A PULSE-conforming loop is therefore **automatically PRISM-evaluable**
without writing PRISM-specific test code. This is the primary reason
PULSE and PRISM are sibling protocols rather than nested.

### 13.1 BYOR + BYOL

PRISM's BYOR ("Bring Your Own Repo") becomes BYOL ("Bring Your Own Loop")
when applied to PULSE manifests. A customer publishes a manifest plus a
substrate adapter; PRISM evaluates the loop without further integration.

---

## 14. MCP Integration

A conforming PULSE loop **may** expose itself as an MCP server where each
phase is a tool. The recommended naming convention is:

```
pulse_<loop_id>_<phase_id>
```

For example, the Graphonomous loop's `retrieve_ctx` phase becomes the MCP
tool `pulse_graphonomous_continual_learning_retrieve_ctx`.

A simpler grouping reuses the canonical kinds as MCP machines (matching
Graphonomous v0.4 and PRISM v3.0):

```
mcp_tool: retrieve  → action: <phase_id>
mcp_tool: route     → action: <phase_id>
mcp_tool: act       → action: <phase_id>
mcp_tool: learn     → action: <phase_id>
mcp_tool: consolidate → action: <phase_id>
```

Both styles are conformant. The grouping style is recommended for
language-model agent consumption (PRISM, Claude Code, Cursor, Codex)
because it preserves the 5-machine surface that today's reference
runtimes use.

---

## 15. Worked Examples

Three canonical loop manifests ship alongside this specification.
They are reproduced in §15.1–15.3 for clarity.

### 15.1 Graphonomous Continual Learning Loop

See §4 for the full manifest. Key properties:

- 5 phases (canonical kinds)
- Cadence: `event` (agent query) with `idle` fallback for consolidation
- Inner loop: `graphonomous.deliberate` triggered when `kappa > 0`
- All 7 invariants enabled
- Emits `OutcomeSignal` to `prism.benchmark`

### 15.2 PRISM Benchmark Loop (5 custom phases)

```jsonc
{
  "$schema": "https://opensentience.org/schemas/pulse-loop-manifest.v0.1.json",
  "pulse_protocol_version": "0.1",
  "loop_id": "prism.benchmark",
  "loop_name": "PRISM Benchmark Cycle",
  "version": "3.0.0",
  "owner": "opensentience.org",
  "workspace_scope": "optional",

  "phases": [
    { "id": "compose",   "kind": "custom", "custom_kind": "compose",
      "description": "Build scenarios from git anchors and CL gap analysis.",
      "outputs": { "to": "phase:interact", "schema": "ScenarioBatch" } },
    { "id": "interact",  "kind": "custom", "custom_kind": "interact",
      "description": "Run scenarios against registered systems via MCP.",
      "inputs": { "from": "phase:compose", "schema": "ScenarioBatch" },
      "outputs": { "to": "phase:observe", "schema": "Transcript[]" } },
    { "id": "observe",   "kind": "custom", "custom_kind": "observe",
      "description": "3-layer judging: transcripts → dimension judges → meta-judges.",
      "inputs": { "from": "phase:interact", "schema": "Transcript[]" },
      "outputs": { "to": "phase:reflect", "schema": "Judgment[]" } },
    { "id": "reflect",   "kind": "custom", "custom_kind": "reflect",
      "description": "Gap analysis, IRT recalibration, scenario evolution.",
      "inputs": { "from": "phase:observe", "schema": "Judgment[]" },
      "outputs": { "to": "phase:diagnose", "schema": "GapAnalysis" } },
    { "id": "diagnose",  "kind": "custom", "custom_kind": "diagnose",
      "description": "Failure pattern detection, fix suggestions, leaderboard updates.",
      "inputs": { "from": "phase:reflect", "schema": "GapAnalysis" },
      "outputs": { "to": "external", "schema": "DiagnosticReport" } }
  ],

  "closure": {
    "from_phase": "diagnose",
    "to_phase":   "compose",
    "via":        "substrate:memory",
    "guarantee":  "next_tick"
  },

  "cadence": {
    "type":   "periodic",
    "params": { "interval": "weekly" },
    "fallback": { "type": "manual", "params": { "interface": "mcp:prism_benchmark" } }
  },

  "nesting": {
    "parent_loop": null,
    "inner_loops": [
      {
        "loop_id": "graphonomous.continual_learning",
        "trigger": "phase:interact when registered_system == 'graphonomous'",
        "wait":    "until_stable"
      }
    ]
  },

  "substrates": {
    "memory":    "graphonomous://prism/scenarios",
    "policy":    "delegatic://opensentience/prism",
    "audit":     "delegatic://opensentience/prism/audit",
    "auth":      "open_sentience://opensentience/prism",
    "transport": "mcp",
    "time":      null
  },

  "invariants": {
    "phase_atomicity":       true,
    "feedback_immutability": true,
    "append_only_audit":     true,
    "kappa_routing":         false,
    "quorum_before_commit":  false,
    "outcome_grounding":     true,
    "trace_id_propagation":  true
  }
}
```

### 15.3 AgenTroMatic 7-Phase Deliberation Loop

```jsonc
{
  "$schema": "https://opensentience.org/schemas/pulse-loop-manifest.v0.1.json",
  "pulse_protocol_version": "0.1",
  "loop_id": "agentromatic.deliberation",
  "loop_name": "AgenTroMatic Deliberation Loop",
  "version": "0.2.0",
  "owner": "agentromatic.com",
  "workspace_scope": "required",

  "phases": [
    { "id": "bid",         "kind": "custom", "custom_kind": "bid",
      "description": "Capability-based bidding from agent registry." },
    { "id": "overlap",     "kind": "custom", "custom_kind": "overlap",
      "description": "Detect overlapping bids that require deliberation." },
    { "id": "negotiate",   "kind": "custom", "custom_kind": "negotiate",
      "description": "Structured argumentation across overlapping bidders." },
    { "id": "elect",       "kind": "custom", "custom_kind": "elect",
      "description": "Ra (Raft) consensus to elect a leader.",
      "invariant": "quorum_before_commit" },
    { "id": "execute",     "kind": "act",
      "description": "Elected leader executes the task under quorum validation.",
      "policy_check": "delegatic.check_policy" },
    { "id": "commit",      "kind": "act",
      "description": "Commit the outcome envelope to the shared graph.",
      "audit_event": "task.committed" },
    { "id": "learn_rep",   "kind": "learn",
      "description": "Update reputation across participants from outcome.",
      "outputs": { "to": "signal:ReputationUpdate", "schema": "ReputationUpdate" } }
  ],

  "closure": {
    "from_phase": "learn_rep",
    "to_phase":   "bid",
    "via":        "substrate:memory",
    "guarantee":  "eventual"
  },

  "cadence": {
    "type":   "event",
    "params": { "trigger": "task_arrival" }
  },

  "nesting": {
    "parent_loop": null,
    "inner_loops": []
  },

  "substrates": {
    "memory":    "graphonomous://workspace/{ws_id}",
    "policy":    "delegatic://workspace/{ws_id}",
    "audit":     "delegatic://workspace/{ws_id}/audit",
    "auth":      "open_sentience://workspace/{ws_id}",
    "transport": "a2a",
    "time":      null
  },

  "invariants": {
    "phase_atomicity":       true,
    "feedback_immutability": true,
    "append_only_audit":     true,
    "kappa_routing":         false,
    "quorum_before_commit":  true,
    "outcome_grounding":     true,
    "trace_id_propagation":  true
  },

  "connections": [
    {
      "id": "rep_to_fleetprompt",
      "emit_phase":     "learn_rep",
      "envelope":       "cloudevents.v1",
      "token":          "ReputationUpdate",
      "to_loop":        "fleetprompt.trust",
      "to_phase":       "trust_recompute",
      "cadence":        "async",
      "delivery":       "at_least_once"
    }
  ]
}
```

The 7-phase AgenTroMatic loop demonstrates that **phase counts above 5 are
first-class**. Three phases use `custom_kind` (bid, overlap, negotiate);
two use `act`; one uses `learn`. The protocol composes them without
forcing a Procrustean reshape.

---

## 16. Versioning Policy

PULSE follows semantic versioning with **explicit stability guarantees**:

- **MAJOR** (1.0, 2.0): Breaking changes to manifest schema, invariant
  semantics, or canonical token shapes. Minimum 12 months notice.
- **MINOR** (0.1, 0.2): Additive changes — new optional fields, new
  cadence types, new invariants opt-in by default. Backward compatible.
- **PATCH** (0.1.0 → 0.1.1): Clarifications, conformance test
  improvements, no schema changes.

Manifests **must** declare `pulse_protocol_version`. Runtimes **must**
reject manifests declaring a higher minor version than the runtime
supports, but **must** accept lower minor versions.

### 16.1 Stability Commitments for v0.1

The following are stable in v0.1 and will not change before v1.0:

- The 5 canonical phase kinds
- The 6 cadence types
- The 5 canonical tokens
- The 7 invariants
- The substrate slot names (`memory`, `policy`, `audit`, `auth`, `transport`, `time`)

The following may change before v1.0 based on conformance feedback:

- Specific field names within the manifest (will be additive only)
- The CloudEvents envelope shape (will track CNCF spec)
- The conformance test suite (will only become stricter)

---

## 17. Implementation Roadmap

### v0.1 (this spec)
- JSON Schema published at `opensentience.org/schemas/pulse-loop-manifest.v0.1.json`
- Reference manifests for Graphonomous, PRISM, AgenTroMatic
- Conformance test suite skeleton
- PRISM compose phase reads PULSE manifests

### v0.2 (next minor)
- Reference manifests for all 11+ portfolio loops
- Reference Elixir runtime in `pulse_runtime` hex package
- Delegatic policy substrate adapter
- OpenSentience OS-006 auth substrate adapter
- TickTickClock time substrate adapter

### v0.3
- Conformance certification harness
- Cross-language conformance reports (Elixir, Rust, TypeScript, Python)
- Loop visualization tool (renders manifests as topology diagrams)
- BYOL ("Bring Your Own Loop") in PRISM

### v1.0
- Stability lock on all v0.1 commitments
- Production conformance for all [&] portfolio products
- IETF or W3C submission for community standardization

---

## 18. Limitations

PULSE v0.1 explicitly does **not** address:

1. **Distributed consensus across loops** — handled by Deliberatic / AgenTroMatic, not PULSE
2. **Loop migration mid-iteration** — Temporal-style live workflow updates are out of scope
3. **Encrypted phase payloads** — TLS at the transport layer is assumed
4. **Loop discovery / registry** — handled by FleetPrompt or organization-specific catalogs
5. **Cost accounting** — substrates emit cost events, but PULSE does not aggregate them
6. **GUI manifest authoring** — text/JSON is the source of truth in v0.1

These may be addressed in future versions if conformance feedback shows
recurring need.

---

## 19. Glossary

| Term                  | Definition                                                                 |
|-----------------------|----------------------------------------------------------------------------|
| Loop                  | A named, cyclic process composed of ordered phases that close on themselves. |
| Phase                 | An atomic, idempotent step inside a loop, with a `kind` and a signature. |
| Cadence               | The trigger that initiates a new iteration of a loop.                      |
| Substrate             | A referenced infrastructure layer (memory, policy, audit, auth, transport, time). |
| Connection            | A typed signal envelope carrying a canonical token from one loop to another. |
| Closure               | The path by which a loop's late-stage phase signals back to its early-stage phase. |
| Token                 | A canonical, versioned data shape used in cross-loop signaling.            |
| Invariant             | A property the runtime must enforce for the loop to be conforming.         |
| Trace ID              | A unique identifier propagated through every phase and substrate call.     |
| Manifest              | The JSON/YAML document that declares a single loop.                        |
| Conformance           | The state of passing the v0.1 conformance test suite.                      |
| BYOL                  | "Bring Your Own Loop" — PRISM's evaluation of any conforming loop.         |
| κ (kappa)             | Topology entanglement measure from OS-002; > 0 forces deliberate routing. |

---

## 20. Appendix A: Why "PULSE"

The acronym is **Protocol for Uniform Loop State Exchange**, but the
metaphor matters more than the expansion:

- A pulse is a heartbeat. Every closed loop has a rhythm.
- Pulses are propagated through a circulatory system. Every [&] product
  shares the same memory, policy, and audit substrates.
- A pulse is observable from outside (PRISM watches the heartbeat to
  diagnose health) without intruding on the heart itself (the loop
  runs autonomously).
- A pulse can be measured (rate, variability, regularity) — exactly the
  metrics PRISM cares about.

The natural-phenomenon metaphor mirrors PRISM (optics) and matches the
"intelligence is structured accumulation" thesis: structured accumulation
*requires* rhythm, and rhythm *requires* a protocol.

---

## 21. Appendix B: The Three-Protocol Stack

```
┌──────────────────────────────────────────────────────────┐
│  PRISM    — measures loops over time      (diagnostic)   │ OS-009
├──────────────────────────────────────────────────────────┤
│  PULSE    — declares loops + circulation   (temporal)    │ OS-010
├──────────────────────────────────────────────────────────┤
│  [&]      — composes capabilities          (structural)  │ AmpersandBoxDesign
└──────────────────────────────────────────────────────────┘
```

[&] is the capability algebra: what each agent can do.
PULSE is the temporal algebra: how those capabilities cycle over time.
PRISM is the diagnostic algebra: how well the cycles actually work.

Together they form a complete substrate for accountable, evolvable,
benchmarkable agent systems.

---

**End of OS-010 PULSE Specification v0.1**
