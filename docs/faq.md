# Frequently Asked Questions

> Common questions about OpenSentience scope, design, and integration.

---

## Is OpenSentience a product?

No. OpenSentience is a **research organization** that publishes cognitive
protocols (OS-001 through OS-006) and ships one thin runtime artifact — the
`open_sentience` hex package implementing OS-006 (the governance shim).

It does not have a UI, a SaaS offering, or a pricing page. The hex package is
a library dependency consumed by other [&] ecosystem products.

---

## Why six protocols?

Each protocol maps to a well-established finding in cognitive science:

| Protocol | Cognitive Basis |
|----------|----------------|
| OS-001 Continual Learning | Hippocampal consolidation (McClelland et al. 1995) |
| OS-002 Topological Routing | Working memory gating (O'Reilly & Frank 2006) |
| OS-003 Deliberation | Dual-process theory (Kahneman 2011) |
| OS-004 Attention Engine | Endogenous attention (Desimone & Duncan 1995) |
| OS-005 Model Tier Adaptation | Resource rationality (Lieder & Griffiths 2020) |
| OS-006 Governance Shim | Executive function (Miyake et al. 2000) |

Six is not arbitrary — it is the count of distinct cognitive capabilities
needed for a governed, self-improving agent. If a seventh becomes necessary,
the numbering extends.

---

## Why Elixir for the governance shim?

OTP patterns map directly to the governance domain:

- **GenStateMachine** models agent lifecycle states and validated transitions
- **DynamicSupervisor** manages variable numbers of governed agents at runtime
- **ETS** provides microsecond-latency permission lookups without GenServer bottlenecks
- **GenServer** serializes state mutations (permission changes, audit writes)
- **PubSub** enables real-time policy propagation from Delegatic

The shim needs exactly the concurrency, fault-tolerance, and state management
primitives that OTP provides natively.

---

## How does OpenSentience relate to Delegatic?

**Delegatic defines policy. OpenSentience enforces it.**

Delegatic is the governance authoring layer — it lets operators write policies
about what agents may do. OpenSentience subscribes to those policies and
enforces them at runtime via the PermissionEngine and AutonomyController.

Without Delegatic, you can still use OpenSentience with locally configured
permissions. But for multi-agent, multi-stakeholder governance, Delegatic
provides the policy source of truth.

---

## What is the runtime overhead?

The shim is designed to be negligible:

| Metric | Target |
|--------|--------|
| CPU | < 1% overhead |
| Memory | < 5 MB RSS |
| Permission check | < 2 microseconds (ETS direct read) |
| Audit write | < 1 ms (batched) |
| Agent install | < 10 ms |

If your application already runs OTP, the shim adds one supervision subtree
with a handful of GenServers and two ETS tables.

---

## Can I use it without the rest of [&]?

Yes. The `open_sentience` hex package wraps any OTP `child_spec`. It does not
depend on Graphonomous, Delegatic, AgenTroMatic, or any other [&] package.

You lose cross-product features (Delegatic policy sync, Graphonomous
graph_access governance, Agentelic manifest import), but the core governance
loop — install, permission, lifecycle, autonomy, audit — works standalone.

---

## What is graduated autonomy?

A trust-building progression for agent capabilities:

1. **Observe** — the agent generates recommendations but takes no action.
   All proposed actions are logged. The operator reviews.
2. **Advise** — the agent prepares actions and queues them for human approval.
   The operator approves or rejects each action before execution.
3. **Act** — the agent executes autonomously within its granted permissions.
   Actions are still audited but no longer require approval.

Every agent starts at `observe`. Promotion to higher levels is an explicit
operator action, recorded in the audit trail. Demotion is always available
and immediate.

---

## Do the protocols prescribe implementation details?

No. The protocols are specifications, not implementations. OS-001 specifies
*what* continual learning must do (consolidate, decay, merge). It does not
mandate SQLite, ETS, or any particular storage engine.

Graphonomous is the reference implementation of OS-001, OS-002, OS-004, and
OS-005. Other implementations are welcome — the protocol is the contract,
not the code.

---

## How do I contribute?

OpenSentience protocols are published in `opensentience.org/project_spec/`.
The governance shim source will live in a dedicated hex package repository.
Contributions should align with the relevant protocol specification before
modifying implementation code.

See the [&] Protocol contributing guidelines in
`AmpersandBoxDesign/CONTRIBUTING.md` for general conventions.
