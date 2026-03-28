# Skill 08 — Anti-Patterns

> What NOT to do when using the OpenSentience governance shim — and how to
> fix it.
>
> Every anti-pattern here comes from real failure modes: ungoverned agents,
> permission sprawl, false trust, missing audit evidence, and governance
> that exists on paper but not at runtime.

---

## Table of Anti-Patterns

| # | Name | Severity | Description |
|---|------|----------|-------------|
| 1 | [Permission Sprawl](#1--permission-sprawl) | Critical | Granting all permissions defeats governance |
| 2 | [Trust Skipping](#2--trust-skipping) | Critical | Jumping straight to Act autonomy |
| 3 | [Audit Blindness](#3--audit-blindness) | High | Ignoring the audit trail |
| 4 | [Island Governance](#4--island-governance) | High | Not integrating with Delegatic |
| 5 | [Shim Confusion](#5--shim-confusion) | High | Treating the shim as a runtime |
| 6 | [Unchecked Actions](#6--unchecked-actions) | High | Skipping permission_check before sensitive operations |
| 7 | [Telemetry Neglect](#7--telemetry-neglect) | Medium | Not monitoring shim overhead |
| 8 | [Lifecycle Shortcuts](#8--lifecycle-shortcuts) | Medium | Skipping lifecycle states |

---

## Critical Anti-Patterns

---

### 1 — Permission Sprawl

**The mistake:** Granting `*` permissions across all types to avoid dealing
with permission configuration.

**Why it is harmful:**
- The governance shim becomes a no-op — every permission check returns `allow`
- The audit trail fills with meaningless `ok` entries
- No defense against agent scope creep or compromised agents
- Compliance reviews have no evidence of access control

**The fix:** Start with the minimum permissions the agent needs. Add more
only when the agent encounters a denial that the operator determines is
legitimate. Every grant should have a documented reason.

**Before (bad):**
```elixir
permissions: %{
  granted: [
    %{type: :filesystem, access: :read, resource: "/**"},
    %{type: :filesystem, access: :write, resource: "/**"},
    %{type: :network, access: :outbound, resource: "*"},
    %{type: :tool_invocation, access: :allowed, resource: "*"}
  ]
}
```

**After (good):**
```elixir
permissions: %{
  granted: [
    %{type: :filesystem, access: :read, resource: "/data/input/**"},
    %{type: :filesystem, access: :write, resource: "/data/output/**"},
    %{type: :network, access: :outbound, resource: "api.internal.net"}
  ],
  denied: [
    %{type: :filesystem, access: :write, resource: "/data/input/**"}
  ]
}
```

---

### 2 — Trust Skipping

**The mistake:** Setting a new agent directly to `act` autonomy without
any observation or advise period.

**Why it is harmful:**
- No evidence that the agent behaves as expected
- If the agent misbehaves, the first indication is a production incident
- The audit trail has no `action_recommended` or approval records to review
- Trust is assumed, not earned

**The fix:** Follow the graduated autonomy workflow. Start at `observe`,
review recommendations, promote to `advise`, review approvals, then promote
to `act` when confidence is established.

**Before (bad):**
```
agent_install(manifest)
agent_enable("new-agent")
autonomy_level("new-agent", "act")  # immediately autonomous
```

**After (good):**
```
agent_install(manifest)
agent_enable("new-agent")
# Default: observe
# ... review audit trail for 1-2 sessions ...
autonomy_level("new-agent", "advise")
# ... review and approve queued actions ...
autonomy_level("new-agent", "act")
```

---

## High-Severity Anti-Patterns

---

### 3 — Audit Blindness

**The mistake:** Never querying the audit trail. The entries accumulate but
nobody reads them.

**Why it is harmful:**
- Permission denials go unnoticed (potential misconfiguration)
- Blocked actions go unreviewed (the agent may need broader scope)
- Autonomy changes go unmonitored (who promoted this agent?)
- Compliance audits have the data but nobody has reviewed it
- The audit system costs resources for zero value

**The fix:** Build audit review into your operational workflow. Query
the audit trail at least at session boundaries, after autonomy changes,
and during periodic compliance reviews.

---

### 4 — Island Governance

**The mistake:** Running OpenSentience without Delegatic, defining all
permissions locally in code.

**Why it is harmful:**
- No centralized policy management across agents
- Permission changes require code deploys instead of policy updates
- Multiple governance instances cannot coordinate
- Policy drift between environments (dev/staging/prod)
- No policy versioning or rollback capability

**The fix:** Connect to Delegatic for policy authoring. Use local permissions
only as a fallback or for development. In production, Delegatic should be the
source of truth for policy, with OpenSentience enforcing it.

---

### 5 — Shim Confusion

**The mistake:** Treating the governance shim as a replacement for the
agent runtime. Expecting OpenSentience to execute tasks, manage state,
or provide business logic.

**Why it is harmful:**
- The shim wraps, it does not replace. It adds governance around an existing
  OTP process.
- Attempting to use the shim as a runtime leads to missing functionality,
  confused architecture, and misplaced responsibilities
- The shim is intentionally thin — overhead under 1%

**The fix:** Remember the separation of concerns. The agent process handles
business logic. The governance shim handles permissions, lifecycle, autonomy,
and audit. They compose through OTP supervision, not inheritance.

---

### 6 — Unchecked Actions

**The mistake:** Having an agent perform sensitive operations without calling
`permission_check` first, relying on the autonomy controller alone.

**Why it is harmful:**
- Autonomy only controls whether actions need approval
- Permissions control whether actions are allowed at all
- An agent at `act` autonomy still needs permission to access a resource
- Skipping permission checks means the audit trail has no record of what
  resources were accessed

**The fix:** Always call `permission_check` before sensitive operations,
regardless of autonomy level. The permission check is the enforcement point;
autonomy is the approval workflow.

---

## Medium-Severity Anti-Patterns

---

### 7 — Telemetry Neglect

**The mistake:** Not monitoring the governance shim's own resource usage
and performance.

**Why it is harmful:**
- Permission check latency could degrade without anyone noticing
- ETS table growth could consume unexpected memory
- AuditWriter batch sizes could grow unboundedly
- The shim's overhead claim (< 1% CPU, < 5 MB RSS) is a target, not a guarantee

**The fix:** Include shim health in your application's telemetry:
- ETS table sizes for `:os_permissions` and `:os_autonomy`
- AuditWriter queue depth and flush latency
- Permission check latency percentiles (p50, p99)
- Agent count under AgentSupervisor

---

### 8 — Lifecycle Shortcuts

**The mistake:** Attempting to jump from `installed` directly to `running`,
or from `running` directly to `removed`, bypassing intermediate states.

**Why it is harmful:**
- The GenStateMachine will reject the transition, causing an error
- The audit trail will record a failed transition attempt
- Workarounds (direct state manipulation) bypass governance entirely

**The fix:** Follow the state machine. Every transition must go through
valid intermediate states. If you need to remove a running agent:
`running -> disabled -> removed`. There are no shortcuts.

---

## Self-Audit Checklist

Run through this periodically:

### Permissions
- [ ] Are grants scoped to the minimum necessary resources?
- [ ] Are explicit denials in place for sensitive paths?
- [ ] Are permission denials in the audit trail reviewed?

### Autonomy
- [ ] Do new agents start at `observe`?
- [ ] Are promotions documented with reasons in the audit trail?
- [ ] Is demotion used when behavior degrades?

### Audit
- [ ] Is the audit trail queried regularly?
- [ ] Are compliance reviews scheduled?
- [ ] Is the audit backend appropriate for the deployment (ETS for dev, Ecto for prod)?

### Integration
- [ ] Is Delegatic connected for policy management?
- [ ] Are Agentelic manifests reviewed before install?
- [ ] Are marketplace agents treated as untrusted by default?

### Operations
- [ ] Is shim telemetry included in monitoring?
- [ ] Are ETS table sizes tracked?
- [ ] Is AuditWriter health monitored?
