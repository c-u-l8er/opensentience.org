# OpenSentience Runtime Protocol (Core ↔ Agent) — v1
## Concrete message envelope + framing specification

This document defines the **v1 runtime protocol** between **OpenSentience Core** and an **OpenSentience Agent** process.

It makes the protocol concrete by specifying:
- transport expectations (local-first)
- framing (how bytes become messages)
- a standard message envelope (fields and semantics)
- a minimal set of message types required for MVP (handshake, tool registration, tool calls, streaming, cancellation, heartbeats, structured errors)

This spec is designed to align with portfolio standards:
- namespaced tool identifiers: `<agent_id>/<tool_name>`
- secret-free durable artifacts (logs/audit/signal/directive payloads must never contain secrets)
- side effects should cross explicit intent boundaries (directives) and be auditable

---

## 0) Goals and non-goals

### Goals
1. **Local-first and safe-by-default**
   - Core never loads agent code in-process.
   - Agents run as separate OS processes and communicate over a local transport.

2. **A concrete, debuggable wire protocol**
   - Version negotiation.
   - Correlated request/response.
   - Streaming support (optional but recommended).
   - Cancellation support (best-effort).
   - Heartbeats/health.

3. **Security posture**
   - Core issues a short-lived session token on launch.
   - Agent must authenticate using that token.
   - No secrets in protocol messages (except the authentication token during handshake).

### Non-goals (v1)
- Cross-host networking over the internet.
- End-to-end encryption beyond local socket + token (may be added later).
- A fully generalized pubsub protocol (A2A Traffic is separate).
- Binary/Protobuf encoding (v1 is JSON over framed messages).

---

## 1) Transport

### 1.1 Recommended transport (MVP)
**Unix domain socket** (UDS) with message framing (see Section 2).

Rationale:
- local security via filesystem permissions
- simpler than distributed Erlang for MVP
- avoids exposing TCP listeners by default

### 1.2 Alternative transports (allowed but not specified in detail)
- Local TCP (127.0.0.1) with identical framing rules
- Other local IPC (named pipes, etc.) if they preserve message boundaries and security invariants

If an alternative transport is used, the **message framing and envelope must remain identical**.

---

## 2) Framing (bytes → messages)

### 2.1 Length-prefixed frames (required)
Each message is a **single JSON object**, encoded as UTF-8 bytes, preceded by a **4-byte unsigned big-endian length**.

- `len` = number of bytes in the UTF-8 JSON payload
- Payload follows immediately after the 4-byte length

This avoids ambiguity with newlines and supports streaming at the message level.

### 2.2 Limits (required defaults; configurable)
Core and agent must enforce:
- `max_frame_bytes`: default 4,194,304 (4 MiB)
- `max_inflight_requests`: default 256 per agent connection (Core may throttle)
- `max_tool_input_bytes` and `max_tool_output_bytes`: implementation-defined; Core may enforce lower limits per tool

If a frame exceeds limits:
- receiver must close the connection or reject with a structured error (preferred: close, since parsing may be unsafe)
- Core must record a safe audit event (no payload content)

### 2.3 Ordering
- Messages are processed in the order received on a single connection.
- Requests and responses may be interleaved; correlation is via envelope ids (Section 3).

---

## 3) Standard message envelope (required)

Every protocol message MUST be a JSON object containing at least:

- `v` (integer): protocol version. For this spec: `1`.
- `type` (string): message type (namespaced string; see Section 4).
- `id` (string): unique message id (UUID recommended).
- `ts` (string): RFC3339 timestamp of message creation (sender time).
- `payload` (object): type-specific fields.

### 3.1 Correlation fields (required where applicable)
For request/response-style messages, the envelope must also support:

- `in_reply_to` (string, optional): the `id` of the message being replied to.
- `request_id` (string, optional): stable id for a logical request chain (UUID recommended).
- `correlation_id` (string, optional): ties into portfolio-wide audit timeline (e.g., a chat session id, mission id, or workflow execution id).
- `causation_id` (string, optional): immediate cause (e.g., a directive id, tool call id, or event id).

Rules:
- If Core initiates a `tool.call`, it MUST set `request_id` and SHOULD set `correlation_id`.
- Agent MUST echo `request_id`, `correlation_id`, and `causation_id` back in all messages emitted as part of handling that request (streaming chunks, final result, logs).

### 3.2 Actor attribution (optional but recommended)
Envelope MAY include:

- `actor` (object, optional):
  - `type`: `"human" | "agent" | "system"`
  - `id`: string identifier (e.g., agent id, user id)
  - `display`: optional display name

Core should populate `actor` for tool calls originating from chat/UI. Agents should treat it as metadata only (never as authorization).

### 3.3 Errors (standard shape)
Any message may include an `error` object (either at top-level or within payload; v1 standardizes top-level):

- `error` (object, optional):
  - `code` (string): stable machine-readable code (e.g., `protocol.unauthorized`, `tool.invalid_input`)
  - `message` (string): safe human-readable summary (MUST NOT contain secrets)
  - `details` (object, optional): structured metadata (MUST be secret-free)
  - `retryable` (boolean, optional): whether retry might succeed
  - `where` (string, optional): component tag (e.g., `core.router`, `agent.runtime`)
  - `debug` (object, optional): debug-only fields; MUST be disabled by default and MUST be secret-free even when enabled

A message that includes `error` is still a valid framed message.

---

## 4) Message types (v1 MVP set)

Message type strings are dot-separated and scoped:
- `core.*` messages are sent by Core
- `agent.*` messages are sent by the Agent

### 4.1 Handshake and session
#### 4.1.1 `agent.hello` (Agent → Core) — required
Sent immediately after connection establishment.

Payload:
- `session_token` (string): short-lived token provided by Core on launch (see Section 5)
- `agent_id` (string): must match `opensentience.agent.json` `id`
- `agent_version` (string): semver of the agent
- `manifest_hash` (string, optional): hash of `opensentience.agent.json` (for drift detection)
- `protocol` (object):
  - `supported_versions` (array of integers): e.g., `[1]`
  - `capabilities` (array of strings): e.g., `["tools", "streaming", "cancellation"]`
- `sdk` (object, optional):
  - `name` (string): e.g., `opensentience_agent_sdk`
  - `version` (string): semver

Notes:
- The only secret allowed in this message is `session_token`. Do not log it.

#### 4.1.2 `core.welcome` (Core → Agent) — required
Core’s handshake response.

Payload:
- `accepted_version` (integer): negotiated protocol version (v1 uses `1`)
- `session_id` (string): Core-generated session id for this connection
- `heartbeat_interval_ms` (integer): required heartbeat cadence
- `max_frame_bytes` (integer): enforced maximum frame size
- `server` (object):
  - `core_version` (string)
  - `instance_id` (string)

If authentication fails:
- Core SHOULD send `core.welcome` with top-level `error.code = "protocol.unauthorized"`, then close the connection.

#### 4.1.3 `core.goodbye` (Core → Agent) — optional
Core indicates it will close the connection.

Payload:
- `reason` (string): safe reason code/message
- `retry_after_ms` (integer, optional): if Core suggests reconnect delay

---

### 4.2 Tool registration
Tools are globally namespaced as `<agent_id>/<tool_name>`.

#### 4.2.1 `agent.tools.register` (Agent → Core) — required
Agent declares the tools it exposes.

Payload:
- `tools` (array): each tool object contains:
  - `tool_id` (string): MUST be namespaced (`<agent_id>/<tool_name>`)
  - `name` (string): tool name without agent prefix (e.g., `fp_run_workflow`)
  - `description` (string)
  - `input_schema` (object): JSON Schema-like object (safe subset; Core may validate)
  - `output_schema` (object, optional)
  - `capabilities` (array of strings, optional): e.g., `["streaming", "cancellation"]`
  - `side_effects` (boolean, optional): true if the tool can cause side effects
  - `requires_directive` (boolean, optional): true if the tool must be directive-backed (portfolio stance)
  - `tags` (array of strings, optional): UI grouping
- `replace` (boolean, optional): if true, replace any prior registration for this session

Core response:
- `core.tools.registered` (below)

#### 4.2.2 `core.tools.registered` (Core → Agent) — required
Acknowledges registration.

Payload:
- `registered` (array of strings): list of tool_ids accepted
- `rejected` (array, optional): list of:
  - `tool_id`
  - `error` (standard error object, secret-free)

Rejection examples:
- tool_id not namespaced properly
- schema invalid / too large
- tool name conflicts within same agent_id

#### 4.2.3 `agent.tools.unregister` (Agent → Core) — optional
Agent indicates some tools should be removed (e.g., dynamic skill changes).

Payload:
- `tool_ids` (array of strings)

Core MAY respond with `core.tools.unregistered`.

---

### 4.3 Tool invocation (Core → Agent → Core)

#### 4.3.1 `core.tool.call` (Core → Agent) — required
Core requests a tool execution.

Payload:
- `call_id` (string): unique id for this tool call (UUID recommended)
- `tool_id` (string): namespaced `<agent_id>/<tool_name>`
- `input` (object): tool arguments (must be JSON object)
- `timeout_ms` (integer, optional): suggested timeout; agent may enforce stricter limits
- `idempotency_key` (string, optional): used for safe retries
- `caller` (object, optional):
  - `type`: `human|agent|system`
  - `id`: string
- `context` (object, optional): non-secret contextual metadata
  - `project_root` (string, optional): path to project root (if applicable)
  - `resource_paths` (array of strings, optional): relevant repo-local resources
  - `ui` (object, optional): UI hints (never secrets)

Rules:
- Core MUST ensure the calling entity has permission to invoke the tool and any declared permissions, before sending.
- Agent MUST validate `input` against `input_schema` (if feasible) and fail safely with a structured error if invalid.

#### 4.3.2 `agent.tool.stream` (Agent → Core) — optional
Streaming output chunks for an active call.

Payload:
- `call_id` (string)
- `seq` (integer): monotonically increasing per call, starting at 1
- `channel` (string): `"stdout" | "stderr" | "log" | "partial_result" | "status"`
- `data` (object):
  - for `stdout|stderr|log|status`: `{ "text": "..." }`
  - for `partial_result`: `{ "json": { ... } }` (must be secret-free)
- `done` (boolean, optional): if true, no more stream messages will be sent (agent will still send a final result)

Notes:
- Streaming must never include secrets.
- Core should display streaming output in UI and also apply redaction best-effort if needed.

#### 4.3.3 `agent.tool.result` (Agent → Core) — required
Final result for a tool call.

Payload:
- `call_id` (string)
- `status` (string): `"succeeded" | "failed" | "canceled"`
- `output` (object, optional): tool output if succeeded (secret-free)
- `error` (object, optional): standard error object if failed/canceled
- `started_at` (string, optional): RFC3339
- `finished_at` (string, optional): RFC3339
- `metrics` (object, optional): safe metrics (durations, counts), secret-free

Rules:
- Exactly one final `agent.tool.result` MUST be sent per `call_id`.
- If `status = canceled`, agent should set `error.code = "tool.canceled"` (or a more specific code).

---

### 4.4 Cancellation

#### 4.4.1 `core.tool.cancel` (Core → Agent) — optional but recommended
Request cancellation of an in-flight tool call.

Payload:
- `call_id` (string)
- `reason` (string, optional): safe reason
- `deadline_ms` (integer, optional): best-effort deadline for cancellation to take effect

Agent behavior:
- Cancellation is best-effort.
- Agent SHOULD stop work if possible and then send `agent.tool.result` with `status = canceled`.

#### 4.4.2 `agent.tool.cancel_ack` (Agent → Core) — optional
Agent acknowledges receipt of cancel request.

Payload:
- `call_id` (string)
- `accepted` (boolean)
- `note` (string, optional): safe note

---

### 4.5 Heartbeats and health

#### 4.5.1 `agent.heartbeat` (Agent → Core) — required after welcome
Sent periodically per `heartbeat_interval_ms` negotiated in `core.welcome`.

Payload:
- `session_id` (string)
- `uptime_ms` (integer)
- `inflight_calls` (integer)
- `status` (string): `"ok" | "degraded" | "unhealthy"`
- `details` (object, optional): safe details (queue depth, memory stats), secret-free

Core behavior:
- If heartbeats stop, Core marks agent unhealthy and stops routing tool calls.
- Core may restart agent based on configured restart policy.

#### 4.5.2 `core.ping` / `agent.pong` (optional)
Optional explicit ping/pong if needed, but `agent.heartbeat` is the MVP requirement.

---

## 5) Authentication and launch parameters

### 5.1 Session token
Core issues a **short-lived session token** at agent launch.

Requirements:
- Token MUST be unpredictable (cryptographically random).
- Token MUST NOT be logged by Core or agent.
- Token SHOULD expire quickly (e.g., minutes) and be bound to the launched process/session.

### 5.2 How Core passes connection info to agent (implementation detail, normative intent)
Core should provide the agent:
- socket path (UDS path)
- session token
- any non-secret runtime options (e.g., heartbeat interval)

Recommended mechanism:
- environment variables (names are implementation-specific; do not persist them to logs)
- command-line args are acceptable but higher risk (often visible via process lists)

### 5.3 Token usage
- Agent MUST send the token in `agent.hello.payload.session_token`.
- Core MUST validate it before accepting any tool registration or tool calls.

---

## 6) Version negotiation and compatibility

### 6.1 Negotiation
- Agent includes `supported_versions` in `agent.hello`.
- Core responds with `accepted_version` in `core.welcome`.
- If no common version exists, Core responds with an error and closes.

### 6.2 Additive evolution rule (v1 stability)
For v1:
- Unknown `payload` fields MUST be ignored (forward compatibility).
- Unknown message `type` MUST result in a structured error response if it expects a reply, or be ignored if unsolicited (Core policy may choose to close for strictness).

---

## 7) Safety and secrecy rules (protocol-level)

1. **No secrets in messages**
   - The only permitted secret is the session token in `agent.hello`.
   - Tool inputs/outputs, logs, signals, directives, and errors MUST be secret-free.

2. **Redaction is defense-in-depth, not permission**
   - Core and agents may apply best-effort redaction, but callers must not send secrets.

3. **Bounded outputs**
   - Agents must bound streaming and final outputs.
   - For large outputs, agents should return references (e.g., file paths within permitted sandboxes) rather than embedding huge payloads.

4. **Structured errors**
   - Always prefer structured error codes + safe messages over dumping raw stack traces.

---

## 8) Minimal examples (indented JSON, not normative)

### 8.1 agent.hello
    {
      "v": 1,
      "type": "agent.hello",
      "id": "f3a1d2b0-3c2f-4f6a-9f3f-3f5d0f8f9b2a",
      "ts": "2026-01-16T12:00:00Z",
      "payload": {
        "session_token": "<redacted>",
        "agent_id": "com.graphonomous.core",
        "agent_version": "1.0.0",
        "protocol": { "supported_versions": [1], "capabilities": ["tools", "streaming", "cancellation"] }
      }
    }

### 8.2 core.tool.call
    {
      "v": 1,
      "type": "core.tool.call",
      "id": "4c3c0c7b-4c9a-4a6b-9d2a-4e4a9f0e2a1b",
      "ts": "2026-01-16T12:00:01Z",
      "request_id": "8d0f8a5a-2f0a-4b76-9a9c-4c2b7b9a0c1d",
      "correlation_id": "chat_session:abc123",
      "payload": {
        "call_id": "9b1a2c3d-4e5f-6789-abcd-ef0123456789",
        "tool_id": "com.graphonomous.core/graph_search",
        "input": { "query": "foo", "collections": ["project:my_project:customer_docs"], "top_k": 5, "graph_mode": true },
        "timeout_ms": 30000
      }
    }

### 8.3 agent.tool.result
    {
      "v": 1,
      "type": "agent.tool.result",
      "id": "d2c1b0a9-8f7e-6d5c-4b3a-291817161514",
      "ts": "2026-01-16T12:00:02Z",
      "request_id": "8d0f8a5a-2f0a-4b76-9a9c-4c2b7b9a0c1d",
      "correlation_id": "chat_session:abc123",
      "payload": {
        "call_id": "9b1a2c3d-4e5f-6789-abcd-ef0123456789",
        "status": "succeeded",
        "output": { "query_id": "q_123", "results": [], "warnings": [] },
        "started_at": "2026-01-16T12:00:01Z",
        "finished_at": "2026-01-16T12:00:02Z"
      }
    }

---

## 9) Open questions (explicit, but bounded)
These do not block the envelope/framing spec, but should be resolved before expanding protocol scope:

1. Should directive lifecycle be carried explicitly as protocol messages (e.g., `core.directive.create`, `agent.directive.request`) or remain internal Core APIs with tool-call gating?
2. Should Core enforce schema validation strictly for all tool calls in MVP, or only warn and rely on agents?
3. Should we standardize a “deliver event” callback tool name for bus delivery (e.g., `*/a2a_handle_event`) and include it in this protocol spec, or keep it in the A2A Traffic spec?
