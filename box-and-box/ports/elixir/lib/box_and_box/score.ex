defmodule BoxAndBox.Score do
  @moduledoc """
  Heuristic Arithmetic — faithful port of score.mjs (v0.2).

  A Score lives in a SEMIRING (K, ⊕, ⊗, 0̲, 1̲). vote/rollout/reinforce/dominate/
  anneal/softmax satisfy H1–H13. The tropical/log zero (0̲) is the sentinel
  `:neg_infinity`; it annihilates ⊗. Laws H1–H13.
  """

  @neg :neg_infinity

  def neg_inf, do: @neg

  # ---- semiring registry -----------------------------------------------------
  def semirings do
    %{
      "tropical" => %{
        label: "(max, +)",
        oplus: &t_max/2,
        otimes: &t_plus/2,
        zero: @neg,
        one: 0,
        idempotent: true
      },
      "probability" => %{
        label: "(+, ×)",
        oplus: fn a, b -> a + b end,
        otimes: fn a, b -> a * b end,
        zero: 0,
        one: 1,
        idempotent: false
      },
      "log" => %{
        label: "(logsumexp, +)",
        oplus: &logsumexp/2,
        otimes: &t_plus/2,
        zero: @neg,
        one: 0,
        idempotent: false
      }
    }
  end

  def semiring(name), do: Map.get(semirings(), name, semirings()["tropical"])

  # tropical max with -inf sentinel
  defp t_max(@neg, b), do: b
  defp t_max(a, @neg), do: a
  defp t_max(a, b), do: max(a, b)

  # tropical/log multiplication (= addition) with annihilating zero
  def t_plus(@neg, _), do: @neg
  def t_plus(_, @neg), do: @neg
  def t_plus(a, b), do: a + b

  def logsumexp(@neg, b), do: b
  def logsumexp(a, @neg), do: a

  def logsumexp(a, b) do
    m = max(a, b)
    m + :math.log(:math.exp(a - m) + :math.exp(b - m))
  end

  # a Score carries a utility plus soft analogues of the invariant families
  def score(p \\ %{}) do
    %{
      u: Map.get(p, :u, 0),
      w: Map.get(p, :w, 1),
      eps: Map.get(p, :eps, 0),
      gamma: Map.get(p, :gamma, 1),
      visits: Map.get(p, :visits, 0),
      sources: Enum.to_list(Map.get(p, :sources, []))
    }
  end

  # ---- vote : aggregate alternatives (⊕ side) --------------------------------
  def vote(a, b, semiring \\ "tropical") do
    s = semiring(semiring)

    score(%{
      u: s.oplus.(a.u, b.u),
      w: a.w * b.w,
      eps: max(a.eps, b.eps),
      gamma: min(a.gamma, b.gamma),
      visits: a.visits + b.visits,
      sources: a.sources ++ b.sources
    })
  end

  # ---- rollout : chain evidence along a path, γ-discounted (⊗ side) ----------
  def rollout(scores, gamma \\ 0.9, semiring \\ "tropical") do
    s = semiring(semiring)

    scores
    |> Enum.with_index()
    |> Enum.reduce(s.one, fn {sc, t}, acc ->
      discounted = if sc.u == s.zero, do: s.zero, else: :math.pow(gamma, t) * sc.u
      s.otimes.(acc, discounted)
    end)
  end

  # ---- reinforce : η-contraction toward a target -----------------------------
  def reinforce(u, target, eta \\ 0.3), do: (1 - eta) * u + eta * target

  # ---- dominate : Pareto-prune (idempotent, antitone) ------------------------
  # opts: [%{id:, obj: [..]}] higher-is-better; returns the non-dominated front.
  def dominate(opts) do
    Enum.filter(opts, fn a ->
      not Enum.any?(opts, fn b ->
        b.id != a.id and
          Enum.with_index(b.obj) |> Enum.all?(fn {bj, i} -> bj >= Enum.at(a.obj, i) end) and
          Enum.with_index(b.obj) |> Enum.any?(fn {bj, i} -> bj > Enum.at(a.obj, i) end)
      end)
    end)
  end

  # ---- anneal : ε → 0 (idempotent) -------------------------------------------
  def anneal(s), do: score(%{s | eps: 0})

  # ---- softmax (shift-invariant; T→0 ⇒ argmax) -------------------------------
  def softmax(us, t \\ 1) do
    m = Enum.max(us)
    ex = Enum.map(us, fn u -> :math.exp((u - m) / t) end)
    z = Enum.sum(ex)
    Enum.map(ex, fn e -> e / z end)
  end
end
