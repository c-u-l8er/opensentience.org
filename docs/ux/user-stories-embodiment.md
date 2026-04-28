# Embodiment (body-browser + body-os) — User Stories

Canonical user-story catalog covering both `body-browser/` and `body-os/` (shared OS-011 Embodiment Protocol). Used for Playwright tests + Claude Design input.

**Scope:** OS-011 — `&body.*` reference implementations. Browser via `agent-browser` CLI; OS via `body-os-shim` / OpenClaw / Claude Computer Use.
**Unit-test surface covered:** `body-browser/test/**` (41 tests) + `body-os/test/**` (41 tests). Both have Simulator + live backends.

---

## Story 1 · Browser agent records a website workflow as SkillCandidate

- **Persona:** RPA developer automating expense-report submission
- **Goal:** Agent learns a multi-step browser workflow; consolidation converts it to shareable SkillCandidate
- **Prerequisite:** `body-browser` active; `agent-browser` CLI responding
- **Steps:**
  1. Agent calls `perceive(mode=full)` → EnvironmentObservation with DOM + `state_hash=H0`
  2. Calls `affordances()` → `{click@e_login, fill@e_email, click@e_submit, …}`
  3. Plans: `[click@e_login, fill@e_email, fill@e_password, click@e_signin, navigate@expense_form, …]`
  4. For each step: `act(typed_action)` → InteractionTrace edge (`H_i → H_{i+1}`)
  5. Final step done; Trace stored; after N successful replays, consolidation creates SkillCandidate
  6. SkillCandidate: `representative_trace`, `affordance_set`, `replay_success_rate=0.95`
- **Success:** SkillCandidate sent to FleetPrompt marketplace; another agent installs + replays
- **Covers:** `perceive`/`act`/`affordances`/`encode_state`, state_hash generation, InteractionTrace schema, SkillCandidate promotion — ~25 unit tests
- **UI status:** planned (MCP tools live; visualization planned via RuneFort)
- **Claude Design hook:** Workflow replay visualization — state-hash progression (H0→H14) + affordance annotations per step

## Story 2 · OS agent learns deployment script + replays on different machine

- **Persona:** Dark-factory operator automating ML-model deployment
- **Goal:** Agent A learns deploy workflow; Agent B replays on different codebase with policy re-auth
- **Prerequisite:** `body-os` active; Delegatic policies attached
- **Steps:**
  1. Machine A: Agent perceives `cwd=/repo_a, git.head=abc123, H0`. Learns `[edit_file, git_add, git_commit, git_push]`
  2. Each destructive action emits SurpriseSignal if forward model diverges
  3. Trace stored with affordance metadata: `{file_edit@/repo_a/CHANGELOG.md, git_push@origin}`
  4. Machine B: install SkillCandidate; call `body.os.replay(Trace)`:
     - `encode_state()` normalizes H0→H0' (path mapping)
     - For each edge: re-authorize via Delegatic policy check
     - Execute; verify hash progression
     - On divergence: fail-fast + SurpriseSignal
  5. Outcome recorded with trace_id + goal_id + re-auth decisions
- **Success:** ~85% state-hash fidelity despite path differences
- **Covers:** mode=full perceive, affordance enumeration (shell_exec, file_edit), state_hash normalization, replay FSM, policy re-auth — ~30 unit tests
- **UI status:** planned (cross-machine replay verified via tests in v0.1)
- **Claude Design hook:** Side-by-side trace diff (A vs B) with re-auth checkpoints highlighted

## Story 3 · Agent emits SurpriseSignal when forward model diverges

- **Persona:** CL engineer improving agent planning via forward-model calibration
- **Goal:** Agent predicts action outcome; actual diverges; learning loop updates model
- **Prerequisite:** Forward model trained (external); body-browser active; Graphonomous available
- **Steps:**
  1. Agent perceives product listing, H0
  2. Forward model predicts: `click@e_add_to_cart → {page: cart, item_count: +1, H1_pred}`
  3. Agent acts → H1_actual
  4. Encode H1_actual, compare to H1_pred
  5. Mismatch: H1_actual shows auth modal not cart. `surprise_magnitude=0.82`
  6. Emit SurpriseSignal (PULSE v0.1.1 token) → Graphonomous `learn.from_interaction`
  7. Updates forward-model confidence; plan revised to insert login step first
- **Success:** Plan revision visible in next episode; surprise captured for later analysis
- **Covers:** state_hash comparison, surprise magnitude calc, SurpriseSignal emission, Graphonomous integration — ~15 unit tests
- **UI status:** mcp-only
- **Claude Design hook:** Surprise event timeline — predicted vs actual state + forward-model delta visualization

## Story 4 · Affordance-bounded action selection with policy filtering

- **Persona:** Governance-aware agent respecting org policy
- **Goal:** Actions bounded by both environment affordances AND policy
- **Prerequisite:** Delegatic policy filter available; body provider active
- **Steps:**
  1. `perceive()` → EnvironmentObservation with available actions
  2. `affordances()` → `full_affordance_set = {file_delete, shell_exec, navigate, …}`
  3. Query Delegatic: `policy_filter(org_id, action_set)` → subset (shell_exec denied)
  4. `bounded_set = full_set ∩ policy_set`
  5. Agent plans using `bounded_set` only
  6. Audit event: action selected from bounded set
- **Success:** No policy-denied actions attempted; governance boundary respected
- **Covers:** affordance enumeration, policy filter contract, bounded action selection — ~12 unit tests
- **UI status:** planned (Phase 2 Delegatic integration)
- **Claude Design hook:** Affordance chooser — full set (red X denied) vs filtered (green ✓)

## Story 5 · Cross-machine skill transfer fidelity measurement

- **Persona:** Fleet manager measuring skill transfer quality
- **Goal:** Measure `replay_success_rate` across machines; identify when skill needs re-training vs generalizes
- **Prerequisite:** SkillCandidate with representative_trace; multiple machines; PRISM integration
- **Steps:**
  1. Machine A consolidation detects 100 successful replays → SkillCandidate
  2. SkillCandidate → FleetPrompt
  3. PRISM scenario: Machine B installs + replays 20× → measure fidelity
  4. For each replay: compare state_hash, record divergence events
  5. PRISM judges: `replay_success_rate ≥0.9` = "transfer-ready"; <0.7 = "environment-specific"
  6. Feedback to consolidation: next cycle prioritizes generalizable skills
- **Success:** Fleet insights into skill generalization; fidelity becomes first-class PRISM dim
- **Covers:** SkillCandidate creation, replay fidelity measurement, PRISM integration, feedback loop — ~18 unit tests
- **UI status:** planned (tight PRISM integration; Phase 2-3)
- **Claude Design hook:** Skill generalization heatmap (machine × skill) highlighting "golden" universal skills

---

**Tests to implement first:** Story 1 + Story 2 cross-machine replay are already covered by the live-smoke tests (`body-browser-cross-machine`, `body-browser-agent-browser`) in e2e-dashboard. Playwright user-story tier would add visual proof — trace records + replay video side-by-side.
