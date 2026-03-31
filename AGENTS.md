# OpenSentience — Agent Interface

OpenSentience is the research publication arm of the [&] Protocol ecosystem. It defines eight protocols for machine cognition.

## For agents

OpenSentience does not expose MCP tools directly. Agents interact with OpenSentience protocols through their implementing products:

| Protocol | Implementing Product | MCP Provider |
|---|---|---|
| OS-001 Continual Learning | Graphonomous | `graphonomous` MCP server |
| OS-002 Topological Routing | AmpersandBoxDesign reference impl | `&reason.deliberate` contract |
| OS-003 Deliberation | AmpersandBoxDesign reference impl | `&reason.deliberate` contract |
| OS-004 Attention Engine | Graphonomous | `attention_survey`, `attention_run_cycle` |
| OS-005 Model Tier Adaptation | Per-provider implementation | tier-aware budgets |
| OS-006 Governance Shim | `open_sentience` hex package | governance MCP tools |
| OS-007 Adversarial Robustness | OpenSentience security module | security audit events |
| OS-008 Agent Harness | OpenSentience harness module | `harness_start_session`, `harness_sprint_status` |

## Spec location

- `docs/spec/README.md` — full protocol specifications (OS-001 through OS-007)
- `docs/spec/OS-008-HARNESS.md` — Agent Harness Protocol specification
- Parent protocol: https://ampersandboxdesign.com
