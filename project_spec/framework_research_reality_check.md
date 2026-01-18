# Framework Research Reality Check (January 2026)
## Reconciling “Agent Framework Research” recommendations with the current OpenSentience portfolio specs + codebase

**Purpose:** This note is a “truth pass” over the framework-research doc you shared. It distinguishes:
- what is already **specified and/or implemented** in this repo,
- what is **aligned but not yet implemented**,
- what is **misstated / mismatched** with current architecture decisions,
- what should be recorded as **future work** (and *where* it belongs in the portfolio docs).

This file is intentionally concrete and references the *actual* spec/doc files that exist today (not the filenames from the research doc).

---

## 0) Canonical sources of truth (current repo)

**OpenSentience Core / Portfolio specs (canonical):**
- `opensentience.org/project_spec/agent_marketplace.md` — Core architecture + marketplace lifecycle + MVP constraints
- `opensentience.org/project_spec/RUNTIME_PROTOCOL.md` — Core ↔ Agent runtime protocol v1 (UDS + length-prefixed JSON frames)
- `opensentience.org/project_spec/portfolio-integration.md` — How FleetPrompt / Graphonomous / Delegatic / A2A integrate + permission taxonomy + roadmap
- `project_spec/standards/agent-manifest.md` — `opensentience.agent.json` standard
- `project_spec/standards/security-guardrails.md` — security invariants (localhost-only admin, no secrets in durable artifacts, directives for side effects, etc.)
- `project_spec/PROJECT_PHASES.md` + `project_spec/PHASE_1_WORK_BREAKDOWN.md` — the actionable phased plan

**Implementation reality (already scaffolded/started):**
- `opensentience.org/core/README.md` — Phase 1 Core scaffold (catalog/discovery, enablement, audit, launcher scaffolding, minimal admin UI skeleton, Mix tasks)
- `opensentience.org/zed-agent/` — *separate* ACP agent for Zed (JSON-RPC over stdio). This is **not** the Core ↔ Agent runtime protocol.

---

## 1) Major reconciliation: there are two different “agent protocols” in this repo

The research doc implicitly treats “the agent protocol” as a single thing. In reality, the repo currently contains **two distinct protocol surfaces**:

1) **OpenSentience Runtime Protocol (Core ↔ Agent)**  
   - Spec: `opensentience.org/project_spec/RUNTIME_PROTOCOL.md`  
   - Transport: UDS + length-prefixed JSON frames  
   - Message types: `agent.hello`, `agent.tools.register`, `core.tool.call`, streaming, cancellation, heartbeats, etc.  
   - This is the protocol that matters for the marketplace/runtime.

2) **ACP (Zed ↔ External Agent)**  
   - Implementation: `opensentience.org/zed-agent/`  
   - Transport: JSON-RPC 2.0 over stdio (newline-delimited JSON)  
   - This is for editor integration (Zed), not the portfolio runtime.

**Doc update recommendation:** whenever “protocol”, “tool calls”, “streaming”, or “cancellation” are mentioned, explicitly name which protocol is being discussed:
- “Runtime protocol (Core ↔ Agent)” vs
- “ACP (Zed integration)”.

This prevents design churn and false gaps.

---

## 2) Reality check: claims from the research doc vs current specs/implementation

Legend:
- ✅ **True / already specified and broadly aligned**
- 🟡 **Partially true / exists in spec but not implemented (or scoped differently)**
- ❌ **Not true (in this repo/specs) or mismatched**

### 2.1 Marketplace + runtime focus
- Claim: “Marketplace + runtime focus is unique; keep it.”  
  ✅ **Aligned and canonical**: this is the whole point of `agent_marketplace.md` and `portfolio-integration.md`.

### 2.2 Permissions-first design
- Claim: “Granular permissions, explicit approval before enable, enforced at ToolRouter.”  
  ✅ **Specified**:  
  - Manifest requested permissions: `project_spec/standards/agent-manifest.md`  
  - Enablement = approved ⊆ requested: `agent_marketplace.md` + `PHASE_1_WORK_BREAKDOWN.md`  
  - Enforcement point is Core router boundary: `agent_marketplace.md` + `RUNTIME_PROTOCOL.md` + portfolio principles.

- Note: “ANS/A2A PKI identity” style verification  
  🟡 **Not in current scope/spec**. Identity/verification is not currently designed as PKI-based in this repo. If you want PKI, it should be treated as a future “publisher verification” layer *above* local runtime.

### 2.3 Process isolation model
- Claim: “Agents run as separate OS processes; Core never loads agent code.”  
  ✅ **Non-negotiable invariant** in `agent_marketplace.md` and reinforced by Core README.

### 2.4 Discovery: file scanning vs semantic discovery
- Claim: “Current spec is path scanning; must add semantic discovery with embeddings + pgvector.”  
  ✅/🟡/❌ split:
  - ✅ **True**: current Core discovery is manifest scanning (`opensentience.agent.json`).  
  - ✅ **True**: discovery must not execute code.  
  - 🟡 **Search UX exists in CLI goals** (e.g., `agents search <query>` is mentioned), but semantic search is not specified as embedding-based.
  - ❌ **pgvector recommendation is mismatched with current storage**: Core is explicitly SQLite-backed in Phase 1 (`opensentience.org/core/mix.exs`, `opensentience.org/core/README.md`). “Add pgvector” is a Postgres choice and is not aligned with current MVP stance.

**Recommendation:** treat “semantic search” as **future capability** with an implementation approach consistent with the portfolio:
- For local-first MVP: keyword + tags + capability filters in SQLite.
- For embeddings: route through **Graphonomous** (which is already the portfolio “knowledge/embedding” layer), or adopt a SQLite-compatible vector extension later. Don’t prematurely force Core onto Postgres.

### 2.5 Trust score / ratings / verification levels
- Claim: “We need multi-dimensional trust score and verification levels.”  
  🟡 **Conceptually useful, but not currently specified**.

**Reality:** current portfolio emphasizes:
- explicit trust boundary at **build/compile time**,
- explicit permission approvals,
- audit trail and safe-by-default defaults.

That is already a trust system, but it is *operator-centric*, not marketplace reputation-centric.

**Recommendation:** record “publisher verification + reputation” as a **Phase 3+ marketplace feature** (primarily for remote registries). For local-only development and early portfolio integration, the existing trust boundaries are higher leverage.

### 2.6 Observability & tracing
- Claim: “Need OpenTelemetry tracing + metrics; current spec only has basic logging.”  
  🟡 **Partially true**:
  - ✅ Audit log is a first-class primitive in current specs and Phase 1 scaffold.
  - 🟡 “Distributed tracing / OpenTelemetry” is *not* currently specified, and no telemetry integration is implemented in Core yet.
  - ✅ `RUNTIME_PROTOCOL.md` already includes correlation fields (`request_id`, `correlation_id`, `causation_id`) that make tracing feasible later without redesign.

**Recommendation:** add a small spec note: “correlation/causation fields are the spine for future tracing”, and define a minimal metrics/tracing plan as Phase 9 hardening, not as Phase 1 MVP.

### 2.7 Evaluation & testing framework
- Claim: “Spec doesn’t address testing agents; need YAML test suites + test runner.”  
  🟡 **Mixed**:
  - FleetPrompt already has a dedicated `fleetprompt.com/project_spec/TEST_PLAN.md` (component-level testing plan).
  - Core Phase 1 breakdown includes a “minimal protocol regression suite plan” (scaffold now, implement in Phase 2+).
  - What’s missing is a **portfolio-wide agent test format/runner standard** (the YAML runner in the research doc is one possible design, but not currently canonical).

**Recommendation:** write a portfolio standard later (e.g., `project_spec/standards/agent-testing.md`) once the runtime protocol + SDK stabilize. Otherwise you’ll lock a test format before the tool/runtime surfaces settle.

### 2.8 Workflow orchestration primitives
- Claim: “We don’t have workflows; need DAG/workflow engine in Core.”  
  ❌ **Mismatch:** workflows already exist as a **FleetPrompt responsibility**:
  - `fleetprompt.com/project_spec/*` defines workflows (`.fleetprompt/workflows/`) and execution model.
  - Portfolio plan explicitly places workflow execution inside FleetPrompt agent (integrated via Core routing).

**Recommendation:** do **not** add a competing workflow engine to Core yet. The portfolio architecture is: Core governs lifecycle + permissions + audit + routing; FleetPrompt provides workflow orchestration as an agent. If you want “Core-managed workflows”, that should be a deliberate redesign, not a patch.

### 2.9 Resource limits / sandboxing
- Claim: “Permissions are not enough; need cgroups/timeouts/rate limits.”  
  🟡 **Aligned but not yet specified in detail**:
  - Security guardrails already call out “rate limits / quotas for high-cost operations” as minimum viable.
  - `RUNTIME_PROTOCOL.md` already includes `timeout_ms` on `core.tool.call` (a key enforcement hook).
  - There is no cgroups/namespaces implementation spec in Core right now.

**Recommendation:** add resource/time limits in layers:
1) **Protocol/tool-call timeouts** (immediate, consistent with existing protocol)
2) **Launcher-level limits** (ulimits / OS timeouts where feasible)
3) **cgroups** (Linux-only hardening track later)

### 2.10 Communication patterns: pub/sub, long-running tasks, streaming
- Claim: “ToolRouter assumes sync request/response; we need pub/sub + long-running tasks + streaming.”  
  ✅/🟡 split:
  - ✅ Streaming and cancellation are already in the runtime protocol v1.
  - ✅ Pub/sub is already a portfolio concept (A2A Traffic agent + `event:*` permissions in `portfolio-integration.md`).
  - 🟡 “Long-running tasks status tracking” is not a first-class runtime protocol concept today beyond streaming/cancellation + audit. It can be modeled via:
    - streaming status updates (`agent.tool.stream` with `channel: "status"`),
    - correlation IDs in audit,
    - optional “task handle” patterns later.

**Recommendation:** keep the current protocol as-is for MVP; implement long-running tooling via streaming + audit before inventing a second async protocol.

### 2.11 Capability negotiation
- Claim: “Need conditional capabilities and runtime negotiation (MCP-style).”  
  🟡 **Potential future enhancement**. Current portfolio stance:
  - manifest declares capabilities,
  - runtime tool registration is authoritative for what’s actually callable.

In practice, “capability negotiation” can be achieved by **dynamic tool registration** (register only what’s available) without adding a new manifest schema surface.

### 2.12 Multi-tenancy & namespace isolation
- Claim: “Need schema-per-tenant Postgres; namespace format `<tenant>.<agent_type>.<agent_name>`.”  
  ❌/🟡 mismatch:
  - The portfolio currently is **local-first** and uses **SQLite** for Core Phase 1.
  - FleetPrompt explicitly says SaaS multitenancy patterns are *not required for local agent MVP*.
  - Some tenancy/namespacing concepts exist (e.g., permissions and agent IDs are namespaced), but “schema-per-tenant Postgres” is not aligned with current phase plan.

**Recommendation:** treat multi-tenancy as an “enterprise expansion” topic and keep it out of Phase 1–3 acceptance criteria unless you are explicitly targeting org-level deployments now.

---

## 3) The biggest concrete inaccuracies in the research doc (and how to correct them)

1) **File names referenced don’t match the repo**  
   - Research doc: `AGENT_SPEC.md`, `PORTFOLIO_INTEGRATION_SPEC.md`  
   - Reality:  
     - `opensentience.org/project_spec/agent_marketplace.md`  
     - `opensentience.org/project_spec/portfolio-integration.md`

2) **Workflow orchestration is not missing; it lives in FleetPrompt**  
   - Don’t duplicate it in Core without a conscious redesign.

3) **“Add pgvector” conflicts with SQLite-first Core**  
   - If you want embeddings soon, route through Graphonomous or a SQLite-compatible vector approach.

4) **Trust scoring is not currently a required MVP primitive**  
   - Core already has explicit trust boundaries (build/enable) + audit. Marketplace reputation can come later.

5) **Observability isn’t “missing”; correlation scaffolding is already present**  
   - `RUNTIME_PROTOCOL.md` correlation fields are the right backbone. Implement metrics/tracing incrementally.

---

## 4) Recommended doc changes (what to update now)

This section is intentionally “low-churn”: changes that improve truthfulness without forcing major architecture moves.

### 4.1 Add a “Reality / Current State” section to the research doc
Add a short section that:
- states Core is SQLite-first in Phase 1,
- separates ACP (Zed) from runtime protocol (Core ↔ Agent),
- clarifies that workflows are owned by FleetPrompt agent.

### 4.2 Rename the “Files to Update” list to match reality
Replace:
- `AGENT_SPEC.md` → `opensentience.org/project_spec/agent_marketplace.md`
- `PORTFOLIO_INTEGRATION_SPEC.md` → `opensentience.org/project_spec/portfolio-integration.md`

### 4.3 Reframe “Semantic Search” as “Discovery Indexing + (future) semantic retrieval”
Update the recommendation to:
- **MVP:** parse manifests → index fields (id/name/description/capabilities/permissions) → keyword search/filter
- **Future:** semantic retrieval via Graphonomous or vector extension (explicitly not required for Phase 1)

### 4.4 Add a “Future Proposals” appendix (keep speculative items out of MVP sections)
Items to move into “Future Proposals”:
- Trust score + publisher verification PKI
- Full OTel tracing
- cgroups enforcement
- multi-tenant Postgres
- visual workflow builder
- YAML agent-wide test runner format (until runtime SDK stabilizes)

---

## 5) Recommendations for portfolio priorities (aligned with current phase plan)

This repo already has a coherent implementation order in `project_spec/PROJECT_PHASES.md`. To align the research doc with reality:

### Phase 1–3 (near-term, already planned)
- Core: catalog/discovery, install/build/enable, audit log, launcher
- Runtime protocol implementation + ToolRouter MVP
- Agent SDK + example agents (acts as protocol regression suite)

### Phase 4+ (portfolio vertical slices)
- FleetPrompt workflows/skills as an agent (already a full component spec)
- Graphonomous for knowledge/embeddings/citations
- A2A for pub/sub event routing
- Delegatic for multi-agent orchestration

### Hardening track (later)
- resource limits (timeouts, rate-limits, then OS-level controls)
- metrics/tracing (use correlation IDs already in protocol)
- marketplace trust/reputation layers (when remote registry usage matters)

---

## 6) “What you should believe” summary

- OpenSentience **already** has a strong architectural spine: process isolation, explicit trust boundaries, permission approvals, auditability, and a concrete runtime protocol spec.
- Several “gaps” identified by framework research are either:
  - already solved elsewhere in the portfolio (workflows in FleetPrompt, pub/sub via A2A),
  - already scaffolded by the protocol (streaming/cancel/heartbeats + correlation fields),
  - or valid but **not MVP-aligned** (pgvector/Postgres, PKI trust scoring, full multitenancy).
- The most valuable updates are **doc truthfulness and correct mapping** to the actual specs, not a wholesale re-architecture.

---

## 7) Next action (doc maintenance plan)

1) Keep the framework-research doc, but relabel it as **“Research-driven proposals”** rather than “required spec updates”.
2) Update it to reference the correct canonical docs in this repo (paths above).
3) Add this file (`framework_research_reality_check.md`) as the “ground truth reconciliation” companion so future reviews don’t re-open already-decided portfolio architecture.

If you want to turn any proposal into a real spec change, do it by:
- adding it to `project_spec/PROJECT_PHASES.md` (phase placement),
- then adding a concrete acceptance checklist item to `PHASE_1_WORK_BREAKDOWN.md` or the relevant component spec.