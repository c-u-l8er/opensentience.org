defmodule OpenSentience.Catalog do
  @moduledoc """
  Catalog API for Phase 1.

  Responsibilities:
  - Query agent records (for CLI/UI)
  - Upsert agents discovered from manifests (NO code execution)
  - Update lifecycle fields (install/build/status/error) as other subsystems act

  Security notes:
  - This module must only persist *secret-free* data.
  - Any error strings stored durably must be bounded and safe (see `Agent.safe_error_summary/1`).
  """

  import Ecto.Query, warn: false

  alias OpenSentience.Catalog.Agent
  alias OpenSentience.Repo

  @type agent_id :: String.t()
  @type result(t) :: {:ok, t} | {:error, Ecto.Changeset.t()}

  @doc """
  Lists agents with optional filters.

  Options:
  - `:status` (string or atom) - filter by `agents.status`
  - `:search` (string) - substring match against `agent_id` and `name`
  - `:limit` (integer) - defaults to 100 (bounded)
  - `:offset` (integer) - defaults to 0
  - `:order` - `:last_seen_desc` (default) | `:agent_id_asc` | `:name_asc`
  """
  @spec list_agents(Keyword.t()) :: [Agent.t()]
  def list_agents(opts \\ []) when is_list(opts) do
    limit = opts |> Keyword.get(:limit, 100) |> normalize_limit()
    offset = opts |> Keyword.get(:offset, 0) |> normalize_offset()
    status = opts |> Keyword.get(:status) |> normalize_optional_string()
    search = opts |> Keyword.get(:search) |> normalize_optional_string()
    order = Keyword.get(opts, :order, :last_seen_desc)

    Agent
    |> base_query()
    |> maybe_filter_status(status)
    |> maybe_search(search)
    |> apply_order(order)
    |> limit(^limit)
    |> offset(^offset)
    |> Repo.all()
  end

  @doc """
  Returns an agent by id, or `nil` if not found.
  """
  @spec get_agent(agent_id()) :: Agent.t() | nil
  def get_agent(agent_id) when is_binary(agent_id) do
    Repo.get(Agent, agent_id)
  end

  @doc """
  Returns an agent by id or raises if not found.
  """
  @spec get_agent!(agent_id()) :: Agent.t()
  def get_agent!(agent_id) when is_binary(agent_id) do
    Repo.get!(Agent, agent_id)
  end

  @doc """
  Returns an agent by `manifest_path`, or `nil` if not found.
  """
  @spec get_agent_by_manifest_path(String.t()) :: Agent.t() | nil
  def get_agent_by_manifest_path(manifest_path) when is_binary(manifest_path) do
    Agent
    |> where([a], a.manifest_path == ^manifest_path)
    |> Repo.one()
  end

  @doc """
  Upserts an agent record based on discovery output.

  Expected attrs (minimum):
  - `:agent_id` / `"agent_id"`
  - `:manifest_path` / `"manifest_path"`
  - `:manifest_hash` / `"manifest_hash"`

  Common attrs:
  - `:name`, `:version`, `:description`
  - `:source_git_url`, `:source_ref`
  - `:status` (defaults to `"local_uninstalled"`)
  - `:last_seen_at` (defaults to now)
  - `:discovered_at` is set on insert and preserved on update

  This function is intentionally implemented as "get then insert/update" to preserve
  `discovered_at` without relying on DB-specific upsert semantics.
  """
  @spec upsert_agent(map()) :: result(Agent.t())
  def upsert_agent(attrs) when is_map(attrs) do
    agent_id = Map.get(attrs, :agent_id) || Map.get(attrs, "agent_id")

    if not is_binary(agent_id) or String.trim(agent_id) == "" do
      {:error,
       Agent.changeset(%Agent{}, %{}) |> Ecto.Changeset.add_error(:agent_id, "is required")}
    else
      Repo.transaction(fn ->
        case Repo.get(Agent, agent_id) do
          nil ->
            %Agent{}
            |> Agent.upsert_changeset(attrs)
            |> Repo.insert()

          %Agent{} = existing ->
            # Preserve first discovery time; other defaulting (status/last_seen) is handled
            # by Agent.upsert_changeset/2 to avoid mixed-key issues and unintended overrides.
            preserved =
              attrs
              |> Map.put("discovered_at", existing.discovered_at)

            existing
            |> Agent.upsert_changeset(preserved)
            |> Repo.update()
        end
      end)
      |> unwrap_transaction_result()
    end
  end

  @doc """
  Updates only `last_seen_at` for an agent.

  Useful for rescans where you don't want to modify other fields.
  """
  @spec touch_last_seen(agent_id()) :: result(Agent.t())
  def touch_last_seen(agent_id) when is_binary(agent_id) do
    now = DateTime.utc_now()

    with %Agent{} = agent <- Repo.get(Agent, agent_id) do
      agent
      |> Agent.changeset(%{last_seen_at: now})
      |> Repo.update()
    else
      nil ->
        {:error,
         Agent.changeset(%Agent{}, %{}) |> Ecto.Changeset.add_error(:agent_id, "not found")}
    end
  end

  @doc """
  Marks an agent as installed and records source and destination details.
  """
  @spec mark_installed(agent_id(), map()) :: result(Agent.t())
  def mark_installed(agent_id, attrs) when is_binary(agent_id) and is_map(attrs) do
    update_agent(agent_id, fn agent ->
      Agent.changeset(agent, %{
        status: "installed",
        install_path: Map.get(attrs, :install_path) || Map.get(attrs, "install_path"),
        source_git_url: Map.get(attrs, :source_git_url) || Map.get(attrs, "source_git_url"),
        source_ref: Map.get(attrs, :source_ref) || Map.get(attrs, "source_ref"),
        last_error: nil
      })
    end)
  end

  @doc """
  Sets build status fields.

  `build_status` should be one of:
  - `not_built | building | built | failed`

  `build_last_at` is set to `DateTime.utc_now()` unless explicitly passed.
  """
  @spec set_build_status(agent_id(), String.t() | atom(), Keyword.t()) :: result(Agent.t())
  def set_build_status(agent_id, build_status, opts \\ [])
      when is_binary(agent_id) and (is_binary(build_status) or is_atom(build_status)) do
    build_last_at = Keyword.get(opts, :build_last_at, DateTime.utc_now())
    status = normalize_string(build_status)

    update_agent(agent_id, fn agent ->
      Agent.changeset(agent, %{
        build_status: status,
        build_last_at: build_last_at
      })
    end)
  end

  @doc """
  Updates an agent's `status` field.
  """
  @spec set_status(agent_id(), String.t() | atom()) :: result(Agent.t())
  def set_status(agent_id, status)
      when is_binary(agent_id) and (is_binary(status) or is_atom(status)) do
    update_agent(agent_id, fn agent ->
      Agent.changeset(agent, %{status: normalize_string(status)})
    end)
  end

  @doc """
  Records a safe error summary and sets status to `"error"`.

  `error` can be any term; it is coerced to a bounded, secret-free string.
  """
  @spec set_error(agent_id(), term()) :: result(Agent.t())
  def set_error(agent_id, error) when is_binary(agent_id) do
    safe = Agent.safe_error_summary(error)

    update_agent(agent_id, fn agent ->
      Agent.changeset(agent, %{status: "error", last_error: safe})
    end)
  end

  @doc """
  Clears `last_error` (does not change status).
  """
  @spec clear_error(agent_id()) :: result(Agent.t())
  def clear_error(agent_id) when is_binary(agent_id) do
    update_agent(agent_id, fn agent ->
      Agent.changeset(agent, %{last_error: nil})
    end)
  end

  # ----------------------------------------------------------------------------
  # Internal helpers
  # ----------------------------------------------------------------------------

  defp update_agent(agent_id, fun) when is_binary(agent_id) and is_function(fun, 1) do
    case Repo.get(Agent, agent_id) do
      nil ->
        {:error,
         Agent.changeset(%Agent{}, %{}) |> Ecto.Changeset.add_error(:agent_id, "not found")}

      %Agent{} = agent ->
        agent
        |> fun.()
        |> Repo.update()
    end
  end

  defp base_query(queryable) do
    from(a in queryable)
  end

  defp maybe_filter_status(query, nil), do: query

  defp maybe_filter_status(query, status) when is_binary(status) do
    from(a in query, where: a.status == ^status)
  end

  defp maybe_search(query, nil), do: query

  defp maybe_search(query, search) when is_binary(search) do
    like = "%" <> search <> "%"

    from(a in query,
      where: ilike(a.agent_id, ^like) or ilike(a.name, ^like)
    )
  end

  defp apply_order(query, :agent_id_asc),
    do: from(a in query, order_by: [asc: a.agent_id])

  defp apply_order(query, :name_asc),
    do: from(a in query, order_by: [asc: a.name, asc: a.agent_id])

  defp apply_order(query, :last_seen_desc),
    do: from(a in query, order_by: [desc: a.last_seen_at, asc: a.agent_id])

  defp apply_order(query, _unknown),
    do: apply_order(query, :last_seen_desc)

  defp normalize_limit(limit) when is_integer(limit) and limit > 0 do
    min(limit, 500)
  end

  defp normalize_limit(_), do: 100

  defp normalize_offset(offset) when is_integer(offset) and offset >= 0, do: offset
  defp normalize_offset(_), do: 0

  defp normalize_string(value) when is_atom(value), do: Atom.to_string(value) |> String.trim()
  defp normalize_string(value) when is_binary(value), do: String.trim(value)
  defp normalize_string(value), do: value |> to_string() |> String.trim()

  defp normalize_optional_string(nil), do: nil

  defp normalize_optional_string(value) when is_binary(value) do
    value = String.trim(value)
    if value == "", do: nil, else: value
  end

  defp normalize_optional_string(value) when is_atom(value),
    do: value |> Atom.to_string() |> normalize_optional_string()

  defp normalize_optional_string(value),
    do: value |> to_string() |> normalize_optional_string()

  defp unwrap_transaction_result({:ok, {:ok, %Agent{} = agent}}), do: {:ok, agent}
  defp unwrap_transaction_result({:ok, {:error, %Ecto.Changeset{} = cs}}), do: {:error, cs}

  defp unwrap_transaction_result({:error, reason}),
    do: raise("catalog transaction failed: #{inspect(reason)}")
end
