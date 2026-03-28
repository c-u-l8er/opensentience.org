# OpenSentience — Agent Interface

OpenSentience is the research publication arm of the [&] Protocol ecosystem. It defines six protocols for machine cognition.

## For agents

OpenSentience does not expose MCP tools directly. Agents interact with OpenSentience protocols through their implementing products:

| Protocol | Implementing Product | MCP Provider |
|---|---|---|
| OS-001 Continual Learning | Graphonomous | `graphonomous` MCP server |
| OS-002 Topological Routing | AmpersandBoxDesign reference impl | `&reason.deliberate` contract |
| OS-003 Deliberation | AmpersandBoxDesign reference impl | `&reason.deliberate` contract |
| OS-004 Attention Engine | Graphonomous | `attention_survey`, `attention_run_cycle` |
| OS-005 Model Tier Adaptation | Per-provider implementation | tier-aware budgets |
| OS-006 Governance Shim | Delegatic | policy + audit APIs |

## Spec location

- `project_spec/README.md` — full protocol specifications
- Parent protocol: https://ampersandboxdesign.com
