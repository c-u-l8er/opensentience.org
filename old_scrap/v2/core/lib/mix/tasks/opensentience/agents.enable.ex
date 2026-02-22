defmodule Mix.Tasks.Opensentience.Agents.Enable do
  @shortdoc "Enable an agent by approving a subset (or all) of requested permissions from its manifest"

  @moduledoc """
  Enables an agent by creating a **permission approval** record for it (deny-by-default).

  This task:
  - loads the agent's `opensentience.agent.json` (from the catalog `manifest_path`, unless overridden)
  - reads the manifest's requested permissions (NO code execution)
  - approves either:
    - all requested permissions, or
    - an explicit subset (approved ⊆ requested)
  - persists approval to SQLite (`permission_approvals`)
  - emits audit events (best-effort, secret-free) via `OpenSentience.Enablement.Approvals`

  Usage:

      mix opensentience.agents.enable <agent_id> --all
      mix opensentience.agents.enable <agent_id> --approved-permissions "filesystem:read:~/.opensentience/**,event:subscribe:foo.*"

  Options:
    --all                       Approve all requested permissions from the manifest
    --approved-permissions STR  Comma-separated list of permissions to approve (subset of requested)
    --manifest-path PATH        Override manifest path (otherwise uses catalog manifest_path)
    --no-revoke-existing        Do not revoke existing active approvals before creating a new one

    --actor-type TYPE           human|system|agent (default: human)
    --actor-id ID               Actor identifier (default: unknown)
    --correlation-id ID         Optional correlation id for audit linking
    --causation-id ID           Optional causation id for audit linking

    --json                      Output JSON (for scripting)
    -h, --help                  Show this help

  Notes:
  - This task expects the agent already exists in the catalog (typically after `mix opensentience.agents.scan`).
  - Drift detection is enforced by storing a `requested_permissions_hash` derived from the manifest's permissions list.
  - For safety, approvals are also scope-pinned (best-effort) using:
    - `manifest_hash` (from the manifest file contents)
    - `source_ref` (from the catalog agent record, if present)
  """

  use Mix.Task

  alias OpenSentience.Catalog
  alias OpenSentience.Discovery.ManifestReader
  alias OpenSentience.Enablement.Approvals

  @impl true
  def run(args) do
    {opts, rest, invalid} =
      OptionParser.parse(args,
        strict: [
          all: :boolean,
          "approved-permissions": :string,
          "manifest-path": :string,
          "no-revoke-existing": :boolean,
          "actor-type": :string,
          "actor-id": :string,
          "correlation-id": :string,
          "causation-id": :string,
          json: :boolean,
          help: :boolean
        ],
        aliases: [h: :help]
      )

    if opts[:help] do
      Mix.shell().info(@moduledoc)
      exit({:shutdown, 0})
    end

    if invalid != [] do
      Mix.raise("Invalid options: #{inspect(invalid)}")
    end

    agent_id =
      case rest do
        [id] -> id |> to_string() |> String.trim()
        _ -> Mix.raise("Usage: mix opensentience.agents.enable <agent_id> [options]")
      end

    Mix.Task.run("app.start")

    agent =
      case Catalog.get_agent(agent_id) do
        nil ->
          Mix.raise(
            "No agent with id #{agent_id} in the catalog. Run `mix opensentience.agents.scan` first."
          )

        a ->
          a
      end

    manifest_path =
      opts[:"manifest-path"]
      |> normalize_optional_string()
      |> case do
        nil -> agent.manifest_path
        p -> p
      end

    if not is_binary(manifest_path) or String.trim(manifest_path) == "" do
      Mix.raise("Agent has no manifest_path in the catalog and --manifest-path was not provided.")
    end

    manifest =
      case ManifestReader.read(manifest_path) do
        {:ok, m} ->
          m

        {:error, err} ->
          # Keep output secret-safe: code/message + minimal details.
          Mix.raise(
            "Failed to read manifest: #{Map.get(err, :message, inspect(err))} (path=#{manifest_path})"
          )
      end

    requested = Map.get(manifest, :permissions) || []
    approved = compute_approved_permissions!(requested, opts)

    approve_opts = [
      actor_type: normalize_actor_type(opts[:"actor-type"] || "human"),
      actor_id: normalize_actor_id(opts[:"actor-id"] || "unknown"),
      correlation_id: normalize_optional_string(opts[:"correlation-id"]),
      causation_id: normalize_optional_string(opts[:"causation-id"]),
      revoke_existing?: not (opts[:"no-revoke-existing"] == true),
      manifest_hash: Map.get(manifest, :manifest_hash),
      source_ref: normalize_optional_string(agent.source_ref)
    ]

    case Approvals.approve(agent_id, requested, approved, approve_opts) do
      {:ok, approval} ->
        approved_permissions =
          case Approvals.decode_approved_permissions(approval) do
            {:ok, perms} -> perms
            {:error, _} -> approved
          end

        if opts[:json] do
          Mix.shell().info(
            Jason.encode!(
              %{
                ok: true,
                agent_id: agent_id,
                approval: %{
                  id: approval.id,
                  status: approval.status,
                  approved_at: approval.approved_at,
                  approved_by: approval.approved_by,
                  requested_permissions_hash: approval.requested_permissions_hash,
                  scope: %{
                    manifest_hash: approval.manifest_hash,
                    source_ref: approval.source_ref
                  },
                  approved_permissions: approved_permissions
                }
              },
              pretty: true
            )
          )
        else
          print_pretty(agent_id, manifest_path, requested, approval, approved_permissions)
        end

      {:error, reason} ->
        if opts[:json] do
          Mix.shell().error(
            Jason.encode!(
              %{
                ok: false,
                error: %{
                  message: "Enable failed",
                  reason: safe_inspect(reason)
                }
              },
              pretty: true
            )
          )
        else
          Mix.shell().error("Enable failed.")
          Mix.shell().error("  agent_id: #{agent_id}")
          Mix.shell().error("  reason:  #{safe_inspect(reason)}")
        end

        Mix.raise("Enable failed")
    end
  end

  defp compute_approved_permissions!(requested, opts) when is_list(requested) do
    all? = opts[:all] == true

    approved_from_flag =
      opts[:"approved-permissions"]
      |> normalize_optional_string()
      |> case do
        nil -> nil
        s -> split_permissions_string(s)
      end

    cond do
      all? and is_list(approved_from_flag) ->
        Mix.raise("Choose either --all or --approved-permissions (not both).")

      all? ->
        requested

      is_list(approved_from_flag) and approved_from_flag != [] ->
        approved_from_flag

      true ->
        requested_preview =
          requested
          |> Enum.take(10)
          |> Enum.join(", ")

        Mix.raise("""
        No approvals specified.

        Use:
          --all
        or:
          --approved-permissions "<comma-separated subset>"

        Requested permissions (preview):
          #{requested_preview}#{if length(requested) > 10, do: " ...", else: ""}
        """)
    end
  end

  defp split_permissions_string(str) when is_binary(str) do
    str
    |> String.split([",", "\n", "\r\n"], trim: true)
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 == ""))
  end

  defp print_pretty(agent_id, manifest_path, requested, approval, approved_permissions) do
    Mix.shell().info("Enabled: #{agent_id}")
    Mix.shell().info("  manifest_path: #{manifest_path}")
    Mix.shell().info("  approval_id:   #{approval.id}")
    Mix.shell().info("  status:        #{approval.status}")
    Mix.shell().info("  approved_by:   #{approval.approved_by}")
    Mix.shell().info("  approved_at:   #{dt(approval.approved_at)}")
    Mix.shell().info("  requested_permissions_hash: #{approval.requested_permissions_hash}")

    scope_bits =
      []
      |> maybe_add_scope("manifest_hash", approval.manifest_hash)
      |> maybe_add_scope("source_ref", approval.source_ref)

    if scope_bits != [] do
      Mix.shell().info("  scope:         " <> Enum.join(scope_bits, ", "))
    end

    Mix.shell().info("")
    Mix.shell().info("Requested permissions: #{length(requested)}")
    Mix.shell().info("Approved permissions:  #{length(approved_permissions)}")

    if length(approved_permissions) > 0 do
      Mix.shell().info("")

      Enum.each(approved_permissions, fn p ->
        Mix.shell().info("  - #{p}")
      end)
    end
  end

  defp maybe_add_scope(acc, _k, v) when v in [nil, ""], do: acc
  defp maybe_add_scope(acc, k, v), do: acc ++ ["#{k}=#{v}"]

  defp normalize_actor_id(v) do
    v
    |> to_string()
    |> String.trim()
    |> case do
      "" -> "unknown"
      s -> String.slice(s, 0, 200)
    end
  end

  defp normalize_actor_type(v) when v in [:human, :system, :agent], do: v

  defp normalize_actor_type(v) do
    v =
      v
      |> to_string()
      |> String.trim()
      |> String.downcase()

    case v do
      "system" -> :system
      "agent" -> :agent
      _ -> :human
    end
  end

  defp normalize_optional_string(nil), do: nil

  defp normalize_optional_string(v) when is_binary(v) do
    v = String.trim(v)
    if v == "", do: nil, else: v
  end

  defp normalize_optional_string(v), do: v |> to_string() |> normalize_optional_string()

  defp safe_inspect(term) do
    term
    |> inspect(limit: 30, printable_limit: 800)
    |> String.replace(~r/\r\n|\r|\n/, " ")
    |> String.slice(0, 1_000)
  end

  defp dt(nil), do: ""
  defp dt(%DateTime{} = dt), do: DateTime.to_iso8601(dt)
  defp dt(%NaiveDateTime{} = ndt), do: NaiveDateTime.to_iso8601(ndt)
  defp dt(other), do: to_string(other)
end
