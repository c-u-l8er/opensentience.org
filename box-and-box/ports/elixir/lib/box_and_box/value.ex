defmodule BoxAndBox.Value do
  @moduledoc """
  Invariant Arithmetic — faithful port of value.mjs (v0.2).

  A Value is a PRODUCT OF MONOIDS across families. `combine/2` merges componentwise;
  `chain/2` composes along PULSE phases (partial — refuses a backward step);
  promote/reconcile/deliberate are endomorphisms; consume is the boolean gate.
  Laws L1–L14.

  Values are plain maps. Missing optional fields default like the JS `??`.
  """

  @phases ~w(retrieve route act learn consolidate)

  def phases, do: @phases

  def phase_idx(p), do: Enum.find_index(@phases, &(&1 == p)) || -1

  # identity element of the whole product monoid
  def v0 do
    %{
      n: 0,
      kappa: false,
      beta: 1,
      sigma: [],
      pi: nil,
      iota: nil,
      psi: nil,
      authority: [],
      deny_default: true,
      audit: []
    }
  end

  @doc "Build a Value with sensible defaults, copying list fields."
  def v(p \\ %{}) do
    base = v0()

    merged = Map.merge(base, p)

    %{
      merged
      | sigma: Enum.to_list(Map.get(p, :sigma, [])),
        authority: Enum.to_list(Map.get(p, :authority, [])),
        audit: Enum.to_list(Map.get(p, :audit, []))
    }
  end

  defp uniq(list), do: Enum.uniq(list)

  defp first_non_null(a, b), do: if(a != nil, do: a, else: b)

  # ---- combine : Value × Value → Value ----
  def combine(a, b) do
    %{
      n: a.n + b.n,
      kappa: a.kappa or b.kappa,
      beta: min(a.beta, b.beta),
      sigma: uniq(a.sigma ++ b.sigma),
      pi: first_non_null(a.pi, b.pi),
      iota: first_non_null(a.iota, b.iota),
      psi: first_non_null(a.psi, b.psi),
      authority: a.authority ++ b.authority,
      deny_default: a.deny_default and b.deny_default,
      audit: a.audit ++ b.audit
    }
  end

  # ---- chain : Value × Value → Value (PARTIAL) ----
  # Returns %{error: ...} on a backward phase step.
  def chain(a, b) do
    if a.pi != nil and b.pi != nil and phase_idx(a.pi) > phase_idx(b.pi) do
      %{error: "π-violation: cannot chain '#{b.pi}' after '#{a.pi}'"}
    else
      r = combine(a, b)
      %{r | pi: first_non_null(b.pi, a.pi)}
    end
  end

  # ---- promote : Value × Evidence → Value ----
  def promote(v, evidence \\ %{}) do
    ev_beta = Map.get(evidence, :beta, 0)
    %{v | beta: max(v.beta, ev_beta)}
  end

  # ---- reconcile : Value × Set<Tag> → Value ----
  def reconcile(v, tags \\ []) do
    drop = MapSet.new(tags)
    %{v | sigma: Enum.reject(v.sigma, &MapSet.member?(drop, &1))}
  end

  # ---- deliberate : Value → Value ----
  def deliberate(v), do: %{v | kappa: false}

  # ---- consume : Value × Requirements → {ok, failures, value} ----
  def consume(v, req \\ %{}) do
    failures =
      []
      |> beta_min(v, req)
      |> sigma_empty(v, req)
      |> acyclic(v, req)
      |> phase(v, req)
      |> forward_from(v, req)
      |> deny(v, req)
      |> Enum.reverse()

    %{ok: failures == [], failures: failures, value: v}
  end

  defp beta_min(acc, v, req) do
    bm = Map.get(req, :beta_min)

    if bm != nil and v.beta < bm,
      do: [%{family: "β", why: "β=#{round3(v.beta)} < β_min=#{bm}"} | acc],
      else: acc
  end

  defp sigma_empty(acc, v, req) do
    if Map.get(req, :sigma_empty) && length(v.sigma) > 0,
      do: [%{family: "σ", why: "unresolved conflicts {#{Enum.join(v.sigma, ", ")}}"} | acc],
      else: acc
  end

  defp acyclic(acc, v, req) do
    if Map.get(req, :acyclic) && v.kappa,
      do: [%{family: "κ", why: "cyclic — self-reference detected"} | acc],
      else: acc
  end

  defp phase(acc, v, req) do
    rp = Map.get(req, :phase)

    if rp != nil and v.pi != rp,
      do: [%{family: "π", why: "phase #{v.pi} ≠ required #{rp}"} | acc],
      else: acc
  end

  defp forward_from(acc, v, req) do
    ff = Map.get(req, :forward_from)

    if ff != nil and v.pi != nil and phase_idx(v.pi) < phase_idx(ff),
      do: [%{family: "π", why: "phase #{v.pi} precedes #{ff}"} | acc],
      else: acc
  end

  defp deny(acc, v, req) do
    if Map.get(req, :deny_default) == "must_allow" and v.deny_default == true and
         Map.get(req, :authorized) != true,
       do: [%{family: "governance", why: "deny_default with empty authority_path"} | acc],
       else: acc
  end

  def round3(x) when is_number(x), do: Float.round(x * 1.0, 3)
end
