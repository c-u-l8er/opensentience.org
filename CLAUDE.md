# OpenSentience — Research Protocols for Machine Cognition

Research arm of [&] Ampersand Box Design. Publishes theoretical foundations, empirical protocols, and open questions that guide the [&] product ecosystem.

## Source-of-truth spec

- `docs/spec/README.md` — OpenSentience research protocols specification

## Published protocols

| Protocol | ID | [&] Primitive | Status |
|---|---|---|---|
| Continual Learning | OS-001 | `&memory.graph` | v0.1.12 shipped (Graphonomous) |
| Topological Routing (κ) | OS-002 | `&reason.deliberate` | spec complete |
| Deliberation Orchestrator | OS-003 | `&reason.deliberate` | spec complete |
| Attention Engine | OS-004 | meta-reasoning | spec complete |
| Model Tier Adaptation | OS-005 | system | spec complete |
| Agent Governance Shim | OS-006 | governance | in development |

## Relationship to other projects

- OpenSentience defines the theoretical protocols; [&] portfolio companies implement them
- Graphonomous implements OS-001 (continual learning)
- AmpersandBoxDesign implements OS-002 through OS-005 as prompts and contracts
- Delegatic implements OS-006 (governance)
- This is a static site — no build process
