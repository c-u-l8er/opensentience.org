defmodule BoxAndBox.Resource do
  @moduledoc """
  Resource Arithmetic — faithful port of resource.mjs (v0.8). Laws C1–C8, CB1–CB3.

  A Ledger is a closed double-entry system: transfer conserves the grand total.
  Depletable resources obey linear logic; `reusable` resources (the `!` modality)
  are used freely. Repairs are priced (Type-II rationality). INFEASIBLE = :infeasible.
  """

  @sink "#sink"
  @treasury "#treasury"
  @free "free"
  @infeasible :infeasible

  def sink, do: @sink
  def treasury, do: @treasury
  def free, do: @free
  def infeasible, do: @infeasible

  def ledger(p \\ %{}) do
    %{bal: Map.get(p, :bal, %{}), kind: Map.get(p, :kind, %{})}
  end

  def balance(l, acct, res) do
    case Map.get(l.bal, acct) do
      nil -> 0
      m -> Map.get(m, res, 0)
    end
  end

  def total(l, res) do
    l.bal
    |> Map.values()
    |> Enum.reduce(0, fn r, s -> s + Map.get(r, res, 0) end)
  end

  # the one primitive: move `amt` of `res` between two accounts; conserves the total
  def transfer(l, res, from, to, amt) do
    if amt < 0 or balance(l, from, res) < amt do
      @infeasible
    else
      from_map = Map.get(l.bal, from, %{})
      to_map = Map.get(l.bal, to, %{})

      from_map2 = Map.put(from_map, res, Map.get(from_map, res, 0) - amt)
      # re-read to_map from the possibly-updated bal (if from == to)
      bal1 = Map.put(l.bal, from, from_map2)
      to_map = Map.get(bal1, to, to_map)
      to_map2 = Map.put(to_map, res, Map.get(to_map, res, 0) + amt)
      bal2 = Map.put(bal1, to, to_map2)
      %{l | bal: bal2}
    end
  end

  def spend(l, acct, res, amt), do: transfer(l, res, acct, @sink, amt)
  def refill(l, acct, res, amt), do: transfer(l, res, @treasury, acct, amt)

  def affords(l, acct, cost),
    do: Enum.all?(cost, fn {res, amt} -> balance(l, acct, res) >= amt end)

  def feasible(l, acct, cost), do: affords(l, acct, cost)

  # reusable (`!`) vs depletable
  def use(l, acct, res) do
    cond do
      balance(l, acct, res) < 1 -> %{ok: false, ledger: l}
      Map.get(l.kind, res) == "reusable" -> %{ok: true, ledger: l}
      true -> %{ok: true, ledger: spend(l, acct, res, 1)}
    end
  end

  def allocate(l, task, amt), do: transfer(l, "capacity", @free, "task:" <> task, amt)

  def consolidate(l, task, mind \\ "mind") do
    kind2 = Map.put(l.kind, "know:" <> task, "reusable")
    mind_map = Map.get(l.bal, mind, %{})
    mind_map2 = Map.put(mind_map, "know:" <> task, 1)
    %{l | kind: kind2, bal: Map.put(l.bal, mind, mind_map2)}
  end

  def forget(l, task, mind \\ "mind") do
    amt = balance(l, "task:" <> task, "capacity")
    m = transfer(l, "capacity", "task:" <> task, @free, amt)
    m = if m == @infeasible, do: l, else: m

    if Map.has_key?(m.bal, mind) do
      mind_map = Map.get(m.bal, mind)
      %{m | bal: Map.put(m.bal, mind, Map.put(mind_map, "know:" <> task, 0))}
    else
      m
    end
  end

  # pricing the repairs (Type-II rationality)
  def worthwhile(value, cost), do: value >= cost

  def repair(l, acct, %{} = opts) do
    resource = Map.get(opts, :resource, "tokens")
    value = Map.fetch!(opts, :value)
    cost = Map.fetch!(opts, :cost)

    cond do
      not affords(l, acct, %{resource => cost}) -> %{decision: "cannot-afford", ledger: l}
      not worthwhile(value, cost) -> %{decision: "skip", ledger: l}
      true -> %{decision: "invoke", ledger: spend(l, acct, resource, cost)}
    end
  end
end
