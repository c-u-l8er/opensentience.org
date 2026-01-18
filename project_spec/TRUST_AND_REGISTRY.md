# OpenSentience Trust & Registry Model (MVP-aligned)

**Status:** Draft (aligned with current Core + registry design)  
**Scope:** Trust, provenance, and optional verification metadata for agent discovery/installation.  
**Primary specs:**  
- `opensentience.org/project_spec/agent_marketplace.md` (discovery + install/enable/run)  
- `opensentience.org/project_spec/RUNTIME_PROTOCOL.md` (session token, manifest hash, tool registration)  
- `project_spec/standards/agent-manifest.md` (manifest fields and permission string format)  
- `project_spec/standards/security-guardrails.md` (no secrets, explicit side effects, localhost UI hardening)

---

## 0) Executive summary (the “truth” of the current architecture)

OpenSentience currently treats **trust** as a set of **explicit, auditable user decisions** at clear boundaries:

1. **Discovery is non-executing**: the Core reads `opensentience.agent.json` and indexes metadata; it does not execute agent code.
2. **Install/build is a trust boundary**: fetching code and compiling dependencies is explicitly initiated and audited (compilation may execute macros).
3. **Enablement is permission-gated**: an agent cannot run until requested permissions are explicitly approved (deny-by-default, subset approval).
4. **Runtime is isolated**: the Core does not load agent code in-process; agents are separate OS processes and authenticate with a short-lived session token.
5. **Auditability is first-class**: privileged actions and tool routing are recorded in a secret-free audit log.

What we **do not** have today (and therefore this document does not pretend exists): global “trust scores”, community reviews, PKI/attestation enforcement, semantic search ranking by trust, etc. Those can be layered later, but they’re not required to make the MVP safe and useful.

This document defines a **registry metadata and verification model** that fits those realities.

---

## 1) Goals and non-goals

### 1.1 Goals (MVP + near-term compatible)
- Make the registry a **pure-data index** (git-based sync) that Core can clone/pull and display as “available to install”.
- Provide clear **provenance** for each agent (where it comes from, what ref is recommended, what manifest hash is expected).
- Support **optional verification metadata** (publisher identity hints, signatures, attestations) without requiring any of it to function.
- Ensure Core can produce a “trust story” in the UI/CLI:
  - *What did you install? From where? At which ref? With what manifest hash? When was it enabled and with which permissions?*

### 1.2 Non-goals (v1)
- Enforcing PKI / ZK proofs / third-party certification.
- Computing a global trust score or marketplace rating system.
- Preventing all malicious code (cannot be solved purely at the registry layer).
- Running untrusted builds in a hardened sandbox (recommended later; not assumed here).

---

## 2) Definitions

- **Agent**: A runnable program exposing tools to OpenSentience Core via the runtime protocol.
- **Manifest**: `opensentience.agent.json` at repo root (per `project_spec/standards/agent-manifest.md`).
- **Registry**: A git repository containing agent entries (pure data) used for *remote discovery*.
- **Publisher**: The entity that controls the agent’s source repository and releases (could be an individual or org).
- **Verification**: Any evidence that a publisher or artifact is what it claims to be (e.g., signature, known key, org claim).
- **Trust boundary**: A step where code may execute or side effects may occur (e.g., build, run, tool call).

---

## 3) Threat model (what the registry can and cannot protect)

### 3.1 Things the registry helps with
- **Registry poisoning visibility**: registry entries are version-controlled; changes are reviewable.
- **Provenance clarity**: you can see `git_url`, pinned refs, and expected manifest hash.
- **Tamper evidence**: optional signatures/checksums can make unauthorized changes detectable.

### 3.2 Things the registry cannot fully solve
- A legitimate publisher can ship malicious code.
- A dependency can be compromised after publication.
- A build step may execute arbitrary code (Elixir macros, build scripts).
- An enabled agent may still behave badly within its approved permissions.

Because of this, OpenSentience’s core posture remains:
- *deny-by-default permissions + explicit enablement + process isolation + auditability.*

---

## 4) Trust boundaries and what gets recorded

### 4.1 Discovery (local)
- Reads `opensentience.agent.json`.
- Computes `manifest_hash` from raw bytes.
- Stores safe metadata in the catalog.
- Emits audit event(s), e.g. `agent.discovered` / `agent.updated`.

### 4.2 Registry sync (remote discovery)
- Clones/pulls a registry git repo.
- Reads agent entries (pure data).
- Presents entries as “available to install”.
- Emits audit event(s), e.g. `registry.synced` (recommended), including:
  - registry repo URL
  - registry ref (commit hash)
  - number of entries read

### 4.3 Install
- Fetch sources (git clone/fetch/checkout) into `~/.opensentience/agents/<agent_id>/src`.
- Emits `agent.installed` with safe metadata:
  - `git_url`, `ref`, destination path, registry ref (if installed via registry)

### 4.4 Build (explicit trust boundary)
- Runs compilation steps (`mix deps.get`, `mix deps.compile`, etc).
- Emits `agent.build_started` and `agent.built` / `agent.build_failed`.
- The UI/CLI should label this as: **“Build executes third-party code.”**

### 4.5 Enable (permission approval)
- Approves a subset of manifest permissions (or all).
- Stores approval record keyed to a drift-detection input (manifest hash and/or requested-permissions hash).
- Emits `agent.enabled` (and `agent.permissions_revoked` on revoke).

### 4.6 Run
- Launcher starts the agent in a separate OS process.
- Core passes a short-lived **session token** and connection info.
- Agent authenticates via `agent.hello` (see `RUNTIME_PROTOCOL.md`) and may include `manifest_hash`.
- Emits lifecycle audit events: `agent.run_started`, `agent.run_stopped`, `agent.run_crashed`.

### 4.7 Tool routing (Phase 2+)
- Core enforces permissions at the router boundary before sending `core.tool.call`.
- Tool invocations are audited (inputs/outputs redacted best-effort, secret-free).
- Correlation fields (`correlation_id`, `causation_id`, `request_id`) tie tool calls to the unified timeline.

---

## 5) Registry: structure and required fields (pure data index)

### 5.1 Registry repository
- The registry is a git repo.
- It contains one or more files describing available agents.
- The Core treats registry content as untrusted input, but **pure data**:
  - parse only
  - validate shape
  - never execute

### 5.2 Minimal agent entry (MVP)
A registry entry MUST provide enough information to fetch the agent source and locate its manifest:

```/dev/null/opensentience_registry_entry.json#L1-33
{
  "id": "com.example.git-helper",
  "git_url": "https://github.com/example/git-helper",
  "default_ref": "v1.2.3",
  "manifest_path": "opensentience.agent.json",

  "display": {
    "name": "Git Helper",
    "summary": "Helps generate commit messages and analyze diffs",
    "tags": ["git", "code"]
  }
}
```

Notes:
- `display.*` is non-authoritative convenience metadata for browsing; the manifest remains canonical for permissions/entrypoint.

### 5.3 Strongly recommended fields (provenance + drift detection)
These fields improve safety and operator confidence without requiring heavyweight infrastructure:

```/dev/null/opensentience_registry_entry_recommended.json#L1-44
{
  "id": "com.example.git-helper",
  "git_url": "https://github.com/example/git-helper",
  "default_ref": "v1.2.3",
  "manifest_path": "opensentience.agent.json",

  "expected": {
    "manifest_hash": "sha256:...optional...",
    "source_commit": "abc123...optional..."
  },

  "publisher": {
    "name": "Example, Inc.",
    "website": "https://example.com",
    "contact": "security@example.com",
    "repository_owner": "example"
  }
}
```

- `expected.manifest_hash` is used to warn if the installed manifest differs from what the registry claims.
- `expected.source_commit` is used to pin exact source when desired.

---

## 6) Verification model (fits the current system)

OpenSentience MVP should treat “verification” as **informational** and **non-blocking** unless a user config explicitly enforces thresholds.

### 6.1 Verification levels (informational, not a score)
These levels are designed to be implementable incrementally and map cleanly to UI badges/filters.

- **Level 0 — Unverified**
  - Default for all agents.
  - Means: “We have no verified identity or artifact attestations.”

- **Level 1 — Publisher-claimed**
  - Registry entry includes `publisher` metadata.
  - Means: “The publisher claims identity info; not cryptographically proven.”

- **Level 2 — Registry-verified (curation)**
  - Registry maintainers assert “this entry was reviewed”.
  - Implementable as: a boolean flag in entry + governance in the registry repo PR process.
  - Means: “Curated by this registry; still not a cryptographic guarantee.”

- **Level 3 — Signed metadata (optional)**
  - Registry entry (or registry commit/tag) is signed by a known key.
  - Means: “Tampering with registry content is detectable; publisher/registry identity can be anchored.”

- **Level 4 — Artifact attested (future)**
  - Attestation that a specific commit/tag corresponds to a built artifact or audited source.
  - Means: “Stronger supply-chain guarantees.” (Out of scope for MVP.)

### 6.2 What Core does with verification levels (MVP behavior)
- Core displays verification status in:
  - registry listing UI/CLI
  - agent detail view after install
- Core does **not** auto-enable permissions or auto-run based on verification.
- Core can optionally provide configuration such as:
  - “Only show registry entries at Level ≥ 2”
  - “Warn if Level 0 and requesting `network:*` permissions”
  (These are policy knobs, not required for MVP.)

---

## 7) Optional cryptographic hooks (designed for later, harmless now)

This section defines shapes that can exist in registry entries without requiring Core to implement verification immediately.

### 7.1 Registry entry signatures (optional)
```/dev/null/opensentience_registry_signatures.json#L1-33
{
  "id": "com.example.git-helper",
  "git_url": "https://github.com/example/git-helper",
  "default_ref": "v1.2.3",
  "manifest_path": "opensentience.agent.json",
  "expected": { "manifest_hash": "sha256:..." },

  "verification": {
    "level": 3,
    "signed_by": "registry:opensentience-public",
    "signature": {
      "alg": "ed25519",
      "key_id": "ed25519:abc123...",
      "sig": "base64..."
    }
  }
}
```

MVP-compatible interpretation:
- If Core cannot validate `signature`, it treats the agent as Level 0/1 and shows a “signature present but not verified” note.
- If/when Core implements signature validation, it can upgrade the displayed level.

### 7.2 Publisher key registry (future)
If implemented, keys should live in the registry repo, reviewed like code, and referenced by `key_id`. This keeps trust roots explicit and auditable.

---

## 8) “Trust story” UX requirements (what users must be able to see)

For any installed agent, the system should make it easy to answer:

1. **Source**
   - Which `git_url`?
   - Which ref/commit?
   - Was it installed from a registry? Which registry commit?

2. **Identity & verification**
   - Is the publisher unverified/curated/signed?
   - Was there an expected manifest hash? Did it match?

3. **Permissions**
   - What permissions were requested in the manifest?
   - What subset was approved (and when)?
   - Did the manifest change since approval (drift)?

4. **Execution**
   - When did the agent run?
   - What tools were called and by whom (actor attribution)?
   - What failed (secret-free error codes/messages)?

This is the “enterprise-grade” baseline that matches the current architecture: clarity, auditability, and explicit control.

---

## 9) Drift detection and re-approval rules (MVP-aligned)

Drift detection is a core safety mechanism and is already part of the design vocabulary (manifest hashes, requested-permissions hash, `agent.hello.manifest_hash`).

### 9.1 Drift detection inputs (recommended)
- `manifest_hash` (computed from raw manifest bytes at discovery/install time)
- `requested_permissions_hash` (hash of sorted permissions array)

### 9.2 Enforcement rules (recommended)
- If the manifest changes (hash mismatch), Core MUST:
  - mark the agent as requiring re-review
  - block “Run” until permissions are re-approved
- If the agent connects and reports a different `manifest_hash` in `agent.hello`:
  - Core SHOULD close the connection and record an audit event (possible tampering or wrong build output).

---

## 10) Audit event guidance (trust-relevant, secret-free)

This document does not define the full audit taxonomy, but these events are strongly recommended for trust provenance:

- `registry.sync_started` / `registry.synced` / `registry.sync_failed`
  - metadata: registry url, commit, counts
- `agent.installed`
  - metadata: git url, ref/commit, install path, registry commit (if applicable)
- `agent.build_started` / `agent.built` / `agent.build_failed`
  - metadata: command identifiers (not raw secrets), durations, exit codes
- `agent.enable_requested` / `agent.enabled` / `agent.permissions_revoked`
  - metadata: requested hash, approved list summary, approval scope key
- `agent.manifest_drift_detected`
  - metadata: old/new hash, old/new requested-permissions hash
- `security.denied`
  - metadata: operation attempted, reason code

All metadata MUST be secret-free (per portfolio guardrails).

---

## 11) Recommendations (practical next increments)

These are small, architecture-consistent steps that improve trust without reinventing the system:

1. **Add “Provenance” to agent detail UI/CLI**
   - show registry commit (if installed via registry)
   - show installed git commit
   - show manifest hash and drift status

2. **Add `expected.manifest_hash` support to registry sync**
   - warn on mismatch during install
   - do not block by default

3. **Add “Verification badge” as informational**
   - Level 0–2 can be implemented immediately (unverified / publisher-claimed / curated)
   - Level 3 can be displayed as “signature present” until validation exists

4. **Do not add “trust score” yet**
   - A numeric score implies objectivity and a computation pipeline.
   - The MVP architecture is better served by clear provenance + drift detection + explicit permission gates.
   - If ratings/reviews are added later, treat them as separate from security verification.

---

## 12) Compatibility notes with the runtime protocol

This trust model intentionally aligns with:
- `RUNTIME_PROTOCOL.md`:
  - session tokens for connection authentication
  - `agent.hello.manifest_hash` for drift detection
  - correlation IDs for audit timeline linkage
- `agent_marketplace.md`:
  - local and remote discovery split
  - safe-by-default install/enable/run workflow
  - process isolation boundary

---

## 13) Open questions (explicit, non-blocking)

1. Should enablement approvals be keyed by:
   - `agent_id + manifest_hash`, or
   - `agent_id + git_commit`, or
   - `agent_id + version`?
   (MVP recommendation: include `requested_permissions_hash` + `manifest_hash` at minimum.)

2. Do you want any default policy warnings, e.g.:
   - “Unverified agent requesting `network:egress:*`”
   - “Agent requesting `filesystem:write:~/**`”
   (Recommended, but should be warnings, not blockers by default.)

3. Which registry governance model will you use?
   - single curated registry
   - multiple registries (public + private)
   - per-tenant registries (future)

---