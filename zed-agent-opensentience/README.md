# OpenSentience — External Agent for Zed (ACP)

This directory is intended to host **OpenSentience**, a terminal-based external agent that integrates with **Zed** via the **Agent Client Protocol (ACP)**.

Zed runs external agents as subprocesses and communicates with them over **JSON-RPC 2.0** via **stdio** (newline-delimited JSON messages). This README explains how to run and wire up an ACP agent named “OpenSentience” in Zed.

## What you’re building

- **Agent name (in Zed):** `OpenSentience`
- **Protocol:** ACP (JSON-RPC 2.0 over stdio)
- **Transport:** stdio (stdin/stdout)
- **Important ACP rules:**
  - Messages are **one JSON object per line** (no embedded newlines).
  - The agent **MUST NOT** write non-ACP output to `stdout`.
  - Logs should go to `stderr`.
  - File paths in ACP payloads **MUST be absolute**.

Reference: https://agentclientprotocol.com/protocol/overview

---

## Prerequisites

1. **Zed** installed (stable or preview).
2. A runnable **OpenSentience agent executable** that speaks ACP over stdio.
   - This README assumes you will produce a CLI executable (for example `opensentience`) that can be run as:
     - `opensentience --acp` (or similar)
   - If you implement it in Elixir, you’ll likely ship it as an `escript` or a release binary.

---

## Running the agent (terminal)

Once you have an executable, you should be able to run it in a terminal (it will appear to “hang” because it’s waiting for ACP messages on stdin):

- Example (adjust path/name to your executable):
  - `./opensentience --acp`

Notes:
- Seeing no output is normal.
- If you print anything to `stdout` that isn’t valid ACP JSON, Zed will reject/break the session.
- Put debug logs on `stderr`.

---

## Configure Zed to use the agent

Add an `agent_servers` entry in your Zed `settings.json`.

You can open Zed settings via the Command Palette: `zed: open settings`.

Example configuration (adjust command/args to match your agent):

```json
{
  "agent_servers": {
    "OpenSentience": {
      "type": "custom",
      "command": "/absolute/path/to/opensentience",
      "args": ["--acp"],
      "env": {}
    }
  }
}
```

### Notes on fields

- `command` should be **absolute** when possible (more reliable than relying on PATH).
- `args` must include whatever flag/subcommand makes your program speak ACP over stdio.
- `env` is optional, but useful for:
  - LLM provider API keys (do **not** commit keys to git)
  - feature flags / logging toggles

---

## Start a new thread in Zed

After adding the agent server:

1. Open the **Agent Panel** in Zed.
2. Click `+` (new thread).
3. Select **OpenSentience**.

If Zed can start the process and complete ACP `initialize` + `session/new`, you should see the thread come alive.

---

## Optional: Add a keybinding to start OpenSentience quickly

Edit your `keymap.json` (Command Palette: `zed: open keymap`) and add:

```json
[
  {
    "bindings": {
      "cmd-alt-o": [
        "agent::NewExternalAgentThread",
        {
          "agent": {
            "custom": {
              "name": "OpenSentience",
              "command": {
                "command": "opensentience",
                "args": ["--acp"]
              }
            }
          }
        }
      ]
    }
  }
]
```

Notes:
- The `"command": "opensentience"` here is the *command name* Zed will run; it must be resolvable (either absolute path or on `PATH`).
- On Linux, `cmd` bindings won’t apply; use `ctrl` combos as desired.

---

## Debugging

### ACP logs in Zed
Zed includes an ACP log view (Command Palette):
- `dev: open acp logs`

This is the first place to look if the agent doesn’t start, stops responding, or emits invalid messages.

### Common failure modes
- **Agent prints plain text to stdout** → must go to `stderr`.
- **Agent outputs multi-line JSON** → ACP requires one JSON message per line.
- **Agent never responds to `initialize`** → Zed will time out / abort.
- **Relative paths in ACP payloads** → ACP requires **absolute** file paths.

---

## Implementation checklist (for your agent)

To work with Zed, OpenSentience must implement ACP baseline methods:

- `initialize` (negotiate protocol version & capabilities)
- `authenticate` (optional; return no auth methods if not needed)
- `session/new`
- `session/prompt`
- `session/cancel` (notification)
- emit `session/update` notifications during a prompt turn (message chunks, tool calls, plans, etc.)

If you also implement client-side tool access (recommended), request the client capabilities you want (fs/terminal) during `initialize` and then call:
- `fs/read_text_file`, `fs/write_text_file`
- `terminal/create`, `terminal/output`, etc.

See:
- https://agentclientprotocol.com/protocol/initialization
- https://agentclientprotocol.com/protocol/session-setup
- https://agentclientprotocol.com/protocol/prompt-turn
- https://agentclientprotocol.com/protocol/tool-calls
- https://agentclientprotocol.com/protocol/transports

---

## Next steps

If you want, I can also:
- scaffold a minimal Elixir ACP agent (Mix project + stdio JSON-RPC loop),
- implement `initialize`, `session/new`, `session/prompt`, and streaming `session/update`,
- add a build step to produce a single executable Zed can run.