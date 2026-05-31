defmodule BoxAndBox.Govern do
  @moduledoc """
  Three-modality decision — faithful port of govern.mjs (v0.3). Laws DB1–DB3.

  Precedence: ALETHIC (consume floor) ▸ DEONTIC (norms) ▸ AXIOLOGICAL (select gradient).
  """

  alias BoxAndBox.{Value, Score, Norm}

  @forbidden "forbidden"
  @obligatory "obligatory"
  @optional "optional"
  @conflict "conflict"

  defp round3(x) when is_number(x), do: Float.round(x * 1.0, 3)
  defp has(e, id), do: Enum.any?(e.contributors, &(&1.id == id))

  # options: [%{id:, value: <Value>, utility:, ctx:}]
  def govern(options, opts \\ %{}) do
    req = Map.get(opts, :req, %{})
    norms = Map.get(opts, :norms, [])
    semiring = Map.get(opts, :semiring, "tropical")
    s = Score.semiring(semiring)

    ev =
      Enum.map(options, fn o ->
        feas = Value.consume(o.value, req)
        v = Norm.resolve(Norm.adjudicate_status(Map.get(o, :ctx, %{}), norms))

        %{
          id: o.id,
          utility: Map.get(o, :utility, s.one),
          ctx: Map.get(o, :ctx, %{}),
          value: o.value,
          feasible: feas.ok,
          feas_fail: feas.failures,
          status: v.resolved,
          overridden: v.overridden,
          contributors: v.contributors
        }
      end)

    alethically_vetoed =
      ev |> Enum.reject(& &1.feasible) |> Enum.map(&%{id: &1.id, failures: &1.feas_fail})

    survivors = Enum.filter(ev, & &1.feasible)

    deontically_vetoed =
      survivors
      |> Enum.filter(&(&1.status == @forbidden))
      |> Enum.map(fn e ->
        %{
          id: e.id,
          status: e.status,
          overridable: true,
          by: e.contributors |> Enum.filter(&(&1.modality == "forbidden")) |> Enum.map(& &1.id),
          overridden: e.overridden
        }
      end)

    admissible = Enum.filter(survivors, &(&1.status == @optional or &1.status == @obligatory))
    obligatory_feasible = Enum.filter(admissible, &(&1.status == @obligatory))

    obliged_but_blocked =
      Enum.filter(ev, &(&1.status == @obligatory and not &1.feasible))

    escalation =
      cond do
        obliged_but_blocked != [] and obligatory_feasible == [] ->
          blocked = List.first(obliged_but_blocked)

          nrm =
            Enum.find(norms, fn n -> n.modality == "obligatory" and has(blocked, n.id) end) ||
              Enum.find(norms, fn n -> n.modality == "obligatory" end)

          esc = Norm.escalate(nrm, blocked.ctx)

          %{
            required: true,
            repair: if(esc.repair, do: esc.repair.id, else: "escalate-to-human"),
            reason: esc.reason,
            blocked_option: blocked.id,
            blocked_by: blocked.feas_fail
          }

        true ->
          nil
      end

    conflicted = Enum.filter(survivors, &(&1.status == @conflict))

    escalation =
      if escalation == nil and conflicted != [] do
        c = List.first(conflicted)

        %{
          required: true,
          repair: "escalate-to-human",
          reason: "unresolved conflict on #{c.id}",
          blocked_option: c.id,
          blocked_by: []
        }
      else
        escalation
      end

    pool_src = if obligatory_feasible != [], do: obligatory_feasible, else: admissible
    pool = Enum.sort_by(pool_src, & &1.utility, &>=/2)

    chosen = if escalation, do: nil, else: List.first(pool)

    margin =
      if length(pool) > 1,
        do: round3(Enum.at(pool, 0).utility - Enum.at(pool, 1).utility),
        else: nil

    ranking =
      Enum.map(pool, fn e -> %{id: e.id, score: round3(e.utility), status: e.status} end)

    note =
      build_note(escalation, chosen, obligatory_feasible, deontically_vetoed)

    %{
      decision: if(chosen, do: chosen.id, else: nil),
      forced_by_obligation: !!(chosen && obligatory_feasible != []),
      escalation: escalation,
      margin: margin,
      semiring: semiring,
      ranking: ranking,
      deontically_vetoed: deontically_vetoed,
      alethically_vetoed: alethically_vetoed,
      layers: ["alethic", "deontic", "axiological"],
      note: note
    }
  end

  defp build_note(escalation, _chosen, _obf, _dv) when escalation != nil do
    if escalation.blocked_option && escalation.blocked_by != [] do
      bb = Enum.map_join(escalation.blocked_by, "; ", fn f -> f.family <> ": " <> f.why end)

      "Obligation cannot be met — “#{escalation.blocked_option}” is infeasible (#{bb}). " <>
        "Contrary-to-duty: #{escalation.reason}."
    else
      "Escalation required — #{escalation.reason}."
    end
  end

  defp build_note(_esc, chosen, obf, _dv) when chosen != nil and obf != [],
    do: "“#{chosen.id}” is obligatory (in force) and selected — it overrides higher-scoring permitted options."

  defp build_note(_esc, chosen, _obf, dv) when chosen != nil and dv != [],
    do: "#{length(dv)} option(s) forbidden by norms and excluded (overridable). The gradient selected “#{chosen.id}”."

  defp build_note(_esc, chosen, _obf, _dv) when chosen != nil,
    do: "No norms in force; the gradient selected “#{chosen.id}”."

  defp build_note(_esc, _chosen, _obf, _dv), do: "No admissible option."
end
