# OpenSentience Agent Marketplace (Elixir-only) — Project Specification

## 0) Summary

Build an always-running **OpenSentience Core** (OTP application) that provides a **safe-by-default Agent Marketplace** for **Elixir-only** agents. Agents live in separate Mix projects (often git repos) and can be **discovered**, **installed**, **updated (synced)**, and **run** on demand. The system must not auto-execute untrusted code; it must require explicit enable/run with a permissions-aware workflow.

The MVP also includes a **local admin control panel + chat interface** served on `127.0.0.1:6767` for managing the marketplace (discover/sync/install/enable/run) and for interacting with running agents.

This spec assumes design is complete and will be used as the baseline for implementation.

---

## 1) Goals

1. **Always-running core daemon**
   - The OpenSentience Core runs continuously, owns system state, indexes agents, and manages running agent processes.

2. **Elixir-only agents**
   - Agents are BEAM applications started from Mix projects or prebuilt releases.
   - No requirement to support non-Elixir runtimes in this iteration.

3. **Marketplace experience**
   - Local discovery: scan developer folders (e.g., `~/Projects`) for agent projects.
   - Remote discovery: a shareable registry of agents (git-based index) that can be synced into a local catalog.

4. **Safe-by-default**
   - Discovery and indexing must not execute agent code.
   - Installing/updating/running requires explicit user action.
   - Permissions are declared up front and must be approved before enabling.
   - The local admin UI must be **localhost-only** (bind to `127.0.0.1`) and protected against drive-by actions (authentication token and CSRF protections) so other websites/processes can’t trigger installs/compiles/runs.

5. **Clean operational lifecycle**
   - Start/stop/restart agents.
   - Health checks and crash recovery.
   - Logging, metrics, and audit trail.

6. **Local admin control panel + chat UI (MVP)**
   - Provide a local-only web interface on `127.0.0.1:6767` (bind to `127.0.0.1` by default).
   - Implement as a first-class “adapter” over the same internal APIs as the CLI (Catalog/Sync/Launcher/ToolRouter/AuditLog) to avoid duplicated logic.
   - Admin control panel must expose marketplace actions (list/search/info/sync/install/enable/run/stop/restart) and show:
     - agent status (installed/enabled/running/healthy, last heartbeat)
     - requested vs approved permissions
     - recent audit events and agent logs (with redaction)
   - Chat UI must support:
     - creating sessions
     - sending messages to the runtime (and, where supported, streaming partial outputs)
     - showing tool invocations and results (with redaction)
     - cancellation of in-flight runs (where supported)

---

## 2) Non-goals (for this phase)

1. **Multi-language agents** (Node/Python/Rust) — explicitly out of scope.
2. **Hot code reloading inside the core VM** of arbitrary agent code — out of scope.
3. **Running untrusted code in-process** with the core — prohibited by design.
4. **Full editor protocol support** (e.g., ACP/LSP) baked into core — optional adapter; core focuses on marketplace/runtime.
5. **A public hosted app store** with payment/reviews — out of scope. “Marketplace” means index + sync + enable/run.

---

## 3) Glossary

- **Core**: Always-running OpenSentience service managing catalog + runtime.
- **Agent**: A Mix project that provides tools/capabilities and connects to core via a runtime protocol.
- **Catalog**: Local database/index of known agents and their metadata.
- **Registry (Remote)**: A git-backed index listing agent entries and locations.
- **Install**: Fetch sources (git clone) and prepare dependencies/build artifacts without executing agent runtime.
- **Enable**: Approve permissions & mark agent eligible to run.
- **Run**: Start the agent as a separate OS process (or separate BEAM node) and connect it to core.

---

## 4) High-level Architecture

### 4.1 Components

1. **opensentience_core** (daemon)
   - Supervises:
     - `Catalog` (persistence + search)
     - `Discovery` (scanners/watchers)
     - `Sync` (pull remote registry, update local clones)
     - `Launcher` (process manager)
     - `AgentConnectionHub` (manages active connections)
     - `ToolRouter` (routes tool calls to agents)
     - `AuditLog` (records security-relevant events)
     - `AdminWeb` (local-only control panel + chat UI on `127.0.0.1:6767`)
     - `PubSub`/event bus (status updates for UI: agent lifecycle, sync progress, tool output streaming)

2. **Agent projects** (separate repos / Mix projects)
   - Include an agent SDK dependency (to be created) that:
     - Exposes a behaviour to implement tools.
     - Provides a standard entrypoint to connect to core.

3. **Remote registry** (git repo)
   - A simple repository of agent entries (metadata + git URL + version/ref).
   - The core syncs it and updates the local catalog.

### 4.2 Key Design Principle

**The core never loads arbitrary agent code into its own VM.**  
Agents are always started in separate processes/nodes and communicate over a defined protocol.

This avoids dependency conflicts, improves isolation, and supports safe-by-default workflows.

---

## 5) Agent Metadata (Manifest)

### 5.1 Manifest File

Each agent project must contain a manifest at a well-known path:

- `opensentience.agent.json` at repo root (MVP)
- Future: support `opensentience.agent.toml` (optional)

### 5.2 Manifest Requirements

- Must be parseable without executing code.
- Must declare:
  - stable agent id
  - name/description
  - version
  - entrypoint information
  - declared permissions
  - (optional) tool list summary for display (authoritative tool list comes from runtime registration)

### 5.3 Proposed Manifest Schema (v1)

Example:

Required (v1):
- `id`: reverse-DNS style string (stable)
- `name`: display name
- `version`: semver
- `description`: short description
- `source`: git url + optional ref
- `entrypoint`: how to run (MVP: mix task)
- `permissions`: list of requested permissions
- `capabilities`: `["tools", "streaming", "cancellation"]` etc.

Recommended optional fields (for discovery/search UX; safe to index without executing code):
- `keywords`: array of strings (tags for basic search)
- `tool_summary`: display-only list of tools (authoritative tool list comes from runtime registration)
- `integration_points`: array of strings (e.g. `["github", "gitlab"]`) for filtering
- `docs_url`: link to human docs (not fetched during discovery)

Recommended optional fields (for production hardening; not required for MVP):
- `resources`: declared “needs” for operator visibility only (Core may enforce later), e.g. cpu/memory hints
- `execution_limits`: declared timeouts/concurrency/rate hints (Core may enforce later)
- `publisher`: display metadata (name, url); registry may attach verification later
- `verification`: display metadata (e.g. `unverified|verified|audited`) — registry-derived, not trusted if self-declared
- `trust_score`: registry-derived numeric (if present); Core treats as informational only unless a verification system is implemented

---

## 6) Discovery

### 6.1 Local Discovery (MVP: file-based, no code execution)

The core supports configured scan roots, e.g.:

- `~/Projects`
- `~/.opensentience/agents`

Discovery rules:
- Find directories containing `opensentience.agent.json`.
- Index them into the catalog with status = `local_uninstalled` or `local_dev`.
- Do **not** run `mix` during discovery.
- Record file hash/mtime for change detection.

Optional (MVP+):
- File watcher (inotify) to refresh catalog when manifests change.

### 6.2 Remote Discovery (Registry Sync)

The remote registry is a git repository containing a list of agent entries.
The core can:
- clone/pull the registry repo
- read registry entries (pure data)
- present them as “available to install”

Registry entry should include (minimum):
- `id`
- `git_url`
- `default_ref` (tag/branch/commit)
- `manifest_path` (default `opensentience.agent.json`)

Registry entry may include (trust + UX metadata; informational unless verified by Core):
- `publisher` (object): display identity (name/url/contact)
- `verification` (object): e.g. `{ "level": "unverified|verified|audited|certified", "issuer": "...", "issued_at": "...", "evidence_url": "..." }`
- `trust_score` (number): registry-computed score used for sorting/filtering
- `deprecated` (boolean) and `replacement_id` (string)
- `keywords`, `integration_points` (arrays) for filtering

Important: Core MUST continue to treat remote registry metadata as untrusted input. The only trust boundary in MVP is: explicit install/build/enable by the user, plus Core-side permission enforcement.

### 6.3 Catalog Search (MVP: metadata + filtering)

Core should support searching the local + remote catalogs using only manifest/registry metadata (no code execution), for example:

- free-text across: `id`, `name`, `description`, `keywords`
- filters across:
  - `capabilities`
  - `integration_points`
  - `status` (installed/enabled/running)
  - `verification.level` (if present)
  - `trust_score >= threshold` (if present)

This is intentionally “semantic-light” for MVP: it must be fast, deterministic, and safe.

### 6.4 Semantic Discovery (MVP+; keep file scanning as the source of truth)

If/when we add semantic search, it should be implemented as a derived index over already-discovered safe fields:

- Inputs to semantic index:
  - `name`, `description`, `keywords`, `tool_summary` (if present), and (optionally) registry-provided tags
- Ranking should combine:
  - relevance (semantic)
  - operator-selected trust thresholds (verification/trust_score)
  - observed reliability metrics (see Section 11.3)

Non-negotiable invariant:
- Semantic discovery must never execute agent code and must never fetch arbitrary URLs during discovery/indexing.

---

## 7) Install / Enable / Run Workflow (Safe-by-default)

### 7.1 Install

Install is a two-step operation:

1. Fetch sources:
   - `git clone` to `~/.opensentience/agents/<agent_id>/src`
   - or update existing clone via `git fetch`
2. Prepare build inputs (no runtime execution):
   - Allowed: `mix deps.get` (network + code download)
   - Allowed: `mix deps.compile` (compilation)
   - Not allowed: starting the agent runtime automatically as part of install

Notes:
- Compilation executes compiler macros; this is still “code execution” at build time.
- Therefore, install must be explicit and clearly marked as a trust boundary:
  - The user must confirm they are compiling third-party code.
  - (MVP) Accept that compilation is required for Elixir; log this action.

### 7.2 Permissions Approval (Enable)

Before an agent can run, the user must explicitly approve its declared permissions.

Core maintains an approval record:
- `agent_id`
- `approved_permissions` (subset or full set)
- timestamp + user identity (if applicable)

An agent may be:
- installed but not enabled
- enabled but not currently running

### 7.3 Run

When running:
- core starts the agent as a separate process
- core passes connection info and a session token
- agent connects back to core and registers its tools

Run modes:
- **Dev mode**: run from source via `mix run`/`mix <task>`
- **Release mode** (future): run as an Elixir release executable for faster startup and safer deployments

---

## 8) Runtime Protocol (Core ↔ Agent)

### 8.1 Requirements

The protocol must support:
- agent registration/handshake
- tool declaration (name, description, input schema)
- tool invocation with request/response correlation
- streaming outputs (optional but recommended)
- cancellation
- heartbeats/health
- structured errors
- versioning/compat negotiation

Concrete v1 message envelope + framing is specified in `opensentience.org/project_spec/RUNTIME_PROTOCOL.md` and is treated as the MVP baseline.

### 8.2 Transport

**MVP standard (baseline):** Unix domain socket (UDS) using **length-prefixed JSON frames** as defined in `opensentience.org/project_spec/RUNTIME_PROTOCOL.md`:
- each message is a single JSON object (UTF-8)
- framed with a 4-byte unsigned big-endian length prefix

Alternative transports may be used for development (e.g., local TCP on `127.0.0.1`), but they MUST preserve the exact same framing and message envelope.

### 8.3 Security

- Core issues a short-lived **session token** to the launched agent process.
- Agent must present token on connect.
- Core must enforce permissions at the router boundary (core is the policy enforcement point).

---

## 9) Tool Model

### 9.1 Tool Naming

Tools are globally namespaced to avoid collisions:
- `<agent_id>/<tool_name>`
Example:
- `com.opensentience.git_commit/suggest_message`

### 9.2 Tool Schemas

Agents provide input schemas (JSON Schema-like) for UI/validation and runtime checks.

Core responsibilities:
- validate tool calls against schema (optional in MVP)
- enforce permissions before invoking agent tool
- log tool invocations in audit log

---

## 10) Process Management & Health

### 10.1 Launcher Responsibilities

- Start agent process with controlled environment:
  - working directory
  - limited env vars
  - connection info (socket path) + token
- Capture stdout/stderr for logs
- Restart policy (configurable):
  - dev: no auto-restart (or limited)
  - production: exponential backoff

### 10.2 Health

- Core expects:
  - successful handshake within timeout
  - periodic heartbeat
- Core marks agent unhealthy and stops routing if heartbeat fails.

### 10.3 Resource Limits & Abuse Resistance (MVP+ guidance; do not weaken MVP invariants)

MVP requirement remains: permission gating + process isolation. In addition, Core should be designed to add resource controls without refactors:

Recommended operator controls (even if enforcement is “best-effort” at first):
- Per-tool call timeouts (`timeout_ms` propagated; Core may enforce stricter limits)
- Max concurrent tool calls per agent
- Rate limits (calls/minute) per agent and/or per caller
- Bounded logs and bounded message sizes (protocol already specifies `max_frame_bytes`)
- Kill-switch: disable an enabled agent quickly (stop process + stop routing)

Optional enforcement mechanisms (later phases):
- OS-level CPU/memory limits (e.g. cgroups on Linux)
- Network egress controls aligned with `network:egress:<host-or-tag>`

---

## 11) Observability & Auditing

### 11.1 Logs

Core logs:
- discovery events
- registry sync
- install/compile actions
- permission approvals
- agent start/stop/crash
- tool calls (with redaction)

### 11.2 Audit Log (Security Relevant)

Record:
- install source + ref
- permission grants/revocations
- run commands + timestamps
- tool invocations (tool name, agent id, caller, outcome)

Audit requirements (keep consistent with `RUNTIME_PROTOCOL.md`):
- Prefer correlation fields (`request_id`, `correlation_id`, `causation_id`) so UI can show a unified timeline.
- Persist only secret-free metadata; apply redaction best-effort to tool I/O and logs.

### 11.3 Metrics & Tracing (MVP+; design now, implement incrementally)

Production operators need “is it healthy and fast?” in addition to logs:

Recommended metrics (per agent and per tool_id):
- invocation counts
- success/failure/canceled counts
- latency (p50/p95/p99)
- crash/restart counts and uptime
- permission denials (by permission type/category)

Recommended tracing model:
- represent a tool call as a root “span” with child spans for permission checks, routing, and agent execution
- tie traces to audit events via `correlation_id` / `request_id`

Non-negotiable invariant:
- traces and metrics must remain secret-free in durable storage.

### 11.4 Testing & Evaluation (MVP+; required for higher trust levels)

This spec does not require a full eval framework for MVP, but it should establish the expectation:

- Agents SHOULD ship repeatable tests (unit/integration) for their tool surfaces.
- Core SHOULD eventually provide a way to run agent test suites in isolation and record results as auditable events.
- Registry verification levels (if implemented) SHOULD require passing a standard test suite and basic security checks for “audited/certified” tiers.

Keep the trust boundary clear:
- Running tests is code execution and must be treated similarly to build/run (explicit operator intent + audit).

---

## 12) CLI + Local Admin Web UI (MVP)

### 12.1 CLI (Mix tasks acceptable for MVP)

Provide a CLI (or Mix tasks) to manage marketplace:

- `opensentience agents list`
- `opensentience agents search <query>`
- `opensentience agents info <agent_id>`
- `opensentience agents install <agent_id>`
- `opensentience agents enable <agent_id> --approve <perm,...>`
- `opensentience agents run <agent_id>`
- `opensentience agents stop <agent_id>`
- `opensentience agents update <agent_id>`
- `opensentience registry sync`

MVP can be Mix tasks in the core project; later it can be a standalone escript.

### 12.2 Local Admin Control Panel (required for MVP)

Run an HTTP server bound to `127.0.0.1:6767` that provides an admin UI for the core.

**Recommended implementation:** Phoenix + LiveView for real-time status updates and streaming outputs.

**Core requirement:** the UI calls internal core modules (Catalog/Sync/Launcher/ToolRouter) rather than re-implementing logic.

#### 12.2.1 Security Model (required for MVP)

Because “localhost” endpoints can be triggered by other local processes and by browser-based attacks, the UI must include:

- **Bind to loopback only:** default `127.0.0.1` (not `0.0.0.0`).
- **Auth token required for state-changing actions:**
  - Generate/store an admin token (e.g., first-run) in `~/.opensentience/` (permissions restricted) or via env var.
  - UI must require the token for install/compile/enable/run/stop/update actions.
- **CSRF protection:** enabled for browser sessions.
- **Clickjacking protection:** deny framing (`X-Frame-Options: DENY` or CSP `frame-ancestors 'none'`).
- **No cross-origin trust:** do not enable permissive CORS.
- **Audit all privileged actions:** installs, compiles, permission grants, runs, stops, tool calls.

#### 12.2.2 Required UI Features / Screens (MVP)

- **Agents list**: local + remote, searchable, with status badges (installed/enabled/running/healthy).
- **Agent detail**:
  - manifest display
  - install state (source/ref, install path)
  - permissions requested vs approved
  - actions: install/update, enable (approve perms), run/stop/restart
- **Registry sync**: trigger sync and show progress/result.
- **Audit log view**: recent events with filters.
- **Logs view**: agent stdout/stderr (redacted) and core lifecycle events (optional for MVP but strongly recommended).

### 12.3 Chat Interface (required for MVP)

Provide a local-only chat UI hosted by the core on `127.0.0.1:6767` that enables interacting with running agents.

Required capabilities:
- create/select a “session”
- send messages
- show responses (streaming where supported by runtime/agents)
- show tool invocations + tool results (redacted)
- cancel an in-flight run (where supported)

The chat UI must not bypass permissions: all tool usage must go through `ToolRouter` permission enforcement and be audited.

---

## 13) Data Storage

Catalog should persist:
- known agents (local + remote)
- install locations
- installed refs/versions
- enablement state
- permissions approvals
- last sync time + last seen status

MVP storage options:
- SQLite via an Elixir wrapper
- Postgres (heavier)
- Flat files (simple but limited)

This spec recommends **SQLite** for local-first MVP.

---

## 14) Repository Layout (Proposed)

- `opensentience_core/` — daemon app
- `opensentience_agent_sdk/` — SDK for agent projects
- `registry/` — optional local copy of remote registry repo (runtime data), not necessarily in this code repo
- `project_spec/` — specs like this document

Agents live outside this repo (e.g., `~/Projects/<agent_repo>`), but can be installed into `~/.opensentience/agents/`.

---

## 15) Milestones

### Milestone 1: Catalog + Local Discovery + Admin UI Skeleton
- manifest schema v1
- scan configured directories
- persist and display agents in catalog
- **Admin UI up on `127.0.0.1:6767`**:
  - agents list + agent detail (read-only)
  - audit log view (even if initially minimal)
- no installing/running yet

### Milestone 2: Install + Enable + Audit Log (CLI + UI)
- git clone/update from remote registry entry
- explicit compile step (user-initiated)
- permissions approval recorded
- **Admin UI supports install/update + enable (permissions approval) flows**
- audit log records install/compile/enable actions

### Milestone 3: Run + Protocol + Tool Calls + Chat UI (CLI + UI)
- launcher starts agent
- agent connects and registers tools
- core routes tool calls and returns results
- **Admin UI supports run/stop/restart and shows live status/health**
- **Chat UI supports sessions + message send + tool invocation visibility**
- cancellation support where available

### Milestone 4: Remote Registry Sync (CLI + UI)
- sync remote registry repo
- show remote agents and install them via UI
- display sync status/progress + last sync timestamps

### Milestone 5: Reliability & Security Hardening
- unix socket + token auth (agent runtime protocol)
- harden localhost UI security controls (token handling, CSRF, headers, redaction)
- sandboxing options (where feasible)
- improved metrics, logging, and backoff policies

---

## 16) Open Questions (to resolve before implementation details)

1. Exact protocol message formats and version negotiation.
2. Initial permission taxonomy (what permissions exist and how they’re enforced).
3. Whether “install” includes compilation in MVP, and how to present that trust boundary clearly.
4. Whether agents are started via Mix task or can optionally provide a release entrypoint.

---

## 17) Acceptance Criteria (Definition of Done for MVP)

- Core daemon runs continuously.
- **Local admin UI is available on `127.0.0.1:6767`** and is protected against drive-by actions:
  - binds to loopback by default
  - state-changing actions require an admin token (and are CSRF-protected)
  - privileged actions are audited
- You can (via CLI or UI):
  - sync a remote registry index
  - discover local agent projects
  - install an agent from remote registry (git clone)
  - explicitly enable it (approve permissions)
  - run it (separate process)
  - see it register at least one tool
  - invoke a tool via core and receive a result
- You can (via the UI):
  - view agent details (manifest, install/enabled/running status, requested vs approved permissions)
  - start/stop/restart a running agent
  - use the **chat interface** to create a session and send messages, seeing responses (streaming where supported) and tool invocations/results (redacted)
- No agent code executes during discovery/indexing.
- Audit log records install/compile/enable/run/stop/tool-call events.

---