defmodule BoxAndBox.Laws do
  @moduledoc """
  The 97-law property-test suite — faithful port of test/laws.mjs.

  Mirrors the JS `trial(n, body)` random loop (default 2000 trials/law) across all
  15 suites: L1–14, H1–13, B1–3, D1–9, DB1–3, T1–8, TB1–3, R1–8, RB1–3, E1–8,
  EB1–3, S1–8, SB1–3, C1–8, CB1–3. JavaScript is the conformance reference.

  Run: `mix run run_laws.exs`  (or `elixir run_laws.exs` after `mix compile`).
  """

  alias BoxAndBox.{Value, Score, Bridge, Norm, Govern, Temporal, Supervise, Reflexive,
                   Epistemic, Strategic, Resource}

  # the heuristic suite swaps semirings; held in the process dictionary like JS `let S`
  defp s, do: Process.get(:laws_semiring, Score.semiring("tropical"))
  def set_semiring(name), do: Process.put(:laws_semiring, Score.semiring(name))

  # ---------------- random helpers (mirror JS) ----------------
  defp rnd(a, b), do: a + :rand.uniform() * (b - a)

  defp approx(a, b), do: approx(a, b, 1.0e-7)

  defp approx(:neg_infinity, :neg_infinity, _t), do: true
  defp approx(:neg_infinity, _b, _t), do: false
  defp approx(_a, :neg_infinity, _t), do: false

  defp approx(a, b, t) do
    a == b or
      (is_number(a) and is_number(b) and finite?(a) and finite?(b) and
         abs(a - b) <= t * (1 + abs(a) + abs(b)))
  end

  defp finite?(x), do: is_number(x)

  defp set_eq(a, b) do
    length(a) == length(b) and Enum.sort(a) == Enum.sort(b)
  end

  defp arr_eq(a, b) do
    length(a) == length(b) and Enum.with_index(a) |> Enum.all?(fn {x, i} -> x == Enum.at(b, i) end)
  end

  defp sample(arr), do: Enum.filter(arr, fn _ -> :rand.uniform() < 0.5 end)

  defp ri(n), do: :rand.uniform(n) - 1
  defp randint(n), do: trunc(:rand.uniform() * n)

  defp tofixed(x, d) do
    f = :math.pow(10, d)
    Float.round(x * f) / f
  end

  # the JS trial(n, body): body returns true | counterexample
  def trial(n, body) do
    Enum.reduce_while(1..n, %{pass: true, at: n}, fn i, _acc ->
      case body.() do
        true -> {:cont, %{pass: true, at: n}}
        cex -> {:halt, %{pass: false, cex: cex, at: i}}
      end
    end)
  end

  # ---------------- INVARIANT (L1–L14) ----------------
  defp rand_v do
    ph = [nil | Value.phases()]

    Value.v(%{
      n: tofixed(rnd(0, 10), 2),
      kappa: :rand.uniform() < 0.5,
      beta: tofixed(:rand.uniform(), 3),
      sigma: sample(["x", "y", "z", "w"]),
      pi: Enum.at(ph, randint(length(ph))),
      authority: if(:rand.uniform() < 0.5, do: ["c" <> Integer.to_string(randint(3))], else: []),
      deny_default: :rand.uniform() < 0.5,
      audit: if(:rand.uniform() < 0.5, do: ["e" <> Integer.to_string(randint(3))], else: [])
    })
  end

  defp val_eq(a, b) do
    approx(a.n, b.n) and a.kappa == b.kappa and approx(a.beta, b.beta) and set_eq(a.sigma, b.sigma) and
      a.pi == b.pi and a.iota == b.iota and a.psi == b.psi and arr_eq(a.authority, b.authority) and
      a.deny_default == b.deny_default and arr_eq(a.audit, b.audit)
  end

  defp forward_triple do
    phases = Value.phases()
    idxs = [0, 0, 0] |> Enum.map(fn _ -> randint(length(phases)) end) |> Enum.sort()

    Enum.map(idxs, fn i ->
      v = rand_v()
      %{v | pi: Enum.at(phases, i)}
    end)
  end

  def inv do
    [
      {"L1", "combine associative",
       fn n ->
         trial(n, fn ->
           a = rand_v(); b = rand_v(); c = rand_v()
           if val_eq(Value.combine(Value.combine(a, b), c), Value.combine(a, Value.combine(b, c))), do: true, else: "assoc"
         end)
       end},
      {"L2", "combine identity V0",
       fn n ->
         trial(n, fn ->
           a = rand_v()
           if val_eq(Value.combine(a, Value.v0()), a) and val_eq(Value.combine(Value.v0(), a), a), do: true, else: "identity"
         end)
       end},
      {"L3", "commutative families (n,κ,β,σ,deny)",
       fn n ->
         trial(n, fn ->
           a = rand_v(); b = rand_v()
           x = Value.combine(a, b); y = Value.combine(b, a)
           if approx(x.n, y.n) and x.kappa == y.kappa and approx(x.beta, y.beta) and set_eq(x.sigma, y.sigma) and x.deny_default == y.deny_default, do: true, else: "comm"
         end)
       end},
      {"L4", "β idempotent under min",
       fn n -> trial(n, fn -> a = rand_v(); if approx(Value.combine(a, a).beta, a.beta), do: true, else: "β-idem" end) end},
      {"L5", "σ idempotent under ∪",
       fn n -> trial(n, fn -> a = rand_v(); if set_eq(Value.combine(a, a).sigma, a.sigma), do: true, else: "σ-idem" end) end},
      {"L6", "κ idempotent under ∨",
       fn n -> trial(n, fn -> a = rand_v(); if Value.combine(a, a).kappa == a.kappa, do: true, else: "κ-idem" end) end},
      {"L7", "promote β-monotone",
       fn n -> trial(n, fn -> a = rand_v(); ev = %{beta: :rand.uniform()}; if Value.promote(a, ev).beta >= a.beta - 1.0e-9, do: true, else: "monotone" end) end},
      {"L8", "reconcile antitone + idempotent",
       fn n ->
         trial(n, fn ->
           a = rand_v(); t = sample(["x", "y", "z", "w"])
           r = Value.reconcile(a, t)
           sub = Enum.all?(r.sigma, fn tag -> Enum.member?(a.sigma, tag) end)
           if sub and set_eq(Value.reconcile(r, t).sigma, r.sigma), do: true, else: "reconcile"
         end)
       end},
      {"L9", "deliberate κ→false + idempotent",
       fn n ->
         trial(n, fn ->
           a = rand_v(); d = Value.deliberate(a)
           if d.kappa == false and Value.deliberate(d).kappa == false, do: true, else: "deliberate"
         end)
       end},
      {"L10", "chain refuses a backward phase",
       fn n ->
         trial(n, fn ->
           a = rand_v(); b = rand_v()
           if a.pi == nil or b.pi == nil do
             true
           else
             r = Value.chain(a, b)
             if Value.phase_idx(a.pi) > Value.phase_idx(b.pi) do
               if Map.get(r, :error), do: true, else: "should refuse"
             else
               if Map.get(r, :error), do: "should allow", else: true
             end
           end
         end)
       end},
      {"L11", "chain associative where defined",
       fn n ->
         trial(n, fn ->
           [a, b, c] = forward_triple()
           l = Value.chain(Value.chain(a, b), c)
           r = Value.chain(a, Value.chain(b, c))
           cond do
             Map.get(l, :error) || Map.get(r, :error) -> true
             val_eq(l, r) -> true
             true -> "chain-assoc"
           end
         end)
       end},
      {"L12", "promote distributes over combine on β",
       fn n ->
         trial(n, fn ->
           a = rand_v(); b = rand_v(); ev = %{beta: :rand.uniform()}
           if approx(Value.promote(Value.combine(a, b), ev).beta, Value.combine(Value.promote(a, ev), Value.promote(b, ev)).beta), do: true, else: "β-distrib"
         end)
       end},
      {"L13", "consume gate (β_min)",
       fn n ->
         trial(n, fn ->
           a = rand_v(); thr = 0.5
           ok = Value.consume(a, %{beta_min: thr}).ok
           if ok == (a.beta >= thr), do: true, else: "gate"
         end)
       end},
      {"L14", "deny_default idempotent under ∧",
       fn n -> trial(n, fn -> a = rand_v(); if Value.combine(a, a).deny_default == a.deny_default, do: true, else: "∧-idem" end) end}
    ]
  end

  # ---------------- HEURISTIC (H1–H13) ----------------
  defp gen do
    sr = s()

    if sr == Score.semiring("probability") do
      r = :rand.uniform()
      cond do
        r < 0.06 -> 0
        r < 0.12 -> 1
        true -> tofixed(rnd(0, 4), 4)
      end
    else
      r = :rand.uniform()
      cond do
        r < 0.06 -> sr.zero
        r < 0.12 -> sr.one
        true -> tofixed(rnd(-12, 12), 4)
      end
    end
  end

  defp rand_score, do: Score.score(%{u: gen(), w: rnd(0, 1), eps: rnd(0, 1), gamma: rnd(0.5, 1)})

  defp rand_opt_obj, do: %{id: randint(1_000_000_000), obj: [tofixed(rnd(0, 5), 2), tofixed(rnd(0, 5), 2)]}

  defp num_le(a, b) do
    cond do
      a == :neg_infinity -> true
      b == :neg_infinity -> false
      true -> a <= b
    end
  end

  defp num_gt(a, b) do
    cond do
      a == :neg_infinity -> false
      b == :neg_infinity -> true
      true -> a > b
    end
  end

  def heur do
    [
      {"H1", "⊕ commutative monoid",
       fn n ->
         trial(n, fn ->
           sr = s(); a = gen(); b = gen(); c = gen()
           cond do
             not approx(sr.oplus.(a, b), sr.oplus.(b, a)) -> "comm"
             not approx(sr.oplus.(sr.oplus.(a, b), c), sr.oplus.(a, sr.oplus.(b, c))) -> "assoc"
             approx(sr.oplus.(a, sr.zero), a) -> true
             true -> "id"
           end
         end)
       end},
      {"H2", "⊗ monoid",
       fn n ->
         trial(n, fn ->
           sr = s(); a = gen(); b = gen(); c = gen()
           if not approx(sr.otimes.(sr.otimes.(a, b), c), sr.otimes.(a, sr.otimes.(b, c))) do
             "assoc"
           else
             if approx(sr.otimes.(a, sr.one), a) and approx(sr.otimes.(sr.one, a), a), do: true, else: "id"
           end
         end)
       end},
      {"H3", "left distributivity",
       fn n ->
         trial(n, fn ->
           sr = s(); a = gen(); b = gen(); c = gen()
           if approx(sr.otimes.(a, sr.oplus.(b, c)), sr.oplus.(sr.otimes.(a, b), sr.otimes.(a, c))), do: true, else: "distL"
         end)
       end},
      {"H4", "right distributivity",
       fn n ->
         trial(n, fn ->
           sr = s(); a = gen(); b = gen(); c = gen()
           if approx(sr.otimes.(sr.oplus.(a, b), c), sr.oplus.(sr.otimes.(a, c), sr.otimes.(b, c))), do: true, else: "distR"
         end)
       end},
      {"H5", "0̲ annihilates ⊗",
       fn n ->
         trial(n, fn ->
           sr = s(); a = gen()
           if sr.otimes.(sr.zero, a) == sr.zero and sr.otimes.(a, sr.zero) == sr.zero, do: true, else: "annih"
         end)
       end},
      {"H6", "⊕ idempotence (dioid only)",
       fn n -> trial(n, fn -> sr = s(); a = gen(); if approx(sr.oplus.(a, a), a), do: true, else: "idem [expected off tropical]" end) end},
      {"H7", "⊗ monotone in order",
       fn n ->
         trial(n, fn ->
           sr = s(); a = gen(); b = gen()
           {a, b} = if num_gt(a, b), do: {b, a}, else: {a, b}
           c = gen()
           if num_le(sr.otimes.(a, c), sr.otimes.(b, c)) or approx(sr.otimes.(a, c), sr.otimes.(b, c)), do: true, else: "mono"
         end)
       end},
      {"H8", "reinforce η-contraction",
       fn n ->
         trial(n, fn ->
           u = rnd(-10, 10); t = rnd(-10, 10); e = rnd(0.05, 0.95)
           got = abs(Score.reinforce(u, t, e) - t); want = (1 - e) * abs(u - t)
           if approx(got, want, 1.0e-6) and got <= abs(u - t) + 1.0e-9, do: true, else: "contr"
         end)
       end},
      {"H9", "rollout γ-contraction",
       fn n ->
         trial(n, fn ->
           g = rnd(0.1, 0.95)
           u = Enum.map(1..3, fn _ -> rnd(-8, 8) end)
           v = Enum.map(1..3, fn _ -> rnd(-8, 8) end)
           r = Enum.map(1..3, fn _ -> rnd(-5, 5) end)
           bu = Enum.with_index(u) |> Enum.map(fn {x, i} -> Enum.at(r, i) + g * x end)
           bv = Enum.with_index(v) |> Enum.map(fn {x, i} -> Enum.at(r, i) + g * x end)
           num = Enum.with_index(bu) |> Enum.map(fn {x, i} -> abs(x - Enum.at(bv, i)) end) |> Enum.max()
           den = Enum.with_index(u) |> Enum.map(fn {x, i} -> abs(x - Enum.at(v, i)) end) |> Enum.max()
           if approx(num, g * den, 1.0e-6), do: true, else: "γ-contr"
         end)
       end},
      {"H10", "dominate idempotent + Pareto",
       fn n ->
         trial(n, fn ->
           k = 4 + randint(4)
           opts = Enum.map(1..k, fn _ -> rand_opt_obj() end)
           p1 = Score.dominate(opts); p2 = Score.dominate(p1)
           ids1 = p1 |> Enum.map(& &1.id) |> Enum.sort()
           ids2 = p2 |> Enum.map(& &1.id) |> Enum.sort()
           cond do
             ids1 != ids2 -> "not-idem"
             true ->
               dominated =
                 Enum.any?(p1, fn a ->
                   Enum.any?(p1, fn b ->
                     a.id != b.id and
                       Enum.with_index(b.obj) |> Enum.all?(fn {bj, i} -> bj >= Enum.at(a.obj, i) end) and
                       Enum.with_index(b.obj) |> Enum.any?(fn {bj, i} -> bj > Enum.at(a.obj, i) end)
                   end)
                 end)
               if dominated, do: "dominated survivor", else: true
           end
         end)
       end},
      {"H11", "anneal ε→0 idempotent",
       fn n ->
         trial(n, fn ->
           sc = rand_score(); a1 = Score.anneal(sc); a2 = Score.anneal(a1)
           if a1.eps == 0 and a2.eps == 0, do: true, else: "ε"
         end)
       end},
      {"H12", "softmax shift-invariant",
       fn n ->
         trial(n, fn ->
           k = 4; t = rnd(0.3, 2)
           u = Enum.map(1..k, fn _ -> rnd(-6, 6) end); c = rnd(-5, 5)
           a = Score.softmax(u, t); b = Score.softmax(Enum.map(u, &(&1 + c)), t)
           if Enum.with_index(a) |> Enum.all?(fn {x, i} -> approx(x, Enum.at(b, i), 1.0e-6) end), do: true, else: "shift"
         end)
       end},
      {"H13", "T→0 collapses to argmax",
       fn n ->
         trial(n, fn ->
           u = Enum.map(1..5, fn _ -> tofixed(rnd(-6, 6), 3) end)
           sm = Score.softmax(u, 0.01)
           if index_of_max(sm) == index_of_max(u), do: true, else: "argmax"
         end)
       end}
    ]
  end

  defp index_of_max(list) do
    m = Enum.max(list)
    Enum.find_index(list, &(&1 == m))
  end

  # ---------------- BRIDGE (B1–B3) ----------------
  defp rand_option do
    %{
      id: "opt" <> Integer.to_string(randint(1_000_000)),
      value: Value.v(%{beta: tofixed(:rand.uniform(), 3), kappa: :rand.uniform() < 0.4, sigma: sample(["c"])}),
      utility: tofixed(rnd(0, 10), 3)
    }
  end

  @breq %{beta_min: 0.5, acyclic: true}

  def br do
    [
      {"B1", "veto ⇒ score 0̲",
       fn n ->
         trial(n, fn ->
           o = rand_option(); g = Bridge.gated_score(o, @breq, "tropical")
           if Value.consume(o.value, @breq).ok do
             true
           else
             if g.score == :neg_infinity, do: true, else: "not annihilated"
           end
         end)
       end},
      {"B2", "select ranks within feasible",
       fn n ->
         trial(n, fn ->
           opts = Enum.map(1..(2 + randint(4)), fn _ -> rand_option() end)
           r = Bridge.select(opts, @breq, "tropical")
           if r.decision == nil do
             true
           else
             feas = Enum.filter(opts, fn o -> Value.consume(o.value, @breq).ok end)
             chosen = Enum.find(feas, fn o -> o.id == r.decision end)
             cond do
               chosen == nil -> "chose infeasible"
               true ->
                 chosen_u = chosen.utility
                 if Enum.all?(feas, fn o -> o.utility <= chosen_u + 1.0e-9 end), do: true, else: "feasible outranks chosen"
             end
           end
         end)
       end},
      {"B3", "conservativity: one feasible ⇒ chosen",
       fn n ->
         trial(n, fn ->
           i = randint(3)
           opts =
             Enum.map(0..2, fn j ->
               base = rand_option()
               if j == i do
                 %{base | value: Value.v(%{beta: 0.99, kappa: false})}
               else
                 %{base | value: Value.v(%{beta: 0.99, kappa: true}), utility: 999}
               end
             end)
           r = Bridge.select(opts, @breq, "tropical")
           if r.decision == Enum.at(opts, i).id, do: true, else: "not unique feasible"
         end)
       end}
    ]
  end

  # ---------------- DEONTIC (D1–D9) ----------------
  defp stati, do: [Norm.status().optional, Norm.status().obligatory, Norm.status().forbidden, Norm.status().conflict]
  defp rand_status, do: Enum.at(stati(), randint(4))

  def deon do
    st = Norm.status()
    [
      {"D1", "join commutative + associative",
       fn n ->
         trial(n, fn ->
           a = rand_status(); b = rand_status(); c = rand_status()
           if Norm.join(a, b) != Norm.join(b, a) do
             "comm"
           else
             if Norm.join(Norm.join(a, b), c) == Norm.join(a, Norm.join(b, c)), do: true, else: "assoc"
           end
         end)
       end},
      {"D2", "join identity OPTIONAL + idempotent",
       fn n ->
         trial(n, fn ->
           a = rand_status()
           if Norm.join(a, st.optional) == a and Norm.join(a, a) == a, do: true, else: "id/idem"
         end)
       end},
      {"D3", "O ⊔ F = CONFLICT",
       fn n -> trial(n, fn -> if Norm.join(st.obligatory, st.forbidden) == st.conflict, do: true, else: "no-conflict" end) end},
      {"D4", "join monotone (a ⊑ a⊔b)",
       fn n ->
         trial(n, fn ->
           a = rand_status(); b = rand_status()
           if Norm.rank(Norm.join(a, b)) >= Norm.rank(a) and Norm.rank(Norm.join(a, b)) >= Norm.rank(b), do: true, else: "mono"
         end)
       end},
      {"D5", "CONFLICT absorbs",
       fn n -> trial(n, fn -> a = rand_status(); if Norm.join(st.conflict, a) == st.conflict, do: true, else: "absorb" end) end},
      {"D6", "resolve idempotent + clears conflict (distinct prio)",
       fn n ->
         trial(n, fn ->
           v = %{status: st.conflict, contributors: [%{id: "o", modality: "obligatory", priority: 5}, %{id: "f", modality: "forbidden", priority: 2}]}
           r1 = Norm.resolve(v)
           if r1.resolved == st.conflict do
             "did-not-clear"
           else
             r2 = Norm.resolve(r1)
             if r2.resolved == r1.resolved, do: true, else: "not-idempotent"
           end
         end)
       end},
      {"D7", "factual detachment (in force iff condition)",
       fn n ->
         trial(n, fn ->
           c = :rand.uniform() < 0.5
           nm = Norm.norm(%{modality: "obligatory", condition: fn _ -> c end})
           if Norm.detach(nm, %{}).in_force == c, do: true, else: "detach"
         end)
       end},
      {"D8", "CTD partiality (repair iff violated)",
       fn n ->
         trial(n, fn ->
           nm = Norm.norm(%{id: "p", modality: "obligatory", ctd: Norm.norm(%{id: "r", modality: "obligatory"})})
           r1 = Norm.detach(nm, %{}, %{violated: false})
           r2 = Norm.detach(nm, %{}, %{violated: true})
           if r1.repair == nil and r2.repair.id == "r", do: true, else: "ctd"
         end)
       end},
      {"D9", "comply: O⇒¬F (ought is permitted)",
       fn n ->
         trial(n, fn ->
           if Norm.comply(st.obligatory, true).ok and not Norm.comply(st.forbidden, true).ok and not Norm.comply(st.obligatory, false).ok, do: true, else: "comply"
         end)
       end}
    ]
  end

  # ---------------- DEONTIC BRIDGE (DB1–DB3) ----------------
  defp feas_v, do: Value.v(%{beta: 0.99, kappa: false})
  defp infeas_v, do: Value.v(%{beta: 0.10, kappa: true})
  @greq %{beta_min: 0.9, acyclic: true}

  def dbr do
    [
      {"DB1", "forbidden excluded from decision",
       fn n ->
         trial(n, fn ->
           norms = [Norm.norm(%{id: "no-x", modality: "forbidden", condition: fn c -> Map.get(c, :x) == true end, priority: 5})]
           opts = [%{id: "safe", value: feas_v(), utility: 1, ctx: %{}}, %{id: "bad", value: feas_v(), utility: 99, ctx: %{x: true}}]
           r = Govern.govern(opts, %{req: @greq, norms: norms})
           if r.decision == "safe" and Enum.any?(r.deontically_vetoed, &(&1.id == "bad")), do: true, else: "forbidden-not-excluded"
         end)
       end},
      {"DB2", "obligation forces over higher score",
       fn n ->
         trial(n, fn ->
           norms = [Norm.norm(%{id: "must-c", modality: "obligatory", condition: fn c -> Map.get(c, :duty) == true end, priority: 5})]
           opts = [%{id: "A", value: feas_v(), utility: 99, ctx: %{}}, %{id: "C", value: feas_v(), utility: 1, ctx: %{duty: true}}]
           r = Govern.govern(opts, %{req: @greq, norms: norms})
           if r.decision == "C" and r.forced_by_obligation, do: true, else: "obligation-not-forced"
         end)
       end},
      {"DB3", "alethic precedence ⇒ CTD escalation",
       fn n ->
         trial(n, fn ->
           norms = [Norm.norm(%{id: "must-c", modality: "obligatory", condition: fn c -> Map.get(c, :duty) == true end, priority: 5, ctd: Norm.norm(%{id: "escalate-DPO", modality: "obligatory"})})]
           opts = [%{id: "A", value: feas_v(), utility: 99, ctx: %{}}, %{id: "C", value: infeas_v(), utility: 1, ctx: %{duty: true}}]
           r = Govern.govern(opts, %{req: @greq, norms: norms})
           if r.decision == nil and r.escalation && r.escalation.repair == "escalate-DPO", do: true, else: "no-escalation"
         end)
       end}
    ]
  end

  # ---------------- TEMPORAL (T1–T8) ----------------
  defp ats do
    [
      Temporal.atom("even", fn s -> rem(s.v, 2) == 0 end),
      Temporal.atom("hi", fn s -> s.v >= 3 end),
      Temporal.atom("pos", fn s -> s.v > 0 end)
    ]
  end

  defp r_atom, do: Enum.at(ats(), randint(3))

  defp r_form(d) when d <= 0, do: r_atom()

  defp r_form(d) do
    case randint(8) do
      0 -> r_atom()
      1 -> Temporal.not_(r_form(d - 1))
      2 -> Temporal.and_(r_form(d - 1), r_form(d - 1))
      3 -> Temporal.or_(r_form(d - 1), r_form(d - 1))
      4 -> Temporal.next(r_form(d - 1))
      5 -> Temporal.always(r_form(d - 1))
      6 -> Temporal.eventually(r_form(d - 1))
      _ -> Temporal.until(r_form(d - 1), r_form(d - 1))
    end
  end

  defp r_traj, do: Enum.map(1..(1 + randint(6)), fn _ -> %{v: randint(5)} end)
  defp sat(f, tau), do: Temporal.monitor(f, tau).verdict == "satisfied"

  def temp do
    [
      {"T1", "G,F idempotent (GGφ≡Gφ)",
       fn n ->
         trial(n, fn ->
           a = r_form(2); tau = r_traj()
           if Temporal.eval_direct(Temporal.always(Temporal.always(a)), tau) == Temporal.eval_direct(Temporal.always(a), tau) and
                Temporal.eval_direct(Temporal.eventually(Temporal.eventually(a)), tau) == Temporal.eval_direct(Temporal.eventually(a), tau), do: true, else: "idem"
         end)
       end},
      {"T2", "duality (¬Gφ≡F¬φ, ¬Fφ≡G¬φ)",
       fn n ->
         trial(n, fn ->
           a = r_form(2); tau = r_traj()
           if Temporal.eval_direct(Temporal.not_(Temporal.always(a)), tau) == Temporal.eval_direct(Temporal.eventually(Temporal.not_(a)), tau) and
                Temporal.eval_direct(Temporal.not_(Temporal.eventually(a)), tau) == Temporal.eval_direct(Temporal.always(Temporal.not_(a)), tau), do: true, else: "dual"
         end)
       end},
      {"T3", "∧,∨ commutative + idempotent",
       fn n ->
         trial(n, fn ->
           a = r_form(2); b = r_form(2); tau = r_traj()
           if Temporal.eval_direct(Temporal.and_(a, b), tau) == Temporal.eval_direct(Temporal.and_(b, a), tau) and
                Temporal.eval_direct(Temporal.or_(a, b), tau) == Temporal.eval_direct(Temporal.or_(b, a), tau) and
                Temporal.eval_direct(Temporal.and_(a, a), tau) == Temporal.eval_direct(a, tau), do: true, else: "lattice"
         end)
       end},
      {"T4", "progression faithful (monitor ≡ direct)",
       fn n ->
         trial(n, fn ->
           a = r_form(2); tau = r_traj()
           if sat(a, tau) == Temporal.eval_direct(a, tau, 0), do: true, else: "progress≠direct"
         end)
       end},
      {"T5", "safety finite-witness / liveness never-early",
       fn n ->
         trial(n, fn ->
           p = r_atom(); tau = r_traj()
           g = Temporal.monitor(Temporal.always(p), tau)
           if g.verdict == "violated" and not Enum.member?(g.online, "vio") do
             "safety-no-witness"
           else
             f = Temporal.monitor(Temporal.eventually(p), tau)
             if Enum.member?(f.online, "vio"), do: "liveness-early-false", else: true
           end
         end)
       end},
      {"T6", "G/∧ and F/∨ distribute",
       fn n ->
         trial(n, fn ->
           a = r_form(1); b = r_form(1); tau = r_traj()
           if Temporal.eval_direct(Temporal.always(Temporal.and_(a, b)), tau) == Temporal.eval_direct(Temporal.and_(Temporal.always(a), Temporal.always(b)), tau) and
                Temporal.eval_direct(Temporal.eventually(Temporal.or_(a, b)), tau) == Temporal.eval_direct(Temporal.or_(Temporal.eventually(a), Temporal.eventually(b)), tau), do: true, else: "dist"
         end)
       end},
      {"T7", "until fixpoint (φUψ≡ψ∨(φ∧X(φUψ)))",
       fn n ->
         trial(n, fn ->
           a = r_form(1); b = r_form(1); tau = r_traj()
           lhs = Temporal.until(a, b)
           rhs = Temporal.or_(b, Temporal.and_(a, Temporal.next(Temporal.until(a, b))))
           if Temporal.eval_direct(lhs, tau) == Temporal.eval_direct(rhs, tau), do: true, else: "until-fix"
         end)
       end},
      {"T8", "lasso GF/FG + G/F vs unrolling",
       fn n ->
         trial(n, fn ->
           p = r_atom(); stem = r_traj(); loop = r_traj()
           some_loop = Enum.any?(loop, fn s -> p.pred.(s) end)
           every_loop = Enum.all?(loop, fn s -> p.pred.(s) end)
           cond do
             Temporal.monitor_lasso(Temporal.gf(p), stem, loop) != some_loop -> "GF"
             Temporal.monitor_lasso(Temporal.fg(p), stem, loop) != every_loop -> "FG"
             true ->
               unroll = stem ++ loop ++ loop ++ loop
               if Temporal.monitor_lasso(Temporal.always(p), stem, loop) != Temporal.eval_direct(Temporal.always(p), unroll) do
                 "G-unroll"
               else
                 if Temporal.monitor_lasso(Temporal.eventually(p), stem, loop) == Temporal.eval_direct(Temporal.eventually(p), unroll), do: true, else: "F-unroll"
               end
           end
         end)
       end}
    ]
  end

  # ---------------- TEMPORAL BRIDGE (TB1–TB3) ----------------
  def tbr do
    [
      {"TB1", "safety shield prunes a violating step",
       fn n ->
         trial(n, fn ->
           safe = Temporal.always(Temporal.atom("β≥.8", fn s -> s.beta >= 0.8 end))
           hist = [%{beta: 0.95}, %{beta: 0.9}]
           res = Supervise.residual_of(safe, hist)
           if Supervise.guard(res, %{beta: 0.5}) == true and Supervise.guard(res, %{beta: 0.95}) == false, do: true, else: "shield"
         end)
       end},
      {"TB2", "unmet liveness ⇒ escalation at horizon",
       fn n ->
         trial(n, fn ->
           spec = Supervise.temporal_spec(%{id: "reach-goal", formula: Temporal.eventually(Temporal.atom("done", fn s -> s.done end)), kind: "liveness", ctd: "escalate-replan"})
           miss = Supervise.supervise([%{done: false}, %{done: false}], [spec])
           hit = Supervise.supervise([%{done: false}, %{done: true}], [spec])
           if miss.escalation && Enum.at(miss.escalation.specs, 0).repair == "escalate-replan" and hit.escalation == nil, do: true, else: "esc"
         end)
       end},
      {"TB3", "safety violation ⇒ unsafe verdict",
       fn n ->
         trial(n, fn ->
           spec = Supervise.temporal_spec(%{id: "never-low", formula: Temporal.always(Temporal.atom("β≥.8", fn s -> s.beta >= 0.8 end)), kind: "safety"})
           r = Supervise.supervise([%{beta: 0.9}, %{beta: 0.5}, %{beta: 0.9}], [spec])
           if r.safe == false and Enum.at(r.reports, 0).violated_at == 1, do: true, else: "unsafe"
         end)
       end}
    ]
  end

  # ---------------- REFLEXIVE (R1–R8) ----------------
  defp nm(id, mod, pri \\ 0, target \\ nil), do: Reflexive.nm(id, mod, pri, target)

  defp rand_nm do
    nm(
      "n" <> Integer.to_string(randint(1_000_000)),
      Enum.at(["permitted", "obligatory", "forbidden"], randint(3)),
      randint(5),
      Enum.at(["t1", "t2"], randint(2))
    )
  end

  def refl do
    [
      {"R1", "success (enact adds, repeal removes)",
       fn n ->
         trial(n, fn ->
           p = Reflexive.policy(%{norms: [nm("a", "permitted")]}); x = rand_nm()
           r1 = Reflexive.revise(p, Reflexive.enact(x))
           if not r1.accepted or not Enum.any?(r1.policy.norms, &(&1.id == x.id)) do
             "enact"
           else
             r2 = Reflexive.revise(r1.policy, Reflexive.repeal(x.id))
             if r2.accepted and not Enum.any?(r2.policy.norms, &(&1.id == x.id)), do: true, else: "repeal"
           end
         end)
       end},
      {"R2", "consistency (no surviving dominated conflict)",
       fn n ->
         trial(n, fn ->
           ns = Enum.map(1..4, fn _ -> rand_nm() end)
           %{norms: norms} = Reflexive.arbitrate(ns)
           bad =
             Enum.any?(norms, fn a ->
               Enum.any?(norms, fn b ->
                 dom = Map.get(b, :priority, 0) > Map.get(a, :priority, 0) or (Map.get(b, :priority, 0) == Map.get(a, :priority, 0) and Map.get(b, :time, 0) > Map.get(a, :time, 0))
                 conf = a != b and Map.get(a, :target) != nil and a.target == b.target and ((a.modality == "obligatory" and b.modality == "forbidden") or (a.modality == "forbidden" and b.modality == "obligatory"))
                 conf and dom
               end)
             end)
           if bad, do: "dominated-survivor", else: true
         end)
       end},
      {"R3", "minimal change (enact∘repeal = id)",
       fn n ->
         trial(n, fn ->
           p = Reflexive.policy(%{norms: [nm("a", "permitted"), nm("b", "obligatory", 3)]})
           x = nm("x" <> Integer.to_string(randint(100_000)), "permitted")
           after_p = Reflexive.revise(Reflexive.revise(p, Reflexive.enact(x)).policy, Reflexive.repeal(x.id)).policy
           if Reflexive.policy_key(after_p) == Reflexive.policy_key(p), do: true, else: "not-minimal"
         end)
       end},
      {"R4", "entrenchment (no weakening the core)",
       fn n ->
         trial(n, fn ->
           p = Reflexive.entrench(Reflexive.policy(%{norms: [nm("safe", "forbidden", 10)]}), "safe")
           cond do
             Reflexive.revise(p, Reflexive.repeal("safe")).accepted -> "repealed-entrenched"
             Reflexive.revise(p, Reflexive.amend("safe", nm("safe", "permitted"))).accepted -> "weakened-entrenched"
             true ->
               strong = Reflexive.revise(p, Reflexive.amend("safe", nm("safe", "forbidden", 20)))
               if strong.accepted and Enum.find(strong.policy.norms, &(&1.id == "safe")).priority == 20, do: true, else: "strengthen-blocked"
           end
         end)
       end},
      {"R5", "lex superior (priority wins)",
       fn n ->
         trial(n, fn ->
           hi = nm("hi", "forbidden", 9, "g"); lo = nm("lo", "obligatory", 2, "g")
           a = Reflexive.arbitrate([hi, lo])
           if Enum.any?(a.norms, &(&1.id == "hi")) and Enum.member?(a.overridden, "lo"), do: true, else: "superior"
         end)
       end},
      {"R6", "lex posterior (recency breaks ties)",
       fn n ->
         trial(n, fn ->
           old = Map.put(nm("old", "forbidden", 5, "g"), :time, 1)
           neu = Map.put(nm("new", "obligatory", 5, "g"), :time, 9)
           a = Reflexive.arbitrate([old, neu])
           if Enum.any?(a.norms, &(&1.id == "new")) and Enum.member?(a.overridden, "old"), do: true, else: "posterior"
         end)
       end},
      {"R7", "arbitration idempotent",
       fn n ->
         trial(n, fn ->
           ns = Enum.map(1..4, fn _ -> rand_nm() end)
           a1 = Reflexive.arbitrate(ns); a2 = Reflexive.arbitrate(a1.norms)
           if a2.overridden == [] and length(a2.norms) == length(a1.norms), do: true, else: "not-idempotent"
         end)
       end},
      {"R8", "reflective stability (fixpoint)",
       fn n ->
         trial(n, fn ->
           p = Reflexive.entrench(Reflexive.policy(%{norms: [nm("safe", "forbidden", 10)]}), "safe")
           props = [Reflexive.enact(nm("p1", "permitted")), Reflexive.repeal("safe"), Reflexive.enact(nm("p2", "obligatory", 1))]
           s1 = Reflexive.stabilize(p, props); s2 = Reflexive.stabilize(s1.policy, props)
           if s1.stable and Reflexive.policy_key(s2.policy) == Reflexive.policy_key(s1.policy), do: true, else: "unstable"
         end)
       end}
    ]
  end

  # ---------------- REFLEXIVE BRIDGE (RB1–RB3) ----------------
  def refb do
    [
      {"RB1", "cannot self-permit the forbidden",
       fn n ->
         trial(n, fn ->
           p = Reflexive.entrench(Reflexive.policy(%{norms: [nm("forbid-X", "forbidden", 10, "X")]}), "forbid-X")
           if Reflexive.revise(p, Reflexive.enact(nm("force-X", "obligatory", 10, "X"))).accepted == false, do: true, else: "self-permitted"
         end)
       end},
      {"RB2", "revision propagates to govern",
       fn n ->
         trial(n, fn ->
           a = %{id: "A", value: Value.v(%{beta: 0.99, kappa: false}), utility: 99, ctx: %{x: true}}
           b = %{id: "B", value: Value.v(%{beta: 0.99, kappa: false}), utility: 1, ctx: %{}}
           before = Govern.govern([a, b], %{req: %{beta_min: 0.9, acyclic: true}, norms: []})
           if before.decision != "A" do
             "pre"
           else
             pol = Reflexive.revise(Reflexive.policy(%{}), Reflexive.enact(Norm.norm(%{id: "forbid-A", modality: "forbidden", priority: 5, condition: fn c -> Map.get(c, :x) == true end})))
             after_g = Govern.govern([a, b], %{req: %{beta_min: 0.9, acyclic: true}, norms: pol.policy.norms})
             if after_g.decision == "B" and Enum.any?(after_g.deontically_vetoed, &(&1.id == "A")), do: true, else: "no-propagate"
           end
         end)
       end},
      {"RB3", "entrenched safety survives in supervise",
       fn n ->
         trial(n, fn ->
           spec = Supervise.temporal_spec(%{id: "floor", formula: Temporal.always(Temporal.atom("β", fn s -> s.beta >= 0.8 end)), kind: "safety"})
           p = Reflexive.entrench(Reflexive.policy(%{specs: [spec]}), "floor")
           if Reflexive.revise(p, Reflexive.repeal("floor")).accepted do
             "repealed"
           else
             r = Supervise.supervise([%{beta: 0.9}, %{beta: 0.5}], p.specs)
             if r.safe == false and Enum.at(r.reports, 0).violated_at == 1, do: true, else: "not-enforced"
           end
         end)
       end}
    ]
  end

  # ---------------- EPISTEMIC (E1–E8) ----------------
  # JS worlds are distinct object references even when structurally equal, so the
  # accessibility relations stay reflexive/symmetric/transitive. With only 8 distinct
  # truth-assignments over {p,q,r}, random worlds collide; we tag each world with a
  # unique :wid so structural equality coincides with JS reference identity.
  @eatoms ["p", "q", "r"]
  defp rand_world, do: Map.new(@eatoms, fn a -> {a, :rand.uniform() < 0.5} end)

  defp rand_worlds(count) do
    Enum.map(1..count, fn i -> Map.put(rand_world(), :wid, i) end)
  end

  defp pa, do: Enum.map(@eatoms, fn name -> Epistemic.atom(name, fn w -> Map.get(w, name) end) end)
  defp e_atom, do: Enum.at(pa(), randint(3))

  defp partition_model do
    worlds = rand_worlds(3 + randint(4))
    k = 1 + randint(length(worlds))
    cell = Enum.map(worlds, fn _ -> randint(k) end)
    access = %{
      "a" => fn w ->
        i = index_of(worlds, w)
        worlds |> Enum.with_index() |> Enum.filter(fn {_, j} -> Enum.at(cell, j) == Enum.at(cell, i) end) |> Enum.map(&elem(&1, 0))
      end
    }
    Epistemic.model(%{worlds: worlds, actual: Enum.at(worlds, randint(length(worlds))), access: access})
  end

  defp belief_model do
    worlds = rand_worlds(4 + randint(3))
    d = Enum.filter(worlds, fn _ -> :rand.uniform() < 0.5 end)
    dox = if d != [], do: d, else: [Enum.at(worlds, 0)]
    Epistemic.model(%{worlds: worlds, actual: Enum.at(worlds, randint(length(worlds))), access: %{"a" => fn _ -> dox end}})
  end

  defp cm_model(agents) do
    worlds = rand_worlds(3 + randint(4))
    access =
      Map.new(agents, fn ag ->
        k = 1 + randint(length(worlds))
        cell = Enum.map(worlds, fn _ -> randint(k) end)
        {ag, fn w ->
          i = index_of(worlds, w)
          worlds |> Enum.with_index() |> Enum.filter(fn {_, j} -> Enum.at(cell, j) == Enum.at(cell, i) end) |> Enum.map(&elem(&1, 0))
        end}
      end)
    Epistemic.model(%{worlds: worlds, actual: Enum.at(worlds, randint(length(worlds))), access: access})
  end

  defp ku_model do
    w1 = %{"p" => true, "q" => false, "r" => false}
    w2 = %{"p" => false, "q" => false, "r" => false}
    worlds = [w1, w2]
    Epistemic.model(%{worlds: worlds, actual: w1, access: %{"a" => fn _ -> worlds end}})
  end

  defp index_of(list, elem), do: Enum.find_index(list, &(&1 == elem))

  def epi do
    [
      {"E1", "factivity T (Kφ → φ)",
       fn n ->
         trial(n, fn ->
           m = partition_model(); f = e_atom()
           if not Epistemic.knows(m, "a", f) or Epistemic.holds(f, m.actual), do: true, else: "not-factive"
         end)
       end},
      {"E2", "distribution K (K(φ→ψ)∧Kφ → Kψ)",
       fn n ->
         trial(n, fn ->
           m = partition_model(); f = e_atom(); g = e_atom()
           if not (Epistemic.knows(m, "a", Epistemic.implies(f, g)) and Epistemic.knows(m, "a", f)) or Epistemic.knows(m, "a", g), do: true, else: "no-K"
         end)
       end},
      {"E3", "positive introspection (Kφ → KKφ)",
       fn n ->
         trial(n, fn ->
           m = partition_model(); f = e_atom()
           if not Epistemic.knows(m, "a", f) do
             true
           else
             if Enum.all?(m.access["a"].(m.actual), fn u -> Epistemic.knows_at(m, "a", u, f) end), do: true, else: "no-4"
           end
         end)
       end},
      {"E4", "negative introspection (¬Kφ → K¬Kφ)",
       fn n ->
         trial(n, fn ->
           m = partition_model(); f = e_atom()
           if Epistemic.knows(m, "a", f) do
             true
           else
             if Enum.all?(m.access["a"].(m.actual), fn u -> not Epistemic.knows_at(m, "a", u, f) end), do: true, else: "no-5"
           end
         end)
       end},
      {"E5", "belief consistency D (¬(Bφ ∧ B¬φ))",
       fn n ->
         trial(n, fn ->
           m = belief_model(); f = e_atom()
           if not (Epistemic.believes(m, "a", f, 0.6) and Epistemic.believes(m, "a", Epistemic.not_(f), 0.6)), do: true, else: "inconsistent"
         end)
       end},
      {"E6", "knowledge ⇒ belief (Kφ → Bφ)",
       fn n ->
         trial(n, fn ->
           m = partition_model(); f = e_atom()
           if not Epistemic.knows(m, "a", f) or Epistemic.believes(m, "a", f, 1), do: true, else: "k-not-b"
         end)
       end},
      {"E7", "learning monotonicity (announce preserves K)",
       fn n ->
         trial(n, fn ->
           m = partition_model(); f = e_atom()
           if not Epistemic.knows(m, "a", f) do
             true
           else
             psi = e_atom()
             if not Epistemic.holds(psi, m.actual) do
               true
             else
               if Epistemic.knows(Epistemic.announce(m, psi), "a", f), do: true, else: "lost-knowledge"
             end
           end
         end)
       end},
      {"E8", "common knowledge (Cφ → Eφ)",
       fn n ->
         trial(n, fn ->
           ags = ["a", "b"]; m = cm_model(ags); f = e_atom()
           if not Epistemic.common(m, ags, f) or Epistemic.everyone(m, ags, f), do: true, else: "c-not-e"
         end)
       end}
    ]
  end

  def epb do
    [
      {"EB1", "threshold gate monotone; K = belief@1",
       fn n ->
         trial(n, fn ->
           m = partition_model(); f = e_atom()
           lo = rnd(0, 0.5); hi = rnd(0.5, 1)
           if Epistemic.believes_at(m, "a", m.actual, f, hi) and not Epistemic.believes_at(m, "a", m.actual, f, lo) do
             "not-monotone"
           else
             if not Epistemic.knows(m, "a", f) or Epistemic.believes(m, "a", f, 1), do: true, else: "gate"
           end
         end)
       end},
      {"EB2", "known-unknown ⇒ deliberate (κ)",
       fn n ->
         trial(n, fn ->
           m = ku_model(); f = Epistemic.atom("p", fn w -> Map.get(w, "p") end)
           if (if Epistemic.knows_it_doesnt_know(m, "a", f), do: Epistemic.route(m, "a", f) == "deliberate", else: true), do: true, else: "route"
         end)
       end},
      {"EB3", "pooled knowledge dominates individual",
       fn n ->
         trial(n, fn ->
           ags = ["a", "b"]; m = cm_model(ags); f = e_atom()
           if not Epistemic.knows(m, "a", f) or Epistemic.distributed(m, ags, f), do: true, else: "pool"
         end)
       end}
    ]
  end

  # ---------------- STRATEGIC (S1–S8) ----------------
  defp sp, do: Strategic.atom("p", fn s -> s.p end)
  defp sq, do: Strategic.atom("q", fn s -> s.q end)
  defp rand_sf, do: Enum.at([sp(), sq(), Strategic.not_(sp()), Strategic.and_(sp(), sq()), Strategic.or_(sp(), sq())], randint(5))

  defp rand_game(agents \\ ["1", "2"]) do
    n = 3 + randint(3)
    states = Enum.map(0..(n - 1), fn i -> %{name: "s" <> Integer.to_string(i), p: :rand.uniform() < 0.5, q: :rand.uniform() < 0.5} end)

    nm_counts =
      for a <- agents, st <- states, into: %{} do
        {a <> "@" <> st.name, 1 + (if :rand.uniform() < 0.5, do: 1, else: 0)}
      end

    moves = fn a, st -> Enum.map(0..(Map.get(nm_counts, a <> "@" <> st.name) - 1), & &1) end

    tbl =
      Enum.reduce(states, %{}, fn st, acc ->
        joint = product_moves(agents, nm_counts, st)
        Enum.reduce(joint, acc, fn jm, acc2 ->
          key = st.name <> "|" <> Enum.map_join(agents, ",", fn a -> Integer.to_string(jm[a]) end)
          Map.put(acc2, key, Enum.at(states, randint(length(states))))
        end)
      end)

    delta = fn st, jm ->
      key = st.name <> "|" <> Enum.map_join(agents, ",", fn a -> Integer.to_string(jm[a]) end)
      Map.get(tbl, key)
    end

    Strategic.game(%{states: states, agents: agents, moves: moves, delta: delta})
  end

  defp product_moves(agents, nm_counts, st) do
    Enum.reduce(agents, [%{}], fn a, acc ->
      cnt = Map.get(nm_counts, a <> "@" <> st.name)
      for p <- acc, m <- 0..(cnt - 1), do: Map.put(p, a, m)
    end)
  end

  defp some_state(m), do: Enum.at(m.states, randint(length(m.states)))

  defp force1ext(model, c, state, in_set) do
    comp = Enum.reject(model.agents, &Enum.member?(c, &1))
    cm = Strategic.product(model, c, state)
    om = Strategic.product(model, comp, state)
    Enum.any?(cm, fn cmove -> Enum.all?(om, fn omove -> in_set.(model.delta.(state, Map.merge(cmove, omove))) end) end)
  end

  defp reach_bfs(m, f) do
    w0 = Enum.filter(m.states, fn s -> Strategic.holds(f, s) end)
    reach_bfs_loop(m, f, w0)
  end

  defp reach_bfs_loop(m, f, w) do
    in_w = fn s -> Enum.member?(w, s) end
    add = Enum.filter(m.states, fn q -> not in_w.(q) and Enum.any?(m.moves.("a", q), fn mv -> in_w.(m.delta.(q, %{"a" => mv})) end) end)
    if add == [], do: w, else: reach_bfs_loop(m, f, w ++ add)
  end

  def str do
    [
      {"S1", "unit: [C]⊤ and ¬[C]⊥",
       fn n ->
         trial(n, fn ->
           m = rand_game(); q = some_state(m); c = if :rand.uniform() < 0.5, do: ["1"], else: ["1", "2"]
           if Strategic.effectivity(m, c, q, Strategic.top()) and not Strategic.effectivity(m, c, q, Strategic.bot()), do: true, else: "unit"
         end)
       end},
      {"S2", "coalition monotonicity",
       fn n ->
         trial(n, fn ->
           m = rand_game(); q = some_state(m); f = rand_sf()
           if not Strategic.effectivity(m, ["1"], q, f) or Strategic.effectivity(m, ["1", "2"], q, f), do: true, else: "coalition-mono"
         end)
       end},
      {"S3", "outcome monotonicity (φ⊨ψ ⇒ [C]φ → [C]ψ)",
       fn n ->
         trial(n, fn ->
           m = rand_game(); q = some_state(m); f = rand_sf(); g = Strategic.or_(f, sq()); c = ["1"]
           if not Strategic.effectivity(m, c, q, f) or Strategic.effectivity(m, c, q, g), do: true, else: "outcome-mono"
         end)
       end},
      {"S4", "superadditivity (disjoint C₁,C₂ cooperate)",
       fn n ->
         trial(n, fn ->
           m = rand_game(); q = some_state(m); f1 = rand_sf(); f2 = rand_sf()
           if not (Strategic.effectivity(m, ["1"], q, f1) and Strategic.effectivity(m, ["2"], q, f2)) or Strategic.effectivity(m, ["1", "2"], q, Strategic.and_(f1, f2)), do: true, else: "superadd"
         end)
       end},
      {"S5", "regularity (¬([C]φ ∧ [N∖C]¬φ))",
       fn n ->
         trial(n, fn ->
           m = rand_game(); q = some_state(m); f = rand_sf()
           if not (Strategic.effectivity(m, ["1"], q, f) and Strategic.effectivity(m, ["2"], q, Strategic.not_(f))), do: true, else: "not-regular"
         end)
       end},
      {"S6", "maintenance is a greatest fixpoint (□)",
       fn n ->
         trial(n, fn ->
           m = rand_game(); f = rand_sf(); c = ["1"]
           w = Strategic.can_maintain(m, c, f); in_w = fn s -> Enum.member?(w, s) end
           reapply = Enum.filter(m.states, fn q -> Strategic.holds(f, q) and force1ext(m, c, q, in_w) end)
           if Enum.all?(w, fn q -> Strategic.holds(f, q) end) and length(reapply) == length(w), do: true, else: "gfp"
         end)
       end},
      {"S7", "reachability is a least fixpoint (◊)",
       fn n ->
         trial(n, fn ->
           m = rand_game(); f = rand_sf(); c = ["1"]
           w = Strategic.can_reach(m, c, f); in_w = fn s -> Enum.member?(w, s) end
           reapply = Enum.filter(m.states, fn q -> Strategic.holds(f, q) or force1ext(m, c, q, in_w) end)
           if Enum.all?(Enum.filter(m.states, fn s -> Strategic.holds(f, s) end), fn q -> Enum.member?(w, q) end) and length(reapply) == length(w), do: true, else: "lfp"
         end)
       end},
      {"S8", "grand-coalition determinacy ([Σ]φ ↔ ∃ successor φ)",
       fn n ->
         trial(n, fn ->
           m = rand_game(); q = some_state(m); f = rand_sf(); g = m.agents
           some_succ = Enum.any?(Strategic.product(m, g, q), fn jm -> Strategic.holds(f, m.delta.(q, jm)) end)
           if Strategic.effectivity(m, g, q, f) == some_succ, do: true, else: "determinacy"
         end)
       end}
    ]
  end

  def sb do
    [
      {"SB1", "single-agent collapse → temporal reachability",
       fn n ->
         trial(n, fn ->
           m = rand_game(["a"]); f = rand_sf()
           w = Strategic.can_reach(m, ["a"], f); b = reach_bfs(m, f)
           if length(w) == length(b) and Enum.all?(w, fn q -> Enum.member?(b, q) end), do: true, else: "collapse"
         end)
       end},
      {"SB2", "ought-implies-can (¬ability ⇒ escalate)",
       fn n ->
         trial(n, fn ->
           m = rand_game(); q = some_state(m); f = rand_sf(); c = ["1"]
           can = Strategic.can_ensure(m, c, f, q)
           if Strategic.oblige(m, c, f, q) == (if can, do: "discharge", else: "escalate"), do: true, else: "oic"
         end)
       end},
      {"SB3", "coordination needs ability ∧ common knowledge",
       fn n ->
         trial(n, fn ->
           m = rand_game(); q = some_state(m); f = rand_sf(); c = ["1", "2"]; ck = :rand.uniform() < 0.5
           ex = Strategic.executable(m, c, f, q, ck)
           if ex == (Strategic.can_ensure(m, c, f, q) and ck), do: true, else: "coord"
         end)
       end}
    ]
  end

  # ---------------- RESOURCE (C1–C8) ----------------
  defp rand_ledger do
    l = Resource.ledger(%{kind: %{"tokens" => "depletable", "money" => "depletable", "capacity" => "capacity", "skill" => "reusable"}})

    bal =
      Enum.reduce(["a", "b", "c", "d"], %{}, fn a, acc ->
        Map.put(acc, a, %{"tokens" => ri(10), "money" => ri(10), "skill" => if(:rand.uniform() < 0.5, do: 1, else: 0)})
      end)

    bal =
      bal
      |> Map.put(Resource.treasury(), %{"tokens" => 50, "money" => 50})
      |> Map.put(Resource.sink(), %{})
      |> Map.put(Resource.free(), %{"capacity" => 10 + ri(10)})

    %{l | bal: bal}
  end

  defp avail(l, res), do: Enum.reduce(["a", "b", "c", "d"], 0, fn a, s -> s + Resource.balance(l, a, res) end)

  def reso do
    [
      {"C1", "conservation under transfer (Σ invariant)",
       fn n ->
         trial(n, fn ->
           l = rand_ledger(); res = if :rand.uniform() < 0.5, do: "tokens", else: "money"
           accts = ["a", "b", "c", "d", Resource.treasury(), Resource.sink()]
           from = Enum.at(accts, ri(length(accts))); to = Enum.at(accts, ri(length(accts)))
           b = Resource.total(l, res); m = Resource.transfer(l, res, from, to, ri(6))
           got = if m == Resource.infeasible(), do: b, else: Resource.total(m, res)
           if got == b, do: true, else: "not-conserved"
         end)
       end},
      {"C2", "no overdraft; balances stay ≥ 0",
       fn n ->
         trial(n, fn ->
           l = rand_ledger(); from = Enum.at(["a", "b", "c", "d"], ri(4))
           over = Resource.transfer(l, "tokens", from, "a", Resource.balance(l, from, "tokens") + 1 + ri(3))
           if over != Resource.infeasible() do
             "overdraft-allowed"
           else
             ok = Resource.transfer(l, "tokens", from, "b", min(Resource.balance(l, from, "tokens"), ri(4)))
             if ok == Resource.infeasible() or Enum.all?(Map.values(ok.bal), fn r -> Enum.all?(Map.values(r), &(&1 >= 0)) end), do: true, else: "negative"
           end
         end)
       end},
      {"C3", "independent transactions commute (CRDT)",
       fn n ->
         trial(n, fn ->
           l = rand_ledger(); res = "tokens"
           a1 = min(Resource.balance(l, "a", res), ri(4)); a2 = min(Resource.balance(l, "c", res), ri(4))
           m12 = Resource.transfer(Resource.transfer(l, res, "a", "b", a1), res, "c", "d", a2)
           m21 = Resource.transfer(Resource.transfer(l, res, "c", "d", a2), res, "a", "b", a1)
           if Enum.all?(["a", "b", "c", "d"], fn x -> Resource.balance(m12, x, res) == Resource.balance(m21, x, res) end), do: true, else: "noncommutative"
         end)
       end},
      {"C4", "linearity — spending depletes (not idempotent)",
       fn n ->
         trial(n, fn ->
           l = rand_ledger(); a = Enum.at(["a", "b", "c", "d"], ri(4))
           start = Resource.balance(l, a, "tokens")
           if start < 2 do
             true
           else
             m = Resource.spend(Resource.spend(l, a, "tokens", 1), a, "tokens", 1)
             if Resource.balance(m, a, "tokens") == start - 2, do: true, else: "not-linear"
           end
         end)
       end},
      {"C5", "reusability — using `!` does not deplete (idempotent)",
       fn n ->
         trial(n, fn ->
           l = rand_ledger(); a = Enum.at(["a", "b", "c", "d"], ri(4))
           if Resource.balance(l, a, "skill") < 1 do
             true
           else
             u1 = Resource.use(l, a, "skill"); u2 = Resource.use(u1.ledger, a, "skill")
             if u1.ok and u2.ok and Resource.balance(u2.ledger, a, "skill") == Resource.balance(l, a, "skill"), do: true, else: "depleted"
           end
         end)
       end},
      {"C6", "flow monotonicity — depletion only decreases",
       fn n ->
         trial(n, fn ->
           l0 = rand_ledger()
           {res, _l} =
             Enum.reduce_while(0..3, {true, l0, avail(l0, "tokens")}, fn _i, {_ok, l, prev} ->
               a = Enum.at(["a", "b", "c", "d"], ri(4))
               m = Resource.spend(l, a, "tokens", min(Resource.balance(l, a, "tokens"), ri(3)))
               if m == Resource.infeasible() do
                 {:cont, {true, l, prev}}
               else
                 now = avail(m, "tokens")
                 if now > prev, do: {:halt, {"increased", m}}, else: {:cont, {true, m, now}}
               end
             end)
             |> case do
               {"increased", m} -> {"increased", m}
               {_ok, l, _prev} -> {true, l}
             end
           if res == true, do: true, else: "increased"
         end)
       end},
      {"C7", "capacity conservation (stability + plasticity)",
       fn n ->
         trial(n, fn ->
           l0 = rand_ledger(); start = Resource.total(l0, "capacity")
           result =
             Enum.reduce_while(0..2, l0, fn _i, l ->
               t = "T" <> Integer.to_string(ri(3))
               l2 =
                 if :rand.uniform() < 0.6 do
                   Resource.allocate(l, t, min(Resource.balance(l, Resource.free(), "capacity"), ri(4)))
                 else
                   Resource.forget(l, t)
                 end
               l2 = if l2 == Resource.infeasible(), do: l, else: l2
               if l2 == Resource.infeasible(), do: {:halt, :broke}, else: {:cont, l2}
             end)
           cond do
             result == :broke -> "broke"
             Resource.total(result, "capacity") == start -> true
             true -> "capacity-leaked"
           end
         end)
       end},
      {"C8", "no free reclaim — forgetting releases the knowledge",
       fn n ->
         trial(n, fn ->
           l0 = rand_ledger(); amt = min(Resource.balance(l0, Resource.free(), "capacity"), 1 + ri(4))
           l = Resource.allocate(l0, "T", amt); l = Resource.consolidate(l, "T")
           before = Resource.balance(l, "mind", "know:T"); m = Resource.forget(l, "T")
           if before == 1 and Resource.balance(m, "mind", "know:T") == 0 and Resource.balance(m, Resource.free(), "capacity") >= amt, do: true, else: "kept-both"
         end)
       end}
    ]
  end

  def resb do
    [
      {"CB1", "exhaustion ⇒ infeasible (the alethic 0̲ gate)",
       fn n ->
         trial(n, fn ->
           l = rand_ledger(); a = Enum.at(["a", "b", "c", "d"], ri(4)); c = ri(12)
           if Resource.feasible(l, a, %{"tokens" => c}) == (Resource.balance(l, a, "tokens") >= c), do: true, else: "gate"
         end)
       end},
      {"CB2", "cost composes additively along a pipeline (semiring)",
       fn n ->
         trial(n, fn ->
           l = rand_ledger(); a = Enum.at(["a", "b", "c", "d"], ri(4)); c1 = ri(3); c2 = ri(3); c3 = ri(3)
           if Resource.balance(l, a, "tokens") < c1 + c2 + c3 do
             true
           else
             seq = Resource.spend(Resource.spend(Resource.spend(l, a, "tokens", c1), a, "tokens", c2), a, "tokens", c3)
             lump = Resource.spend(l, a, "tokens", c1 + c2 + c3)
             if Resource.balance(seq, a, "tokens") == Resource.balance(lump, a, "tokens"), do: true, else: "not-additive"
           end
         end)
       end},
      {"CB3", "Type-II repair pricing (value ≥ cost ∧ affordable)",
       fn n ->
         trial(n, fn ->
           l = rand_ledger(); a = Enum.at(["a", "b", "c", "d"], ri(4))
           value = ri(8); cost = ri(8)
           r = Resource.repair(l, a, %{resource: "tokens", value: value, cost: cost})
           exp =
             cond do
               not Resource.affords(l, a, %{"tokens" => cost}) -> "cannot-afford"
               value >= cost -> "invoke"
               true -> "skip"
             end
           cond do
             r.decision != exp -> "wrong-decision"
             r.decision == "invoke" and Resource.balance(r.ledger, a, "tokens") != Resource.balance(l, a, "tokens") - cost -> "no-charge"
             true -> true
           end
         end)
       end}
    ]
  end

  # ---------------- harness ----------------
  def run_set(laws, n) do
    {pass, fail, results} =
      Enum.reduce(laws, {0, 0, []}, fn {id, desc, fn_}, {p, f, acc} ->
        r = fn_.(n)
        res = %{id: id, desc: desc, pass: r.pass, cex: Map.get(r, :cex), at: r.at}
        if r.pass, do: {p + 1, f, [res | acc]}, else: {p, f + 1, [res | acc]}
      end)

    %{pass: pass, fail: fail, results: Enum.reverse(results)}
  end

  def suites do
    [
      %{key: "INV", label: "Invariant (L1–L14)", laws: inv()},
      %{key: "HEUR", label: "Heuristic (H1–H13) · tropical dioid", laws: heur(), semiring: "tropical"},
      %{key: "BR", label: "Bridge (B1–B3)", laws: br()},
      %{key: "DEON", label: "Deontic (D1–D9)", laws: deon()},
      %{key: "DBR", label: "Deontic bridge (DB1–DB3)", laws: dbr()},
      %{key: "TEMP", label: "Temporal (T1–T8)", laws: temp()},
      %{key: "TBR", label: "Temporal bridge (TB1–TB3)", laws: tbr()},
      %{key: "REFL", label: "Reflexive (R1–R8)", laws: refl()},
      %{key: "REFB", label: "Reflexive bridge (RB1–RB3)", laws: refb()},
      %{key: "EPI", label: "Epistemic (E1–E8)", laws: epi()},
      %{key: "EPB", label: "Epistemic bridge (EB1–EB3)", laws: epb()},
      %{key: "STR", label: "Strategic (S1–S8)", laws: str()},
      %{key: "SB", label: "Strategic bridge (SB1–SB3)", laws: sb()},
      %{key: "RESO", label: "Resource (C1–C8)", laws: reso()},
      %{key: "RESB", label: "Resource bridge (CB1–CB3)", laws: resb()}
    ]
  end

  def run(n \\ 2000) do
    IO.puts("\nbox-and-box law harness (Elixir port) · #{n} trials/law\n#{String.duplicate("─", 48)}")

    {total_fail, total_pass, total_laws} =
      Enum.reduce(suites(), {0, 0, 0}, fn suite, {tf, tp, tl} ->
        if Map.has_key?(suite, :semiring), do: set_semiring(suite.semiring)
        r = run_set(suite.laws, n)
        fail_txt = if r.fail > 0, do: ", #{r.fail} fail", else: ""
        IO.puts("#{suite.label}: #{r.pass}/#{length(suite.laws)} pass#{fail_txt}")

        r.results
        |> Enum.reject(& &1.pass)
        |> Enum.each(fn x -> IO.puts("  ✗ #{x.id} #{x.desc} — #{x.cex} @trial #{x.at}") end)

        {tf + r.fail, tp + r.pass, tl + length(suite.laws)}
      end)

    IO.puts(String.duplicate("─", 48))
    IO.puts("GRAND TOTAL: #{total_pass}/#{total_laws} laws pass" <> if(total_fail > 0, do: " (#{total_fail} fail)", else: ""))
    IO.puts(String.duplicate("─", 48))
    IO.puts(if total_fail == 0, do: "✓ all stated laws hold.\n", else: "✗ #{total_fail} law(s) failed.\n")
    if total_fail == 0, do: 0, else: 1
  end
end
