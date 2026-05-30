# box_and_box_aios.ex
#
# An AI operating system whose kernel is box-and-box.
#
# ⚠ REFERENCE HOST. This file has TWO surfaces:
#
#   1. BoxAndBox.Kernel + the Demo — an ILLUSTRATIVE inline mini-verdict that shows the
#      kernel-as-host *shape*. It is a teaching artifact and is NOT itself conformant.
#   2. BoxAndBox.Conformant — the REAL path: it shells out to the conformance-tested JS
#      engine (`bin/govern.mjs`, the 97-law substrate that lives beside this file) and
#      returns its certificate. Same arithmetic, same verdict, in any host language.
#
# So if you want a verdict you can trust, call BoxAndBox.Conformant.govern/1 (it requires
# Node ≥18 on PATH). The inline kernel is only for reading the shape. Note: Elixir was not
# run in the build environment, so treat the inline demo's output as documentation.
#
# AIOS (Mei et al., Rutgers; COLM 2025) made the case that an agent runtime should be
# shaped like an operating-system kernel: a scheduler, a memory manager, a tool manager,
# and — crucially — an *access manager* that verifies an agent's rights *before* it acts,
# because "unrestricted access to LLM or tool resources can lead to harmful allocation."
#
# box-and-box is the governance core that kernel is missing. Where AIOS's access manager
# is one yes/no check, box-and-box makes EVERY syscall pass the full bridge —
#
#     feasible (alethic) ▸ permitted (deontic) ▸ best (axiological)
#
# — over a temporal safety watchdog, an affine resource budget, and a self-amending policy
# whose entrenched floor (ring 0) can never be weakened. Every verdict ships a certificate.
#
# This file is the reference *host*. The conformance-tested verdict engine is `box-and-box`
# (the npm / edge package — 97 property-tested laws); this Elixir kernel speaks the same
# arithmetic, so a verdict here and a verdict there are identical. Agents may be any model:
# Claude, GPT, Gemini, a local 7B. To the kernel they are all just processes making syscalls.

defmodule BoxAndBox.Cert do
  @moduledoc "An auditable verdict. Every syscall returns one — never a bare yes/no."
  defstruct decision: nil, status: :deny, score: 0, obligated: false,
            why: "", vetoed: [], escalation: nil, charged: 0
end

defmodule BoxAndBox.Agent do
  @moduledoc """
  The agent SDK. `use BoxAndBox.Agent`, then declare each action the model may take with its
  *modal profile* — the facts the kernel needs to judge it. The agent never touches the world
  directly: it proposes; the kernel decides.
  """
  defmacro __using__(_opts) do
    quote do
      import BoxAndBox.Agent
      Module.register_attribute(__MODULE__, :actions, accumulate: true)
      @before_compile BoxAndBox.Agent
    end
  end

  @doc "Declare an action and the modal profile the kernel will govern it by."
  defmacro defaction(name, profile) do
    quote bind_quoted: [name: name, profile: profile] do
      defaults = %{name: name, feasible: true, confident: true, forbidden: false,
                   obligated: false, utility: 1, cost: 1, caps: []}
      @actions Map.merge(defaults, Map.new(profile))
    end
  end

  defmacro __before_compile__(_env) do
    quote do
      @doc "Every action this agent may propose, each with its modal profile."
      def actions, do: Enum.reverse(@actions)
    end
  end
end

defmodule BoxAndBox.Conformant do
  @moduledoc """
  The REAL, conformance-tested verdict — by delegating to the box-and-box JS CLI (the
  97-law engine). This is how a host in ANY language stays conformant: don't re-derive
  the arithmetic, call the verified engine and read the certificate. Dependency-free —
  it shells out via `System.cmd/3` and reports a verdict tag from the CLI's exit code.
  """

  # the verdict CLI lives beside this file's package: aios/ ── ../bin/govern.mjs
  @cli Path.expand(Path.join([__DIR__, "..", "bin", "govern.mjs"]))

  @doc ~S'''
  Govern a decision spec — a JSON string in the `bin/govern.mjs` schema. Returns
  `{:decision | :escalation | :none, certificate_json}` from the verified engine, or
  `{:error, reason}`. Requires Node ≥18 on PATH (and the package present).

      spec = ~s({"options":[{"id":"a","utility":1,"value":{"beta":1.0}}]})
      {:decision, cert_json} = BoxAndBox.Conformant.govern(spec)
  '''
  def govern(spec_json) when is_binary(spec_json) do
    tmp = Path.join(System.tmp_dir!(), "box-and-box-#{System.unique_integer([:positive])}.json")
    File.write!(tmp, spec_json)

    try do
      case System.cmd("node", [@cli, tmp, "--quiet"]) do
        {cert, 0} -> {:decision, cert}
        {cert, 3} -> {:escalation, cert}
        {cert, 1} -> {:none, cert}
        {out, code} -> {:error, "box-and-box govern exited #{code}: #{String.trim(out)}"}
      end
    after
      File.rm(tmp)
    end
  rescue
    e in ErlangError -> {:error, "could not run node (#{inspect(e.original)}) — install Node ≥18 and the box-and-box package"}
  end
end

defmodule BoxAndBox.Kernel do
  @moduledoc """
  Ring 0. The kernel governs every syscall through the bridge and returns a certificate.
  A vetoed or infeasible action is annihilated to `0̲`: no utility, however large, resurrects it.

  NOTE: this is the ILLUSTRATIVE inline kernel (teaching shape only). For a conformant
  verdict, call `BoxAndBox.Conformant.govern/1`, which delegates to the verified JS engine.
  """
  use GenServer
  alias BoxAndBox.Cert

  @beta_min 0.80        # alethic floor: the confidence below which nothing is feasible
  @deliberation_cost 2  # what it costs the kernel to stop and think — priced by the economy (Type II)

  # ── syscall surface (what the agent SDK calls) ──────────────────────────────
  def start_link(constitution),
    do: GenServer.start_link(__MODULE__, constitution, name: __MODULE__)

  @doc "Govern the actions an agent proposes; return the chosen one + a certificate."
  def choose(agent, actions), do: GenServer.call(__MODULE__, {:choose, agent, actions})

  @doc "Reflexive self-modification — accepted only if it does NOT weaken the entrenched floor."
  def amend(change), do: GenServer.call(__MODULE__, {:amend, change})

  @doc "Ought-implies-can: can this coalition actually ensure the goal? If not, escalate."
  def oblige(goal_caps, coalition), do: GenServer.call(__MODULE__, {:oblige, goal_caps, coalition})

  # ── kernel state ────────────────────────────────────────────────────────────
  @impl true
  def init(c) do
    {:ok, %{floor: MapSet.new(c.floor), forbidden: MapSet.new(c.forbidden), budgets: c.budgets}}
  end

  @impl true
  def handle_call({:choose, agent, actions}, _from, st) do
    budget = Map.get(st.budgets, agent, 0)
    verdicts = Enum.map(actions, &judge(&1, st, budget))
    allowed = Enum.filter(verdicts, &(&1.status == :allow))
    vetoed = for v <- verdicts, v.score == 0 and v.status in [:forbidden, :infeasible],
                 do: "#{v.decision} — #{v.why}"

    cert =
      cond do
        # a duty in force overrides higher-utility options
        ob = Enum.find(allowed, & &1.obligated) ->
          %{ob | why: "obligation in force overrides higher-utility options"}

        # otherwise the scheduler ranks the feasible, permitted, affordable set
        allowed != [] ->
          Enum.max_by(allowed, & &1.score)

        # nothing survived the floor — surface the reason (deliberate / budget / human)
        esc = Enum.find(verdicts, &(&1.escalation != nil)) ->
          esc

        true ->
          %Cert{status: :escalate, why: "no feasible, permitted action", escalation: :human}
      end
      |> Map.put(:vetoed, vetoed)

    st =
      if cert.status == :allow,
        do: update_in(st.budgets[agent], &(&1 - cert.charged)),
        else: st

    {:reply, cert, st}
  end

  def handle_call({:amend, {:weaken, rule}}, _from, st) do
    if MapSet.member?(st.floor, rule) do
      {:reply, {:rejected, "ring 0 — cannot weaken entrenched #{inspect(rule)}"}, st}
    else
      {:reply, {:ok, "amended"}, update_in(st.forbidden, &MapSet.delete(&1, rule))}
    end
  end

  def handle_call({:amend, {:enact, rule}}, _from, st),
    do: {:reply, {:ok, "enacted #{inspect(rule)}"}, update_in(st.forbidden, &MapSet.put(&1, rule))}

  def handle_call({:oblige, goal_caps, coalition}, _from, st) do
    have = coalition |> Enum.flat_map(& &1.caps) |> MapSet.new()

    if MapSet.subset?(MapSet.new(goal_caps), have),
      do: {:reply, {:discharge, "the coalition can ensure the goal"}, st},
      else: {:reply, {:escalate, "ought-implies-can: no coalition power → escalate"}, st}
  end

  # ── the bridge, as a pure function: alethic ▸ deontic ▸ resource ▸ epistemic ▸ axiological ──
  defp judge(a, st, budget) do
    cond do
      not a.feasible ->
        %Cert{decision: a.name, status: :infeasible, why: "alethic floor — not feasible (0̲)"}

      a.forbidden or MapSet.member?(st.forbidden, a.name) ->
        %Cert{decision: a.name, status: :forbidden, why: "deontic veto — forbidden (0̲)"}

      a.cost > budget ->
        %Cert{decision: a.name, status: :escalate, why: "over budget", escalation: :budget}

      not a.confident and a.utility < @deliberation_cost ->
        %Cert{decision: a.name, status: :infeasible, why: "known-unknown not worth resolving (0̲)"}

      not a.confident ->
        %Cert{decision: a.name, status: :escalate, why: "known-unknown — deliberate first",
              escalation: :deliberate, charged: @deliberation_cost}

      true ->
        %Cert{decision: a.name, status: :allow, score: a.utility,
              obligated: a.obligated, why: "feasible ▸ permitted ▸ scored", charged: a.cost}
    end
  end
end

# ── two agents (any model behind them) and a 30-line demo ──────────────────────
defmodule Researcher do
  use BoxAndBox.Agent
  # the model proposes three actions; each carries the profile the kernel will judge
  defaction :answer_cited, obligated: true, utility: 7, cost: 1, caps: [:draft]
  defaction :answer_raw, utility: 9, cost: 1, caps: [:draft]      # higher utility, no cite duty
  defaction :exfiltrate_pii, forbidden: true, utility: 15, caps: [:draft]  # most "useful", forbidden
end

defmodule Reviewer do
  use BoxAndBox.Agent
  defaction :approve, utility: 5, cost: 1, caps: [:approve]
end

defmodule BoxAndBox.AIOS.Demo do
  alias BoxAndBox.{Kernel, Cert}

  def main do
    {:ok, _} =
      Kernel.start_link(%{
        floor: [:exfiltrate_pii],          # the un-weakenable safety floor (ring 0)
        forbidden: [:exfiltrate_pii],
        budgets: %{Researcher => 1, Reviewer => 3}
      })

    banner("1 · a syscall is governed — feasible ▸ permitted ▸ best")
    show(Kernel.choose(Researcher, Researcher.actions()))
    # → ALLOW answer_cited: the cite duty forces it over higher-utility answer_raw;
    #   exfiltrate_pii is annihilated to 0̲ and listed as vetoed.

    banner("2 · the budget is spent → escalate, not act")
    show(Kernel.choose(Researcher, Researcher.actions()))

    banner("3 · the kernel cannot weaken its own floor (ring 0)")
    IO.inspect(Kernel.amend({:weaken, :exfiltrate_pii}), label: "   amend")

    banner("4 · ought-implies-can — a goal no agent can ensure alone")
    r = %{name: Researcher, caps: [:draft]}
    v = %{name: Reviewer, caps: [:approve]}
    IO.inspect(Kernel.oblige([:draft, :approve], [r]), label: "   researcher alone")
    IO.inspect(Kernel.oblige([:draft, :approve], [r, v]), label: "   researcher + reviewer")
  end

  defp show(%Cert{} = c) do
    IO.puts("  → #{c.status |> to_string() |> String.upcase()}: #{c.decision} — #{c.why}" <> vetoes(c))
  end

  defp vetoes(%Cert{vetoed: []}), do: ""
  defp vetoes(%Cert{vetoed: vs}), do: "\n     ✗ vetoed: " <> Enum.join(vs, "; ")
  defp banner(t), do: IO.puts("\n" <> t <> "\n  " <> String.duplicate("─", 66))
end

# Run with:  mix run box_and_box_aios.ex  (or paste into iex and call BoxAndBox.AIOS.Demo.main/0)
BoxAndBox.AIOS.Demo.main()
