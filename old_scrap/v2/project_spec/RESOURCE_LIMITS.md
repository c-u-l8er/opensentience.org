# Resource Limits & Sandboxing — OpenSentience Core

**Status:** Hardening track (staged).  
- Phase 2: portable, policy-level limits (timeouts/concurrency/rate limits/bounded logs)  
- Phase 3+: optional OS-level enforcement (Linux cgroups; other OSes later)  
**Dependencies:** Phase 1 Launcher, Phase 2 Protocol (and ToolRouter for call-level enforcement)  
**Integrates with:** `agent_marketplace.md` Section 9 (Launcher), `security-guardrails.md`, `RUNTIME_PROTOCOL.md` (timeouts, framing limits)

## Architecture compatibility notes

These notes exist to prevent “resource limits” from drifting into the wrong layer (e.g., discovery, manifest parsing, or agent code).

### Boundaries (who enforces what)

- **Discovery / indexing boundary (filesystem-only)**
  - Discovery MUST remain non-executing and side-effect-free.
  - Resource limits MUST NOT require network calls, embedding providers, or executing agent code.
  - Manifest `resources` / `execution_limits` are safe to *parse and display*, but enforcement happens later.

- **ToolRouter boundary (portable, Phase 2)**
  - ToolRouter is the primary enforcement point for **portable** limits:
    - per-call timeouts (honor `timeout_ms` from `core.tool.call`, with Core-configured caps allowed)
    - concurrency limits (inflight calls per agent/tool)
    - rate limits (calls per time window per agent and/or caller)
    - bounded payload handling (reject/deny oversized tool call inputs where applicable)
  - ToolRouter must produce **structured, secret-free errors** for limit denials and record audit events (per the portfolio guardrails).

- **Launcher boundary (process-level, Phase 3+)**
  - Launcher is the enforcement point for **process containment**:
    - bounded stdout/stderr capture
    - restart/kill policies
    - (optional) OS-level CPU/memory containment (Linux cgroups v2 first)
  - If OS-level enforcement kills an agent, Core must surface:
    - a clear stop reason
    - a secret-free audit trail
    - the affected run id / agent id

### Runtime protocol coupling (what this depends on)

- `RUNTIME_PROTOCOL.md` already provides key enforcement hooks:
  - `core.tool.call.payload.timeout_ms` for call-level timeouts
  - `max_frame_bytes` / framing limits for safe-by-default payload bounds
  - `core.tool.cancel` for best-effort cancellation of long-running work
  - heartbeats for health; Core can stop routing to unhealthy agents
- Resource limit failures must remain **observable** and **correlatable**:
  - attach `request_id` / `correlation_id` in audit/logging wherever applicable
  - avoid persisting raw tool inputs/outputs; store safe summaries only

### Storage posture (avoid accidental secrets)
- No secrets in durable artifacts:
  - limit configs may be stored
  - usage metrics may be stored in aggregate (bounded)
  - raw prompts, raw outputs, raw env values, and API keys must not be persisted

---

## 0) Problem Statement

Agents run as separate OS processes, but without resource controls:
- A malicious/buggy agent could consume 100% CPU
- An agent could allocate all available memory
- An agent could fill disk with logs
- An agent could open thousands of network connections

**This breaks the "safe-by-default" principle.**

---

## 1) Goals

Resource limits must be introduced in a way that preserves the portfolio invariants:
- Discovery/indexing stays non-executing (no side effects).
- Enforcement happens at clear boundaries (ToolRouter + Launcher).
- Failures are observable and auditable, without storing secrets.

### 1.1 Staged goals (portable first)
**Phase 2 (portable / cross-platform “policy limits”):**
- Enforce **per-tool-call timeouts** (use `timeout_ms` from `core.tool.call`, and allow Core to enforce stricter ceilings).
- Enforce **max concurrent tool calls** per agent and/or per tool.
- Enforce **rate limits** (calls per time window) per agent and/or per caller.
- Enforce **bounded logs and bounded message sizes** (protocol framing already defines `max_frame_bytes`).
- Provide clear, structured errors when limits are exceeded.

**Phase 3+ (advanced / OS-level enforcement):**
- Optionally enforce CPU/memory via OS mechanisms (Linux cgroups v2 first).
- Extend to additional OS-specific enforcement only when implementation is reliable and testable.

**Future / enterprise:**
- Per-user quotas and multi-tenant budgeting (only once “user” and “tenant” are first-class in Core).

---

## 2) Manifest Declaration

### 2.1 Agent Manifest Enhancement (optional, informational first)

Agents may declare resource needs and execution limits in `opensentience.agent.json` for operator visibility and future enforcement.

Important:
- These fields are **not required for MVP functionality**.
- Core may apply **stricter operator-configured limits** regardless of what an agent requests.
- Any enforcement decisions must be made at runtime boundaries (ToolRouter/Launcher), not during discovery.
- Internally, Core should normalize units to machine-friendly values (bytes, milliseconds, counts) even if the manifest uses human-friendly units.

```json
{
  "id": "com.example.git-analyzer",
  "name": "Git Analyzer",
  "version": "1.0.0",
  ...
  
  "resources": {
    "cpu": {
      "request": "100m",
      "limit": "500m"
    },
    "memory": {
      "request": "128Mi",
      "limit": "512Mi"
    },
    "disk": {
      "limit": "1Gi"
    },
    "network": {
      "bandwidth_limit": "10Mbps",
      "max_connections": 100
    }
  },
  
  "execution_limits": {
    "max_tool_call_duration": "30s",
    "max_concurrent_calls": 5,
    "rate_limit": "100/minute"
  }
}
```

**Units:**
- CPU: millicores (`100m` = 0.1 core, `1000m` = 1 core)
- Memory: `Mi` (mebibytes), `Gi` (gibibytes)
- Disk: `Mi`, `Gi`
- Bandwidth: `Mbps`, `Gbps`
- Duration: `s`, `m`, `h`

### 2.2 Defaults

If not specified in manifest:

```elixir
@default_resources %{
  cpu: %{request: "50m", limit: "200m"},
  memory: %{request: "64Mi", limit: "256Mi"},
  disk: %{limit: "100Mi"},
  network: %{bandwidth_limit: "5Mbps", max_connections: 50}
}

@default_execution_limits %{
  max_tool_call_duration: "15s",
  max_concurrent_calls: 3,
  rate_limit: "60/minute"
}
```

---

## 3) Enforcement Architecture

OpenSentience should enforce limits at two layers:

1) **ToolRouter-level (portable, recommended first)**
- timeouts, concurrency, rate limiting, and bounded payload/log handling

2) **Launcher/OS-level (advanced, optional)**
- CPU/memory controls via OS primitives (Linux cgroups v2 first)

OS-level enforcement is intentionally treated as an advanced track because:
- cross-platform implementations vary widely,
- reliable measurement/enforcement requires careful testing,
- the portfolio already has strong isolation + permission boundaries, so portable limits deliver most value early.

### 3.1 Linux (cgroups v2) — optional advanced enforcement

```elixir
defmodule OpenSentience.Launcher.Cgroups do
  @moduledoc """
  Manages cgroup limits for agent processes (Linux only).
  Requires: cgroup v2 mounted at /sys/fs/cgroup
  """
  
  def create_cgroup(agent_id, resources) do
    cgroup_path = "/sys/fs/cgroup/opensentience/agents/#{agent_id}"
    File.mkdir_p!(cgroup_path)
    
    # CPU limit
    set_cpu_limit(cgroup_path, resources.cpu.limit)
    
    # Memory limit
    set_memory_limit(cgroup_path, resources.memory.limit)
    
    # I/O limits (disk)
    set_io_limit(cgroup_path, resources.disk.limit)
    
    {:ok, cgroup_path}
  end
  
  defp set_cpu_limit(path, limit) do
    # Convert millicores to cgroup format
    # 100m = 10,000 (10% of 100,000 period)
    quota = parse_millicores(limit) * 100
    period = 100_000
    
    File.write!(Path.join(path, "cpu.max"), "#{quota} #{period}")
  end
  
  defp set_memory_limit(path, limit) do
    # Convert Mi/Gi to bytes
    bytes = parse_memory(limit)
    
    File.write!(Path.join(path, "memory.max"), "#{bytes}")
    File.write!(Path.join(path, "memory.swap.max"), "0")
  end
  
  def add_process(cgroup_path, pid) do
    File.write!(Path.join(cgroup_path, "cgroup.procs"), "#{pid}")
  end
end
```

### 3.2 macOS (launchd resource limits)

```elixir
defmodule OpenSentience.Launcher.MacOSLimits do
  @moduledoc """
  Sets resource limits via launchd plist (macOS).
  """
  
  def apply_limits(pid, resources) do
    # Use setrlimit via Port/NIF
    set_rlimit(:cpu, pid, resources.cpu.limit)
    set_rlimit(:memory, pid, resources.memory.limit)
    set_rlimit(:fsize, pid, resources.disk.limit)
  end
  
  defp set_rlimit(type, pid, limit) do
    # Call OS-level setrlimit
    System.cmd("renice", ["+10", "-p", "#{pid}"]) # nice value for CPU
    # ... use ulimit or setrlimit(2) via NIF
  end
end
```

### 3.3 Windows (Job Objects)

```elixir
defmodule OpenSentience.Launcher.WindowsLimits do
  @moduledoc """
  Uses Windows Job Objects for resource limits.
  Requires FFI or Port to Win32 API.
  """
  
  def create_job_object(agent_id, resources) do
    job_name = "opensentience_#{agent_id}"
    
    # Create job object
    job_handle = :win32.create_job_object(job_name)
    
    # Set limits
    :win32.set_job_cpu_rate_limit(job_handle, resources.cpu.limit)
    :win32.set_job_memory_limit(job_handle, resources.memory.limit)
    
    {:ok, job_handle}
  end
  
  def assign_process(job_handle, pid) do
    :win32.assign_process_to_job(job_handle, pid)
  end
end
```

---

## 4) Runtime Enforcement

### 4.1 Launcher Integration

```elixir
defmodule OpenSentience.Launcher do
  def start_agent(agent_id, opts \\ []) do
    agent = Catalog.get_agent!(agent_id)
    resources = agent.resources || default_resources()
    
    # Setup resource controls BEFORE starting process
    {:ok, cgroup_or_job} = 
      case :os.type() do
        {:unix, :linux} -> Cgroups.create_cgroup(agent_id, resources)
        {:unix, :darwin} -> {:ok, :macos_rlimit}
        {:win32, _} -> WindowsLimits.create_job_object(agent_id, resources)
      end
    
    # Start process
    {:ok, pid} = start_process(agent_id, opts)
    
    # Attach process to cgroup/job
    apply_limits(cgroup_or_job, pid, resources)
    
    # Monitor resource usage
    schedule_resource_check(agent_id, pid)
    
    {:ok, pid}
  end
  
  defp schedule_resource_check(agent_id, pid) do
    Process.send_after(self(), {:check_resources, agent_id, pid}, 1_000)
  end
  
  def handle_info({:check_resources, agent_id, pid}, state) do
    usage = get_resource_usage(pid)
    
    # Check if approaching limits
    if usage.memory > 0.9 * agent.resources.memory.limit do
      Logger.warn("Agent #{agent_id} approaching memory limit: #{usage.memory}")
      emit_audit_event("agent.resource_warning", agent_id, usage)
    end
    
    # Check if exceeded hard limits
    if usage.memory > agent.resources.memory.limit do
      Logger.error("Agent #{agent_id} exceeded memory limit, killing")
      stop_agent(agent_id, reason: :resource_limit_exceeded)
    end
    
    # Schedule next check
    schedule_resource_check(agent_id, pid)
    
    {:noreply, state}
  end
end
```

### 4.2 Rate Limiting (Tool Call Level)

```elixir
defmodule OpenSentience.RateLimiter do
  @moduledoc """
  Rate limits tool calls per agent.
  Uses token bucket algorithm.
  """
  
  def check_rate_limit(agent_id) do
    rate_limit = get_agent_rate_limit(agent_id) # e.g., "100/minute"
    
    case Hammer.check_rate("tool_call:#{agent_id}", rate_limit.period, rate_limit.count) do
      {:allow, _count} ->
        :ok
      
      {:deny, _limit} ->
        {:error, :rate_limit_exceeded}
    end
  end
end
```

---

## 5) Monitoring & Observability

### 5.1 Resource Usage Metrics

```elixir
defmodule OpenSentience.Metrics.Resources do
  @moduledoc """
  Exposes resource usage metrics for agents.
  """
  
  def get_usage(agent_id) do
    pid = Launcher.get_pid(agent_id)
    
    %{
      cpu_percent: get_cpu_usage(pid),
      memory_bytes: get_memory_usage(pid),
      disk_bytes: get_disk_usage(agent_id),
      network_connections: get_connection_count(pid),
      network_bytes_sent: get_network_sent(pid),
      network_bytes_received: get_network_received(pid)
    }
  end
  
  defp get_cpu_usage(pid) do
    # Read from /proc/<pid>/stat (Linux)
    # or use Process.info/2 (cross-platform)
    case :os.type() do
      {:unix, :linux} ->
        {utime, stime} = parse_proc_stat(pid)
        calculate_cpu_percent(utime, stime)
      
      _ ->
        # Fallback: use System.cmd or Port
        :unknown
    end
  end
end
```

### 5.2 Admin UI Display

```heex
<div class="agent-resources">
  <h4><%= @agent.name %> Resources</h4>
  
  <div class="resource-meter">
    <label>CPU</label>
    <progress value="<%= @usage.cpu_percent %>" max="100"></progress>
    <span><%= format_percent(@usage.cpu_percent) %> / <%= @limits.cpu.limit %></span>
  </div>
  
  <div class="resource-meter">
    <label>Memory</label>
    <progress value="<%= @usage.memory_bytes %>" max="<%= @limits.memory.limit %>"></progress>
    <span><%= format_bytes(@usage.memory_bytes) %> / <%= @limits.memory.limit %></span>
  </div>
  
  <div class="resource-meter">
    <label>Disk</label>
    <progress value="<%= @usage.disk_bytes %>" max="<%= @limits.disk.limit %>"></progress>
    <span><%= format_bytes(@usage.disk_bytes) %> / <%= @limits.disk.limit %></span>
  </div>
  
  <div class="rate-limit-status">
    <span>Tool calls: <%= @usage.tool_calls_last_minute %> / <%= @limits.rate_limit %></span>
  </div>
</div>
```

---

## 6) Error Handling

### 6.1 Limit Exceeded Errors

When an agent exceeds a hard limit:
1. Kill the agent process
2. Record reason in `runs` table
3. Emit audit event
4. Return structured error

```elixir
defmodule OpenSentience.Errors do
  defexception [:message, :code, :agent_id, :limit_type, :usage, :limit]
  
  def limit_exceeded(agent_id, type, usage, limit) do
    %__MODULE__{
      message: "Agent exceeded #{type} limit",
      code: "resource_limit_exceeded",
      agent_id: agent_id,
      limit_type: type,
      usage: usage,
      limit: limit
    }
  end
end
```

### 6.2 User-Facing Messages

```
Error: Agent 'com.example.heavy-agent' exceeded memory limit

Used: 512 MB
Limit: 256 MB

This agent requested 256 MB but used 512 MB. This may indicate:
1. The agent has a memory leak
2. The agent needs a higher limit (update manifest)
3. The input was unusually large

Actions:
- Review agent logs for errors
- Contact agent author
- Increase memory limit (if trusted)
```

---

## 7) Per-User Quotas

### 7.1 Quota Schema

```sql
CREATE TABLE user_quotas (
  user_id TEXT PRIMARY KEY,
  max_agents INTEGER DEFAULT 10,
  max_cpu_cores REAL DEFAULT 2.0,
  max_memory_gb REAL DEFAULT 4.0,
  max_disk_gb REAL DEFAULT 10.0,
  max_tool_calls_per_hour INTEGER DEFAULT 1000
);

CREATE TABLE user_resource_usage (
  user_id TEXT PRIMARY KEY,
  current_agents INTEGER DEFAULT 0,
  current_cpu_cores REAL DEFAULT 0.0,
  current_memory_gb REAL DEFAULT 0.0,
  current_disk_gb REAL DEFAULT 0.0,
  tool_calls_last_hour INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);
```

### 7.2 Quota Enforcement

```elixir
defmodule OpenSentience.Quotas do
  def check_quota(user_id, agent_id) do
    quota = get_user_quota(user_id)
    usage = get_user_usage(user_id)
    agent = Catalog.get_agent!(agent_id)
    
    cond do
      usage.current_agents >= quota.max_agents ->
        {:error, :quota_exceeded, :max_agents}
      
      usage.current_cpu_cores + agent.resources.cpu.limit > quota.max_cpu_cores ->
        {:error, :quota_exceeded, :cpu}
      
      usage.current_memory_gb + agent.resources.memory.limit > quota.max_memory_gb ->
        {:error, :quota_exceeded, :memory}
      
      true ->
        :ok
    end
  end
end
```

---

## 8) Configuration

```elixir
# config/config.exs
config :opensentience, :resource_limits,
  # Global enforcement
  enabled: true,
  enforcement_mode: :hard, # :hard (kill) or :soft (throttle)
  
  # Check interval
  monitor_interval_ms: 1_000,
  
  # Defaults for agents without manifest limits
  default_cpu_limit: "200m",
  default_memory_limit: "256Mi",
  default_disk_limit: "100Mi",
  
  # Kill grace period
  kill_grace_period_ms: 5_000

config :opensentience, :quotas,
  enabled: true,
  default_user_quota: %{
    max_agents: 10,
    max_cpu_cores: 2.0,
    max_memory_gb: 4.0,
    max_disk_gb: 10.0,
    max_tool_calls_per_hour: 1000
  }
```

---

## 9) Testing

### 9.1 Limit Enforcement Tests

```elixir
defmodule OpenSentience.Launcher.LimitsTest do
  use OpenSentience.DataCase
  
  @tag :slow
  test "kills agent that exceeds memory limit" do
    # Create agent with low memory limit
    agent = create_agent(
      id: "memory-hog",
      resources: %{memory: %{limit: "64Mi"}}
    )
    
    # Start agent
    {:ok, pid} = Launcher.start_agent(agent.id)
    
    # Agent allocates too much memory (simulated)
    simulate_memory_allocation(pid, "128Mi")
    
    # Wait for monitor to kill it
    assert_receive {:agent_killed, ^agent.id, :memory_limit_exceeded}, 2_000
    refute Process.alive?(pid)
  end
  
  test "respects rate limit for tool calls" do
    agent = create_agent(id: "rate-limited", rate_limit: "5/second")
    
    # Make 5 calls (should succeed)
    for _ <- 1..5 do
      assert :ok = RateLimiter.check_rate_limit(agent.id)
    end
    
    # 6th call should fail
    assert {:error, :rate_limit_exceeded} = RateLimiter.check_rate_limit(agent.id)
  end
end
```

---

## 10) Migration Path

### Phase 1: Existing bounds (already in motion)
- Bounded log capture (size/line limits) and safe-by-default redaction posture.
- Protocol framing limits (`max_frame_bytes`) as a safety boundary.

### Phase 2: Portable enforcement (recommended next)
- ToolRouter-enforced **timeouts** (respect `timeout_ms`, optionally cap it).
- ToolRouter-enforced **max concurrency** per agent/tool.
- ToolRouter-enforced **rate limits** per agent/caller.
- Clear, structured “limit exceeded” errors + audit events (secret-free).

### Phase 3: Linux-only OS enforcement (optional)
- Add cgroups v2 support for CPU/memory, behind a feature flag and only when available.

### Phase 4+: Cross-platform OS enforcement (optional)
- Only after the Linux path is proven and tested.
- Treat macOS/Windows enforcement as “best-effort” unless backed by robust primitives and tests.

### Future: Quotas / multi-tenancy
- Per-user quotas are a separate track and depend on first-class user/tenant concepts in Core.

---

## 11) Acceptance Criteria

This spec is considered successful when **portable limits** materially reduce blast radius and “cost explosions”, and OS-level enforcement is treated as an optional hardening layer.

### Phase 2 (portable) acceptance
- [ ] ToolRouter enforces per-call timeouts (using `timeout_ms`, with Core caps allowed).
- [ ] ToolRouter enforces max concurrent calls per agent/tool.
- [ ] ToolRouter enforces rate limiting to prevent tool-call abuse.
- [ ] Launcher/logging remains bounded (no unbounded stdout/stderr persistence).
- [ ] Clear, structured error codes/messages when limits are exceeded (secret-free).
- [ ] Audit events exist for limit denials / throttling / forced termination (secret-free).

### Phase 3+ (advanced, optional) acceptance
- [ ] Linux cgroups v2 CPU/memory enforcement is supported behind a flag.
- [ ] Agents can be terminated when exceeding hard OS-level limits (with clear audit trail).
- [ ] Admin UI can display basic resource information when available (best-effort; avoid implying cross-platform parity).

Per-user quotas and “full multi-tenant budgeting” are explicitly out of scope unless Core models users/tenants as first-class entities.

---

## 12) Security Implications

Resource limits are a **security feature**:
- Prevent DoS from malicious/buggy agents
- Contain blast radius (one agent can't take down Core)
- Enable multi-tenancy (users can't exhaust shared resources)
- Provide cost predictability (limit API/LLM costs)

---

**Document Status:** Ready for implementation (Phase 3)  
**Dependencies:** Phase 1 Launcher, Phase 2 Protocol  
**Estimated Effort:** 2-3 weeks (solo dev, OS-specific code)
