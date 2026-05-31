defmodule BoxAndBox.Temporal do
  @moduledoc """
  Temporal Arithmetic — faithful port of temporal.mjs (v0.4). Laws T1–T8.

  LTL over atomic predicates on states. `progress/2` is formula progression (the
  LTL derivative). Boolean-simplifying constructors collapse residuals to ⊤/⊥.
  """

  @truef %{t: "true"}
  @falsef %{t: "false"}

  def truef, do: @truef
  def falsef, do: @falsef
  def atom(name, pred), do: %{t: "atom", name: name, pred: pred}

  defp is_t(f), do: f.t == "true"
  defp is_f(f), do: f.t == "false"

  def eq(a, b) when a == b, do: true

  def eq(a, b) do
    cond do
      a == nil or b == nil or a.t != b.t ->
        false

      true ->
        case a.t do
          "true" -> true
          "false" -> true
          "atom" -> a.name == b.name
          t when t in ["not", "next", "always", "eventually"] -> eq(a.a, b.a)
          t when t in ["and", "or", "until"] -> eq(a.a, b.a) and eq(a.b, b.b)
          _ -> false
        end
    end
  end

  def not_(f) do
    cond do
      is_t(f) -> @falsef
      is_f(f) -> @truef
      f.t == "not" -> f.a
      true -> %{t: "not", a: f}
    end
  end

  def and_(a, b) do
    cond do
      is_f(a) or is_f(b) -> @falsef
      is_t(a) -> b
      is_t(b) -> a
      eq(a, b) -> a
      true -> %{t: "and", a: a, b: b}
    end
  end

  def or_(a, b) do
    cond do
      is_t(a) or is_t(b) -> @truef
      is_f(a) -> b
      is_f(b) -> a
      eq(a, b) -> a
      true -> %{t: "or", a: a, b: b}
    end
  end

  def next(a), do: %{t: "next", a: a}
  def always(a), do: %{t: "always", a: a}
  def eventually(a), do: %{t: "eventually", a: a}
  def until(a, b), do: %{t: "until", a: a, b: b}

  # derived
  def gf(a), do: always(eventually(a))
  def fg(a), do: eventually(always(a))
  def responds(p, q), do: always(or_(not_(p), eventually(q)))

  # ---- progress : Spec × State → Spec ----
  def progress(f, s) do
    case f.t do
      "true" -> @truef
      "false" -> @falsef
      "atom" -> if f.pred.(s), do: @truef, else: @falsef
      "not" -> not_(progress(f.a, s))
      "and" -> and_(progress(f.a, s), progress(f.b, s))
      "or" -> or_(progress(f.a, s), progress(f.b, s))
      "next" -> f.a
      "always" -> and_(progress(f.a, s), always(f.a))
      "eventually" -> or_(progress(f.a, s), eventually(f.a))
      "until" -> or_(progress(f.b, s), and_(progress(f.a, s), until(f.a, f.b)))
      _ -> f
    end
  end

  # ---- finite-trace closure ----
  defp finalize(f) do
    case f.t do
      "true" -> true
      "false" -> false
      "atom" -> false
      "not" -> not finalize(f.a)
      "and" -> finalize(f.a) and finalize(f.b)
      "or" -> finalize(f.a) or finalize(f.b)
      "always" -> true
      "eventually" -> false
      "until" -> false
      "next" -> false
      _ -> false
    end
  end

  # ---- monitor : Spec × Trajectory → verdict (+ step-by-step) ----
  def monitor(f, trajectory) do
    {residual, trace_rev, decided_at} =
      trajectory
      |> Enum.with_index()
      |> Enum.reduce({f, [], nil}, fn {s, i}, {res, trace, decided} ->
        res2 = progress(res, s)
        v = cond do
          is_t(res2) -> "sat"
          is_f(res2) -> "vio"
          true -> "pending"
        end
        decided2 = if decided == nil and v != "pending", do: i, else: decided
        {res2, [v | trace], decided2}
      end)

    trace = Enum.reverse(trace_rev)

    final_sat =
      cond do
        is_t(residual) -> true
        is_f(residual) -> false
        true -> finalize(residual)
      end

    %{
      verdict: if(final_sat, do: "satisfied", else: "violated"),
      online: trace,
      residual: residual,
      decided_at: decided_at
    }
  end

  # ---- eval_direct : independent reference semantics (finite trace) ----
  def eval_direct(f, tau, i \\ 0)

  def eval_direct(f, tau, i) when i >= length(tau) do
    case f.t do
      "true" -> true
      "false" -> false
      "atom" -> false
      "not" -> not eval_direct(f.a, tau, i)
      "and" -> eval_direct(f.a, tau, i) and eval_direct(f.b, tau, i)
      "or" -> eval_direct(f.a, tau, i) or eval_direct(f.b, tau, i)
      "always" -> true
      "eventually" -> false
      "until" -> false
      "next" -> false
      _ -> false
    end
  end

  def eval_direct(f, tau, i) do
    case f.t do
      "true" -> true
      "false" -> false
      "atom" -> !!f.pred.(Enum.at(tau, i))
      "not" -> not eval_direct(f.a, tau, i)
      "and" -> eval_direct(f.a, tau, i) and eval_direct(f.b, tau, i)
      "or" -> eval_direct(f.a, tau, i) or eval_direct(f.b, tau, i)
      "next" -> eval_direct(f.a, tau, i + 1)
      "always" -> eval_direct(f.a, tau, i) and eval_direct(always(f.a), tau, i + 1)
      "eventually" -> eval_direct(f.a, tau, i) or eval_direct(eventually(f.a), tau, i + 1)
      "until" ->
        eval_direct(f.b, tau, i) or
          (eval_direct(f.a, tau, i) and eval_direct(until(f.a, f.b), tau, i + 1))

      _ -> false
    end
  end

  # ---- ω-words as lassos ----
  defp some_state(states, p), do: Enum.any?(states, fn s -> p.pred.(s) end)
  defp every_state(states, p), do: Enum.all?(states, fn s -> p.pred.(s) end)

  def monitor_lasso(f, stem, loop) do
    cond do
      f.t == "always" and f.a.t == "atom" ->
        every_state(stem, f.a) and every_state(loop, f.a)

      f.t == "eventually" and f.a.t == "atom" ->
        some_state(stem, f.a) or some_state(loop, f.a)

      f.t == "always" and f.a.t == "eventually" and f.a.a.t == "atom" ->
        some_state(loop, f.a.a)

      f.t == "eventually" and f.a.t == "always" and f.a.a.t == "atom" ->
        every_state(loop, f.a.a)

      true ->
        eval_direct(f, stem ++ loop ++ loop ++ loop)
    end
  end

  # ---- classification ----
  defp has(f, tags) do
    !!f and is_map(f) and
      (Enum.member?(tags, f.t) or has(Map.get(f, :a), tags) or has(Map.get(f, :b), tags))
  end

  def character(f) do
    live = has(f, ["eventually", "until"])

    cond do
      f.t == "always" and f.a && f.a.t == "eventually" -> "liveness"
      not live -> "safety"
      has(f, ["always"]) -> "mixed"
      true -> "liveness"
    end
  end

  def show(f) do
    case f.t do
      "true" -> "⊤"
      "false" -> "⊥"
      "atom" -> f.name
      "not" -> "¬#{show(f.a)}"
      "and" -> "(#{show(f.a)}∧#{show(f.b)})"
      "or" -> "(#{show(f.a)}∨#{show(f.b)})"
      "next" -> "X#{show(f.a)}"
      "always" -> "G#{show(f.a)}"
      "eventually" -> "F#{show(f.a)}"
      "until" -> "(#{show(f.a)} U #{show(f.b)})"
      _ -> "?"
    end
  end
end
