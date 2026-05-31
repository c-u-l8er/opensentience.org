defmodule BoxAndBox.Strategic do
  @moduledoc """
  Strategic / Coalitional Arithmetic — faithful port of strategic.mjs (v0.7).
  Laws S1–S8, SB1–SB3.

  Concurrent game structures + ATL. effectivity = [C]◯φ; canMaintain = ⟨⟨C⟩⟩□φ
  (greatest fixpoint); canReach = ⟨⟨C⟩⟩◊φ (least fixpoint); both via the
  controllable predecessor.
  """

  def atom(name, pred), do: %{t: "atom", name: name, pred: pred}
  def not_(a), do: %{t: "not", a: a}
  def and_(a, b), do: %{t: "and", a: a, b: b}
  def or_(a, b), do: %{t: "or", a: a, b: b}

  def holds(f, s) do
    case f.t do
      "atom" -> !!f.pred.(s)
      "not" -> not holds(f.a, s)
      "and" -> holds(f.a, s) and holds(f.b, s)
      "or" -> holds(f.a, s) or holds(f.b, s)
      _ -> false
    end
  end

  def top, do: or_(atom("⊤", fn _ -> true end), not_(atom("⊤", fn _ -> true end)))
  def bot, do: and_(atom("⊥", fn _ -> false end), not_(atom("⊥", fn _ -> false end)))

  # game: %{states:, agents:, moves: (agent, state) -> [moveId], delta: (state, %{agent => moveId}) -> state}
  def game(%{states: states, agents: agents, moves: moves, delta: delta}),
    do: %{states: states, agents: agents, moves: moves, delta: delta}

  def others(model, c), do: Enum.reject(model.agents, &Enum.member?(c, &1))

  # cartesian product of agents' move sets at a state -> list of %{agent => moveId}
  def product(model, agents, state) do
    Enum.reduce(agents, [%{}], fn a, acc ->
      ms = model.moves.(a, state)
      for p <- acc, m <- ms, do: Map.put(p, a, m)
    end)
  end

  # controllable predecessor: ∃ moves for C, ∀ moves for the rest, successor ∈ set
  def force1(model, c, state, in_set) do
    cm = product(model, c, state)
    om = product(model, others(model, c), state)

    Enum.any?(cm, fn cmove ->
      Enum.all?(om, fn omove ->
        in_set.(model.delta.(state, Map.merge(cmove, omove)))
      end)
    end)
  end

  # ---- operators ----
  def effectivity(model, c, state, f), do: force1(model, c, state, fn s -> holds(f, s) end)

  def can_ensure_next(model, c, f),
    do: Enum.filter(model.states, fn q -> effectivity(model, c, q, f) end)

  # ⟨⟨C⟩⟩□f — greatest fixpoint
  def can_maintain(model, c, f) do
    w0 = Enum.filter(model.states, fn s -> holds(f, s) end)
    gfp_loop(model, c, w0)
  end

  defp gfp_loop(model, c, w) do
    in_w = fn s -> Enum.member?(w, s) end
    w2 = Enum.filter(w, fn q -> force1(model, c, q, in_w) end)
    if length(w2) == length(w), do: w2, else: gfp_loop(model, c, w2)
  end

  # ⟨⟨C⟩⟩◊f — least fixpoint
  def can_reach(model, c, f) do
    w0 = Enum.filter(model.states, fn s -> holds(f, s) end)
    lfp_loop(model, c, w0)
  end

  defp lfp_loop(model, c, w) do
    in_w = fn s -> Enum.member?(w, s) end
    add = Enum.filter(model.states, fn q -> not in_w.(q) and force1(model, c, q, in_w) end)
    if add == [], do: w, else: lfp_loop(model, c, w ++ add)
  end

  # ⟨⟨C⟩⟩(f U g) — least fixpoint
  def can_until(model, c, f, g) do
    w0 = Enum.filter(model.states, fn s -> holds(g, s) end)
    until_loop(model, c, f, w0)
  end

  defp until_loop(model, c, f, w) do
    in_w = fn s -> Enum.member?(w, s) end

    add =
      Enum.filter(model.states, fn q ->
        not in_w.(q) and holds(f, q) and force1(model, c, q, in_w)
      end)

    if add == [], do: w, else: until_loop(model, c, f, w ++ add)
  end

  def can_ensure(model, c, f, q), do: Enum.member?(can_reach(model, c, f), q)
  def can_keep(model, c, f, q), do: Enum.member?(can_maintain(model, c, f), q)

  def oblige(model, c, f, q),
    do: if(can_ensure(model, c, f, q), do: "discharge", else: "escalate")

  def executable(model, c, f, q, common_knowledge),
    do: can_ensure(model, c, f, q) and !!common_knowledge
end
