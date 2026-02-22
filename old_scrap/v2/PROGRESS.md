
# OpenSentience (Elixir) — Zed External Agent Progress Document

## Goal
Create a new **external Zed agent** named **OpenSentience**, implemented in **Elixir**, that speaks the **Agent Client Protocol (ACP)** over **stdio** (newline-delimited **JSON-RPC 2.0**).

This will let Zed run the agent as a subprocess and interact with it in the Agent Panel.

---

## Current status (what exists right now)
The repo you have open (`opensentience.org`) contains multiple parts (site + Elixir projects). The **ACP external agent implementation for Zed** lives under:

- `opensentience.org/zed-agent/`

This subproject is a **Mix + escript** ACP agent (JSON-RPC 2.0 over stdio). It already contains typical Mix build output (`_build/`, `deps/`, `test/`) and an `opensentience` escript artifact in the project root (rebuildable via `mix escript.build`).

### Key files (current `opensentience.org/zed-agent/` implementation)
- `opensentience.org/zed-agent/mix.exs`
  - Mix + escript project for the ACP agent
- `opensentience.org/zed-agent/README.md`
  - How to configure Zed to run the agent as a custom external agent
- `opensentience.org/zed-agent/lib/open_sentience/agent.ex`
  - ACP “brain” that handles `initialize`, `session/new`, `session/prompt`, and `session/cancel`
  - Streams progress via `session/update` during prompt turns
  - Contains an LLM-backed path (see LLM modules) in addition to baseline protocol handling
- `opensentience.org/zed-agent/lib/open_sentience/acp/router.ex`
  - ACP router that supports **agent-initiated client requests** (JSON-RPC 2.0) with response correlation (used for calling client methods like `fs/*`, `terminal/*`, and `session/request_permission` when wired in)
- `opensentience.org/zed-agent/lib/open_sentience/llm.ex`
  - LLM provider selection (supports at least `openrouter` + `mock`)
- `opensentience.org/zed-agent/lib/open_sentience/llm/open_router.ex`
  - OpenRouter client (OpenAI-compatible `/chat/completions`)
- `opensentience.org/zed-agent/opensentience`
  - Built escript artifact (can be regenerated with `mix escript.build`)

---

## What works conceptually (implemented behaviors)
### ACP / JSON-RPC framing over stdio
- Incoming messages are parsed as JSON objects (one per line).
- Outgoing messages are emitted as a single JSON object per line.
- Logging is intended for `stderr` (to avoid corrupting ACP output on `stdout`).

### ACP baseline lifecycle support
The core ACP flow is covered at a basic level:

- `initialize`
  - Negotiates protocol version (major version `1`)
  - Returns `agentCapabilities`, `agentInfo`, `authMethods: []`

- `session/new`
  - Requires absolute `cwd`
  - Returns a generated `sessionId`

- `session/prompt`
  - Validates `sessionId` exists and `prompt` is a list of objects
  - Sends `session/update` notifications:
    - a small `plan`
    - streamed `agent_message_chunk` text chunks
  - Responds to the `session/prompt` request with `stopReason: "end_turn"`

- `session/cancel` (notification)
  - Emits a small informational update (best-effort)

---

## What is NOT implemented yet (important gaps)
This is currently an ACP “protocol skeleton”, not a full coding agent.

### LLM backend exists (but the “coding agent” workflow is still incomplete)
- An LLM integration exists (OpenRouter + a deterministic `mock` mode).
- The agent has code paths intended to run an LLM-driven turn and (where wired) incorporate tool results.

### Agent-initiated client tool usage is scaffolded (partial)
ACP supports an agent calling client methods like:
- `fs/read_text_file`, `fs/write_text_file`
- `terminal/create`, `terminal/output`
- `session/request_permission`

This repo includes an ACP routing layer to support those client calls with response correlation. However, the full “edit files / run commands / apply diffs” workflow is not yet complete end-to-end (tool call reporting, robust permission request UX, and reliable editing/patch application still need finishing work).

### No “real” Zed editing workflow
- Tool call reporting (`tool_call` / `tool_call_update`) is not used.
- No diffs are emitted as tool content.
- No file-following locations are emitted.

### No tests / CI
- No ExUnit tests or protocol fixtures yet.

---

## Build / run status (what’s true right now)
- The ACP agent lives at `opensentience.org/zed-agent/`.
- A built escript artifact is present at `opensentience.org/zed-agent/opensentience`.
- You can (and should) rebuild locally from `opensentience.org/zed-agent/` with:
  - `mix deps.get`
  - `mix escript.build`

If Zed is configured to run the `opensentience` executable with `--acp`, the agent should be able to participate in ACP `initialize` + session flows.

---

## Next steps (recommended roadmap)
### Phase 1 — Make it runnable end-to-end in Zed
1. Build the agent executable:
   - Run from `opensentience.org/zed-agent-opensentience/`:
     - `mix deps.get`
     - `mix escript.build`
2. Confirm it responds correctly:
   - You can manually smoke-test by piping a JSON-RPC initialize request into it (or just run it and use Zed).

### Phase 2 — Add a real “agent brain”
Decide what OpenSentience should be:
- A wrapper around an LLM API (OpenAI / Anthropic / etc.)
- A local model (Ollama)
- A rules-based agent (less likely)

Then implement:
- Model prompt assembly (include ACP prompt blocks, files, etc.)
- Streaming responses via `session/update`
- Tool-call loop (ACP tool_call / tool_call_update + optional permission requests)

### Phase 3 — Add “editing” capabilities
To integrate deeply with Zed:
- Implement file reads/writes through ACP client methods (`fs/*`)
- Emit diffs as tool call content (ACP supports diff payloads)
- Add terminal execution through ACP (`terminal/*`) for builds/tests

### Phase 4 — Quality
- Add tests for:
  - JSON-RPC parsing
  - ACP method handling
  - session state
- Add structured logging + debug mode
- Consider supporting `session/load` if you implement persistence

---

## How you will wire it into Zed (once you build it)
In Zed `settings.json`, add something like:

- `agent_servers` → custom agent entry
- `command`: absolute path to your built `opensentience` executable
- `args`: probably `["--acp"]` (matches the CLI)

The included `opensentience.org/zed-agent-opensentience/README.md` already documents this flow.

---

## Open questions (what’s still needed to finish the “real” Zed coding agent)
The agent already has an LLM provider story (OpenRouter by default, plus `mock` for tests). The remaining decisions are about *scope and safety*:

1. Do you want to keep **OpenRouter as the default provider**, or add first-class support for another provider (Anthropic/OpenAI/local)?
2. Should the agent be allowed to use ACP client tools by default:
   - `fs/*` reads only,
   - reads + writes,
   - and/or `terminal/*`?
3. What permission posture do you want in Zed:
   - request permission per operation (`session/request_permission`) every time,
   - or allow a “trusted mode” toggle (still audited, but fewer prompts)?
4. What is the expected editing format:
   - direct file writes,
   - diff/patch application,
   - or both?

Once those are decided, the implementation work is to make prompt turns consistently drive: (a) tool calls via the ACP router, (b) structured progress updates, and (c) robust final responses that reflect actual edits/commands performed.
