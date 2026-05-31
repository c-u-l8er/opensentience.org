defmodule BoxAndBox.Norm do
  @moduledoc """
  Deontic Arithmetic — faithful port of norm.mjs (v0.3).

  Statuses live in a diamond lattice: OPTIONAL ⊑ {OBLIGATORY, FORBIDDEN} ⊑ CONFLICT.
  join is the lub; resolve clears a conflict by priority; detach is factual detachment
  (partial for CTD repairs); comply is the gate; escalate produces the CTD repair.
  Laws D1–D9.
  """

  @optional "optional"
  @obligatory "obligatory"
  @forbidden "forbidden"
  @conflict "conflict"

  def status, do: %{optional: @optional, obligatory: @obligatory, forbidden: @forbidden, conflict: @conflict}

  @rank %{"optional" => 0, "obligatory" => 1, "forbidden" => 1, "conflict" => 2}
  def rank(s), do: Map.get(@rank, s)

  @mod2status %{"obligatory" => @obligatory, "forbidden" => @forbidden, "permitted" => @optional}

  # join : least upper bound on the diamond lattice
  def join(a, b) when a == b, do: a
  def join(@optional, b), do: b
  def join(a, @optional), do: a
  def join(@conflict, _), do: @conflict
  def join(_, @conflict), do: @conflict
  # {obligatory} ⊔ {forbidden}
  def join(_, _), do: @conflict

  # a Norm: conditional rule of one modality, with priority and optional CTD repair
  def norm(p \\ %{}) do
    %{
      id: Map.get(p, :id, "norm"),
      modality: Map.get(p, :modality, "permitted"),
      condition: Map.get(p, :condition, fn _ -> true end),
      priority: Map.get(p, :priority, 0),
      ctd: Map.get(p, :ctd, nil),
      target: Map.get(p, :target, nil)
    }
  end

  defp safe_cond(n, ctx) do
    try do
      !!n.condition.(ctx)
    rescue
      _ -> false
    end
  end

  # accrue every applicable norm's status into a single verdict (join)
  def adjudicate_status(ctx, norms) do
    {status, contributors} =
      Enum.reduce(norms, {@optional, []}, fn n, {st, contribs} ->
        if safe_cond(n, ctx) do
          c = %{id: n.id, modality: n.modality, priority: n.priority}
          {join(st, @mod2status[n.modality]), [c | contribs]}
        else
          {st, contribs}
        end
      end)

    %{status: status, contributors: Enum.reverse(contributors)}
  end

  # resolve : clear a CONFLICT by priority (idempotent; identity on non-conflict)
  def resolve(verdict) do
    if verdict.status != @conflict do
      verdict
      |> Map.put(:resolved, verdict.status)
      |> Map.put(:overridden, [])
      |> Map.put(:note, nil)
    else
      ob = Enum.filter(verdict.contributors, &(&1.modality == "obligatory"))
      fb = Enum.filter(verdict.contributors, &(&1.modality == "forbidden"))
      max_ob = max_priority(ob)
      max_fb = max_priority(fb)

      cond do
        max_ob == max_fb ->
          verdict
          |> Map.put(:resolved, @conflict)
          |> Map.put(:overridden, [])
          |> Map.put(:note, "deadlock: equal priority → escalate")

        true ->
          winner_obligatory = max_ob > max_fb
          loser = (if winner_obligatory, do: fb, else: ob) |> Enum.map(& &1.id)
          win = if winner_obligatory, do: @obligatory, else: @forbidden

          verdict
          |> Map.put(:status, win)
          |> Map.put(:resolved, win)
          |> Map.put(:overridden, loser)
          |> Map.put(
            :note,
            "#{if winner_obligatory, do: "obligatory", else: "forbidden"} (p#{max(max_ob, max_fb)}) overrides [#{Enum.join(loser, ", ")}]"
          )
      end
    end
  end

  # Math.max(-Infinity, ...prios). With no contributors → :neg_infinity sentinel.
  defp max_priority([]), do: :neg_infinity

  defp max_priority(list) do
    Enum.reduce(list, :neg_infinity, fn c, acc -> nmax(acc, c.priority) end)
  end

  defp nmax(:neg_infinity, b), do: b
  defp nmax(a, :neg_infinity), do: a
  defp nmax(a, b), do: max(a, b)

  # detach : factual detachment; CTD repair detaches only after a violation (partial)
  def detach(norm, ctx, opts \\ %{}) do
    violated = Map.get(opts, :violated, false)
    %{in_force: safe_cond(norm, ctx), repair: if(violated and norm.ctd, do: norm.ctd, else: nil)}
  end

  # comply : the gate
  def comply(status, intend) do
    violations =
      []
      |> then(fn v -> if status == @forbidden and intend, do: ["performing a forbidden action" | v], else: v end)
      |> then(fn v -> if status == @obligatory and not intend, do: ["omitting an obligatory action" | v], else: v end)
      |> then(fn v -> if status == @conflict, do: ["unresolved normative conflict" | v], else: v end)

    %{ok: violations == [], violations: Enum.reverse(violations)}
  end

  # escalate : produce the CTD repair obligation now in force
  def escalate(norm, _ctx) do
    if norm && norm.ctd do
      %{repair: norm.ctd, reason: "CTD: #{norm.id} violated → #{norm.ctd.id} in force"}
    else
      %{
        repair: norm(%{id: "escalate-to-human", modality: "obligatory", priority: :infinity}),
        reason: "#{if norm, do: norm.id, else: "obligation"} violated, no CTD → default escalation"
      }
    end
  end
end
