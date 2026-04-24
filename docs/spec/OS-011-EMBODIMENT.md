# OS-011 — Embodiment Protocol

**OpenSentience Specification OS-011 v0.1**

**Date:** April 21, 2026
**Status:** Draft (closes the perception-action gap in OS-001 through OS-010)
**Author:** [&] Ampersand Box Design
**License:** Apache 2.0
**Stack:** language-agnostic protocol; reference implementations in Elixir (Graphonomous) and TypeScript (agent-browser wrapper)
**Canonical URL:** `embodiment.opensentience.org`
**Implements:** `&body.*` (new sensorimotor primitive in [&] Protocol draft v0.1.0)
**Depends on:** OS-001 (Continual Learning), OS-004 (Attention), OS-006 (Agent Governance), OS-008 (Harness), OS-010 (PULSE)

> "[&] composes agents. PRISM measures them. PULSE gives them a heartbeat. OS-011 gives them a body."

---

## Table of Contents

0. [One-Paragraph Summary](#0-one-paragraph-summary)
1. [Why Embodiment Now](#1-why-embodiment-now)
2. [Related Work](#2-related-work)
3. [Core Concepts](#3-core-concepts)
4. [The InteractionTrace Schema](#4-the-interactiontrace-schema)
5. [Embodiment Loop Semantics (Normative)](#5-embodiment-loop-semantics-normative)
6. [Canonical Output Contracts](#6-canonical-output-contracts)
7. [The Five Invariants](#7-the-five-invariants)
8. [Forward Models and Surprise](#8-forward-models-and-surprise)
9. [Conformance Test Suite](#9-conformance-test-suite)
10. [Integration Points](#10-integration-points)
11. [MCP Integration](#11-mcp-integration)
12. [PULSE Manifest](#12-pulse-manifest)
13. [Worked Examples](#13-worked-examples)
14. [Appendix A: Neuroscience Grounding](#14-appendix-a-neuroscience-grounding)
15. [Appendix B: Reference Implementation Plan](#15-appendix-b-reference-implementation-plan)

---

## 0. One-Paragraph Summary

OS-011 is the behavioral protocol for embodied agents in the OpenSentience stack. It defines how an agent's `&body.*` provider perceives its environment, enumerates currently-available typed actions (affordances), commits typed actions, encodes state deterministically, and records the result as an `InteractionTrace` — a canonical schema that `&memory.episodic` consumes for continual learning and FleetPrompt consumes for cross-machine skill transfer. OS-011 also defines the `SurpriseSignal` PULSE token, which agents emit when actual observations diverge from their forward-model predictions. Together, these close the perception-action gap in the first ten OpenSentience protocols and give the [&] stack a principled answer to the computer-use category (OpenClaw, Claude Computer Use, Pi.dev-based agents).

---

## 1. Why Embodiment Now

### 1.1 The Founding Insight

OS-001 through OS-010 formalize what an agent *thinks* — how it remembers (OS-001), routes topology (OS-002), deliberates (OS-003), attends (OS-004), adapts compute tier (OS-005), is governed (OS-006), resists attacks (OS-007), is harnessed (OS-008), is benchmarked (OS-009), and is orchestrated (OS-010). They say almost nothing about how an agent *acts* on an environment — how it perceives state, which typed actions are currently available, how actions are committed, and how outcomes are encoded for learning.

In the original formulation, action was implicit:

- An agent might call MCP tools. The tools are the action surface, but untyped at the [&] layer.
- `&reason.plan` produces abstract plans. The plans are text; execution is left to the caller.
- `&memory.episodic.replay` reconstructs past traces. But without a typed schema for what a "trace step" *is*, replay is prose.

The absence was a modeling hole, not a design choice. OS-011 fills it.

### 1.2 The Category the Stack Must Compete In

The most consequential emerging agent category is the *computer-use agent* — systems that drive real browsers and real operating systems with something close to human-level generality:

- **OpenClaw** (Peter Steinberger, 2026): local, open-source, "smart model with eyes and hands at a desk." Shipping. Multi-machine deployments.
- **Claude Computer Use** (Anthropic): coordinate-based OS interaction; stateless per session.
- **Pi.dev** (2026): minimalist TypeScript harness; "primitives, not features"; OpenClaw is built on it.
- **OpenAI Operator, Adept, Letta** (various): coordinated browser / OS agents with differing memory and governance stories.

None of them have a typed capability contract for embodiment. Each reinvents:
- "What does the agent see right now?"
- "What actions are currently available?"
- "Did the action succeed?"
- "Can this trace replay on another machine?"

OS-011 provides the typed contract. `&body.*` becomes the composition-layer primitive; OS-011 becomes the behavioral loop; PULSE's new `SurpriseSignal` becomes the learning signal; FleetPrompt's skill marketplace becomes the distribution layer; PRISM measures the result.

### 1.3 Why Not Extend `&reason` or `&space`?

`&reason` is about decision logic, not action execution. A plan produced by `&reason.plan` describes *what to do*; `&body.*` describes *doing it*, with affordance-bounded action spaces, state encoding, and replay semantics. Smearing embodiment into `&reason` would conflate two distinct responsibilities.

`&space` is about external spatial data (fleet positions, regions, routes), not the agent's own sensorimotor interface. GeoFleetic treats agents as abstract entities that reason over fleet data; they do not have their own sensors or motors in `&space`. Promoting `&body` to a peer primitive keeps `&space`'s abstraction clean while giving sensorimotor concerns a first-class home.

### 1.4 The Dark-Factory Vision

The strategic motivation for OS-011 is the dark-factory thesis: networks of machine-hosted agents that continually learn, share crystallized skills, and operate autonomously under measurable governance. Without OS-011, the loop is open at two points:

- **No standard trace format** → skills cannot be shared across machines without bespoke integration
- **No forward-model signal** → learning collapses to binary success/failure

With OS-011, the loop closes:

```
Machine A: perceive → affordances → plan → act → InteractionTrace → SurpriseSignal → learn
                                                            ↓
                                                    consolidation
                                                            ↓
                                              SkillCandidate (FleetPrompt)
                                                            ↓
Machine B: install → body.replay(trace) → re-authorize destructive actions → measure via PRISM
```

---

## 2. Related Work

| System / Standard | Relationship to OS-011 |
|---|---|
| **OS-001 (Continual Learning)** | OS-011's `InteractionTrace` is a canonical payload for `&memory.episodic`. Graphonomous's novelty detection is the consumer of `SurpriseSignal`. |
| **OS-004 (Attention)** | Affordance enumeration feeds the attention engine's triage — the agent cannot attend to actions outside its affordance set. |
| **OS-006 (Governance)** | Delegatic policies filter affordances at enumeration time (policy-filtered affordance sets are normative). Destructive actions require re-authorization at replay. |
| **OS-007 (Adversarial Robustness)** | Body actions are the largest blast-radius attack surface. OS-011's hard constraints are the protocol defense boundary against embodied-agent exploits. |
| **OS-008 (Harness)** | The harness enforces that actions are bounded by affordances, that `perceive` precedes `act`, and that learning events receive typed outcomes. |
| **OS-010 (PULSE)** | OS-011 introduces `SurpriseSignal` as a sixth canonical token (schema bump to v0.1.1). |
| **OS-009 (PRISM)** | Embodiment fidelity becomes a benchmarkable dimension. Cross-machine replay success rate is a first-class metric. |
| **OpenClaw** | Reference implementation target. A conforming OpenClaw installation implements `&body.os` + `&body.browser` and emits OS-011 `InteractionTrace` records. |
| **Claude Computer Use** | Satisfies `&body.os` via coordinate-based `act`. Existing implementation; OS-011 adapter wraps it. |
| **agent-browser** | Canonical `&body.browser` provider. Snapshot-and-ref model maps directly to `perceive` + `encode_state`. |
| **Pi.dev** | Extension-based harness; OS-011 reference extension provides `&body.os` + `&body.browser` implementations. |
| **Gibson (1977), Gibson (1979)** | Affordances as first-class environmental properties — not agent-computed, but environment-provided. |
| **Smith & Gasser (2005)** | Six lessons from babies: embodiment as ground for abstract cognition. |
| **ACT-R/E (Trafton et al., 2013)** | Cognitive architecture with embodied spatial module distinct from visual/spatial module — precedent for `&body` peer to `&space`. |
| **Vicente & Rasmussen (1992)** | Ecological interface design: affordance enumeration is the cognitive-engineering move that makes action spaces agent-legible. |
| **Miller (2006)** — capability security | Policy-filtered affordance sets are capability-ring boundaries. |

---

## 3. Core Concepts

### 3.1 Body

An agent's **body** is its typed sensorimotor interface to an environment. In OS-011, a body is an implementation of `&body.*` that provides five standard operations: `perceive`, `act`, `affordances`, `encode_state`, `replay`. Canonical subtypes:

- `&body.browser` — browser DOM (reference provider: agent-browser)
- `&body.os` — operating system (reference providers: OpenClaw, Claude Computer Use, Pi.dev extensions)
- `&body.vision` — visual perception (future)
- `&body.voice` — audio I/O (future)
- `&body.motor` — physical actuation / robotics (future)

An agent MAY declare multiple body subtypes. An agent MAY declare zero body subtypes (purely-cognitive agents that consume other agents' traces but do not act themselves).

### 3.2 EnvironmentObservation

A structured capture of environment state produced by `perceive`. Observations are typed by body subtype (a browser observation is not interchangeable with an OS observation) but share common fields:

```jsonc
{
  "body_subtype": "browser",             // or "os", "vision", "voice", "motor"
  "state_hash": "sha256:...",            // result of encode_state over this observation
  "observed_at": "2026-04-21T14:22:05Z",
  "payload": { /* subtype-specific */ },
  "refs": { /* subtype-specific; e.g. @e1→{role,name,...} for browser */ }
}
```

### 3.3 TypedAction

A closed-set typed description of an action to commit. The action-type enumeration is fixed per body subtype for v0.1:

- `&body.browser` actions: `click, dblclick, hover, focus, fill, type, press, check, uncheck, select, upload, scroll, scrollintoview, drag, navigate, wait, screenshot`
- `&body.os` actions: `shell_exec, file_read, file_write, file_edit, file_delete, keyboard_input, mouse_click, mouse_drag, screen_capture, process_spawn, process_signal`

A TypedAction carries a `target` (ref, selector, path, or coordinate depending on subtype), a `params` object, and optional `preconditions` (affordance requirements that must hold). Providers MUST reject actions whose preconditions do not match current affordances.

### 3.4 StateHash

A deterministic hash identifying an observation's state. Canonical encoding: `sha256(canonical_json(stable_fields))`. Stable fields are subtype-specific; volatile fields (timestamps, pids, latency) are excluded by design.

Two agents observing the same environment state MUST produce equal hashes. This is what makes cross-machine replay tractable.

### 3.5 Affordance

A currently-available typed action. An `AffordanceSet` is the set of all TypedActions that the environment currently affords, filtered by governance policy. A button that's disabled has no `click` affordance. A file the agent can't write has no `file_write` affordance (enforced by provider, not by failing later at act-time).

Affordance enumeration is **Gibson-faithful**: the environment (plus governance policy) determines what's available; the agent discovers it, does not compute it heuristically.

### 3.6 InteractionTrace

A canonical record of a perception-action cycle. See Section 4 for the full schema. A trace is a sequence of `TraceEdge` records, each representing one `act` call with before/after state hashes, typed action, outcome, latency, and provenance. Traces are the unit of `&memory.episodic.store`, the payload of `SkillCandidate`, and the input to `&body.*.replay`.

### 3.7 SurpriseSignal

A PULSE canonical token emitted when an observation diverges from a forward-model prediction. Added to PULSE v0.1.1 as the sixth canonical token. Consumed by `&memory.episodic` novelty detection and by PRISM for forward-model-calibration scoring. See Section 8.

### 3.8 FSM (Finite State Machine)

The set of `{StateHash, TypedAction, StateHash}` triples over all recorded traces constitutes an implicit FSM. States are unique `StateHash` values; transitions are `TypedAction` labels on edges. OS-011 does not require agents to materialize this FSM explicitly, but it underpins replay determinism and affordance prediction.

### 3.9 Environment

The world the body perceives and acts upon. For `&body.browser`, the environment is a browser session. For `&body.os`, the environment is an operating system instance. OS-011 is environment-agnostic — the same protocol works for web, OS, voice, vision, and future embodiments.

---

## 4. The InteractionTrace Schema

`InteractionTrace` is the canonical record that every `&body.*` provider produces and that every consumer (`&memory.episodic`, FleetPrompt, PRISM) expects.

### 4.1 Top-Level Structure

```jsonc
{
  "trace_id": "01HX3QW...",                     // ULID or UUID
  "body_subtype": "browser",                    // which &body.* subtype
  "provider": "agent-browser",                  // provider identifier
  "agent_id": "WebOperator@workspace_42",       // from &govern.identity
  "started_at": "2026-04-21T14:22:00Z",
  "ended_at": "2026-04-21T14:22:45Z",
  "environment": {
    "os_family": "linux",                       // optional for browser; required for OS
    "browser_family": "chromium",               // optional
    "viewport": "1440x900",                     // optional
    "initial_url": "https://..."                // subtype-specific
  },
  "edges": [ /* TraceEdge[]; see 4.2 */ ],
  "goal": "Submit weekly expense report",       // optional free-text; human-readable
  "outcome": "success",                         // success | partial | failure | aborted
  "metadata": { /* provider-specific */ }
}
```

### 4.2 TraceEdge

Each edge records one `act` invocation:

```jsonc
{
  "edge_id": 1,
  "state_before": "sha256:abc...",
  "typed_action": {
    "type": "click",
    "target": "@e5",                    // subtype-specific ref/path/coordinate
    "semantic_locator": {               // optional but recommended
      "role": "button",
      "name": "Submit"
    },
    "params": {},
    "preconditions": ["click@@e5"]      // affordance IDs that must hold
  },
  "state_after": "sha256:def...",
  "latency_ms": 243,
  "outcome_status": "success",          // success | partial | failure | blocked | timeout
  "observed_outcome": {                 // optional; evidence for learning
    "mutation_summary": "form submitted",
    "http_requests_emitted": ["POST /api/..."],
    "dom_changes": "..."
  },
  "authorization": null,                // required for destructive OS actions
  "provenance": {
    "timestamp": "2026-04-21T14:22:05.243Z",
    "capability": "&body.browser",
    "operation": "act"
  }
}
```

### 4.3 Required vs. Optional Fields

**Required** on every TraceEdge:
- `edge_id` (monotonic within a trace)
- `state_before`, `state_after` (StateHashes)
- `typed_action` (type + target at minimum)
- `latency_ms`
- `outcome_status`
- `provenance` (timestamp, capability, operation)

**Required** for destructive `&body.os` actions:
- `authorization` block (Section 4.4)

**Recommended**:
- `semantic_locator` for browser actions (robustness across replay)
- `observed_outcome` (learning evidence)
- `preconditions` (enables replay's fail-fast behavior)

### 4.4 Authorization Block (destructive actions only)

```jsonc
{
  "authorization": {
    "policy_id": "delegatic://workspace_42/deploy-policy",
    "approved_by": "supervisor@workspace_42",
    "approved_at": "2026-04-21T14:22:00Z",
    "expires_at": "2026-04-21T14:32:00Z",
    "authorization_token": "sha256:..."  // opaque, verifiable by &govern.identity
  }
}
```

Authorization does NOT carry across replay. Replays of destructive actions MUST re-authorize at replay time; presence of a prior authorization is audit evidence, not replay permission.

### 4.5 Canonical JSON Encoding

For hashing purposes, TraceEdges and InteractionTraces use canonical JSON (RFC 8785 JSON Canonicalization Scheme): keys sorted lexicographically, no insignificant whitespace, numbers in shortest form. This ensures `StateHash` determinism across implementations.

---

## 5. Embodiment Loop Semantics (Normative)

This section is normative. A conforming OS-011 implementation MUST honor all requirements herein.

### 5.1 Perceive-Before-Act

A provider MUST NOT execute an `act` call whose `typed_action.target` references a ref from a stale perception. Refs become stale on any environment mutation. Conforming providers detect staleness by tracking ref issuance per `perceive` call and rejecting acts targeting refs from an older call.

The minimum-trust pattern:

```
obs = perceive()
act_result = act(obs.refs["@e5"], {...})    # uses fresh ref
```

Never:

```
obs_1 = perceive()
# ... time passes, navigation, re-render ...
act_result = act(obs_1.refs["@e5"], {...})  # stale — MUST be rejected
```

### 5.2 Affordance-Bounded Action Spaces

A provider MUST reject an `act` call whose `typed_action` is not in the current `AffordanceSet`. Affordances are policy-filtered before enumeration; an action that's not in the set either cannot be performed (environmental) or is not authorized (governance). The two failure modes are distinguished by the `outcome_status` returned:

- `blocked` — governance policy denies the action
- `failure` — environment did not permit the action

Unauthorized attempts MUST emit an escalation via `&govern.escalation.raise` with the attempted action and denial reason.

### 5.3 Deterministic State Encoding

Given two observations of the same environment state, a provider MUST produce equal `state_hash` values. State encoding:

- Uses canonical JSON (RFC 8785)
- Includes only stable fields (defined per subtype; Section 6)
- Excludes volatile fields (timestamps, pids, latencies, cursor position, focus blink)
- Is SHA-256 by default; providers MAY use stronger hashes but MUST prefix (`sha256:` / `sha3_256:` / etc.)

Providers SHOULD document their stable-field set in the contract metadata so consumers can reason about cross-provider state equivalence.

### 5.4 Replay Fail-Fast

A `replay(trace)` call MUST fail-fast if:

1. Current `encode_state()` does not match `trace.edges[0].state_before`
2. After executing edge N, `encode_state()` does not match `trace.edges[N].state_after`
3. Any edge's `typed_action` is not currently afforded
4. Any destructive edge's re-authorization fails

Failure reasons MUST be reported in structured form:

```jsonc
{
  "replay_result": {
    "status": "failed",
    "failed_at_edge": 3,
    "reason": "state_hash_mismatch",
    "expected_hash": "sha256:def...",
    "actual_hash": "sha256:xyz...",
    "divergence_details": "..."
  }
}
```

Partial replays (executing edges 0..N successfully, failing at N+1) MUST report the committed prefix as a new trace so learning systems can record "this prefix worked, the rest didn't."

### 5.5 Provenance Propagation

Every `action_outcome`, `observation`, and `affordance_set` MUST carry provenance: provider, capability, operation, timestamp, agent_id. Provenance propagates into stored traces and into PULSE-emitted events. Loss of provenance is a conformance failure.

### 5.6 Atomicity

An `act` call executes exactly one typed action. Compound actions (drag-then-click, fill-then-press-enter) are decomposed into multiple edges. This enables fine-grained replay and precise surprise detection (see Section 8).

### 5.7 Idempotency and Side Effects

- `perceive`, `affordances`, `encode_state` are idempotent and side-effect-free.
- `act` has side effects (by construction) and is NOT idempotent.
- `replay` is side-effecting if it executes actions; providers SHOULD support a `dry_run` mode that computes expected outcomes without executing.

---

## 6. Canonical Output Contracts

### 6.1 Browser Observation Payload (`&body.browser.perceive`)

```jsonc
{
  "body_subtype": "browser",
  "state_hash": "sha256:...",
  "observed_at": "2026-04-21T14:22:05Z",
  "payload": {
    "url": "https://example.com/page",
    "title": "...",
    "viewport": { "width": 1440, "height": 900 },
    "a11y_tree": { /* role, name, state for each interactive node */ }
  },
  "refs": {
    "@e1": { "role": "link", "name": "Home", "path": "body>header>a[1]" },
    "@e2": { "role": "button", "name": "Submit", "enabled": true }
  }
}
```

**Stable fields for state_hash**: canonical URL, a11y-tree-structure, viewport dimensions. Excludes: scroll position, exact pixel coordinates, focus state, cursor position.

### 6.2 OS Observation Payload (`&body.os.perceive`)

```jsonc
{
  "body_subtype": "os",
  "state_hash": "sha256:...",
  "observed_at": "2026-04-21T14:22:05Z",
  "payload": {
    "cwd": "/workspace/factory_42/repo",
    "focused_window": { "title": "...", "app": "..." },
    "git": { "head": "sha256:abc...", "branch": "main", "dirty": false },
    "key_processes": ["claude-code", "bash"],
    "env_fingerprint": "sha256:..."
  }
}
```

**Stable fields for state_hash**: cwd, focused_window.title, git.head, key_processes (sorted), env_fingerprint. Excludes: timestamps, full process list, pids, memory usage, CPU load.

### 6.3 TypedAction Payload

Browser:
```jsonc
{
  "type": "click",
  "target": "@e5",
  "semantic_locator": { "role": "button", "name": "Submit" },
  "params": {},
  "preconditions": ["click@@e5"]
}
```

OS (destructive, requires authorization):
```jsonc
{
  "type": "file_write",
  "target": "/workspace/factory_42/repo/CHANGELOG.md",
  "params": { "content_sha256": "sha256:...", "mode": "append" },
  "preconditions": ["file_write@/workspace/factory_42/repo/**"]
}
```

### 6.4 AffordanceSet Payload

```jsonc
{
  "affordance_set_hash": "sha256:...",
  "observed_at": "2026-04-21T14:22:05Z",
  "body_subtype": "browser",
  "scope": null,
  "affordances": [
    {
      "affordance_id": "click@@e2",
      "action_type": "click",
      "target": "@e2",
      "target_label": "Submit",
      "policy_allowed": true
    },
    {
      "affordance_id": "fill@@e3",
      "action_type": "fill",
      "target": "@e3",
      "target_label": "Email",
      "policy_allowed": true,
      "input_type": "email"
    }
  ],
  "policy_filtered_out": 3
}
```

The `policy_filtered_out` field surfaces the count of actions that would be environmentally afforded but are governance-blocked. Surfacing the count (not the actions) keeps the agent blind to unauthorized options while making the filtering visible to auditors.

### 6.5 ActionOutcome Payload

```jsonc
{
  "outcome_status": "success",   // success | partial | failure | blocked | timeout
  "state_before": "sha256:...",
  "state_after": "sha256:...",
  "latency_ms": 243,
  "observed_outcome": { /* evidence, subtype-specific */ },
  "error": null,
  "provenance": { /* required */ }
}
```

---

## 7. The Five Invariants

A conforming OS-011 runtime MUST satisfy all five invariants at all times.

### 7.1 Perceive-Before-Act (I1)

No `act` executes without a fresh perception of the current state. Formal: for every `act` call at time t, there exists a `perceive` call at time t' < t such that no environmental mutation has occurred in (t', t). Enforcement is provider-side: stale refs MUST be rejected.

### 7.2 Affordance-Bounded Action (I2)

No `act` executes a `typed_action` not in the current `AffordanceSet`. Formal: for every `act(a)` call, a ∈ affordances(current_scope) at the moment of invocation.

### 7.3 Policy-Filtered Affordances (I3)

An `AffordanceSet` MUST reflect governance policy. Formal: for every `affordance_set` A emitted by a provider at time t with `&govern.identity` binding g, for every action a ∈ A, policy g permits a at time t.

### 7.4 Deterministic State Encoding (I4)

Equal environment states produce equal state hashes. Formal: for any two observations o1, o2 of the same environment state E, `encode_state(o1) == encode_state(o2)`.

### 7.5 Replay Fail-Fast (I5)

Replay MUST fail-fast on the first state-hash divergence, unaffordance, or authorization failure. Formal: `replay(trace)` does not execute edge N+1 if any of the termination conditions (Section 5.4) hold at edge N.

These five invariants together give the stack: verifiable perception-action coupling, policy enforcement at the body boundary, and deterministic cross-machine replay.

---

## 8. Forward Models and Surprise

### 8.1 Forward Models

An agent with a body MAY maintain a forward model: a prediction of what observation will result from a given typed action applied to the current state. Formally: `fm(state, action) → predicted_next_state`.

Forward models are OPTIONAL in OS-011 v0.1 — an agent can act without predicting. But agents that do predict gain a strictly richer learning signal: `surprise = distance(predicted_next_state, actual_next_state)`.

### 8.2 The SurpriseSignal Token (PULSE v0.1.1)

PULSE v0.1.1 adds `SurpriseSignal` as the sixth canonical token (alongside TopologyContext, DeliberationResult, OutcomeSignal, ReputationUpdate, ConsolidationEvent).

Envelope:

```jsonc
{
  "token": "SurpriseSignal",
  "version": "0.1",
  "trace_id": "01HX...",
  "edge_id": 12,
  "body_subtype": "browser",
  "action_type": "click",
  "predicted_state_hash": "sha256:...",
  "actual_state_hash": "sha256:...",
  "surprise_magnitude": 0.73,
  "surprise_kind": "unexpected_navigation",
  "evidence": {
    "predicted_url": "https://...",
    "actual_url": "https://...",
    "structural_diff": "..."
  },
  "timestamp": "2026-04-21T14:22:05Z"
}
```

`surprise_magnitude` is normalized to [0, 1]; 0 = perfect prediction, 1 = maximal divergence. Providers define the distance metric per body subtype and declare it in contract metadata.

`surprise_kind` is a controlled vocabulary indicating the category of divergence:

- `unexpected_navigation` — URL changed when not predicted
- `unexpected_unchanged` — action predicted state change; nothing happened
- `unexpected_structure` — a11y tree shape diverged
- `unexpected_error` — HTTP/shell error when success predicted
- `unexpected_permission` — permission denial when allowed expected
- `unexpected_latency` — time-to-completion diverged materially
- `other` — with `evidence.reason` description

### 8.3 SurpriseSignal Consumers

- **`&memory.episodic`** (Graphonomous): high-surprise edges stored with higher salience; drives novelty detection
- **`&reason.plan`**: revisions to prior plan candidates based on observed prediction errors
- **PRISM**: forward-model-calibration scoring; a benchmarkable CL dimension
- **FleetPrompt**: SkillCandidate confidence reduction when imported skills produce surprise on local environment
- **`&govern.telemetry`**: surprise as operational signal; sudden surprise spikes indicate environment drift

### 8.4 Dry-Run Prediction

Providers SHOULD support `act(action, dry_run=true)`. In dry-run mode, the provider applies its forward model without executing. Returns predicted `state_after`, predicted outcome, predicted latency. Used by `&reason.plan.simulate` and by replay's fail-fast prediction before destructive action.

---

## 9. Conformance Test Suite

A runtime claims OS-011 v0.1 conformance only if it passes all twelve conformance tests. The full test suite ships at `opensentience.org/conformance/os-011/v0.1/`.

| # | Test Name | What It Verifies |
|---|---|---|
| 1 | `perceive_returns_typed_observation` | `perceive` returns an `EnvironmentObservation` matching the subtype schema with all required fields. |
| 2 | `state_hash_is_deterministic` | Two perceptions of the same environment state produce equal `state_hash`. |
| 3 | `stale_ref_rejection` | An `act` call with a ref from a stale perception is rejected with a typed error (I1). |
| 4 | `unaffordable_action_rejection` | An `act` call for an action not in the current `AffordanceSet` is rejected (I2). |
| 5 | `policy_filtered_affordances` | `affordances()` does not include actions that the current `&govern.identity` binding disallows (I3). |
| 6 | `policy_filter_out_count_is_truthful` | The count of `policy_filtered_out` equals the actual number of policy-denied actions. |
| 7 | `trace_edge_complete` | Every `TraceEdge` emitted has all required fields: state_before, state_after, typed_action, latency_ms, outcome_status, provenance. |
| 8 | `destructive_action_authorization_required` | Destructive actions without an `authorization` block are rejected. |
| 9 | `replay_fails_on_state_divergence` | `replay(trace)` fails-fast when starting state_hash does not match (I5). |
| 10 | `replay_fails_on_mid_trace_divergence` | `replay(trace)` halts at the first mid-trace state_hash mismatch. |
| 11 | `replay_re_authorizes_destructive_edges` | Replay of destructive actions requires fresh authorization; prior authorization does not transfer. |
| 12 | `surprise_signal_conforms_to_pulse_v0.1.1` | Emitted `SurpriseSignal` tokens validate against the PULSE v0.1.1 schema. |

Conformance reports are signed and submitted to `opensentience.org/conformance/os-011/reports/`. The report includes: provider name, body_subtype set, OS-011 version, test results per subtype, and attestation signature.

---

## 10. Integration Points

### 10.1 Graphonomous (OS-001)

Graphonomous implements `&memory.episodic.store` / `&memory.episodic.replay` with `InteractionTrace` as the canonical payload. Procedural clusters emerge from repeated successful traces with matching state_hash prefixes. When a cluster reaches reliability threshold, it emits a `SkillCandidate` to FleetPrompt (see Section 10.4).

Novelty detection: Graphonomous consumes `SurpriseSignal` tokens, weighting high-surprise traces for higher memory salience. Contradictions with existing procedural knowledge trigger `belief_revise`.

### 10.2 Delegatic (OS-006)

Delegatic policies filter affordances at enumeration time. The flow:

```
body.affordances(scope) →
  environmental_afford(scope) →
  delegatic.filter(env_affordances, agent.identity, current_policy) →
  AffordanceSet
```

Destructive actions require `delegatic.authorize(action, agent, policy) → authorization_block`. Replay re-authorization goes through the same path.

### 10.3 OS-008 (Harness)

The harness enforces OS-011 invariants at runtime:

- **Prerequisite chain**: `act` requires a preceding `perceive` from the current state (I1)
- **Quality gate**: action preconditions must match affordances (I2)
- **Context management**: long action sequences within a sprint respect the 60% context rule
- **Audit trail**: every TraceEdge and SurpriseSignal logged

Pipeline enforcer test suite (OS-008) SHOULD include OS-011-specific tests for the above.

### 10.4 FleetPrompt

A `SkillCandidate` payload for an OS-011 skill contains:

- A representative `InteractionTrace` (the "golden" recording)
- Preconditions: initial state_hash, affordance requirements, environment requirements
- Success record: N replays, replay_success_rate, environment coverage
- Trust metadata: signed provenance, reputation score

When installed on a new machine, FleetPrompt's install engine:
1. Verifies environment compatibility (OS family, browser family, authorized domains)
2. Maps agent identity to local Delegatic policy
3. Pre-authorizes destructive actions up to policy ceiling
4. Hands off to `body.replay(trace)`

### 10.5 PRISM (OS-009)

OS-011 adds three benchmarkable dimensions to PRISM (or refines existing dimensions):

- **Embodiment fidelity**: replay success rate on held-out environments
- **Forward-model calibration**: surprise_magnitude distribution; lower is better
- **Affordance awareness**: fraction of plans whose actions are all afforded (vs. hallucinated action types)

These are weighted into the 9 CL dimensions or proposed as new sub-dimensions in PRISM v3.1.

### 10.6 [&] Protocol

OS-011 is the normative behavioral spec for the new `&body.*` primitive family introduced in [&] Protocol draft v0.1.0. The two specifications MUST remain synchronized; when OS-011 adds new body subtypes, [&] updates its subtype enumeration accordingly.

### 10.7 OpenClaw / Pi.dev / Claude Computer Use

These are adoption targets, not dependencies. A conforming OpenClaw build satisfies `&body.os` + `&body.browser` and emits OS-011 traces. A Pi.dev extension authored against OS-011 produces traces consumable by Graphonomous. Claude Computer Use, adapted through an OS-011 wrapper, becomes a conforming `&body.os` provider.

---

## 11. MCP Integration

OS-011 operations compile to MCP tools per provider. Reference tool surface for a conforming `&body.browser` MCP server:

- `body_browser_perceive(perception_query) → browser_observation`
- `body_browser_act(typed_action) → action_outcome`
- `body_browser_affordances(scope_query?) → affordance_set`
- `body_browser_encode_state() → state_hash`
- `body_browser_replay(interaction_trace) → replay_result`
- `body_browser_dry_run(typed_action) → predicted_outcome`

Reference tool surface for a conforming `&body.os` MCP server:

- `body_os_perceive(perception_query) → os_observation`
- `body_os_act(typed_action) → action_outcome`
- `body_os_affordances(scope_query?) → affordance_set`
- `body_os_encode_state() → state_hash`
- `body_os_replay(interaction_trace) → replay_result`
- `body_os_dry_run(typed_action) → predicted_outcome`

Tool names are provider-namespaced in practice (e.g., `agent_browser_perceive`, `openclaw_os_act`). The [&] capability contract abstracts over naming.

---

## 12. PULSE Manifest

Embodied agents SHOULD declare an OS-011 loop manifest alongside their OS-001 continual-learning loop. Reference manifest:

```jsonc
{
  "$schema": "https://opensentience.org/schemas/pulse-loop-manifest.v0.1.json",
  "pulse_protocol_version": "0.1.1",
  "loop_id": "os-011.embodiment",
  "version": "0.1.0",
  "owner": "opensentience.org",
  "phases": [
    {
      "id": "perceive_env",
      "kind": "retrieve",
      "inputs": ["perception_query"],
      "outputs": ["environment_observation"],
      "idempotent": true,
      "timeout_ms": 5000,
      "audit_event": "os011.perceive"
    },
    {
      "id": "enumerate_affordances",
      "kind": "route",
      "inputs": ["environment_observation"],
      "outputs": ["affordance_set"],
      "idempotent": true,
      "timeout_ms": 1000,
      "audit_event": "os011.affordances"
    },
    {
      "id": "select_action",
      "kind": "route",
      "inputs": ["affordance_set", "plan"],
      "outputs": ["typed_action"],
      "idempotent": true,
      "audit_event": "os011.select"
    },
    {
      "id": "commit_action",
      "kind": "act",
      "inputs": ["typed_action"],
      "outputs": ["action_outcome", "trace_edge"],
      "idempotent": false,
      "policy_check": "delegatic://authorize",
      "invariant": ["perceive_before_act", "affordance_bounded"],
      "audit_event": "os011.act"
    },
    {
      "id": "learn_from_outcome",
      "kind": "learn",
      "inputs": ["trace_edge", "surprise_signal"],
      "outputs": ["memory_update"],
      "audit_event": "os011.learn"
    }
  ],
  "closure": {
    "from_phase": "learn_from_outcome",
    "to_phase": "perceive_env"
  },
  "cadence": {
    "primary": "event",
    "params": { "event_source": "plan_step_emitted" }
  },
  "substrates": [
    { "substrate_type": "memory",  "implementation": "graphonomous" },
    { "substrate_type": "policy",  "implementation": "delegatic" },
    { "substrate_type": "audit",   "implementation": "opensentience" }
  ],
  "invariants": {
    "phase_atomicity": true,
    "feedback_immutability": true,
    "append_only_audit": true,
    "outcome_grounding": true,
    "trace_id_propagation": true
  },
  "connections": [
    {
      "id": "surprise_to_memory",
      "emit_phase": "commit_action",
      "emit_condition": "surprise_magnitude >= 0.3",
      "envelope": "cloudevents.v1",
      "token": "SurpriseSignal",
      "to_loop": "graphonomous.continual_learning",
      "to_phase": "learn_outcome",
      "cadence": "async",
      "delivery": "at_least_once"
    },
    {
      "id": "trace_to_prism",
      "emit_phase": "learn_from_outcome",
      "emit_condition": "outcome in ['success','failure']",
      "envelope": "cloudevents.v1",
      "token": "OutcomeSignal",
      "to_loop": "prism.benchmark",
      "to_phase": "observe",
      "cadence": "async",
      "delivery": "at_least_once"
    }
  ]
}
```

---

## 13. Worked Examples

### 13.1 Website FSM Recording

Goal: A continual-learning agent records a successful workflow (submit expense report) and ships it as a SkillCandidate.

```
1. perceive() → obs_0 (state_hash = H0)
2. affordances() → {navigate, click@@e_login, ...}
3. plan → [click@@e_login, fill@@e_email, ...]
4. act(click@@e_login) → outcome (H0 → H1)
5. perceive() → obs_1 (H1)
6. ... repeat ...
15. act(click@@e_submit) → outcome (H13 → H14)
16. Trace = {H0, [edge_1, ..., edge_14], H14, outcome=success}
17. &memory.episodic.store(Trace)
18. After N successful replays across sessions:
    consolidation → SkillCandidate(representative_trace=Trace, replay_success_rate=0.95)
19. SkillCandidate → FleetPrompt
20. Another agent installs skill → body.browser.replay(Trace)
```

Key properties:
- Determinism from state hashes
- Cross-session replay via stored trace
- Learning across sessions via `&memory.episodic`
- Marketability via SkillCandidate

### 13.2 OS Workflow (Dark Factory Deploy)

Goal: Agent learns a deploy workflow on Machine A; Machine B replays it.

```
Machine A:
1. perceive(mode=full) → obs_0 (cwd=/ws/repo, git.head=abc, H0)
2. affordances() → {shell_exec, file_edit@/ws/repo/**, ...}
3. plan → [edit CHANGELOG, git add, git commit, git push]
4. act(file_edit@/ws/repo/CHANGELOG.md) → outcome
   - authorization: policy=delegatic://ws/deploy, expires=now+10m
5. ... repeat ...
6. Trace stored.
7. SurpriseSignal emitted at step 4 (unexpected trailing whitespace) → noted in memory.

Machine B (different repo, same policy class):
1. Install SkillCandidate from FleetPrompt.
2. body.os.replay(Trace):
   - encode_state() → H0' ≠ H0 (different cwd); normalize via scope mapping
   - For each destructive edge: re-authorize via Delegatic
   - Execute edge-by-edge; verify state hashes match trace progression
   - On first divergence, fail-fast and report.
3. Outcome: replay_success_rate += 1 if clean; SurpriseSignal if divergence.
```

### 13.3 Forward-Model Prediction Failure

Goal: Agent predicts action outcome; prediction diverges; learns from surprise.

```
1. perceive() → obs_0 (page = product listing)
2. Forward model predicts: click@@e_add_to_cart → {url=cart, items+=1}
3. act(click@@e_add_to_cart)
4. encode_state() after action → matches predicted structure? NO.
   - Actual: authentication modal opened.
5. surprise_magnitude = 0.82, surprise_kind = "unexpected_structure"
6. Emit SurpriseSignal → Graphonomous updates novelty weights.
7. Plan revision: insert login step before add-to-cart.
8. Next trace includes login; forward model calibrates.
```

---

## 14. Appendix A: Neuroscience Grounding

**Why `&body` as a peer primitive to memory/reason/time/space**:

- **Motor cortex + cerebellum** (primary motor cortex M1, premotor areas, supplementary motor area, cerebellum): biological agents have dedicated neural systems for transforming perceived state + goal into typed actions. These systems are anatomically distinct from hippocampal memory circuits, prefrontal deliberation circuits, suprachiasmatic timing circuits, and parietal spatial circuits. The [&] cognitive taxonomy, by analogy, should have a distinct primitive for this function.

- **Proprioception** (muscle spindles, Golgi tendon organs, joint receptors): the body's sense of its own configuration. The protocol's `encode_state` operation is the computational analog — the body knows its own state with deterministic precision.

- **Affordance perception** (Gibson 1977, 1979): "affordances are what the environment offers the animal." Not computed by the agent, but perceived from the environment-agent relationship. OS-011's `affordances` operation makes this explicit: the environment + governance policy determine what's available, the agent discovers it.

- **Forward models in motor control** (Wolpert, Miall, Kawato 1998): the cerebellum maintains internal forward models that predict sensory consequences of motor commands. The discrepancy between predicted and actual sensation drives learning. OS-011's `SurpriseSignal` is this exact mechanism at the protocol layer.

- **ACT-R/E** (Trafton et al., 2013): extends ACT-R with dedicated embodied spatial + motor modules separate from visual/spatial module. Precedent for `&body` as peer to `&space`, not subsumed by it.

- **Why not collapse into `&reason`**: motor cortex is not deliberation. It is the execution substrate. Conflating them eliminates a distinction biology found worth preserving across 500M years of nervous-system evolution.

- **Why not collapse into `&space`**: parietal cortex (spatial) is about external reference frames. Motor cortex is about the body's own configuration and action. Different reference frames, different computations.

---

## 15. Appendix B: Reference Implementation Plan

### 15.1 Graphonomous Reference (Elixir)

Required modules to add:

- `Graphonomous.Body.InteractionTrace` — struct + serialization
- `Graphonomous.Body.StateHash` — canonical JSON + SHA-256 encoding
- `Graphonomous.Body.TraceStore` — episodic memory extension for trace storage
- `Graphonomous.Body.Replay` — fail-fast replay semantics
- `Graphonomous.Body.Surprise` — SurpriseSignal emission + consumption
- `Graphonomous.MCP.Machines.Body` — new MCP machine with the 5 standard actions × N subtypes

Test additions: ~60 tests mapping to the 12 conformance scenarios across browser + OS subtypes.

### 15.2 Agent-Browser Adapter (TypeScript)

Wraps existing agent-browser CLI to emit OS-011 traces. Required:

- `@ampersand/body-browser` npm package
- `osEmit(trace)` — emit InteractionTrace to a configured endpoint
- `replay(trace)` — new subcommand for agent-browser CLI
- Conformance test harness

### 15.3 OpenClaw Integration (proposed)

Pull request to OpenClaw adding:

- OS-011 trace emission as an opt-in skill plugin
- `&body.os` + `&body.browser` contract advertisement
- PULSE manifest declaration

### 15.4 Claude Computer Use Adapter

Thin wrapper converting Computer Use's screenshot-click API into OS-011 typed actions. Runs as an MCP server.

### 15.5 PRISM OS-011 Scenarios

Add to PRISM scenario compose:

- Browser FSM replay fidelity scenarios (5 scenarios)
- OS workflow replay scenarios (5 scenarios)
- Forward-model calibration scenarios (5 scenarios)
- Cross-machine skill transfer scenarios (5 scenarios)

---

## Versioning Policy

OS-011 v0.1 is draft. Breaking changes permitted in minor versions within v0.1.x. v0.2 signals schema-breaking changes requiring implementation updates. SurpriseSignal as a PULSE token is tied to PULSE v0.1.1; OS-011 v0.1 requires PULSE ≥ 0.1.1.

---

*Document version 0.1.0 · OpenSentience · 2026-04-21*
