# Workflow Orchestration (Portfolio-Aligned)
## FleetPrompt owns workflow execution; OpenSentience Core indexes/validates and routes runs

**Version:** 2.0 (rewrite)  
**Date:** January 2026  
**Status:** Specified; implementation follows Phase 4 FleetPrompt integration and Phase 2 ToolRouter maturity.

This document defines **how workflows are discovered, validated, invoked, and observed** in the Project[&] portfolio.

It explicitly aligns with the portfolio architecture:

- **FleetPrompt (agent)** owns workflow parsing, DAG execution, step scheduling, retries, cancellation semantics, and workflow-specific persistence.
- **OpenSentience Core** owns catalog/discovery, permissions + enablement gates, ToolRouter routing, process isolation, and the unified audit timeline. Core does **not** implement a separate workflow engine.

Canonical references:
- `opensentience.org/project_spec/portfolio-integration.md` (workflow/orchestration ownership clarification)
- `fleetprompt.com/project_spec/*` (FleetPrompt execution model and interfaces)
- `opensentience.org/project_spec/RUNTIME_PROTOCOL.md` (tool calls, streaming, cancellation, correlation IDs)
- `opensentience.org/project_spec/agent_marketplace.md` (lifecycle + safe-by-default)
- `project_spec/standards/security-guardrails.md` (no secrets, side effects require intent, idempotency)

## Architecture compatibility notes

This spec is compatible with (and must not override) the portfolio’s core boundaries:

1. **Workflow execution ownership**
   - **FleetPrompt** is the workflow engine (parsing, DAG execution, retries, conditional logic, step scheduling, resume semantics).
   - **OpenSentience Core** is the governance + routing plane (lifecycle, enablement, permission enforcement, ToolRouter, audit timeline).
   - This document MUST NOT be interpreted as authorizing a second “Core workflow engine”.

2. **How runs happen (routing model)**
   - Workflows execute by **routing a tool call** to FleetPrompt (e.g., `com.fleetprompt.core/fp_run_workflow`), not by Core directly executing steps.
   - Any downstream step work (tool calls to other agents) is initiated by FleetPrompt but still routes through Core, so Core remains the enforcement point.

3. **Audit and observability integration**
   - Core should generate a workflow `correlation_id` (execution id) and propagate it into the initial FleetPrompt tool call.
   - FleetPrompt must propagate correlation fields (`request_id`, `correlation_id`, `causation_id`) into downstream tool calls so the unified timeline is coherent.
   - Audit/logging must remain secret-free and bounded, per portfolio guardrails.

4. **Delegatic integration**
   - Delegatic orchestrates missions/companies and may trigger FleetPrompt workflows, but it does not change the ownership model:
     - Delegatic coordinates; FleetPrompt executes; Core routes/enforces/audits.

5. **Persistence boundaries**
   - Core stores catalog metadata and the unified audit timeline, not workflow execution state as a primary workflow database.
   - FleetPrompt may store workflow execution state if it supports resume/replay, but must emit sufficient streaming updates and lifecycle signals so Core remains the operator control plane.

---

## 0) Goals and non-goals

### 0.1 Goals
1. **Repo-first workflow definition**
   - Workflows live in the project repo under `.fleetprompt/workflows/`.
   - They are discoverable and indexable without executing code.

2. **Single workflow engine**
   - FleetPrompt is the workflow engine for the portfolio.
   - Core does not introduce a competing DAG runtime.

3. **Safe-by-default execution**
   - Running a workflow is a privileged action routed through Core’s ToolRouter and subject to:
     - agent enablement gates,
     - permission approvals,
     - audit logging,
     - process isolation.

4. **Unified observability**
   - Workflow runs are visible in the Core timeline (audit + logs + tool call streaming) via:
     - `correlation_id` (workflow execution id),
     - `request_id` (tool call chain),
     - `causation_id` (step/tool/event causes).

### 0.2 Non-goals (this document does not specify)
- A Core-owned DAG executor, scheduler, or workflow DSL runtime.
- A visual workflow builder UI (can be layered later).
- “Semantic workflow discovery” (search belongs to catalog indexing; semantic retrieval may be Graphonomous-backed later).

---

## 1) Definitions

- **Workflow**: A multi-step execution plan defined in `.fleetprompt/workflows/*` (format chosen by FleetPrompt; commonly YAML).
- **Workflow run**: A single execution instance with a unique execution id (also used as `correlation_id`).
- **Step**: A unit of work in a workflow run (often maps to a tool call to an agent).
- **FleetPrompt**: The OpenSentience agent that validates and executes workflows and exposes stable tools for running them.
- **Core**: OpenSentience Core (catalog + lifecycle + ToolRouter + audit log). Core routes calls; does not execute workflows itself.

---

## 2) Workflow file location and ownership

### 2.1 Location (repo-first)
Workflows live in a project repository:

- `.fleetprompt/workflows/`

Example layout:
- `.fleetprompt/workflows/code-review.yaml`
- `.fleetprompt/workflows/deploy.yaml`

### 2.2 Ownership boundaries
1. FleetPrompt:
   - Parses workflow definitions.
   - Builds execution plans/DAGs.
   - Executes steps (including parallelism, retries, and conditional logic).
   - Performs step-level variable interpolation and output mapping.
   - Produces streaming updates and final results.
   - Handles workflow-run persistence (if any) and resume semantics (if supported).

2. Core:
   - Indexes workflow metadata for browsing.
   - Validates workflow files as *data* (shape checks, size limits) without running workflow code.
   - Routes execution to FleetPrompt via ToolRouter.
   - Enforces permissions and enablement policies.
   - Records audit events and surfaces unified timeline.

---

## 3) Workflow definition format (FleetPrompt-defined)

FleetPrompt is the authority on workflow schema. Core must treat workflow files as **opaque-but-indexable** data.

### 3.1 Minimum metadata Core expects to index
Core SHOULD be able to extract (either by file parsing or by asking FleetPrompt to “describe”) these fields:

- `workflow_id` (string, stable within repo)
- `name` (string)
- `description` (string, optional)
- `version` (string, optional)
- `file_path` (relative path)
- `declared_agents` (list of agent ids referenced; optional)
- `declared_tools` (list of tool ids referenced; optional)
- `inputs_schema_summary` (optional, bounded)
- `outputs_schema_summary` (optional, bounded)

If the file format is not reliably parseable by Core (e.g., a future non-YAML DSL), Core MUST fall back to calling FleetPrompt’s “describe workflow” tool to obtain metadata. That call is safe: it is tool-routed and auditable.

### 3.2 Schema validation authority
- FleetPrompt MUST validate workflow semantics before execution (and should provide a `validate` tool).
- Core MAY perform lightweight validation:
  - file exists,
  - file size limits,
  - allowed extension(s),
  - basic YAML parsing (if used),
  - safe “shape” checks (bounded strings/arrays),
  - but Core does not enforce workflow semantics (DAG correctness, tool existence, etc.) except via FleetPrompt validation.

---

## 4) Indexing & validation responsibilities (Core)

### 4.1 Indexing without execution
Core discovery rules (aligned with portfolio invariants):
- Indexing MUST NOT execute agent code.
- Indexing MUST NOT call external network services.
- Indexing SHOULD NOT require FleetPrompt to be running.

Core may index workflows in two modes:

#### Mode A: Offline indexing (preferred for discovery)
- Scan `.fleetprompt/workflows/` paths.
- Store file paths + mtimes/hashes.
- Optionally parse minimal metadata if format is stable (e.g., YAML) and parsing is safe.
- Mark entries as “unvalidated” until FleetPrompt validates them.

#### Mode B: On-demand validation/description (requires FleetPrompt running)
- When user requests details or wants to run a workflow, Core routes:
  - `com.fleetprompt.core/fp_describe_workflow` (or equivalent) and/or
  - `com.fleetprompt.core/fp_validate_workflow`
- Cache safe summaries in Core DB for display.

### 4.2 Validation (Core-level lightweight checks)
Core SHOULD enforce simple safety constraints:
- Max workflow file size (default suggestion: 100 KB)
- Max number of workflows indexed per repo (configurable)
- Max metadata field lengths (name/description)
- No secrets in indexed metadata (best-effort redaction)

Core MUST NOT:
- evaluate expressions,
- resolve environment variables,
- execute steps,
- fetch remote URLs during indexing.

---

## 5) Execution model (Core routes; FleetPrompt runs)

### 5.1 The only way Core “runs a workflow”
Core initiates workflow execution by routing a tool call to FleetPrompt:

- Tool: `com.fleetprompt.core/fp_run_workflow` (name illustrative; authoritative name is FleetPrompt spec)

Core provides:
- workflow identifier (by id or file path)
- workflow inputs (JSON object)
- execution options (timeouts, idempotency key, etc.)

FleetPrompt performs the actual run and returns:
- execution id
- run status
- final outputs (secret-free and bounded)
- optionally, step summaries and metrics

### 5.2 Correlation IDs
Core MUST create and propagate a workflow execution correlation id:
- `correlation_id = workflow_execution_id` (UUID recommended)
- Core SHOULD set:
  - `request_id` for the `fp_run_workflow` call
  - `causation_id` if this run was triggered by a directive/event/mission

FleetPrompt MUST:
- propagate `correlation_id` and `request_id` into any downstream tool calls it makes (through Core routing), so the unified timeline links all steps.

### 5.3 Streaming updates
FleetPrompt SHOULD provide streaming updates for workflow runs using the runtime protocol:
- Use `agent.tool.stream` with `channel: "status"` and/or `partial_result`
- Include step progress:
  - started/completed/failed/skipped
  - durations
  - safe error codes/messages (no secrets)
- Core displays these updates in UI/CLI and ties them to `correlation_id`.

### 5.4 Cancellation
Core cancels a workflow run by routing a cancellation to FleetPrompt’s running tool call:
- If the workflow run is represented as a long-running `fp_run_workflow` tool call, Core uses the runtime protocol cancellation (`core.tool.cancel`) for that call id.
- FleetPrompt is responsible for propagating cancellation to any in-flight step tool calls it initiated (best-effort), and for returning a final canceled result.

---

## 6) CLI and UI responsibilities (Core surface; FleetPrompt execution)

### 6.1 Core CLI (recommended)
Core should provide user commands that map to:
- list workflows (from indexed repo data; may be “unvalidated”)
- validate workflow (routes to FleetPrompt validate tool)
- run workflow (routes to FleetPrompt run tool)
- cancel workflow run (cancel the running tool call)
- show workflow run status (timeline view by correlation id)

Examples (illustrative; exact commands depend on Core CLI design):
- `opensentience workflows list --project <path>`
- `opensentience workflows validate <workflow_id>`
- `opensentience workflows run <workflow_id> --input '<json>'`
- `opensentience workflows cancel <execution_id>`

### 6.2 Core Admin UI (recommended)
Core UI should:
- show workflows discovered per project
- show validation status and errors (from FleetPrompt)
- allow starting a run (with input form)
- show run progress (streaming updates)
- show unified timeline filtered by `correlation_id` (workflow execution id)
- show links to:
  - tool calls made during the run
  - permission denials
  - audit events

---

## 7) Permissions and safety

### 7.1 Tool routing permissions
Core MUST enforce permissions at the routing boundary:
- To run a workflow, the caller must have permission to invoke the FleetPrompt tool:
  - `tool:invoke:com.fleetprompt.core/fp_run_workflow` (illustrative)
- FleetPrompt’s internal step tool calls are also subject to Core routing checks:
  - if FleetPrompt tries to call `tool_id = com.graphonomous.core/graph_search`, Core verifies FleetPrompt has permission to invoke it (or the call is made under a delegated policy context if designed that way).

### 7.2 Side effects require explicit intent
If a workflow step can cause side effects:
- FleetPrompt must enforce the portfolio guardrail:
  - side effects require explicit intent (directive-backed or equivalent policy)
- Core should expose the intent boundary clearly in UI (e.g., “this step requests a directive”).

This document does not define the directive mechanism; it requires that the existing portfolio stance is honored.

### 7.3 Secret-free invariants
Core and FleetPrompt MUST ensure:
- no secrets in durable Core storage (audit/logs/traces)
- workflow inputs/outputs persisted only in redacted/bounded form (or not at all)
- any displayed logs are escaped and truncated

---

## 8) Persistence boundaries

### 8.1 What Core stores
Core stores:
- indexed workflow metadata (safe summary)
- audit events describing:
  - validation requested/result
  - run requested/started/completed/canceled
- tool call traces (safe summaries)
- correlation linkages

Core should not become the “workflow state database”.

### 8.2 What FleetPrompt stores
FleetPrompt may store:
- workflow execution state (if it supports resume/replay)
- step results (bounded and secret-free)
- internal execution logs (bounded)

If FleetPrompt stores execution state, it should still emit enough status/metrics via streaming + audit integration so Core remains the operator’s primary control plane.

---

## 9) Testing strategy (portfolio-aligned)

### 9.1 Core tests (contract + routing)
Core should test:
- workflow indexing is filesystem-only and safe
- routing a workflow run produces:
  - correct `correlation_id`
  - auditable “run requested” and “run completed” events
- cancellation propagates to FleetPrompt tool call correctly (best-effort)

### 9.2 FleetPrompt tests (execution engine)
FleetPrompt should test:
- parsing + DAG correctness
- retries and backoff behavior
- variable interpolation and output mapping
- cancellation propagation
- safe error shaping and secret-free outputs
- idempotency (if supported)

---

## 10) Acceptance criteria

This orchestration model is complete when:

1. **Indexing**
   - Core discovers `.fleetprompt/workflows/` without executing code.
   - Core can list workflows for a project.

2. **Validation**
   - Core can route a “validate workflow” tool call to FleetPrompt.
   - Validation results are visible in Core UI/CLI and recorded in audit events.

3. **Execution**
   - Core can route `fp_run_workflow` to FleetPrompt with a generated `correlation_id`.
   - Run progress streams into Core and is visible as a unified timeline.

4. **Cancellation**
   - Core can cancel a running workflow (via tool call cancellation).
   - FleetPrompt returns a final canceled status and best-effort cancels in-flight steps.

5. **Security**
   - Permission denials are enforced at routing boundaries and are observable.
   - No secrets are persisted durably in Core artifacts.

---

## 11) Migration notes (what to do with older “Core workflow engine” docs)

If you have older docs or code that implement `OpenSentience.Workflow` inside Core:
- treat them as **deprecated proposals**
- either:
  - move them to a “rejected ideas / archive” section, or
  - explicitly re-scope them into FleetPrompt (the proper owner)

The portfolio should have one workflow executor, not two.

---