defmodule OpenSentience.Harness.Coverage do
  @moduledoc """
  Coverage → dispatch routing matrix (OS-008 spec section 3.3).

  Pure function that maps `{coverage_decision, kappa, autonomy}` to a dispatch
  mode. The harness enforces this routing — agents cannot override it.

  ## Routing Rules

  | coverage.decision | κ value  | autonomy | → dispatch_mode       |
  |-------------------|----------|----------|-----------------------|
  | :escalate         | any      | any      | :escalate (always)    |
  | :learn            | < 0.45   | any      | :explore              |
  | :learn            | ≥ 0.45   | any      | :focus (deliberate)   |
  | :act              | > 0      | any      | :focus (κ-driven)     |
  | :act              | = 0      | :act     | :act                  |
  | :act              | = 0      | :advise  | :deferred             |
  | :act              | = 0      | :observe | :log                  |
  | none + gap > 0.3  | any      | :act     | :propose              |
  | none + gap > 0.3  | any      | other    | :deferred             |
  | none + gap ≤ 0.3  | any      | any      | :idle (consolidate)   |

  """

  @type coverage_decision :: :escalate | :learn | :act | :none
  @type autonomy :: :observe | :advise | :act
  @type dispatch_mode ::
          :escalate | :explore | :focus | :act | :deferred | :log | :propose | :idle

  @kappa_deliberation_threshold 0.45
  @gap_threshold 0.3

  @doc """
  Recommends a dispatch mode based on coverage decision, κ value, and autonomy level.

  ## Parameters

    * `decision` — coverage decision (`:escalate`, `:learn`, `:act`, `:none`)
    * `kappa` — κ cyclicity value (0 = DAG, >0 = cycles present)
    * `autonomy` — agent autonomy level (`:observe`, `:advise`, `:act`)
    * `opts` — keyword options:
      * `:gap` — epistemic gap score (required when decision is `:none`)

  ## Returns

  The recommended dispatch mode atom.

  ## Examples

      iex> Coverage.recommend(:escalate, 0.5, :act)
      :escalate

      iex> Coverage.recommend(:act, 0, :act)
      :act

      iex> Coverage.recommend(:act, 0, :advise)
      :deferred

  """
  @spec recommend(coverage_decision(), number(), autonomy(), keyword()) :: dispatch_mode()
  def recommend(decision, kappa, autonomy, opts \\ [])

  # Rule 1: escalate always escalates
  def recommend(:escalate, _kappa, _autonomy, _opts), do: :escalate

  # Rule 2: learn + low κ → explore
  def recommend(:learn, kappa, _autonomy, _opts) when kappa < @kappa_deliberation_threshold,
    do: :explore

  # Rule 3: learn + high κ → focus (deliberate)
  def recommend(:learn, _kappa, _autonomy, _opts), do: :focus

  # Rule 4: act + κ > 0 → focus (κ-driven deliberation)
  def recommend(:act, kappa, _autonomy, _opts) when kappa > 0, do: :focus

  # Rule 5: act + κ = 0 + :act autonomy → act
  def recommend(:act, 0, :act, _opts), do: :act
  def recommend(:act, kappa, :act, _opts) when kappa == 0, do: :act

  # Rule 6: act + κ = 0 + :advise → deferred
  def recommend(:act, 0, :advise, _opts), do: :deferred
  def recommend(:act, kappa, :advise, _opts) when kappa == 0, do: :deferred

  # Rule 7: act + κ = 0 + :observe → log
  def recommend(:act, 0, :observe, _opts), do: :log
  def recommend(:act, kappa, :observe, _opts) when kappa == 0, do: :log

  # Rules 8-10: none decision — gap-dependent
  def recommend(:none, _kappa, autonomy, opts) do
    gap = Keyword.get(opts, :gap, 0.0)

    cond do
      # Rule 8: none + high gap + :act → propose
      gap > @gap_threshold and autonomy == :act ->
        :propose

      # Rule 9: none + high gap + non-act → deferred
      gap > @gap_threshold ->
        :deferred

      # Rule 10: none + low gap → idle (consolidate)
      true ->
        :idle
    end
  end
end
