defmodule BoxAndBox.Evolution do
  @moduledoc """
  Evolution surface — faithful port of evolution.mjs (v0.1). Laws EV1–EV6.

  NOT a ninth rung. A BRIDGE that joins three existing rungs to decide whether a
  POLICY may change for the better, recording the verdict on a tamper-evident chain:

    · reflexive (rung 5)  — MAY it change?  (entrenched floor is un-weakenable)
    · axiological (rung 2) — DID it improve? (non-regression over a guard set)
    · resource (rung 8)   — is the change WORTH its price? (Type-II)
  """

  import Bitwise
  alias BoxAndBox.{Reflexive, Resource}

  @genesis "00000000"
  def genesis, do: @genesis

  # ---- content-addressed provenance -----------------------------------------
  # canonical JSON: object keys sorted, so the digest is key-order independent.
  def canon(nil), do: "null"
  def canon(true), do: "true"
  def canon(false), do: "false"
  def canon(x) when is_integer(x), do: Integer.to_string(x)
  def canon(x) when is_float(x), do: num_str(x)
  def canon(x) when is_binary(x), do: json_quote(x)
  def canon(x) when is_list(x), do: "[" <> (x |> Enum.map(&canon/1) |> Enum.join(",")) <> "]"

  def canon(x) when is_map(x) do
    pairs =
      x
      |> Enum.map(fn {k, v} -> {to_string(k), v} end)
      |> Enum.sort_by(fn {k, _} -> k end)

    "{" <> (pairs |> Enum.map(fn {k, v} -> json_quote(k) <> ":" <> canon(v) end) |> Enum.join(",")) <> "}"
  end

  defp num_str(x) do
    t = trunc(x)
    if x == t, do: Integer.to_string(t), else: Float.to_string(x)
  end

  defp json_quote(s) do
    "\"" <> (s |> String.to_charlist() |> Enum.map_join(&escape_char/1)) <> "\""
  end

  defp escape_char(?\"), do: "\\\""
  defp escape_char(?\\), do: "\\\\"
  defp escape_char(?\n), do: "\\n"
  defp escape_char(?\r), do: "\\r"
  defp escape_char(?\t), do: "\\t"
  defp escape_char(c) when c < 0x20, do: "\\u" <> (Integer.to_string(c, 16) |> String.downcase() |> String.pad_leading(4, "0"))
  defp escape_char(c), do: <<c::utf8>>

  # FNV-1a 32-bit — pure, deterministic. (Tamper-evidence, not secrecy.)
  def hash(str) do
    h =
      str
      |> :binary.bin_to_list()
      |> Enum.reduce(0x811C9DC5, fn b, acc ->
        band(bxor(acc, b) * 0x01000193, 0xFFFFFFFF)
      end)

    h |> Integer.to_string(16) |> String.downcase() |> String.pad_leading(8, "0")
  end

  def digest(obj), do: hash(canon(obj))

  # a Record links a payload to its predecessor by content hash.
  def record(payload, prev \\ @genesis),
    do: %{id: hash(prev <> canon(payload)), prev: prev, payload: payload}

  def chain(payloads, prev \\ @genesis) do
    {out, _} =
      Enum.reduce(payloads, {[], prev}, fn pl, {acc, p} ->
        r = record(pl, p)
        {[r | acc], r.id}
      end)

    Enum.reverse(out)
  end

  def verify(records, prev \\ @genesis) do
    Enum.reduce_while(records, {:ok, prev}, fn r, {:ok, p} ->
      cond do
        r.prev != p -> {:halt, %{ok: false, reason: "broken link at #{r.id}"}}
        record(r.payload, r.prev).id != r.id -> {:halt, %{ok: false, reason: "tampered payload at #{r.id}"}}
        true -> {:cont, {:ok, r.id}}
      end
    end)
    |> case do
      {:ok, head} -> %{ok: true, head: head, length: length(records)}
      bad -> bad
    end
  end

  # ---- the axiological guard --------------------------------------------------
  # non-regression (the L-E6 crux): no guard metric may drop below its prior value.
  def regresses(before, after_, tol \\ 1.0e-9) do
    n = min(length(before), length(after_))

    Enum.any?(0..(n - 1)//1, fn i ->
      Enum.at(after_, i) < Enum.at(before, i) - tol
    end)
  end

  def delta(before, after_) do
    sb = Enum.sum(before)
    sa = Enum.sum(after_)
    floor((sa - sb) * 1.0e6 + 0.5) / 1.0e6
  end

  # ---- the evolution verdict --------------------------------------------------
  # evolve(policy, amendment, evidence) → %{decision, reason, policy, ledger, certificate, record}
  def evolve(policy, amendment, evidence \\ %{}) do
    before = Map.get(evidence, :before, [])
    after_ = Map.get(evidence, :after, [])
    price = Map.get(evidence, :price, nil)
    ledger = Map.get(evidence, :ledger, nil)
    account = Map.get(evidence, :account, "self")
    resource = Map.get(evidence, :resource, "tokens")
    prev = Map.get(evidence, :prev, @genesis)

    predicted = if amendment && Map.get(amendment, :predict) != nil, do: Map.get(amendment, :predict), else: nil
    observed = delta(before, after_)
    verified = if predicted == nil, do: nil, else: observed >= predicted - 1.0e-9
    reg = regresses(before, after_)

    adm = Reflexive.admissible(policy, amendment)

    {decision, reason, ledger_after, priced} =
      cond do
        not adm.ok ->
          {"reject", "reflexive: #{adm.reason}", ledger, false}

        reg ->
          {"reject", "axiological: a guard metric would regress", ledger, false}

        price != nil ->
          l = ledger || Resource.ledger()

          cond do
            not Resource.affords(l, account, %{resource => price}) ->
              {"escalate", "resource: cannot afford the change (#{price} #{resource})", ledger, true}

            not Resource.worthwhile(observed, price) ->
              {"reject", "resource: not worthwhile (Δ #{observed} < #{price})", ledger, true}

            true ->
              charged = Resource.spend(l, account, resource, price)

              if charged == Resource.infeasible() do
                {"escalate", "resource: cannot afford the change (#{price} #{resource})", ledger, true}
              else
                {"accept", "priced: Δ #{observed} ≥ #{price} #{resource}", charged, true}
              end
          end

        true ->
          {"accept", "admissible, non-regressing (unpriced)", ledger, false}
      end

    {decision, reason, policy_after, ledger_after} =
      if decision == "accept" do
        r = Reflexive.revise(policy, amendment)

        if r.accepted,
          do: {decision, reason, r.policy, ledger_after},
          else: {"reject", "reflexive: #{r.reason}", policy, ledger}
      else
        {decision, reason, policy, ledger_after}
      end

    target =
      cond do
        amendment == nil -> nil
        Map.get(amendment, :item) -> amendment.item.id
        true -> Map.get(amendment, :id)
      end

    certificate = %{
      "decision" => decision,
      "reason" => reason,
      "op" => if(amendment, do: amendment.op, else: nil),
      "target" => target,
      "predicted" => predicted,
      "observed" => observed,
      "verified" => verified,
      "regressed" => reg,
      "priced" => priced,
      "price" => price,
      "policyBefore" => Reflexive.policy_key(policy),
      "policyAfter" => Reflexive.policy_key(policy_after),
      "rungs" => ["reflexive", "axiological", "resource"]
    }

    %{
      decision: decision,
      reason: reason,
      policy: policy_after,
      ledger: ledger_after,
      certificate: certificate,
      record: record(certificate, prev)
    }
  end
end
