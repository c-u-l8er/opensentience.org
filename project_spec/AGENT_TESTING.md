# Agent Testing — Contract Tests + Agent-Owned Test Suites

This guide defines how to test agents in the Project[&] portfolio in a way that is:
- **Production-oriented** (contracts, safety, regressions, observability)
- **Secret-free** (no durable leakage in fixtures/logs)
- **Deterministic by default** (network/LLM optional and gated)
- **Compatible with OpenSentience Core’s trust boundaries** (discovery never executes code)

It covers two complementary layers:

1) **Protocol Contract Tests** (Core ↔ Agent runtime protocol v1)
2) **Agent-Owned Test Suites** (tool behavior, schemas, permissions posture, idempotency)

Canonical references:
- Runtime protocol: `opensentience.org/project_spec/RUNTIME_PROTOCOL.md`
- Marketplace/core spec: `opensentience.org/project_spec/agent_marketplace.md`
- Standards:
  - `project_spec/standards/agent-manifest.md`
  - `project_spec/standards/tool-calling-and-execution.md`
  - `project_spec/standards/signals-and-directives.md`
  - `project_spec/standards/security-guardrails.md`

---

## 0) Goals and Non-goals

### Goals
- Catch breaking changes in protocol framing/envelope early.
- Ensure every agent behaves safely under invalid input, cancellation, and timeouts.
- Provide a consistent way to test tools without requiring the full UI.
- Make it easy to run a “known good” regression suite before shipping updates.

### Non-goals (initially)
- Full LLM quality evals (scoring/rubrics) across datasets. That is a separate “evals” system and can be layered on later.
- Cross-platform sandboxing guarantees in tests. Tests must be safe-by-default, but sandbox enforcement is a runtime concern.

---

## 1) Test Taxonomy (What you test, and where)

### 1.1 Core Protocol Contract Tests (Core-owned)
Purpose: Validate the **runtime protocol** end-to-end, independent of any specific “business logic” agent.

These tests run against:
- A **minimal reference agent** (the portfolio should keep one tiny agent for this), or
- A test harness agent embedded in test code, launched as a separate OS process.

Coverage:
- framing (length prefixing, limits)
- handshake/auth
- tool registration
- tool call request/response correlation
- streaming ordering
- cancellation semantics
- heartbeat/health handling
- redaction/secret-free logging invariants

### 1.2 Agent-Owned Tool Tests (Agent-owned)
Purpose: Validate an agent’s tool behavior, schemas, permissions posture, and safety rules.

These tests live with the agent repo and run in the agent’s CI.

Coverage:
- tool input validation (schema + runtime checks)
- idempotency behavior
- cancellation behavior (best-effort)
- side-effect boundaries (signals vs directives, or “requires_directive” policy)
- secret handling (no secrets in logs/outputs)
- performance invariants (timeouts, bounded output)
- deterministic mode (mock LLM/provider)

### 1.3 Integration Slice Tests (Portfolio-owned; optional per phase)
Purpose: Validate a vertical slice that spans multiple components (e.g., Core + FleetPrompt + Graphonomous).

These are slower and fewer. Use them to prevent “systems drift” as components evolve.

---

## 2) Protocol Contract Test Suite (Core ↔ Agent)

### 2.1 Contract: What is “stable”
The authoritative contract is `RUNTIME_PROTOCOL.md`:
- transport: **UDS + length-prefixed JSON frames**
- envelope: `v`, `type`, `id`, `ts`, `payload` (+ correlation fields)
- tool naming: `<agent_id>/<tool_name>`
- messages: `agent.hello`, `core.welcome`, `agent.tools.register`, `core.tool.call`, `agent.tool.stream`, `agent.tool.result`, `core.tool.cancel`, `agent.heartbeat`, …

Contract stability rule (v1): additive evolution only; do not break existing required fields.

### 2.2 Required contract test cases (minimum)
A Core implementation is not considered complete unless the following pass:

1. **Handshake success**
   - launch agent process
   - agent connects to Core’s socket
   - `agent.hello` accepted
   - Core responds `core.welcome`

2. **Handshake failure**
   - wrong/missing `session_token`
   - Core sends `core.welcome` with `error.code = "protocol.unauthorized"` then closes

3. **Tool registration**
   - accept valid namespaced tool IDs
   - reject invalid tool IDs and invalid schemas (bounded errors; no crash)

4. **Tool call success**
   - Core routes `core.tool.call`
   - Agent returns exactly one `agent.tool.result` for the `call_id`
   - correlation fields are echoed through stream/result as required

5. **Streaming**
   - `agent.tool.stream.seq` is monotonic starting at 1
   - stream events are correlated to the correct `call_id`
   - Core tolerates missing streaming (optional capability)

6. **Cancellation**
   - Core sends `core.tool.cancel`
   - Agent best-effort stops and returns `agent.tool.result` with `status = "canceled"`
   - Agent never returns both “canceled” and “succeeded” results for one call

7. **Heartbeats**
   - agent sends `agent.heartbeat` at the negotiated cadence
   - Core marks unhealthy on missed heartbeats and stops routing new calls

8. **Framing & limits**
   - invalid frame lengths rejected safely
   - max frame size enforced
   - partial reads handled (no “assume all bytes arrive at once”)

9. **Error shaping**
   - all errors are secret-free and use standard shape (`code`, `message`, optional `details`, optional `retryable`)
   - Core does not persist secrets in audit/log sinks

### 2.3 Recommended “nasty input” corpus
Maintain a small corpus of malformed messages to prevent parser regressions:
- non-JSON payload
- missing envelope fields
- oversized strings/arrays
- wrong types (`payload` as list, `id` as number)
- invalid UTF-8 sequences (at framing layer)
- schema objects that exceed size limits

### 2.4 Contract fixtures
Prefer fixtures as **raw framed bytes** + expected outcomes, so you test the framing layer too.

Recommended directory layout (Core repo):
- `test/fixtures/protocol/v1/frames/*.bin`
- `test/fixtures/protocol/v1/messages/*.json` (envelope-level fixtures)
- `test/fixtures/protocol/v1/transcripts/*.ndjson` (human-readable traces)

Fixture rules:
- No secrets, no real API keys, no real user identifiers.
- Use deterministic UUIDs/timestamps in fixtures.

---

## 3) Agent-Owned Test Suites

### 3.1 What each agent should test (baseline)
Every agent should ship tests for:

#### (A) Manifest validity
- `opensentience.agent.json` validates against `agent-manifest.md` expectations:
  - required fields present
  - version is semver
  - permissions are bounded strings
  - entrypoint is correct

#### (B) Tool registry surface
- tool IDs are namespaced `<agent_id>/<tool_name>`
- tool schemas are bounded in size/complexity
- `side_effects` / `requires_directive` flags (if used) reflect reality

#### (C) Tool behavior and safety
- invalid inputs fail fast with structured error (no crash)
- outputs are bounded (size/time)
- logs/streams are secret-free
- cancellation is honored best-effort where relevant
- idempotency key behavior is correct (if supported)

#### (D) Security guardrails
- no “implicit side effects” from model output alone
- directive-backed side effects when required by portfolio stance
- no secrets in durable artifacts

### 3.2 Determinism: “mock mode” is required
Agents that call LLMs or external services should provide a deterministic test mode.

Example patterns:
- `LLM_PROVIDER=mock` returning stable outputs
- dependency injection (pass provider module in opts)
- record/replay HTTP fixtures (only if fixtures are scrubbed and stable)

Tests must not require network by default.

### 3.3 Suggested test structure (agent repo)
A simple, conventional structure:

- `test/`
  - `manifest_test.exs`
  - `tools/*_test.exs`
  - `support/fixtures/*`
  - `support/mocks/*`

If the agent also supports Core runtime protocol directly (Elixir agent SDK), add:
- `test/protocol_smoke_test.exs` (agent can speak protocol correctly in isolation)

### 3.4 Testing the “directive boundary”
If an agent exposes tools that can cause side effects:
- tests should assert that “side effect” tools require explicit directive context (as defined by portfolio rules), or
- that the agent refuses to perform the side effect without the appropriate directive/permission context.

This is a **behavioral invariant**, not a UI feature.

---

## 4) How tests should be run (recommended commands)

This section describes the *recommended* commands and separation. Exact task names can vary by repo.

### 4.1 Core: protocol contract test runner
Recommended:
- `mix test` runs unit tests
- a dedicated integration profile runs protocol contract tests (because they spawn OS processes and open sockets)

Suggested patterns:
- `MIX_ENV=test mix test --only protocol`
- or a dedicated task like `mix opensentience.test.protocol` (recommended if you want clearer UX)

### 4.2 Agents: agent-owned suite
Recommended:
- `mix test` for Elixir agents
- include a `--only integration` tag for tests that spawn a Core process or require OS resources

### 4.3 “Portfolio slice” integration tests
Recommended:
- A small number of tagged tests (slow):
  - “Core + FleetPrompt validation”
  - “Core + A2A publish/subscribe”
  - “Core + Graphonomous search”
- Gate them in CI on main branch merges (or nightly).

---

## 5) What to assert (quality gates)

### 5.1 Secret-free guarantees
Tests should assert:
- durable audit events never contain raw prompts, raw outputs, raw HTTP bodies, or secrets
- large text fields are either omitted or redacted/truncated (per Core redaction rules)

Recommended approach:
- have a helper that scans persisted metadata and fails if it finds:
  - `api_key`, `authorization`, `bearer `, `sk-`, `-----BEGIN`
  - suspiciously long unstructured blobs
  - known “do not persist” keys: `prompt`, `input`, `output`, `stdout`, `stderr`, `body`

### 5.2 Boundedness
Every tool should have bounds:
- runtime bound (timeout)
- output bound (max size)
- stream bound (max chunks / max bytes)

Tests should verify tools respect those bounds under pathological inputs.

### 5.3 Idempotency
If a tool accepts an `idempotency_key`:
- repeated calls with same key should not duplicate side effects
- tool should return the same stable outcome or a safe “already completed” response

### 5.4 Correlation correctness
Protocol tests should enforce that:
- `request_id`/`correlation_id` echo rules are followed by agents
- audit entries link to correlation ids where applicable

---

## 6) Reference “Hello Tools” Agent (for protocol testing)

The portfolio should maintain a tiny agent dedicated to protocol regression testing. It should expose tools like:

- `hello_world` (pure, deterministic)
- `stream_counter` (streams N chunks then succeeds)
- `sleep` (long-running; cancellable)
- `invalid_input` (returns structured error)
- `large_output` (tests truncation/bounds)

This agent must:
- never require network
- never require filesystem writes by default
- be safe to run in CI

---

## 7) Versioning and backwards compatibility tests

When Core or agents change the protocol implementation:
- run the protocol test suite against:
  - the “current” reference agent
  - optionally, the previous tagged reference agent build (to detect accidental breaks)

Recommended policy:
- any protocol change requires adding/adjusting a contract fixture.

---

## 8) Appendices

### 8.1 Suggested minimal contract acceptance checklist
- [ ] handshake ok / unauthorized
- [ ] tool register ok / reject
- [ ] tool call ok
- [ ] stream ordering ok
- [ ] cancel ok
- [ ] heartbeat ok
- [ ] framing limits enforced
- [ ] secret-free persistence verified

### 8.2 Where this document fits in the roadmap
- Phase 1: establish catalog/audit/launcher scaffolding and begin test harness scaffolding.
- Phase 2: implement full protocol and make the contract suite mandatory.
- Phase 3+: require agents to ship agent-owned suites; add vertical slice tests.

---

## Change log
- January 2026: Initial version (contract tests + agent-owned test suites).