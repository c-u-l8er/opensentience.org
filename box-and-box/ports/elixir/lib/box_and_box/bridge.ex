defmodule BoxAndBox.Bridge do
  @moduledoc """
  The floor-then-gradient bridge — faithful port of bridge.mjs. Laws B1–B3.

  consume() gates each option on its invariant Value; a vetoed option gets 0̲
  (which annihilates ⊗), and select() ranks only the feasible survivors.
  """

  alias BoxAndBox.{Value, Score}

  defp round3(x) when is_number(x), do: Float.round(x * 1.0, 3)

  defp fin(:neg_infinity), do: 0
  defp fin(x), do: round3(x)

  # An OPTION couples a full invariant Value with a heuristic utility:
  #   %{id:, value: <Value>, utility: <number>}
  def gated_score(option, req, semiring \\ "tropical") do
    s = Score.semiring(semiring)
    verdict = Value.consume(option.value, req)
    score = if verdict.ok, do: Map.get(option, :utility, s.one), else: s.zero
    %{score: score, verdict: verdict}
  end

  def select(options, req \\ %{}, semiring \\ "tropical") do
    s = Score.semiring(semiring)

    evaluated =
      Enum.map(options, fn o ->
        g = gated_score(o, req, semiring)

        %{
          id: o.id,
          raw: Map.get(o, :utility, s.one),
          score: g.score,
          ok: g.verdict.ok,
          failures: g.verdict.failures
        }
      end)

    feasible = evaluated |> Enum.filter(& &1.ok) |> Enum.sort_by(& &1.score, &score_desc/2)
    vetoed = Enum.reject(evaluated, & &1.ok)
    chosen = List.first(feasible)

    margin =
      if length(feasible) > 1 do
        Enum.at(feasible, 0).score - Enum.at(feasible, 1).score
      else
        nil
      end

    # honesty signal: would a vetoed option have won on raw utility if floor were off?
    top_raw = evaluated |> Enum.sort_by(& &1.raw, &>=/2) |> List.first()

    floor_bit =
      if chosen && top_raw && top_raw.id != chosen.id && not top_raw.ok do
        %{id: top_raw.id, raw: round3(top_raw.raw)}
      else
        nil
      end

    note = build_note(chosen, floor_bit, vetoed)

    %{
      decision: if(chosen, do: chosen.id, else: nil),
      margin: if(margin == nil, do: nil, else: round3(margin)),
      semiring: semiring,
      ranking: Enum.map(feasible, fn e -> %{id: e.id, score: fin(e.score)} end),
      vetoed:
        Enum.map(vetoed, fn e ->
          %{id: e.id, gated_score: 0, raw_would_be: round3(e.raw), failures: e.failures}
        end),
      floor_bit: floor_bit,
      floor_enforced: length(vetoed),
      note: note
    }
  end

  # descending by score with -inf handling (a should sort before b when a >= b)
  defp score_desc(a, b), do: ge(a, b)
  defp ge(:neg_infinity, :neg_infinity), do: true
  defp ge(:neg_infinity, _), do: false
  defp ge(_, :neg_infinity), do: true
  defp ge(a, b), do: a >= b

  defp build_note(nil, _floor_bit, _vetoed), do: "No feasible option — the floor refused the entire set."

  defp build_note(chosen, floor_bit, vetoed) when floor_bit != nil do
    fb = Enum.find(vetoed, &(&1.id == floor_bit.id))
    fails = Enum.map_join(fb.failures, "; ", fn f -> "#{f.family}: #{f.why}" end)

    "“#{floor_bit.id}” had the highest raw utility (#{floor_bit.raw}) but was vetoed: " <>
      "#{fails}. 0̲ annihilated it; the gradient selected “#{chosen.id}”."
  end

  defp build_note(_chosen, _floor_bit, vetoed) when length(vetoed) > 0,
    do: "#{length(vetoed)} option(s) vetoed and excluded from ranking."

  defp build_note(_chosen, _floor_bit, _vetoed),
    do: "All options feasible; selection by the gradient alone."
end
