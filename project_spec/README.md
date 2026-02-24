# OpenSentience — Agent Runtime Specification
**Version:** 0.1.0-draft  
**Date:** February 2026  
**Author:** [&] Ampersand Box Design  
**Status:** Pre-implementation spec — ready to code from  
**Repository:** opensentience.org

---

## 1. What OpenSentience Is

OpenSentience is the **execution runtime** for the [&] agent stack. It sits between the reasoning model (LLM) and the memory/deliberation infrastructure (Graphonomous, Deliberatic), and it owns one responsibility that no other component in the stack owns:

**Closing the feedback loop.**

Every other layer in [&] assumes that when an agent acts, something reports back what happened. OpenSentience is that something. It executes agent actions, observes their outcomes, and delivers structured outcome reports to Graphonomous's `learn_from_outcome` pipeline so the knowledge graph can update its causal confidence from real-world feedback.

This is not a general-purpose agent framework. It is not another LangChain or AutoGPT. It is the runtime that makes [&]'s autonomy loop complete — the conduit between action and memory that transforms Graphonomous from a knowledge store into a learning system.

---

## 2. Position in the [&] Stack

```
┌─────────────────────────────────────────────────────┐
│                  Reasoning Layer                    │
│          (Claude, GPT, local LLM via MCP)          │
└──────────────────────┬──────────────────────────────┘
                       │ MCP tool calls
┌──────────────────────▼──────────────────────────────┐
│               OpenSentience Runtime                 │
│                                                     │
│  ┌──────────────┐  ┌────────────────┐               │
│  │ Action       │  │ Outcome        │               │
│  │ Executor     │  │ Reporter       │  ← THIS SPEC  │
│  └──────┬───────┘  └───────┬────────┘               │
│         │                 │                         │
│  ┌──────▼──────────────────▼────────┐               │
│  │     Lifecycle Manager            │               │
│  │  (goal tracking, session state)  │               │
│  └──────────────┬────────────────────┘              │
└─────────────────┼───────────────────────────────────┘
                  │ Graphonomous MCP calls
┌─────────────────▼───────────────────────────────────┐
│              Graphonomous                           │
│     (memory, continual learning, goal graph)        │
└─────────────────────────────────────────────────────┘
                  │ When conflict detected
┌─────────────────▼───────────────────────────────────┐
│              Deliberatic                            │
│        (multi-agent deliberation layer)             │
└─────────────────────────────────────────────────────┘
```

OpenSentience is **not optional** in the [&] stack. Without it, Graphonomous has no outcome data to learn from. The graph accumulates beliefs but never validates them against reality. The GoalGraph has no way to know if goals were achieved. The causal confidence scores decay on a timer but never update from empirical feedback.

OpenSentience is the piece that makes [&]'s 7.5/10 AGI infrastructure score honest rather than theoretical.

---

## 3. Core Architecture

OpenSentience is an Elixir/OTP application.

### 3.1 Supervision Tree

```
OpenSentience.Application
├── OpenSentience.Registry                    # Agent session registry
├── OpenSentience.LifecycleManager            # Goal/session lifecycle
├── OpenSentience.OutcomeReporter             # Core of this spec
│   ├── OpenSentience.OutcomeReporter.Classifier
│   ├── OpenSentience.OutcomeReporter.GraphBridge
│   └── OpenSentience.OutcomeReporter.RetryBuffer
├── OpenSentience.ActionExecutor
│   ├── OpenSentience.ActionExecutor.ToolDispatcher
│   ├── OpenSentience.ActionExecutor.Sandbox
│   └── OpenSentience.ActionExecutor.Monitor
└── OpenSentience.MCPServer                   # Exposes runtime to LLMs (Anubis.Server)
```

### 3.2 Core Types

```elixir
@type agent_id :: binary()
@type session_id :: binary()
@type action_id :: binary()
@type goal_id :: binary()   # References Graphonomous GoalGraph node ID

@type action :: %{
  id: action_id(),
  agent_id: agent_id(),
  session_id: session_id(),
  goal_id: goal_id() | nil,
  tool: binary(),           # MCP tool name: "graphonomous:retrieve_context" etc.
  arguments: map(),
  causal_context: [binary()], # Graphonomous node IDs that informed this action
  initiated_at: DateTime.t(),
  timeout_ms: pos_integer()
}

@type outcome_status :: :success | :partial_success | :failure | :timeout | :refused

@type outcome :: %{
  id: binary(),
  action_id: action_id(),
  agent_id: agent_id(),
  goal_id: goal_id() | nil,
  status: outcome_status(),
  result: term(),            # Raw tool output
  error: binary() | nil,
  evidence: outcome_evidence(),
  duration_ms: non_neg_integer(),
  observed_at: DateTime.t(),
  reported_at: DateTime.t() | nil
}

@type outcome_evidence :: %{
  type: evidence_type(),
  payload: map(),
  confidence: float()        # 0.0–1.0, how reliable is this evidence signal
}

@type evidence_type ::
  :tool_response       | # Direct tool call result
  :error_message       | # Exception or error
  :timeout             | # Exceeded timeout
  :partial_result      | # Incomplete but not failed
  :external_validation | # Third-party confirmation (API response, DB write, etc.)
  :human_feedback      | # Explicit human rating
  :metric_change         # Observable metric shifted (used in FleetPrompt CL strategies)
```

---

## 4. The Outcome Reporting Pipeline

This is the spec's core contribution. Everything else in OpenSentience exists to support this pipeline.

### 4.1 Pipeline Overview

```
Action completes (success or failure)
        │
        ▼
[1] RawOutcome captured
        │  (tool output, error, duration, status)
        ▼
[2] OutcomeClassifier runs
        │  (what kind of outcome? how confident?)
        ▼
[3] EvidenceBuilder assembles evidence struct
        │  (attach causal_context from action)
        ▼
[4] GraphBridge calls Graphonomous.learn_from_outcome/3
        │  (with retry buffer if Graphonomous is unavailable)
        ▼
[5] GoalGraphUpdater checks goal completion criteria
        │  (was a goal achieved/failed by this outcome?)
        ▼
[6] AuditLogger records full pipeline trace
```

### 4.2 OutcomeClassifier

The classifier converts raw tool output into a structured outcome with an `outcome_status` and a confidence score. It cannot use a general LLM for this — classification must be deterministic enough to be reliable and fast enough to not create latency in the action loop.

Classification strategy: rule-based first, pattern-matched second.

```elixir
defmodule OpenSentience.OutcomeReporter.Classifier do
  @moduledoc """
  Classifies raw action results into structured outcomes.
  
  Classification priority:
  1. Explicit error signals (exceptions, error atoms, HTTP 4xx/5xx)
  2. Timeout (exceeded action.timeout_ms)
  3. Null/empty results (tool returned nothing)
  4. Partial signals (structured response with missing fields)
  5. Success (everything else)
  
  Confidence is reduced when:
  - Tool response is unstructured text (no schema validation possible)
  - Result cannot be independently verified
  - Action was near timeout boundary (>80% of timeout_ms used)
  """

  @spec classify(action(), raw_result :: term(), duration_ms :: non_neg_integer()) ::
    {:ok, outcome()} | {:error, binary()}

  def classify(%{id: action_id, agent_id: agent_id, goal_id: goal_id,
                  causal_context: causal_context, timeout_ms: timeout_ms} = _action,
               raw_result,
               duration_ms) do

    {status, confidence} = derive_status(raw_result, duration_ms, timeout_ms)
    evidence = build_evidence(raw_result, status)

    outcome = %{
      id: generate_id(),
      action_id: action_id,
      agent_id: agent_id,
      goal_id: goal_id,
      status: status,
      result: sanitize_result(raw_result),
      error: extract_error(raw_result, status),
      evidence: %{evidence | confidence: confidence},
      duration_ms: duration_ms,
      observed_at: DateTime.utc_now(),
      reported_at: nil
    }

    {:ok, outcome}
  end

  # --- Private ---

  defp derive_status(result, duration_ms, timeout_ms) do
    cond do
      duration_ms >= timeout_ms                  -> {:timeout, 1.0}
      is_exception?(result)                      -> {:failure, 1.0}
      is_error_atom?(result)                     -> {:failure, 0.95}
      is_http_error?(result)                     -> {:failure, 0.9}
      is_nil_or_empty?(result)                   -> {:failure, 0.7}
      is_partial_result?(result)                 -> {:partial_success, 0.8}
      near_timeout?(duration_ms, timeout_ms)     -> {:success, 0.75}
      true                                       -> {:success, 0.95}
    end
  end

  # Reduces confidence for near-timeout results — these may have
  # completed but with degraded quality
  defp near_timeout?(duration_ms, timeout_ms), do: duration_ms > timeout_ms * 0.8
end
```

### 4.3 GraphBridge — The Critical Integration

This is the piece that closes the loop. GraphBridge translates an `outcome` into a `learn_from_outcome` call to Graphonomous, mapping the outcome's `causal_context` (the Graphonomous node IDs that informed the action) to feedback signals that update their causal confidence.

```elixir
defmodule OpenSentience.OutcomeReporter.GraphBridge do
  @moduledoc """
  Translates outcomes into Graphonomous learn_from_outcome calls.
  
  The causal_context field on an action contains the Graphonomous node IDs
  that were retrieved via retrieve_context before the action was taken. These
  are the nodes that "caused" the action — the beliefs that led to it.
  
  When an action succeeds, confidence in those nodes increases.
  When an action fails, confidence decreases (proportional to outcome confidence).
  When partial, confidence adjusts proportionally.
  
  This is empirical calibration of the knowledge graph from deployment data.
  Without this, Graphonomous is an accumulator. With this, it is a learner.
  """

  @graphonomous_mcp_endpoint Application.compile_env(:open_sentience, :graphonomous_endpoint)

  @spec report(outcome()) :: {:ok, :reported} | {:error, :unavailable} | {:error, binary()}
  def report(%{status: status, causal_context: causal_context} = outcome)
      when length(causal_context) > 0 do

    feedback = %{
      outcome_id: outcome.id,
      action_id: outcome.action_id,
      agent_id: outcome.agent_id,
      goal_id: outcome.goal_id,
      result_status: status,
      evidence_type: outcome.evidence.type,
      evidence_payload: outcome.evidence.payload,
      confidence: outcome.evidence.confidence,
      causal_node_ids: causal_context,
      duration_ms: outcome.duration_ms,
      observed_at: outcome.observed_at
    }

    case call_graphonomous("learn_from_outcome", feedback) do
      {:ok, _response} ->
        {:ok, :reported}

      {:error, :unavailable} ->
        # Route to RetryBuffer — do not drop outcome data
        OpenSentience.OutcomeReporter.RetryBuffer.enqueue(outcome)
        {:error, :unavailable}

      {:error, reason} ->
        Logger.warning("GraphBridge report failed: #{inspect(reason)}, outcome_id=#{outcome.id}")
        {:error, reason}
    end
  end

  # No causal context = cannot attribute outcome to specific graph nodes
  # Still log for audit, but no graph update possible
  def report(%{causal_context: []} = outcome) do
    Logger.info("Outcome #{outcome.id} has no causal context — skipping graph update")
    {:ok, :no_context}
  end

  # --- Private ---

  defp call_graphonomous(tool, args) do
    Anubis.Client.call_tool(@graphonomous_mcp_endpoint, tool, args)
  end
end
```

### 4.4 RetryBuffer

Graphonomous may be temporarily unavailable (restarts, consolidation cycle in progress, network partition in distributed deployments). Outcome data must not be lost. The RetryBuffer is a persistent queue backed by SQLite (same SQLite instance that OpenSentience uses for session state).

```elixir
defmodule OpenSentience.OutcomeReporter.RetryBuffer do
  @moduledoc """
  Persistent buffer for outcomes that could not be immediately reported
  to Graphonomous due to unavailability.
  
  Uses SQLite persistence — survives OpenSentience restarts.
  Retries on exponential backoff: 5s, 15s, 45s, 135s, then hourly.
  Drops outcomes after 7 days (configurable) — stale causal feedback
  is worse than no feedback.
  
  Schema: retry_buffer(id, outcome_json, attempts, next_retry_at, created_at)
  """

  use GenServer

  @max_attempts 10
  @retention_days 7
  @base_backoff_ms 5_000

  def enqueue(outcome) do
    GenServer.cast(__MODULE__, {:enqueue, outcome})
  end

  def handle_cast({:enqueue, outcome}, state) do
    insert_to_db(outcome, next_retry_at: backoff_ms(0))
    {:noreply, state}
  end

  # Periodic flush — called by internal timer
  def handle_info(:flush, state) do
    pending = query_due_retries()
    Enum.each(pending, &attempt_retry/1)
    schedule_flush()
    {:noreply, state}
  end

  defp attempt_retry(%{id: id, outcome: outcome, attempts: attempts}) do
    case OpenSentience.OutcomeReporter.GraphBridge.report(outcome) do
      {:ok, _} ->
        delete_from_buffer(id)

      {:error, _} when attempts < @max_attempts ->
        update_retry_schedule(id, attempts + 1, backoff_ms(attempts + 1))

      {:error, _} ->
        Logger.error("RetryBuffer: exhausted retries for outcome #{outcome.id}, dropping")
        delete_from_buffer(id)
    end
  end

  defp backoff_ms(attempt), do: @base_backoff_ms * :math.pow(3, attempt) |> trunc()
end
```

### 4.5 GoalGraphUpdater

After an outcome is reported to Graphonomous, the updater checks whether the outcome satisfies or fails any active goal that this action was pursuing.

```elixir
defmodule OpenSentience.OutcomeReporter.GoalGraphUpdater do
  @moduledoc """
  Updates Graphonomous GoalGraph nodes based on action outcomes.
  
  Called after GraphBridge succeeds. Uses the outcome's goal_id (if present)
  to determine whether a goal should transition states.
  
  Goal state machine:
    :active → :completed   (outcome meets completion_criteria)
    :active → :failed      (outcome is :failure and goal has no retry budget)
    :active → :suspended   (system-level suspension, not outcome-driven)
    :failed → :active      (explicit retry, resets retry budget)
  
  Completion criteria evaluation is goal-specific — the criteria struct
  on the GoalGraph node defines what counts as success.
  """

  @spec maybe_update_goal(outcome()) :: :ok | {:error, binary()}
  def maybe_update_goal(%{goal_id: nil}), do: :ok
  def maybe_update_goal(%{goal_id: goal_id} = outcome) do
    with {:ok, goal} <- fetch_goal(goal_id),
         new_status  <- evaluate_completion(goal, outcome) do
      if new_status != goal.status do
        update_goal_status(goal_id, new_status, outcome)
      else
        :ok
      end
    end
  end

  defp evaluate_completion(goal, outcome) do
    case {goal.completion_criteria, outcome.status} do
      {%{type: "outcome_threshold", target: threshold}, :success} ->
        if outcome.evidence.confidence >= threshold, do: :completed, else: goal.status

      {%{type: "outcome_threshold"}, :failure} ->
        if goal.retry_budget <= 0, do: :failed, else: goal.status

      {%{type: "metric_change", metric: _m, target: _t}, :success} ->
        # Delegate to metric evaluator — outcome payload must contain the metric
        evaluate_metric_criteria(goal.completion_criteria, outcome.evidence.payload)

      {_, :timeout} ->
        goal.status  # Timeout doesn't fail a goal — session resumes

      _ ->
        goal.status
    end
  end
end
```

---

## 5. Causal Context Propagation

The `causal_context` field is what makes outcome reporting meaningful rather than just logging. Here is how it flows through the system end-to-end.

### 5.1 How causal_context Gets Set

When a reasoning model calls `retrieve_context` on Graphonomous before acting, it receives a response that includes retrieved node IDs. OpenSentience's MCP server intercepts this response and injects the node IDs into the current action's `causal_context`:

```elixir
# In OpenSentience.MCPServer — wraps Graphonomous's MCP surface
def handle_tool_call("graphonomous:retrieve_context", args, session) do
  # Forward to Graphonomous
  {:ok, response} = Graphonomous.MCP.call("retrieve_context", args)

  # Extract the node IDs that were returned
  node_ids = extract_node_ids(response)

  # Register these as the causal context for the *next* action in this session
  LifecycleManager.set_pending_causal_context(session.id, node_ids)

  {:ok, response}
end
```

When the agent then calls a tool that takes an action (writes a file, calls an API, updates a database), the `causal_context` is automatically attached:

```elixir
def handle_tool_call(tool_name, args, session) when tool_name != "graphonomous:retrieve_context" do
  causal_context = LifecycleManager.pop_pending_causal_context(session.id)

  action = %{
    id: generate_id(),
    agent_id: session.agent_id,
    session_id: session.id,
    goal_id: session.active_goal_id,
    tool: tool_name,
    arguments: args,
    causal_context: causal_context,  # ← the nodes that led to this action
    initiated_at: DateTime.utc_now(),
    timeout_ms: get_timeout(tool_name)
  }

  ActionExecutor.execute(action)
end
```

This design means **causal attribution is automatic**. The reasoning model doesn't need to know about it. The developer doesn't need to configure it. Any time a retrieve → act pattern occurs (which is the normal agentic loop), causal context flows through.

### 5.2 The Causal Attribution Contract

For Graphonomous to update node confidence correctly from `learn_from_outcome`, the GraphBridge must communicate:

- **Which nodes were used** (`causal_node_ids`)
- **What happened** (`result_status`, `evidence_type`)
- **How reliable the evidence is** (`confidence`)
- **Whether the outcome was goal-directed** (`goal_id`, if present)

Goal-directed outcomes carry more weight in confidence updates than exploratory or unattributed actions. A node that was used in service of a goal that succeeded should see stronger confidence increase than a node used in an ambiguous side-effect action.

This weighting is Graphonomous's responsibility to implement — OpenSentience just needs to pass the `goal_id` correctly.

---

## 6. Session and Lifecycle Management

### 6.1 Session State

Each agent session has a lifecycle managed by the `LifecycleManager`:

```elixir
@type session :: %{
  id: session_id(),
  agent_id: agent_id(),
  active_goal_id: goal_id() | nil,
  pending_causal_context: [binary()],   # Node IDs from most recent retrieve_context
  action_history: [action_id()],        # In-session action log
  started_at: DateTime.t(),
  last_active_at: DateTime.t(),
  status: :active | :idle | :suspended | :completed
}
```

Sessions are held in ETS for fast access during execution. They are also persisted to SQLite so that agents can resume across restarts. Session resumption loads the active_goal_id from Graphonomous's GoalGraph — the goal persists in the graph, the session state wraps around it.

### 6.2 Goal Registration

When a session starts with an active goal, or when a new goal is identified mid-session, the LifecycleManager registers it with Graphonomous:

```elixir
def register_goal(session_id, goal_spec) do
  # Create goal node in Graphonomous
  {:ok, goal_id} = Graphonomous.MCP.call("goal_create", %{
    content: goal_spec.content,
    criteria: goal_spec.completion_criteria,
    horizon: goal_spec.horizon,
    parent_id: goal_spec.parent_goal_id
  })

  # Associate goal with this session
  update_session(session_id, active_goal_id: goal_id)

  {:ok, goal_id}
end
```

### 6.3 Session Resumption

```elixir
def resume_session(agent_id) do
  case find_suspended_session(agent_id) do
    {:ok, session} ->
      # Reload active goals from Graphonomous
      {:ok, active_goals} = Graphonomous.MCP.call("goal_retrieve_active", %{
        agent_id: agent_id
      })

      resumed_session = %{session |
        active_goal_id: List.first(active_goals, %{})[:id],
        status: :active,
        last_active_at: DateTime.utc_now()
      }

      update_session(session.id, resumed_session)
      {:ok, resumed_session}

    :not_found ->
      start_fresh_session(agent_id)
  end
end
```

This is what goal persistence looks like in practice. The goal lives in Graphonomous's durable graph. The session is a lightweight wrapper that reconnects to it.

---

## 7. MCP Interface

OpenSentience exposes its own MCP surface to reasoning models. The reasoning model calls OpenSentience tools; OpenSentience internally calls Graphonomous and other infrastructure.

### 7.1 MCP Tools Exposed

```
session_start(agent_id, goal? )
  → session_id, active_goal_id?
  → Starts or resumes a session for this agent

session_end(session_id, reason)
  → :ok
  → Closes session, flushes pending outcomes to retry buffer

goal_register(session_id, content, criteria, horizon, parent_id?)
  → goal_id
  → Creates goal in Graphonomous and registers with session

goal_status(goal_id)
  → {status, completion_pct, last_outcome_summary}
  → Current goal state with evidence summary

execute_action(session_id, tool, arguments)
  → {result, outcome_id, causal_attribution_summary}
  → The main action tool — executes, captures outcome, reports to Graphonomous
  → Returns causal attribution summary so the model can reason about what it learned

report_outcome_manual(session_id, action_id, status, evidence)
  → :ok
  → For human-in-the-loop feedback — lets a human explicitly rate an action outcome
  → Highest-confidence evidence signal available

coverage_check(session_id, task_description)
  → {coverage_score, recommendation, knowledge_gaps}
  → Proxies to Graphonomous coverage_query
  → Lets agent check epistemic readiness before acting
```

### 7.2 The execute_action Tool in Detail

`execute_action` is the most important tool. It is the action-execution surface that wraps every non-retrieval action an agent takes.

```elixir
# What the MCP handler does when execute_action is called:
def handle_execute_action(session_id, tool, arguments) do
  session = LifecycleManager.get_session(session_id)
  causal_context = LifecycleManager.pop_pending_causal_context(session_id)

  action = build_action(session, tool, arguments, causal_context)

  with {:ok, result, duration_ms}  <- ActionExecutor.execute(action),
       {:ok, outcome}              <- Classifier.classify(action, result, duration_ms),
       {:ok, _}                    <- GraphBridge.report(outcome),
       :ok                         <- GoalGraphUpdater.maybe_update_goal(outcome) do

    attribution_summary = summarize_attribution(outcome)
    {:ok, {result, outcome.id, attribution_summary}}
  end
end
```

The `attribution_summary` is a brief natural-language description of what causal nodes were updated — e.g. "Updated confidence for 3 nodes related to 'customer_data_retrieval'. Node 'use_pagination_for_large_queries' confidence increased from 0.71 → 0.84." This gives the reasoning model explicit awareness that it learned something from this action, which supports better decision-making in subsequent actions.

---

## 8. Schema

OpenSentience uses its own SQLite database (separate from Graphonomous's).

```sql
-- Agent sessions
CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  agent_id      TEXT NOT NULL,
  active_goal_id TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  started_at    TEXT NOT NULL,
  last_active_at TEXT NOT NULL,
  metadata      JSON
);

-- Action log
CREATE TABLE actions (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES sessions(id),
  agent_id         TEXT NOT NULL,
  goal_id          TEXT,
  tool             TEXT NOT NULL,
  arguments        JSON NOT NULL,
  causal_context   JSON NOT NULL DEFAULT '[]',
  initiated_at     TEXT NOT NULL,
  timeout_ms       INTEGER NOT NULL
);

-- Outcome log
CREATE TABLE outcomes (
  id            TEXT PRIMARY KEY,
  action_id     TEXT NOT NULL REFERENCES actions(id),
  agent_id      TEXT NOT NULL,
  goal_id       TEXT,
  status        TEXT NOT NULL,
  result        JSON,
  error         TEXT,
  evidence_type TEXT NOT NULL,
  evidence_payload JSON,
  confidence    REAL NOT NULL,
  duration_ms   INTEGER NOT NULL,
  observed_at   TEXT NOT NULL,
  reported_at   TEXT
);

-- Retry buffer (persisted queue for failed Graphonomous reports)
CREATE TABLE retry_buffer (
  id            TEXT PRIMARY KEY,
  outcome_json  JSON NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE INDEX idx_sessions_agent    ON sessions(agent_id, status);
CREATE INDEX idx_actions_session   ON actions(session_id);
CREATE INDEX idx_outcomes_action   ON outcomes(action_id);
CREATE INDEX idx_retry_next        ON retry_buffer(next_retry_at);
```

---

## 9. Configuration

```elixir
# config/config.exs
config :open_sentience,
  graphonomous_endpoint: "http://localhost:4001/mcp",
  deliberatic_endpoint: "http://localhost:4002/mcp",   # optional
  db_path: "./data/opensentience.db",
  action_default_timeout_ms: 30_000,
  retry_buffer_retention_days: 7,
  session_idle_timeout_ms: 3_600_000,  # 1 hour
  causal_context_window: 20            # max nodes carried as causal context

# config/runtime.exs
config :open_sentience,
  graphonomous_endpoint: System.get_env("GRAPHONOMOUS_ENDPOINT", "http://localhost:4001/mcp")
```

---

## 10. Dependencies

```elixir
# mix.exs
defp deps do
  [
    {:anubis_mcp, "~> 0.17"},          # MCP server + client — https://github.com/zoedsoupe/anubis-mcp
    {:exqlite, "~> 0.23"},             # SQLite (same as Graphonomous)
    {:jason, "~> 1.4"},                # JSON
    {:telemetry, "~> 1.2"},            # Metrics and tracing
    {:telemetry_metrics, "~> 0.6"},
    {:plug_cowboy, "~> 2.7"}           # HTTP server for health checks
  ]
end
```

**Optional dependency:** add `{:req, "~> 0.5"}` only if OpenSentience needs outbound non-MCP HTTP (external webhooks/APIs, etc). MCP transport for Graphonomous/Deliberatic uses `Anubis.Client` (`streamable_http`) and does not require `req`.

> **Note on anubis_mcp:** This is the active fork of the original `hermes_mcp` library, maintained by the original author (zoedsoupe) after leaving CloudWalk. The fork occurred at v0.13.0 in July 2025. Module namespace changed from `Hermes` to `Anubis`. Use `anubis_mcp` — `hermes_mcp` on Hex is unmaintained. Latest Hex publish is `0.14.1`; the GitHub README references `0.17.0` — pin to whichever is current on Hex at implementation time.

No LLM dependency. OpenSentience never calls a model. It executes actions, classifies outcomes, and reports feedback. Classification is deterministic. Any intelligence is provided by the reasoning model above it or Graphonomous below it.

---

## 11. Implementation Phases

### Phase 0 — Skeleton (1–2 weeks)
```
mix new open_sentience --sup
Add deps, verify compile
SQLite schema + migrations
Session CRUD — start/end/resume
Basic MCP server — session_start, session_end
Integration test: Claude Desktop → OpenSentience → session created
```

### Phase 1 — Action Loop (2–3 weeks)
```
ActionExecutor.execute/1 — actual tool dispatch
OutcomeClassifier — rule-based, tests for each status
execute_action MCP tool
Audit log — all actions and outcomes persisted
Integration test: agent takes action, outcome logged
```

### Phase 2 — Outcome Reporting (2–3 weeks)
```
GraphBridge — learn_from_outcome calls to Graphonomous
RetryBuffer — SQLite-backed, exponential backoff
Causal context propagation — retrieve → act → attribute
Integration test: retrieve_context → execute_action → Graphonomous nodes updated
```

### Phase 3 — Goal Lifecycle (1–2 weeks)
```
goal_register MCP tool
GoalGraphUpdater — completion criteria evaluation
Session resumption with goal reload
Integration test: goal created → actions taken → goal marked complete
```

### Phase 4 — Deliberatic Integration (post-Graphonomous users)
```
Conflict detection: when action outcome contradicts recent Graphonomous retrieve
Trigger Deliberatic deliberation session on contradiction
Feed Deliberatic conclusion back as high-confidence outcome evidence
```

---

## 12. What This Spec Enables

With OpenSentience implemented, the [&] autonomy loop is complete:

```
Agent has a goal (Graphonomous GoalGraph)
    │
    ▼
Agent queries knowledge before acting (Graphonomous retrieve_context)
    │  causal_context populated
    ▼
Agent acts (OpenSentience execute_action)
    │  action dispatched, outcome captured
    ▼
Outcome classified, reported to Graphonomous (GraphBridge)
    │  node confidence updated from real outcome data
    ▼
Goal status updated if criteria met (GoalGraphUpdater)
    │
    ▼
Next action informed by updated graph
    │  causal confidence of previously-used nodes reflects empirical results
    ▼
[repeat — the graph gets better from every deployment cycle]
```

This is not a theoretical loop. Every component has a concrete implementation path. The feedback from real agent deployments flows directly into the knowledge graph that informs future agent decisions.

That is what "autonomous" means in the [&] stack — not autonomous in the sense of unsupervised or unconstrained, but autonomous in the sense that **the system improves its own decision-making from its own experience, without requiring retraining or human intervention to incorporate what it learned.**

---

## 13. Open Questions

**Q1: Multi-agent sessions.** When multiple agents share a Graphonomous instance, conflicting causal updates from simultaneous sessions could create inconsistency. Should outcome reporting be batched and serialized? Or should Graphonomous's consolidation cycle handle conflicts? Recommendation: use Graphonomous's ETS cache as a write buffer, let consolidation batch conflicts. OpenSentience doesn't need to solve this — it just needs to report faithfully.

**Q2: Outcome poisoning.** A badly-behaved or compromised agent could flood the retry buffer with false outcomes, poisoning the knowledge graph with false causal feedback. Mitigation: confidence threshold on graph updates (below 0.5 confidence, outcome is logged but not used for confidence updates). Rate limiting per agent_id on learn_from_outcome calls.

**Q3: FleetPrompt integration.** FleetPrompt sells domain-specific CL strategies. Those strategies need to know about outcome signals to know when to fire. Does OpenSentience publish an event bus that FleetPrompt strategies subscribe to? Or does Graphonomous pull FleetPrompt strategies during consolidation? Recommendation: event bus via `telemetry` — OpenSentience emits `[:open_sentience, :outcome, :reported]` events, FleetPrompt strategies are telemetry handlers. Clean separation.

**Q4: Deliberatic trigger threshold.** When should OpenSentience automatically escalate an outcome to Deliberatic? If an action that was highly confident in its causal nodes fails, that's a contradiction worth deliberating. Proposed rule: if `outcome.evidence.confidence >= 0.9` AND `outcome.status == :failure` AND the causal_context includes nodes with `confidence >= 0.8`, escalate to Deliberatic. This is the signal that the knowledge graph had a high-confidence belief that turned out to be wrong — exactly the case formal argumentation is designed for.

---

*Specification written for [&] Ampersand Box Design, February 2026.*  
*Implements the outcome reporting pipeline identified as the critical missing conduit in the [&] AGI infrastructure analysis.*  
*Depends on: Graphonomous v0.1+ (memory layer), anubis_mcp ~> 0.17 (MCP transport)*  
*Required before: Deliberatic integration, FleetPrompt event system, AgenTroMatic workflow orchestration*
