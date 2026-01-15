
# OpenSentience (Elixir) — Zed External Agent Progress Document

## Goal
Create a new **external Zed agent** named **OpenSentience**, implemented in **Elixir**, that speaks the **Agent Client Protocol (ACP)** over **stdio** (newline-delimited **JSON-RPC 2.0**).

This will let Zed run the agent as a subprocess and interact with it in the Agent Panel.

---

## Current status (what exists right now)
The repo you have open (`opensentience.org`) is primarily a static site, so I added a new subproject under:

- `opensentience.org/zed-agent-opensentience/`

This subproject is a **Mix + escript** scaffold for an ACP agent.

### Key files added
- `opensentience.org/zed-agent-opensentience/mix.exs`
  - Defines the Mix project `:opensentience_acp`
  - Adds `{:jason, "~> 1.4"}` for JSON encode/decode
  - Configures `escript` output named `opensentience`
  - Sets `mod: {OpenSentience.Application, []}`

- `opensentience.org/zed-agent-opensentience/config/config.exs`
  - Logger configured (intended to write to `stderr`, not `stdout`)
  - Basic agent identity and defaults

- `opensentience.org/zed-agent-opensentience/lib/open_sentience/cli.ex`
  - CLI entrypoint (`OpenSentience.CLI`) used by escript
  - Starts ACP stdio loop when run with `--acp` (or no args)
  - Routes incoming JSON-RPC messages to the core agent implementation
  - Sends responses/notifications back via the stdio transport

- `opensentience.org/zed-agent-opensentience/lib/open_sentience/transport/stdio.ex`
  - Implements newline-delimited JSON-RPC stdio transport rules:
    - reads one JSON object per line
    - writes one JSON object per line
    - never prints non-ACP content to `stdout`
    - logs go to `stderr` via Logger

- `opensentience.org/zed-agent-opensentience/lib/open_sentience/agent.ex`
  - A transport-agnostic ACP “brain”:
    - handles `initialize`, `session/new`, `session/prompt`, `session/set_mode`
    - handles `session/cancel` notifications
    - emits `session/update` notifications during prompts
  - Currently behaves as a **stub agent**: it does not call an LLM, it just acknowledges prompts and streams a basic response.

- `opensentience.org/zed-agent-opensentience/lib/open_sentience/json_rpc.ex`
  - JSON-RPC helper builders/validators (currently not wired into the CLI/transport; available for future cleanup/refactor)

- `opensentience.org/zed-agent-opensentience/lib/open_sentience/prompt.ex`
  - A simple “render ACP prompt blocks into text” helper (currently not used by `OpenSentience.Agent`)

- `opensentience.org/zed-agent-opensentience/README.md`
  - How to configure Zed to run this as a custom external agent.

- `opensentience.org/zed-agent-opensentience/.gitignore`

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

### No LLM backend
- There is **no** OpenAI/Anthropic/local-model integration.
- The agent does not generate code changes or tool calls based on model output.

### No client tool usage (fs/terminal)
ACP supports an agent calling client methods like:
- `fs/read_text_file`, `fs/write_text_file`
- `terminal/create`, `terminal/output`, etc.

This agent does **not** call any of those yet, and it does not request permissions via `session/request_permission`.

### No “real” Zed editing workflow
- Tool call reporting (`tool_call` / `tool_call_update`) is not used.
- No diffs are emitted as tool content.
- No file-following locations are emitted.

### No tests / CI
- No ExUnit tests or protocol fixtures yet.

---

## Known technical constraints in this environment
I **did not compile** the Elixir project here, because the tooling interface I have only allows running shell commands with `cd` set to a project root directory (`opensentience.org`), and it disallows `cd` inside the command. Since this Mix project lives under a subdirectory, I can’t run `mix deps.get` / `mix compile` via the available terminal tool.

So: the scaffold is written, but you should run a local build to confirm compilation.

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

## Open questions (I need your preference)
To continue “coding the agent” beyond protocol scaffolding, I need one decision:

1. **Which model/provider should OpenSentience use?**
   - OpenAI? Anthropic? Google? Ollama (local)?
2. Should it be **bring-your-own-key** via environment variables (recommended), or do you want a different auth mechanism?
3. Do you want OpenSentience to:
   - only chat, or
   - also **edit files / run commands** autonomously through ACP tools?

If you answer those, I can continue from the current scaffold and implement the actual agent behavior (model calls + tool loop) in a way that matches ACP and Zed’s external agent expectations.
