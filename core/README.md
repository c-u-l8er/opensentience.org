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

5) Tail audit log:

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

Token:
- The server will ensure an admin token file exists at startup.
- Token is required for non-GET requests (state-changing routes). Phase 1 UI pages are read-only, but the token gate is enforced defensively.

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
- `mix opensentience.audit.tail`
  - tail audit events (supports `--follow`)

---

## What’s next (remaining Phase 1 work)

Planned next increments (per Phase 1 work breakdown):
- Install (git clone/fetch/checkout) with audited trust boundary
- Build (`mix deps.get` / `mix deps.compile`) explicitly audited as code execution
- Enablement UX wired to manifest requested permissions + drift detection
- Launcher run/stop as separate OS process + bounded log capture
- UI actions for lifecycle operations (token + CSRF), reusing Core APIs

---

## Notes

- This project intentionally avoids Phoenix in Phase 1; the admin UI is a minimal Plug/Cowboy surface.
- Phase 2 will add the runtime protocol server (UDS + length-prefixed JSON frames) and tool routing, building on Phase 1’s launcher/audit/storage primitives.