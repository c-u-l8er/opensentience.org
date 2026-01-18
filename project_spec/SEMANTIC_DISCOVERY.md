# Semantic Discovery & Search (SQLite-first, Optional Semantic Indexing)

**Status:** Planned (Phase 1.5)  
**Primary dependency:** Phase 1 catalog + install/enable/run lifecycle works end-to-end  
**Storage posture:** SQLite-first (Core DB)  
**Key invariant:** **Discovery must not execute code and must not perform network calls.**  
**Related specs:**
- `agent_marketplace.md` (discovery + catalog search expectations)
- `RUNTIME_PROTOCOL.md` (correlation fields; tool IDs)
- `TRUST_AND_REGISTRY.md` (verification metadata is informational unless enforced)
- `OBSERVABILITY_AND_METRICS.md` (audit/log/metrics posture; secret-free persistence)
- `project_spec/standards/agent-manifest.md` (manifest schema and safe indexing inputs)
- `project_spec/standards/security-guardrails.md` (no secrets; safe-by-default)

## Architecture compatibility notes (portfolio truth)

These notes exist to prevent design drift. If any future proposal conflicts with the items below, treat it as a deliberate architecture change that must be explicitly approved.

### OpenSentience Core remains SQLite-first
- Phase 1/1.5 Core storage is SQLite-backed and optimized for local-first governance (catalog, approvals, audit, runs).
- Semantic discovery MUST NOT require migrating Core to Postgres/pgvector. If a Postgres-backed search backend is ever introduced, it must be explicitly framed as a Core storage migration decision (not a “Phase 1.5 quick win”).

### Discovery is filesystem-only (no network)
- Core discovery scans (`opensentience.agent.json` indexing) are pure filesystem reads + safe parsing.
- Embedding generation and any semantic indexing is explicitly out-of-band and opt-in (see Section 5). Discovery must remain deterministic even when offline.

### Semantic indexing lives in the Graphonomous layer or behind a provider boundary
- Preferred portfolio-aligned approach: use Graphonomous as the semantic/embedding subsystem.
  - Core publishes derived “agent docs” into a Graphonomous collection (e.g., `opensentience_agents`) and queries it for ranked agent IDs.
  - This keeps “knowledge/embeddings” in the component designed for it and avoids coupling Core’s DB choice to search indexing.
- Alternative approach: a pluggable provider interface that can later support other backends (local embeddings, SQLite vector extensions, or Postgres/pgvector) without changing Core’s discovery invariants.

### Trust signals are informational unless enforced
- Registry-provided verification badges and any trust metadata may be used for filtering/tie-breaking, but must not be treated as authoritative security guarantees unless a verification pipeline is implemented (see `TRUST_AND_REGISTRY.md`).

---

## 0) Summary

This spec upgrades agent discovery from “find manifests on disk” to “find agents users want” while preserving the portfolio’s most important safety invariants.

It defines **two layers**:

1) **Catalog Search (MVP Phase 1.5):** fast, deterministic **SQLite metadata search** + filtering.  
2) **Semantic Index (Optional, opt-in):** embeddings-based ranking implemented via **Graphonomous** or a pluggable provider. Semantic indexing is a **derived index** and must **never** be required for basic catalog functionality.

---

## 1) Non-negotiable invariants

### 1.1 Discovery is pure
During discovery scans, Core MUST:
- read files on disk (`opensentience.agent.json`)
- parse JSON safely
- update catalog records
- compute hashes/mtimes

Core MUST NOT during discovery:
- execute agent code
- run `mix` (or any build step)
- perform network calls (no embedding API calls, no HTTP fetches)
- fetch URLs referenced by manifests

### 1.2 Semantic indexing is optional and derived
- Semantic indexing consumes already-discovered, safe-to-index text fields.
- If semantic indexing is disabled or unavailable, catalog search must still work.

### 1.3 Secret-free persistence
No secrets in:
- SQLite tables
- audit events
- logs (durable)
- semantic index payloads

If a semantic provider requires an API key, it MUST be provided via environment/config and MUST NOT be persisted.

---

## 2) Goals and non-goals

### 2.1 Goals (Phase 1.5)
- Provide a `search` experience across local + remote catalogs:
  - free-text search over `id`, `name`, `description`, `keywords`, `integration_points`
  - filters for `capabilities`, `status`, and registry-provided verification metadata (informational)
- Make search fast enough for interactive UI:
  - target: <100ms p95 on typical local catalogs (10s–1000s of agents)
- Keep discovery safe and deterministic.

### 2.2 Goals (Optional semantic index)
- Improve ranking for natural-language queries (“agents that analyze git commits”)
- Support hybrid ranking (semantic + keyword + curated signals)
- Allow multiple backends:
  - Graphonomous-based semantic retrieval (preferred portfolio alignment)
  - Pluggable providers (future)

### 2.3 Non-goals (Phase 1.5)
- Switching Core DB to Postgres (Core remains SQLite-first)
- Requiring embeddings or network for search to function
- A global reputation “trust score” system (can be layered later; see `TRUST_AND_REGISTRY.md`)
- Personalization, collaborative filtering, or “trending” feed (later)

---

## 3) Data model (SQLite-first)

This spec assumes Core’s catalog is stored in SQLite (via Ecto). Exact schema names may differ, but the data requirements are stable.

### 3.1 Agents table: searchable fields

Core MUST store (from manifest / registry entry):
- `agent_id` (primary key)
- `name`
- `description`
- `version`
- `keywords` (optional; array or normalized table)
- `integration_points` (optional; array or normalized table)
- `capabilities` (manifest list; optional normalized table)
- `status` (local_uninstalled / installed / enabled / running / etc.)
- `manifest_path` (local only)
- `manifest_hash`
- `last_seen_at`, `discovered_at`

Core MAY store registry-derived metadata (informational only):
- `publisher` display object
- `verification` (level/badge; issuer/evidence URL)
- `trust_score` (if present) MUST be treated as informational unless a verification system is implemented

### 3.2 Normalization: capabilities
Capabilities should be queryable as filters. SQLite-friendly options:
- Store `capabilities_json` as JSON text, plus an application-side filter (acceptable for small catalogs)
- Or a normalized join table: `agent_capabilities(agent_id, capability_id)` (preferred for SQL filtering)

Capability IDs are not globally enforced in v1; they are **recommendations**.
- If you want canonical IDs later, treat them as a standards doc, not a hard schema requirement.

---

## 4) Phase 1.5: Catalog Search (no embeddings)

### 4.1 Search inputs
Search MUST operate on safe metadata already in the catalog:
- `agent_id`, `name`, `description`
- `keywords`, `integration_points`
- `capabilities` (if present)
- registry badges (verification level) if present

### 4.2 Query behavior (recommended)
- Tokenize query string into terms (lowercased).
- Prefer exact matches on `agent_id` and name prefixes.
- Boost matches in `keywords` and `integration_points`.
- Fall back to scanning `description`.

This should be implemented as either:
- SQLite `LIKE` queries with careful escaping + ranking in application code, or
- SQLite FTS (FTS5) if you choose to enable it (optional; not required).

### 4.3 Filters (Phase 1.5 baseline)
Support filters with deterministic behavior:

- `status`: `[:installed, :enabled, :running]` (plus local states)
- `capabilities`: match `:any` or `:all`
- `verification_level`: `0..4` (informational; from registry metadata)
- `publisher`: string (informational)
- `integration_points`: any/all

### 4.4 API shape (conceptual)
This is a *spec-level* shape; implementation may differ:

- `Catalog.search(query, opts)` returns:
  - list of agent records
  - an explanation payload for ranking (optional)
  - does not require network

---

## 5) Optional semantic indexing (derived index)

Semantic indexing is a background subsystem that improves ranking. It is not part of discovery scans.

### 5.1 When semantic indexing runs
Semantic indexing MAY run:
- after discovery scan completes (as a separate job)
- after registry sync completes (as a separate job)
- on-demand (manual CLI command)

It MUST NOT run inline during discovery.

### 5.2 What gets embedded / indexed
Semantic indexing input MUST be derived from safe catalog fields:
- `name`
- `description`
- `keywords`
- `integration_points`
- optionally a safe tool summary (display-only; never fetched by executing agent code)

Recommended “document text” template:
- `{name}. {description}. Keywords: {keywords}. Integrations: {integration_points}. Capabilities: {capabilities}.`

### 5.3 Provider options

#### Option A (preferred): Graphonomous-backed semantic retrieval
In the portfolio, Graphonomous is the knowledge/embedding layer. Semantic search can be implemented as:
- Core publishes agent “documents” into a Graphonomous collection, e.g. `opensentience_agents`
- Search queries call a Graphonomous tool and return ranked agent IDs + similarity scores

Benefits:
- avoids forcing Core to adopt Postgres/pgvector
- keeps embeddings and semantic ranking in the component designed for it
- enables future hybrid search using graph signals and provenance

Constraints:
- Graphonomous must be installed/enabled/run for semantic search
- indexing must be auditable and secret-free

#### Option B: Pluggable semantic providers (future)
Core defines a provider interface (behavior) and supports multiple backends:
- local embeddings (if available)
- remote embeddings APIs
- SQLite vector extensions (if adopted later)
- Postgres/pgvector (if you intentionally move Core to Postgres later)

Important: A provider that requires network or API keys must be explicitly enabled and must fail gracefully.

### 5.4 Provider interface (conceptual)
A semantic provider must support:

- `enabled?()`  
- `index_agents(agent_docs)` (batch)  
- `search(query, opts)` returning ranked results with scores  
- `health()` for UI visibility

Provider must guarantee:
- no secret persistence
- deterministic behavior in offline mode (or clear “unavailable” error)

---

## 6) Avoiding network during discovery (explicit rule)

### 6.1 Discovery pipeline is network-free
During `agents.scan` / discovery:
- do not call embedding APIs
- do not call Graphonomous
- do not call remote registries (registry sync is separate)

### 6.2 Semantic indexing is opt-in and auditable
Semantic indexing MUST be treated as a stateful operation:
- record audit event `semantic_index.started` / `semantic_index.completed` / `semantic_index.failed`
- include safe metadata:
  - number of agents indexed
  - provider name
  - duration
  - catalog manifest hashes (optional)
- never record raw query text in durable audit by default (store counts and safe summary only)

---

## 7) Ranking model (Phase 1.5 and beyond)

### 7.1 Phase 1.5 ranking (deterministic)
Default ranking should not depend on unverifiable signals.

Recommended factors:
- exact `agent_id` match
- name prefix match
- keyword match count
- description term matches

Optional (if present):
- verification level (badge) can be used as a tie-breaker, not a multiplier
- install/usage counts can be used only if Core actually records them

### 7.2 Semantic ranking (optional)
If semantic provider is enabled:
- start with semantic similarity score
- blend with deterministic keyword score
- apply operator-configurable thresholds (e.g., hide Level 0 if desired)

Do not multiply by “trust_score” unless you have a defined, implemented trust computation pipeline.
If registry provides `trust_score`, treat it as informational or a tie-breaker until the trust model is enforced.

---

## 8) CLI and UI requirements

### 8.1 CLI (Phase 1.5)
Provide commands (names illustrative; Core may use Mix tasks initially):

- `opensentience agents search "<query>" [--filters ...]`
- `opensentience agents search --keywords "a,b,c"` (optional)
- `opensentience semantic-index rebuild` (optional; if semantic indexing enabled)

### 8.2 Admin UI (Phase 1.5)
- search box on agents list
- filters (status, capabilities, verification badge)
- results show:
  - id, name, description
  - verification badge (if any)
  - status (installed/enabled/running)
  - (optional) “semantic results” indicator when provider enabled

UI must continue working if semantic provider is unavailable.

---

## 9) Performance targets (realistic for SQLite-first)

### 9.1 Phase 1.5 (metadata search)
- p95 < 100ms for catalogs up to low thousands of agents on a typical dev machine
- updates should not block discovery; indexing should be incremental

### 9.2 Semantic search (optional)
- Graphonomous-backed retrieval should target interactive latencies, but exact p95 depends on collection size and embedding model.
- Core should cache recent query results (short TTL) if necessary, but must not persist raw query text by default.

---

## 10) Testing strategy

### 10.1 Unit tests
- search tokenization and ranking rules
- filter semantics (any/all capabilities)
- stable ordering for ties

### 10.2 Integration tests
- discovery scan produces catalog entries without network
- semantic indexing job is not triggered during discovery
- when semantic provider is disabled/unavailable:
  - search still works (metadata mode)
- when Graphonomous is enabled (if used):
  - indexing publishes derived docs
  - search returns ranked agent IDs that exist in catalog

### 10.3 Security regression tests
- ensure no secrets are persisted in catalog, audit, or semantic index payloads
- ensure search input is safely handled (SQL injection resistant; bounded lengths)

---

## 11) Acceptance criteria

Phase 1.5 is complete when:

- [ ] Users can search agents via CLI/UI using free-text + filters
- [ ] Search works with SQLite-only, without Graphonomous, without any network calls
- [ ] Discovery scans do not perform network calls
- [ ] (Optional) Semantic indexing can be enabled and runs as a separate audited job
- [ ] System behaves gracefully when semantic provider is unavailable (no broken UI)
- [ ] All durable artifacts remain secret-free

---

## 12) Future enhancements (explicitly deferred)
- Hybrid search blending semantic + keyword + graph signals (Graphonomous)
- Query expansion, multilingual support
- Trending/recommendations based on usage (requires explicit measurement + privacy stance)
- Enforced verification levels or computed trust scores (requires governance pipeline)
- SQLite vector extensions or Postgres migration (only if intentionally chosen later)

---