defmodule BoxAndBox.Reflexive do
  @moduledoc """
  Reflexive Arithmetic — faithful port of reflexive.mjs (v0.5). Laws R1–R8, RB1–RB3.

  AGM-style revision of a Policy (deontic norms + temporal specs), with an
  immutable entrenched constitutional core that can only be strengthened.
  """

  alias BoxAndBox.Norm

  def policy(p \\ %{}) do
    %{
      norms: Enum.to_list(Map.get(p, :norms, [])),
      specs: Enum.to_list(Map.get(p, :specs, [])),
      entrenched: MapSet.new(Map.get(p, :entrenched, []))
    }
  end

  # amendments
  def enact(item, opts \\ %{}),
    do: %{op: "enact", item: item, authority: Map.get(opts, :authority, "self"), time: Map.get(opts, :time, 0)}

  def repeal(id, opts \\ %{}),
    do: %{op: "repeal", id: id, authority: Map.get(opts, :authority, "self"), time: Map.get(opts, :time, 0)}

  def amend(id, item, opts \\ %{}),
    do: %{op: "amend", id: id, item: item, authority: Map.get(opts, :authority, "self"), time: Map.get(opts, :time, 0)}

  defp find(policy, id) do
    Enum.find(policy.norms, &(&1.id == id)) || Enum.find(policy.specs, &(&1.id == id))
  end

  defp is_norm(x), do: is_map(x) and Map.get(x, :modality) != nil

  defp conflicts(a, b) do
    is_norm(a) and is_norm(b) and Map.get(a, :target) != nil and a.target == b.target and
      ((a.modality == "obligatory" and b.modality == "forbidden") or
         (a.modality == "forbidden" and b.modality == "obligatory"))
  end

  # last-wins dedupe by id, preserving first-seen ordering of keys (matches JS Map)
  defp dedupe(arr) do
    {ordered_ids, map} =
      Enum.reduce(arr, {[], %{}}, fn x, {ids, m} ->
        ids = if Map.has_key?(m, x.id), do: ids, else: ids ++ [x.id]
        {ids, Map.put(m, x.id, x)}
      end)

    Enum.map(ordered_ids, &Map.get(map, &1))
  end

  defp prio(x), do: Map.get(x, :priority, 0)
  defp tval(x), do: Map.get(x, :time, 0)

  # the reflexive guard
  def admissible(policy, am) do
    case am.op do
      "repeal" ->
        if MapSet.member?(policy.entrenched, am.id),
          do: %{ok: false, reason: "“#{am.id}” is entrenched — cannot be repealed"},
          else: %{ok: true}

      "amend" ->
        if not MapSet.member?(policy.entrenched, am.id) do
          %{ok: true}
        else
          cur = find(policy, am.id)
          next = am.item

          if cur == nil or not is_norm(cur) do
            %{ok: false, reason: "“#{am.id}” is entrenched — cannot be amended"}
          else
            stronger = next.modality == cur.modality and prio(next) >= prio(cur)

            if stronger,
              do: %{ok: true},
              else: %{ok: false, reason: "amendment would weaken entrenched “#{am.id}”"}
          end
        end

      "enact" ->
        if is_norm(am.item) do
          blocker =
            Enum.find(policy.entrenched, fn id ->
              e = find(policy, id)
              e && conflicts(e, am.item) && prio(am.item) >= prio(e)
            end)

          if blocker,
            do: %{ok: false, reason: "enacted norm would override entrenched “#{blocker}”"},
            else: %{ok: true}
        else
          %{ok: true}
        end

      _ ->
        %{ok: false, reason: "unknown op"}
    end
  end

  # arbitrate: lex superior (priority) then lex posterior (recency)
  def arbitrate(norms) do
    overridden =
      Enum.reduce(norms, [], fn a, acc ->
        Enum.reduce(norms, acc, fn b, acc2 ->
          cond do
            a == b or not conflicts(a, b) ->
              acc2

            true ->
              a_wins =
                prio(a) > prio(b) or (prio(a) == prio(b) and tval(a) > tval(b))

              if a_wins and not Enum.member?(acc2, b.id), do: acc2 ++ [b.id], else: acc2
          end
        end)
      end)

    %{norms: Enum.reject(norms, &Enum.member?(overridden, &1.id)), overridden: overridden}
  end

  def revise(policy, am) do
    adm = admissible(policy, am)

    if not adm.ok do
      %{policy: policy, accepted: false, reason: adm.reason, changed: nil, overridden: []}
    else
      next = policy(policy)
      next = %{next | entrenched: MapSet.new(policy.entrenched)}
      stamp = fn x -> x |> Map.put(:time, Map.get(am, :time, 0)) |> Map.put(:authority, am.authority) end

      next =
        case am.op do
          "enact" ->
            if is_norm(am.item),
              do: %{next | norms: next.norms ++ [stamp.(am.item)]},
              else: %{next | specs: next.specs ++ [stamp.(am.item)]}

          "repeal" ->
            %{
              next
              | norms: Enum.reject(next.norms, &(&1.id == am.id)),
                specs: Enum.reject(next.specs, &(&1.id == am.id))
            }

          "amend" ->
            %{
              next
              | norms: Enum.map(next.norms, &if(&1.id == am.id, do: stamp.(am.item), else: &1)),
                specs: Enum.map(next.specs, &if(&1.id == am.id, do: stamp.(am.item), else: &1))
            }
        end

      next = %{next | norms: dedupe(next.norms), specs: dedupe(next.specs)}
      arb = arbitrate(next.norms)
      next = %{next | norms: arb.norms}

      changed_id = if Map.get(am, :item), do: am.item.id, else: am.id

      %{
        policy: next,
        accepted: true,
        reason: "#{am.op} “#{changed_id}” accepted",
        changed: am.op,
        overridden: arb.overridden
      }
    end
  end

  def entrench(policy, id) do
    next = policy(policy)
    %{next | entrenched: MapSet.put(MapSet.new(policy.entrenched), id)}
  end

  # deterministic key: sorted norm triples, sorted spec ids, sorted entrenched ids
  def policy_key(p) do
    n =
      p.norms
      |> Enum.map(fn x -> [x.id, x.modality, prio(x)] end)
      |> Enum.sort()

    s = p.specs |> Enum.map(& &1.id) |> Enum.sort()
    e = p.entrenched |> MapSet.to_list() |> Enum.sort()
    inspect(%{n: n, s: s, e: e})
  end

  def stabilize(policy, proposals, opts \\ %{}) do
    max_rounds = Map.get(opts, :max_rounds, 12)
    do_stabilize(policy, proposals, max_rounds, 0, [])
  end

  defp do_stabilize(cur, _proposals, max_rounds, round, log) when round >= max_rounds do
    %{policy: cur, rounds: max_rounds, stable: false, log: Enum.reverse(log)}
  end

  defp do_stabilize(cur, proposals, max_rounds, round, log) do
    {cur2, changed, log2} =
      Enum.reduce(proposals, {cur, false, log}, fn am, {c, ch, lg} ->
        r = revise(c, am)
        lg2 = [%{round: round, op: am.op, accepted: r.accepted, reason: r.reason} | lg]

        if r.accepted and policy_key(r.policy) != policy_key(c),
          do: {r.policy, true, lg2},
          else: {c, ch, lg2}
      end)

    if not changed do
      %{policy: cur2, rounds: round + 1, stable: true, log: Enum.reverse(log2)}
    else
      do_stabilize(cur2, proposals, max_rounds, round + 1, log2)
    end
  end

  def digest(p),
    do: "#{length(p.norms)} norms · #{length(p.specs)} specs · #{MapSet.size(p.entrenched)} entrenched"

  # convenience for tests: build a Norm
  def nm(id, mod, pri \\ 0, target \\ nil),
    do: Norm.norm(%{id: id, modality: mod, priority: pri, target: target})
end
