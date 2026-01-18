# OpenSentience — Component Project Spec

OpenSentience is the **always-running core** of the portfolio.

## Canonical specs

- `agent_marketplace.md`
  - OpenSentience Core architecture
  - Marketplace (discover/sync/install/enable/run)
  - Local Admin UI + Chat on `127.0.0.1:6767`
  - Runtime protocol (Core ↔ Agent), including the message envelope (see Section 8)
  - Safe-by-default workflow

- `RUNTIME_PROTOCOL.md`
  - Concrete Core ↔ Agent protocol (v1): transport, framing, envelope, tool calls, streaming, cancellation, heartbeats

- `portfolio-integration.md`
  - How FleetPrompt, Graphonomous, Delegatic, and A2A fit together
  - Local resource conventions (`~/.opensentience`, `.fleetprompt/`)

## Additional specs (recommended next)

These documents complement the canonical specs above:

- `SEMANTIC_DISCOVERY.md`
  - Semantic agent search: MVP-safe metadata search, with optional semantic indexing via Graphonomous or a pluggable backend later

- `WORKFLOW_ORCHESTRATION.md`
  - Workflow orchestration proposal and execution model (note: portfolio ownership is FleetPrompt + Delegatic; Core routes + audits)

- `RESOURCE_LIMITS.md`
  - Resource limits and sandboxing roadmap (timeouts, rate limits, OS-level controls)

- `fleetprompt.com/project_spec/MARKETPLACE_COMMERCIAL.md`
  - FleetPrompt Marketplace (commercial): accounts, Stripe Connect payouts, listings, entitlements, artifacts/download delivery, and the Ash+Phoenix+Inertia+Svelte stack

- `TRUST_AND_REGISTRY.md`
  - Registry metadata, provenance, verification levels, and drift/approval posture (MVP-aligned)

- `OBSERVABILITY_AND_METRICS.md`
  - Correlation-driven observability: audit/logs/metrics/traces posture, retention, and export guidance

- `AGENT_TESTING.md`
  - Protocol contract tests + agent-owned test suites (determinism, safety, CI expectations)

## Cross-portfolio standards (adopted)

Also follow:

- `project_spec/standards/agent-manifest.md`
- `project_spec/standards/signals-and-directives.md`
- `project_spec/standards/security-guardrails.md`
- `project_spec/standards/tool-calling-and-execution.md`

## Implementation stance (short)

- Core must not load arbitrary agent code in-process.
- Discovery/indexing must not execute agent code.
- Install/compile is an explicit trust boundary.
- Admin UI must be localhost-only and protected against drive-by actions.
