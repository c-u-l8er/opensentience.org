defmodule BoxAndBox.Epistemic do
  @moduledoc """
  Epistemic Arithmetic — faithful port of epistemic.mjs (v0.6). Laws E1–E8, EB1–EB3.

  Possible-worlds models with per-agent accessibility. Knowledge = truth in ALL
  accessible worlds (S5); graded belief = fraction ≥ θ (KD45). Learning = public
  announcement. Multi-agent: common / distributed knowledge.
  """

  def atom(name, pred), do: %{t: "atom", name: name, pred: pred}
  def not_(a), do: %{t: "not", a: a}
  def and_(a, b), do: %{t: "and", a: a, b: b}
  def or_(a, b), do: %{t: "or", a: a, b: b}
  def implies(a, b), do: %{t: "implies", a: a, b: b}

  def holds(f, w) do
    case f.t do
      "atom" -> !!f.pred.(w)
      "not" -> not holds(f.a, w)
      "and" -> holds(f.a, w) and holds(f.b, w)
      "or" -> holds(f.a, w) or holds(f.b, w)
      "implies" -> not holds(f.a, w) or holds(f.b, w)
      _ -> false
    end
  end

  # model: %{worlds:, actual:, access: %{agent => (world -> [worlds])}}
  def model(%{worlds: worlds, actual: actual, access: access}),
    do: %{worlds: worlds, actual: actual, access: access}

  def knows_at(model, agent, w, f) do
    acc = model.access[agent].(w)
    acc != [] and Enum.all?(acc, fn u -> holds(f, u) end)
  end

  def possible_at(model, agent, w, f) do
    Enum.any?(model.access[agent].(w), fn u -> holds(f, u) end)
  end

  def believes_at(model, agent, w, f, theta \\ 0.5) do
    acc = model.access[agent].(w)

    if acc == [] do
      false
    else
      Enum.count(acc, fn u -> holds(f, u) end) / length(acc) >= theta
    end
  end

  def knows(model, agent, f), do: knows_at(model, agent, model.actual, f)
  def believes(model, agent, f, theta \\ 0.5), do: believes_at(model, agent, model.actual, f, theta)

  def knows_it_doesnt_know(model, agent, f) do
    acc = model.access[agent].(model.actual)
    acc != [] and Enum.all?(acc, fn u -> not knows_at(model, agent, u, f) end)
  end

  def route(model, agent, f) do
    cond do
      knows(model, agent, f) -> "act"
      knows_it_doesnt_know(model, agent, f) -> "deliberate"
      true -> "uncertain"
    end
  end

  # learning = truthful public announcement
  def announce(model, psi) do
    worlds = Enum.filter(model.worlds, fn w -> holds(psi, w) end)
    keep = MapSet.new(worlds)

    access =
      Map.new(model.access, fn {a, fun} ->
        {a, fn w -> Enum.filter(fun.(w), &MapSet.member?(keep, &1)) end}
      end)

    model(%{worlds: worlds, actual: model.actual, access: access})
  end

  def everyone(model, agents, f), do: Enum.all?(agents, fn a -> knows(model, a, f) end)

  def common(model, agents, f) do
    reach = do_reach(model, agents, MapSet.new([model.actual]), [model.actual])
    Enum.all?(MapSet.to_list(reach), fn u -> holds(f, u) end)
  end

  defp do_reach(_model, _agents, reach, []), do: reach

  defp do_reach(model, agents, reach, [w | stack]) do
    {reach2, stack2} =
      Enum.reduce(agents, {reach, stack}, fn a, {r, st} ->
        Enum.reduce(model.access[a].(w), {r, st}, fn u, {r2, st2} ->
          if MapSet.member?(r2, u), do: {r2, st2}, else: {MapSet.put(r2, u), [u | st2]}
        end)
      end)

    do_reach(model, agents, reach2, stack2)
  end

  def distributed(model, agents, f) do
    sets = Enum.map(agents, fn a -> MapSet.new(model.access[a].(model.actual)) end)
    [first | rest] = sets

    inter =
      first
      |> MapSet.to_list()
      |> Enum.filter(fn w -> Enum.all?(rest, &MapSet.member?(&1, w)) end)

    inter != [] and Enum.all?(inter, fn u -> holds(f, u) end)
  end
end
