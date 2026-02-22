# OpenSentience Observability & Metrics
Document status: Draft (Jan 2026)  
Scope: OpenSentience Core + all OpenSentience runtime agents (FleetPrompt, Graphonomous, Delegatic, A2A Traffic, and third-party agents).

This document defines how OpenSentience becomes *operable in production-like conditions* (even when “production” is a single developer laptop): you can answer **what happened**, **why**, **who triggered it**, **what it cost**, and **what to do next**—without storing secrets.

It intentionally builds on the **existing correlation fields** defined in:
- `opensentience.org/project_spec/RUNTIME_PROTOCOL.md` (envelope fields: `request_id`, `correlation_id`, `causation_id`, optional `actor`)
- `opensentience.org/project_spec/agent_marketplace.md` (audit + logs requirements)
- `project_spec/standards/security-guardrails.md` (“no secrets”, localhost admin, directive-backed side effects, idempotency)

---

## 0) Goals and Non-goals

### Goals
1. **Single “truth timeline” across the portfolio**
   - Tool calls, lifecycle events, permission decisions, and agent-to-agent coordination must be linkable via correlation IDs.

2. **Secret-free by default**
   - No secrets in durable storage (SQLite), logs, audit events, traces, or exported telemetry.

3. **Debuggability without reverse-engineering**
   - Any operator can follow a `correlation_id` and see: intent → actions → results.

4. **Low operational overhead**
   - Works on a laptop with local storage, and can export to external observability stacks later.

5. **Performance visibility**
   - Provide latency distributions (p50/p95/p99), error rates, and resource usage so you can detect regressions.

### Non-goals (v1)
- A full hosted observability backend (SaaS).
- Storing raw prompt/response content durably (even “for debugging”).
- Perfect, universal redaction (we aim for defense-in-depth and safe defaults).

---

## 1) Three data planes: Audit, Logs, Traces (and why they all exist)

OpenSentience uses **three complementary planes**. Each has a different retention and correctness goal:

### 1.1 Audit log (security-relevant facts)
- Purpose: “What actions occurred?” for governance and post-incident review.
- Properties: append-only semantics (application-level), durable, queryable.
- Storage: Core DB (SQLite) is acceptable for local; exportable later.
- Must be: secret-free, bounded metadata.

Examples of audit events:
- `agent.discovered`, `agent.installed`, `agent.built`, `agent.enabled`, `agent.run_started`, `agent.run_crashed`
- `permission.approval_created`, `permission.approval_revoked`
- `tool.call_routed`, `tool.call_completed` (summary only)
- `security.denied` (when permissions block an action)

### 1.2 Logs (high-cardinality details)
- Purpose: debugging and operational diagnostics (“what exactly failed, and where?”).
- Properties: high volume, typically short retention, may be sampled/rotated.
- Storage: file-backed recommended; optionally index recent lines in DB.
- Must be: secret-free and bounded (truncate large values; never log session tokens).

### 1.3 Traces (distributed execution structure)
- Purpose: connect causal chains across components and measure latency cost per step.
- Properties: structured spans, duration, status, selected attributes.
- Storage: local span store (optional) + export to OpenTelemetry (recommended).
- Must be: secret-free attributes only; payloads should be omitted or hashed.

---

## 2) Canonical correlation model (the backbone)

The runtime protocol already defines correlation fields at the message envelope level. OpenSentience adopts them as the *only* canonical cross-system linkage.

### 2.1 Field definitions (portfolio-wide)
- `request_id`:
  - A stable ID for a logical request chain.
  - For tool calls, Core MUST set it when sending `core.tool.call`.
  - Agents MUST echo it on all messages emitted while handling the call (stream + result).

- `correlation_id`:
  - The *timeline key*.
  - Represents a user-visible “thing”: chat session id, workflow execution id, mission id, etc.
  - Core SHOULD set it for UI/chat initiated actions.

- `causation_id`:
  - The immediate cause.
  - Examples: directive id, upstream tool call id, event id, previous workflow step id.

- `actor` (optional):
  - Attribution metadata only; never authorization.
  - Used for UI/audit readability.

### 2.2 How these map to the portfolio “truth timeline”
- Timeline queries are keyed primarily by `correlation_id`.
- Causality graphs are built via `causation_id` edges.
- “End-to-end latency” is measured by joining spans/events grouped by `request_id`.

### 2.3 Minimum propagation rules
1. If Core originates an action in response to a UI/chat request, it MUST create or reuse a `correlation_id`.
2. If Core calls an agent tool, it MUST attach:
   - `request_id` (new UUID per logical tool call chain, unless retrying with the same idempotency context),
   - `correlation_id` (if known),
   - `causation_id` (if the call is caused by a directive/event/step).
3. Agents MUST copy `request_id`, `correlation_id`, and `causation_id` into:
   - `agent.tool.stream` and `agent.tool.result` envelopes
   - any other protocol messages emitted as part of handling that request
4. Audit events written by Core MUST include `correlation_id` whenever one exists.

---

## 3) Observability requirements by subsystem

### 3.1 Core: lifecycle + governance plane
Core MUST emit audit events and logs for:

**Discovery**
- scan started/completed, count of manifests found/updated
- parse errors (path + safe error)
- manifest drift detected (hash change) and re-approval requirement triggered

**Install/Build**
- install started/completed/failed (git url, ref, destination path)
- build started/completed/failed
- mark build as explicit trust boundary (“compilation executes code”)

**Enablement**
- approval created (requested vs approved summary)
- approval revoked
- denial events when run is attempted without approval or approval is stale

**Launcher**
- run started/stopped/crashed with:
  - pid if available
  - exit_code
  - bounded reason string
- stdout/stderr capture (with strict truncation + redaction)

**Protocol**
- agent connected / handshake accepted / handshake rejected
- tool registration accepted/rejected
- heartbeat missed → health degraded/unhealthy
- cancellation requested/acknowledged/completed

**ToolRouter (Phase 2+)**
- permission check result (allow/deny) with the required permission strings (not inputs)
- tool call start/end with:
  - `tool_id`, `agent_id`, `call_id`, `request_id`, `correlation_id`, `causation_id`
  - duration, status, error code
  - redaction stats (e.g., “payload omitted”, “payload hashed”)

**Admin UI**
- HTTP request metrics and security events:
  - token failures (no token values recorded)
  - CSRF failures
  - rate limiting events (if implemented)

### 3.2 Agents: tool execution plane
Every agent SHOULD provide:
- structured logs with `agent_id`, `tool_id`, `call_id`, `request_id`, `correlation_id`
- `agent.tool.result.payload.metrics` for:
  - `duration_ms`
  - model token counts (if relevant and available)
  - counts of filesystem reads/writes and network calls (summary only)
- best-effort `agent.heartbeat.payload.details` with safe resource hints:
  - queue depth, inflight calls
  - memory usage estimate if easy to obtain (optional)

Agents MUST NOT:
- emit raw secrets
- emit raw file contents in durable logs (short snippets may be allowed only in transient UI streams if you can guarantee non-persistence; otherwise omit)

---

## 4) Data model (what we store and what we don’t)

### 4.1 What is safe to store durably
**Durable (DB)**
- Audit events (summary facts)
- Agent catalog records (manifest metadata)
- Permission approvals (requested hash + approved list)
- Runs (pid/exit/dates)
- Optional: trace spans (limited attributes) and recent log indices

**Non-durable or optional**
- Full logs: file-backed with rotation
- Full traces: export to external system

### 4.2 What must never be stored durably (default policy)
- session tokens (protocol `session_token`)
- API keys and secrets
- raw prompts and raw model outputs
- full file contents from user projects
- arbitrary tool inputs/outputs (unless explicitly classified safe and bounded)

### 4.3 Redaction and size bounds
Defense-in-depth redaction MUST:
- truncate long strings
- omit or hash values of keys that often contain sensitive material (examples: `prompt`, `input`, `output`, `request`, `response`, `stdout`, `stderr`, `trace`, `body`)
- strip environment variable values; only allow listing variable *names* when needed

Size bounds (recommended defaults):
- Max durable metadata JSON size per audit event: 8–16 KB
- Max log line length: 4–8 KB (truncate)
- Max tool call “safe summary” size: 2–4 KB
- Max stream chunk size (runtime protocol): bounded by `max_frame_bytes`

---

## 5) Standard event/metric taxonomy

### 5.1 Audit event types (minimum recommended)
Lifecycle:
- `agent.discovered`
- `agent.updated`
- `agent.installed`
- `agent.build_started`
- `agent.built`
- `agent.build_failed`
- `agent.enabled`
- `agent.permissions_revoked`
- `agent.run_started`
- `agent.run_stopped`
- `agent.run_crashed`

Routing and enforcement:
- `tool.call_routed`
- `tool.call_completed`
- `security.denied`

Protocol health:
- `agent.connected`
- `agent.handshake_failed`
- `agent.heartbeat_missed`
- `agent.marked_unhealthy`

### 5.2 Metrics (Core)
Core SHOULD emit metrics suitable for Prometheus/OpenTelemetry.

Recommended metric names (conceptual; exact exporter naming can vary):

**Catalog & discovery**
- `opensentience_catalog_agents_total` (gauge)
- `opensentience_discovery_scan_duration_ms` (histogram)
- `opensentience_discovery_manifest_parse_errors_total` (counter)

**Enablement & security**
- `opensentience_permissions_denied_total{permission="...", reason="..."}`
- `opensentience_permission_approvals_total{status="active|revoked"}`

**Launcher**
- `opensentience_launcher_runs_total{status="started|stopped|crashed"}`
- `opensentience_launcher_run_uptime_ms` (histogram)
- `opensentience_launcher_restart_total` (counter)

**Protocol**
- `opensentience_protocol_connections_total{status="accepted|rejected"}`
- `opensentience_protocol_frame_bytes` (histogram)
- `opensentience_protocol_heartbeat_lag_ms` (histogram)

**ToolRouter**
- `opensentience_tool_calls_total{tool_id="...", status="succeeded|failed|canceled"}`
- `opensentience_tool_call_duration_ms{tool_id="..."}`
- `opensentience_tool_call_inflight` (gauge)

**Admin UI**
- `opensentience_web_requests_total{route="...", method="...", status="..."}`
- `opensentience_web_request_duration_ms{route="..."}`
- `opensentience_web_security_failures_total{type="csrf|token|rate_limit"}`

### 5.3 Metrics (Agents)
Agents SHOULD emit tool-level metrics in `agent.tool.result.payload.metrics`, including:
- `duration_ms` (required where feasible)
- `cpu_ms` / `memory_mb` (optional, best-effort)
- `io_counts` (optional): reads, writes, network_calls
- `token_counts` (optional): input_tokens, output_tokens, cached_tokens (if model reports them)

Agents SHOULD also produce heartbeat fields:
- `inflight_calls` (required by protocol)
- `status` + safe `details` map (optional)

---

## 6) Tracing strategy (how we get spans without storing secrets)

### 6.1 Trace identity
OpenSentience does not invent new IDs when it can reuse existing ones:

- Use protocol envelope `request_id` as the primary *trace key* for a tool call chain.
- Use protocol `id` as a message/span identifier *if convenient*, but do not rely on it for hierarchy.
- Use payload `call_id` (from `core.tool.call` and `agent.tool.*`) as the *tool-call instance key*.

### 6.2 Span model (conceptual)
A minimal span record SHOULD include:
- `request_id` (trace key)
- `span_id` (unique)
- `parent_span_id` (optional)
- `operation` (e.g., `tool_call`, `permission_check`, `agent_launch`, `registry_sync`)
- `started_at`, `ended_at`, `duration_ms`
- `status` (`ok|error|canceled`)
- attributes (safe only):
  - `agent_id`, `tool_id`, `call_id`
  - `correlation_id`, `causation_id`
  - `error.code` (not raw error text, except safe summaries)

### 6.3 Recommended instrumentation points for spans
Core:
- `catalog.scan` (span per scan)
- `agent.install`, `agent.build`, `agent.enable`, `agent.run`
- `protocol.handshake`
- `tool_router.permission_check` (child of tool call)
- `tool_router.call` (root for a tool call request_id)
- `audit.append` (optional; often too noisy—consider sampling)

Agents:
- `tool.execute` span per tool call
- optional subspans: `fs.read`, `fs.write`, `network.http`, `model.call`
  - note: subspans must not include payload content

### 6.4 Sampling (recommended)
- Local dev: sample 100% (low volume).
- Higher volume: sample by `request_id` hash, keep errors at 100%.
- Always keep audit events (audit is not sampled).

---

## 7) Retention, rotation, export

### 7.1 Recommended defaults
- Audit events: 30–90 days (configurable), possibly longer if you want governance history.
- Logs: 7–30 days with rotation (size-based + time-based).
- Traces/spans: 3–14 days locally; export if you need longer.

### 7.2 Export interfaces (future-friendly)
Core SHOULD support exporting:
- audit events as JSON lines (one event per line)
- traces/spans via OpenTelemetry exporter
- metrics via Prometheus scrape endpoint or OTLP metrics

Export must preserve:
- `correlation_id`, `request_id`, `causation_id`
- consistent agent/tool identifiers (`<agent_id>/<tool_name>`)

---

## 8) UI expectations (“unified timeline”)

The admin UI is expected to support:
- Filter by `correlation_id`
- Show linked entities:
  - agent runs
  - tool calls (with status + duration)
  - security denials
  - relevant audit events
- Drill-down on a tool call:
  - safe input summary (redacted/omitted)
  - safe output summary (redacted/omitted)
  - associated spans
  - logs (bounded)

The UI must treat logs/traces as untrusted text and escape accordingly.

---

## 9) Implementation roadmap (incremental and realistic)

### Phase 1 (Core MVP)
- Audit log: implemented, durable, secret-free posture
- Core logs: structured and bounded
- Basic metrics: discovery/enablement/launcher counters + durations (best-effort)
- Correlation IDs: attach to audit events where available

### Phase 2 (Protocol + ToolRouter MVP)
- Tool call audit: start/end summaries with `call_id`, `request_id`, `correlation_id`
- Permission decision audit: `security.denied` with required permission string(s)
- Tool call latency histograms
- Heartbeat-driven health metrics

### Phase 3 (Agents + SDK)
- SDK automatically propagates correlation fields
- SDK provides helpers for:
  - structured logs
  - tool duration metrics
  - safe error code mapping

### Phase 4+ (Portfolio integrations)
- FleetPrompt/Delegatic emit directive/step lifecycle events tied to `correlation_id`
- A2A publish/delivery attempts appear in the same timeline via correlation fields

---

## 10) Checklist: “Is this observable enough?”

For any new Core feature or agent tool, verify:
1. Does it produce an audit event for state changes?
2. Can I find it by `correlation_id`?
3. Does it have a duration metric?
4. Are permissions denials visible and explainable?
5. Are secrets excluded from durable storage?
6. Does it degrade gracefully under high volume (sampling/rotation/limits)?

If any answer is “no”, treat that as a production-readiness gap.