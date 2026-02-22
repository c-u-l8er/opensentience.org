# OpenSentience Core (Phase 1) — Core MVP

This is the **OpenSentience Core** Phase 1 implementation scaffold (catalog/discovery, enablement, audit log, launcher scaffolding, and a minimal localhost admin UI skeleton).

Phase 1 goals (per portfolio spec):
- Catalog + discovery of agent manifests (**no code execution**)
- Install/build/enable/run lifecycle with **explicit trust boundary**
- Durable **audit log** (security-relevant, secret-free)
- Launcher (separate OS process) + log capture (scaffold in Phase 1, expands in Phase 2)
- Minimal admin UI skeleton on `127.0.0.1:6767` (token gate + CSRF scaffold + safe-by-default)
- CLI covering core lifecycle operations (Phase 1 starts with scan/list/audit; install/build/run/stop follow next)

> Security invariants (Phase 1):
> - Discovery must never run agent code.
> - State-changing operations must be explicit and auditable.
> - No secrets in durable storage (SQLite/audit/logs); admin token is file-backed only.

---

## Project layout

This directory is a standalone Mix project:

- `lib/opensentience/*` — Core modules (catalog, discovery, audit, enablement, web)
- `priv/repo/migrations/*` — SQLite schema migrations (Phase 1 tables)
- `config/*` — local defaults + runtime paths

Storage backend: **SQLite** via Ecto.

---

## Configuration

Core uses a local OpenSentience state directory (defaults under `~/.opensentience/`), configurable via environment variables:

- `OPENSENTIENCE_HOME` — root state directory (default: `~/.opensentience`)
- `OPENSENTIENCE_DB_PATH` — SQLite file path (default: under `~/.opensentience/state/core.sqlite3`)
- `OPENSENTIENCE_SCAN_ROOTS` — comma-separated discovery roots (default: `~/Projects,~/.opensentience/agents`)
- `OPENSENTIENCE_WEB_IP` / `OPENSENTIENCE_WEB_PORT` — admin UI bind (default: `127.0.0.1:6767`)

Admin UI token:
- Stored on disk (default: `~/.opensentience/state/admin.token`)
- **Never** stored in SQLite.

---

## Quick start

From this directory:

1) Fetch deps and compile:

```/dev/null#L1-4
mix deps.get
mix compile
```

2) Run migrations:

```/dev/null#L1-2
mix opensentience.db.migrate
```

3) Scan for manifests and upsert the catalog:

```/dev/null#L1-2
mix opensentience.agents.scan
```

4) List agents:

```/dev/null#L1-2
mix opensentience.agents.list
```

5) Install an agent (explicit trust boundary; executes `git`):

```/dev/null#L1-2
mix opensentience.agents.install com.example.side_effects --git-url https://github.com/org/repo.git --ref main
```

6) Build an installed agent (explicit trust boundary; executes code via `mix`):

```/dev/null#L1-2
mix opensentience.agents.build com.example.side_effects --mix-env prod
```

7) Enable an agent (approve requested permissions from its manifest; deny-by-default):

```/dev/null#L1-2
mix opensentience.agents.enable com.example.side_effects --all
```

8) Tail audit log:

```/dev/null#L1-2
mix opensentience.audit.tail --limit 50
```

---

## Admin UI (Phase 1 skeleton)

The admin UI server is a minimal Plug/Cowboy app intended to be **localhost-only** and safe-by-default.

Start the Core application (which will start the web server if enabled by config):

```/dev/null#L1-2
mix run --no-halt
```

Then visit:

- `http://127.0.0.1:6767/agents`
- `http://127.0.0.1:6767/audit`
- `http://127.0.0.1:6767/login`

Token + session:
- The server will ensure an admin token file exists at startup.
- State-changing requests (non-GET) are protected by **CSRF** and an admin gate.
- For browser usage, you can **log in** at `/login` (using the admin token) to establish a session, then run/stop from the agent detail page.
- For non-browser clients (or scripting), you can still provide the admin token per request via header `x-opensentience-token` (defense-in-depth).

---

## Phase 1 data model (SQLite)

Phase 1 creates these tables:

- `agents` — discovered/known agents
- `permission_approvals` — approved permission subsets (deny-by-default)
- `runs` — launcher-level run records (Phase 1 scaffolding; expands in Phase 2)
- `audit_events` — append-only audit log
- `logs` — optional indexed log lines (Phase 1 scaffolding)

---

## Agent manifests

Discovery looks for files named:

- `opensentience.agent.json`

Discovery:
- walks configured roots
- does filesystem reads only
- computes `manifest_hash` from raw bytes for drift detection
- stores safe summary fields in the catalog

---

## Current Phase 1 CLI surface

Implemented Mix tasks (Phase 1 scaffold):

- `mix opensentience.db.migrate`
  - run SQLite migrations
- `mix opensentience.agents.scan`
  - scan roots for `opensentience.agent.json` and upsert catalog (default)
  - supports `--no-upsert` and `--format json`
- `mix opensentience.agents.list`
  - list catalog agents, supports filters and `--json`
- `mix opensentience.agents.install`
  - install an agent into `~/.opensentience/agents/<agent_id>/src` (git clone/fetch; explicit trust boundary)
  - supports `--git-url`, `--ref`, and `--no-audit`
- `mix opensentience.agents.build`
  - build an installed agent (`mix deps.get` + `mix deps.compile`; explicit trust boundary)
  - supports `--mix-env`, `--timeout-ms`, `--max-output-bytes`, `--no-audit`, and `--json`
- `mix opensentience.agents.enable`
  - enable an agent by approving requested permissions from its manifest (deny-by-default; approved ⊆ requested)
  - supports `--all` or `--approved-permissions`, `--no-revoke-existing`, and `--json`
- `mix opensentience.agents.run`
  - run an agent via the **running** local admin server over HTTP (token + CSRF session)
  - useful because `mix` tasks exit the BEAM; Core should be run persistently (e.g. `mix run --no-halt`)
- `mix opensentience.agents.stop`
  - stop an agent via the **running** local admin server over HTTP (token + CSRF session)
- `mix opensentience.audit.tail`
  - tail audit events (supports `--follow`)

Admin server connection defaults:
- `OPENSENTIENCE_ADMIN_URL` (e.g. `http://127.0.0.1:6767`)
- `OPENSENTIENCE_ADMIN_TOKEN` (or default token file under `~/.opensentience/state/admin.token`)

---

## Phase 1 progress checklist

After logging in at `/login`, the agent detail page includes actions for **Install**, **Build**, **Enable (approve all)**, **Prepare & Run**, **Run**, and **Stop**.

### Catalog + discovery (no code execution)
- [x] Scan configured roots for `opensentience.agent.json` (no code execution)
- [x] Parse + validate manifest fields and compute `manifest_hash`
- [x] Upsert into catalog storage and record discovery timestamps

### Install / Build (explicit trust boundary)
- [x] Install (git clone/fetch/checkout) into `~/.opensentience/agents/<agent_id>/src`
- [x] Build trust boundary (`mix deps.get`, `mix deps.compile`) via `OpenSentience.Build` + `OpenSentience.Build.Sandbox`
- [x] Persist build lifecycle fields (`build_status`, `build_last_at`, `last_error`) and emit audit events (`agent.build_started`, `agent.built`, `agent.build_failed`)

### Enablement (deny-by-default)
- [x] Read requested permissions from manifest without executing code
- [x] Approve subset ⊆ requested and persist approvals (scope-pinned best-effort via `manifest_hash` + `source_ref`)
- [x] Gate run on enablement/approval drift (`Approvals.ensure_enabled/3`)

### Launcher (run/stop + logs)
- [x] Persist runs (`runs` table) and bounded log indexing (`logs` table; redacted + clamped)
- [x] Safe command construction (no shell) via `OpenSentience.Launcher.CommandBuilder` (`mix_task` + `command`; reject `release` for now)
- [x] Subprocess runner owns Port, captures bounded file log under `~/.opensentience/logs/<agent_id>/<run_id>.log`, and marks terminal run status (`stopped|crashed`)
- [x] Audit events for run lifecycle (`agent.run_started`, `agent.run_stopped`, `agent.run_crashed`) best-effort

### Admin UI skeleton (localhost-only; token + CSRF)
- [x] Localhost-only Plug/Cowboy UI on `127.0.0.1:6767` by default
- [x] Token bootstrap + CSRF enabled (cookie session)
- [x] Login flow (`/login` for browser; `/api/csrf` + `/api/login` for clients)
- [x] UI-wired install/build/enable actions (agent detail forms: POST `/agents/:id/install`, `/agents/:id/build`, `/agents/:id/enable`)
- [x] UI-wired Prepare & Run action (agent detail form: POST `/agents/:id/prepare-run`)
- [x] UI-wired run/stop actions (agent detail forms: POST `/agents/:id/run` + `/agents/:id/stop`)

### CLI surface
- [x] Lifecycle CLI: scan/list/install/build/enable
- [x] Run/stop CLI over HTTP to a running Core node (`mix opensentience.agents.run` / `mix opensentience.agents.stop`)

## What’s next (remaining Phase 1 work)

Planned next increments (per Phase 1 work breakdown):
- UI wiring for launcher visibility:
  - show recent `runs` for an agent
  - link to (or render) file-backed logs under `~/.opensentience/logs/<agent_id>/<run_id>.log`
  - basic “live” refresh (polling) is fine for Phase 1
- Tighten the lifecycle UX around enablement:
  - show enablement gate status (enabled / drifted / not enabled) on the agent detail page
  - optionally support “approve subset” in UI (still deny-by-default)

---

## Notes

- This project intentionally avoids Phoenix in Phase 1; the admin UI is a minimal Plug/Cowboy surface.
- Phase 2 will add the runtime protocol server (UDS + length-prefixed JSON frames) and tool routing, building on Phase 1’s launcher/audit/storage primitives.