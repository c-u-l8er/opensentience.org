defmodule BoxAndBox.Supervise do
  @moduledoc """
  Trajectory supervision — faithful port of supervise.mjs (v0.4). Laws TB1–TB3.
  """

  alias BoxAndBox.Temporal

  def temporal_spec(p) do
    %{
      id: Map.fetch!(p, :id),
      formula: Map.fetch!(p, :formula),
      kind: Map.get(p, :kind, "safety"),
      ctd: Map.get(p, :ctd, nil)
    }
  end

  defp first_vio(online) do
    case Enum.find_index(online, &(&1 == "vio")) do
      nil -> nil
      i -> i
    end
  end

  def supervise(trajectory, specs) do
    reports =
      Enum.map(specs, fn spec ->
        m = Temporal.monitor(spec.formula, trajectory)

        r = %{
          id: spec.id,
          kind: spec.kind,
          formula: Temporal.show(spec.formula),
          verdict: m.verdict,
          online: m.online,
          decided_at: m.decided_at,
          violated_at: if(spec.kind == "safety", do: first_vio(m.online), else: nil)
        }

        if spec.kind == "liveness" and m.verdict == "violated" do
          r
          |> Map.put(:escalation, spec.ctd || "escalate-to-human")
          |> Map.put(
            :reason,
            "liveness obligation #{Temporal.show(spec.formula)} unmet within horizon (#{length(trajectory)} steps)"
          )
        else
          r
        end
      end)

    safety_violated =
      Enum.filter(reports, &(&1.kind == "safety" and &1.verdict == "violated"))

    liveness_unmet =
      Enum.filter(reports, &(&1.kind == "liveness" and &1.verdict == "violated"))

    %{
      reports: reports,
      safe: safety_violated == [],
      escalation:
        if liveness_unmet != [] do
          %{
            required: true,
            specs:
              Enum.map(liveness_unmet, fn r ->
                %{id: r.id, repair: r.escalation, reason: r.reason}
              end)
          }
        else
          nil
        end,
      note: note(safety_violated, liveness_unmet, length(trajectory))
    }
  end

  def residual_of(formula, history) do
    Enum.reduce(history, formula, fn s, f -> Temporal.progress(f, s) end)
  end

  def guard(residual, next_state) do
    Temporal.progress(residual, next_state).t == "false"
  end

  defp note([sv | _], _liveness, _n),
    do:
      "UNSAFE — “#{sv.id}” violated at step #{sv.violated_at}; the safety shield would have pruned that transition."

  defp note([], [_ | _] = liveness, n),
    do:
      "safe, but a liveness obligation went unmet at the horizon (#{n} steps) → escalation: " <>
        Enum.map_join(liveness, ", ", & &1.escalation) <> "."

  defp note([], [], n), do: "all specs satisfied over #{n} steps — safe and live."
end
