defmodule OpenSentience.Discovery do
  @moduledoc """
  Discovery orchestrator for Phase 1.

  Responsibilities (Phase 1):
  - Scan configured roots for `opensentience.agent.json`
  - Parse + minimally validate manifest contents (NO code execution)
  - Compute `manifest_hash` for change detection
  - Upsert into the catalog (`OpenSentience.Catalog`)
  - Return a structured summary suitable for CLI/UI and (later) audit logging

  Security invariants:
  - Discovery MUST NOT run `mix`, MUST NOT execute agent code, and MUST NOT follow symlinks.
  - Discovery MUST NOT persist secrets (this module never persists raw manifest JSON).

  Notes:
  - This module is intentionally self-contained early on; it can be refactored into
    `OpenSentience.Discovery.Scanner`, `ManifestReader`, and `Hashing` later without
    changing the public API.
  """

  use GenServer

  require Logger

  alias OpenSentience.Catalog
  alias OpenSentience.Catalog.Agent

  @manifest_filename "opensentience.agent.json"

  # Directories to skip during recursion. This is defense-in-depth and also keeps
  # scans fast and predictable.
  @default_ignore_dirs MapSet.new([
                         ".git",
                         ".hg",
                         ".svn",
                         "_build",
                         "deps",
                         "node_modules",
                         "priv/static",
                         ".elixir_ls",
                         ".idea",
                         ".vscode"
                       ])

  @default_max_manifest_bytes 262_144

  @typedoc "Configuration for a discovery scan."
  @type scan_opt ::
          {:scan_roots, [String.t()]}
          | {:ignore_dirs, MapSet.t(String.t()) | [String.t()]}
          | {:max_manifest_bytes, pos_integer()}
          | {:upsert?, boolean()}
          | {:actor_id, String.t()}
          | {:actor_type, :system | :human | :agent}
          | {:audit_fun, (map() -> any())}

  @type scan_result :: %{
          scan_roots: [String.t()],
          started_at: DateTime.t(),
          finished_at: DateTime.t(),
          manifests_found: non_neg_integer(),
          agents_upserted: non_neg_integer(),
          agents_unchanged: non_neg_integer(),
          errors: [scan_error],
          agents: [agent_summary]
        }

  @type scan_error :: %{
          kind:
            :invalid_root
            | :walk_error
            | :manifest_too_large
            | :manifest_read_error
            | :manifest_parse_error
            | :manifest_invalid,
          root: String.t() | nil,
          path: String.t() | nil,
          message: String.t()
        }

  @type agent_summary :: %{
          agent_id: String.t(),
          manifest_path: String.t(),
          manifest_hash: String.t(),
          action: :discovered | :updated | :unchanged
        }

  # ----------------------------------------------------------------------------
  # GenServer (optional scheduler wrapper)
  # ----------------------------------------------------------------------------

  @doc """
  Starts the discovery server.

  This is optional for Phase 1; the CLI can call `scan_now/1` directly.
  """
  @spec start_link(Keyword.t()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(opts) do
    state = %{
      opts: opts
    }

    {:ok, state}
  end

  # ----------------------------------------------------------------------------
  # Public API
  # ----------------------------------------------------------------------------

  @doc """
  Returns the configured scan roots.

  Preference order:
  1) `config :opensentience_core, :discovery, scan_roots: [...]`
  2) `config :opensentience_core, :scan_roots`
  3) Defaults in `config/config.exs`
  """
  @spec scan_roots() :: [String.t()]
  def scan_roots do
    roots =
      case Application.get_env(:opensentience_core, :discovery) do
        cfg when is_list(cfg) ->
          Keyword.get(cfg, :scan_roots)

        _ ->
          nil
      end

    roots =
      roots ||
        Application.get_env(:opensentience_core, :scan_roots) ||
        []

    roots
    |> List.wrap()
    |> Enum.map(&normalize_path/1)
    |> Enum.reject(&is_nil/1)
    |> Enum.uniq()
  end

  @doc """
  Performs a discovery scan **now**.

  Options:
  - `:scan_roots` - list of roots to scan (defaults to config)
  - `:ignore_dirs` - `MapSet` or list of directory names to skip
  - `:max_manifest_bytes` - safety bound for manifest file size (default: 256 KiB)
  - `:upsert?` - whether to upsert records into the catalog (default: true)
  - `:actor_type`, `:actor_id` - metadata for any optional audit hook (default: system/"core")
  - `:audit_fun` - optional callback invoked with audit-like maps; useful until
    `OpenSentience.AuditLog` is implemented

  Returns a structured summary (safe for CLI/UI).
  """
  @spec scan_now([scan_opt]) :: scan_result
  def scan_now(opts \\ []) when is_list(opts) do
    started_at = DateTime.utc_now()

    scan_roots =
      opts
      |> Keyword.get(:scan_roots, scan_roots())
      |> List.wrap()
      |> Enum.map(&normalize_path/1)
      |> Enum.reject(&is_nil/1)

    ignore_dirs =
      opts
      |> Keyword.get(:ignore_dirs, @default_ignore_dirs)
      |> normalize_ignore_dirs()

    max_manifest_bytes =
      opts
      |> Keyword.get(:max_manifest_bytes, @default_max_manifest_bytes)
      |> normalize_max_manifest_bytes()

    upsert? = Keyword.get(opts, :upsert?, true) == true

    actor_type =
      case Keyword.get(opts, :actor_type, :system) do
        t when t in [:system, :human, :agent] -> t
        _ -> :system
      end

    actor_id =
      opts
      |> Keyword.get(:actor_id, "core")
      |> normalize_string()
      |> case do
        "" -> "core"
        s -> s
      end

    audit_fun =
      case Keyword.get(opts, :audit_fun) do
        fun when is_function(fun, 1) -> fun
        _ -> nil
      end

    {manifests, walk_errors} = find_manifests(scan_roots, ignore_dirs)

    {agent_summaries, parse_errors} =
      manifests
      |> Enum.map(fn {root, path} ->
        case read_manifest(path, max_manifest_bytes) do
          {:ok, manifest, hash} ->
            {root, path, manifest, hash}

          {:error, err} ->
            {:error, %{err | root: root, path: path}}
        end
      end)
      |> Enum.split_with(&match?({_root, _path, _manifest, _hash}, &1))

    # Upsert into catalog, if requested.
    {agents, upsert_errors, {upserted, unchanged}} =
      if upsert? do
        upsert_all(agent_summaries, actor_type, actor_id, audit_fun)
      else
        {summarize_no_upsert(agent_summaries), [], {0, 0}}
      end

    finished_at = DateTime.utc_now()

    %{
      scan_roots: scan_roots,
      started_at: started_at,
      finished_at: finished_at,
      manifests_found: length(manifests),
      agents_upserted: upserted,
      agents_unchanged: unchanged,
      errors: walk_errors ++ parse_errors ++ upsert_errors,
      agents: agents
    }
  end

  @doc """
  Lists all manifest paths under configured roots.

  Returns a list of `{root, manifest_path}`.
  """
  @spec list_manifests([scan_opt]) :: [{String.t(), String.t()}]
  def list_manifests(opts \\ []) when is_list(opts) do
    scan_roots = opts |> Keyword.get(:scan_roots, scan_roots()) |> List.wrap()

    ignore_dirs =
      opts |> Keyword.get(:ignore_dirs, @default_ignore_dirs) |> normalize_ignore_dirs()

    {manifests, _errors} = find_manifests(scan_roots, ignore_dirs)
    manifests
  end

  # ----------------------------------------------------------------------------
  # Manifest reading / validation
  # ----------------------------------------------------------------------------

  @spec read_manifest(String.t(), pos_integer()) ::
          {:ok, map(), String.t()} | {:error, scan_error()}
  defp read_manifest(path, max_manifest_bytes) when is_binary(path) do
    with {:ok, %File.Stat{type: :regular, size: size}} <- File.stat(path),
         true <- size <= max_manifest_bytes or {:error, :too_large},
         {:ok, bin} <- File.read(path),
         {:ok, json} <- decode_json(bin),
         {:ok, normalized} <- normalize_manifest(json),
         {:ok, _validated} <- validate_manifest(normalized) do
      {:ok, normalized, sha256_hex(bin)}
    else
      {:error, :too_large} ->
        {:error,
         %{
           kind: :manifest_too_large,
           root: nil,
           path: path,
           message: "manifest exceeds max bytes (max=#{max_manifest_bytes})"
         }}

      {:error, %File.Stat{type: type}} ->
        {:error,
         %{
           kind: :manifest_read_error,
           root: nil,
           path: path,
           message: "manifest is not a regular file (type=#{inspect(type)})"
         }}

      {:error, :enoent} ->
        {:error,
         %{
           kind: :manifest_read_error,
           root: nil,
           path: path,
           message: "manifest not found"
         }}

      {:error, reason} when is_atom(reason) ->
        {:error,
         %{
           kind: :manifest_read_error,
           root: nil,
           path: path,
           message: "manifest read error: #{Atom.to_string(reason)}"
         }}

      {:error, %Jason.DecodeError{} = err} ->
        {:error,
         %{
           kind: :manifest_parse_error,
           root: nil,
           path: path,
           message: "manifest JSON parse error: #{Exception.message(err)}"
         }}

      {:error, {:manifest_invalid, msg}} ->
        {:error,
         %{
           kind: :manifest_invalid,
           root: nil,
           path: path,
           message: msg
         }}

      other ->
        {:error,
         %{
           kind: :manifest_read_error,
           root: nil,
           path: path,
           message: "manifest read failed: #{safe_inspect(other)}"
         }}
    end
  end

  defp decode_json(bin) when is_binary(bin) do
    Jason.decode(bin)
  end

  # Normalize manifest keys to a minimal internal shape.
  # We intentionally keep the raw manifest map for UI display later, but we only
  # persist safe summaries in the catalog.
  defp normalize_manifest(%{} = json) do
    agent_id =
      json["agent_id"] ||
        json["id"] ||
        json[:agent_id] ||
        json[:id]

    manifest =
      json
      |> Map.new(fn
        {k, v} when is_atom(k) -> {Atom.to_string(k), v}
        {k, v} -> {to_string(k), v}
      end)
      |> Map.put("agent_id", agent_id)

    {:ok, manifest}
  end

  defp normalize_manifest(_other) do
    {:error, {:manifest_invalid, "manifest must be a JSON object"}}
  end

  # Minimal Phase 1 validation (fields are based on Phase 1 work breakdown and
  # common sense). This should be aligned with `project_spec/standards/agent-manifest.md`
  # once that spec is present in-repo.
  defp validate_manifest(%{} = manifest) do
    agent_id = manifest["agent_id"] |> normalize_string()

    cond do
      agent_id == "" ->
        {:error, {:manifest_invalid, "missing required field: agent_id"}}

      not String.match?(agent_id, ~r/^[A-Za-z0-9_.-]{2,200}$/) ->
        {:error, {:manifest_invalid, "agent_id has invalid format"}}

      true ->
        # Optional fields sanity checks (do not reject unknown keys).
        _ = validate_optional_string(manifest, "name", 200)
        _ = validate_optional_string(manifest, "version", 100)
        _ = validate_optional_string(manifest, "description", 2_000)

        case manifest["permissions"] do
          nil ->
            {:ok, manifest}

          perms when is_list(perms) ->
            if Enum.all?(perms, &is_binary/1) do
              {:ok, manifest}
            else
              {:error, {:manifest_invalid, "permissions must be a JSON array of strings"}}
            end

          _ ->
            {:error, {:manifest_invalid, "permissions must be a JSON array"}}
        end
    end
  end

  defp validate_optional_string(manifest, key, max_len)
       when is_map(manifest) and is_binary(key) and is_integer(max_len) do
    case manifest[key] do
      nil ->
        :ok

      value when is_binary(value) ->
        if String.length(value) <= max_len do
          :ok
        else
          :ok
        end

      _ ->
        :ok
    end
  end

  # ----------------------------------------------------------------------------
  # Indexing / upsert
  # ----------------------------------------------------------------------------

  defp upsert_all(agent_summaries, actor_type, actor_id, audit_fun) do
    Enum.reduce(agent_summaries, {[], [], {0, 0}}, fn {root, path, manifest, hash},
                                                      {agents_acc, errors_acc,
                                                       {upserted, unchanged}} ->
      case upsert_one(root, path, manifest, hash, actor_type, actor_id, audit_fun) do
        {:ok, %{action: :unchanged} = summary} ->
          {[summary | agents_acc], errors_acc, {upserted, unchanged + 1}}

        {:ok, summary} ->
          {[summary | agents_acc], errors_acc, {upserted + 1, unchanged}}

        {:error, err} ->
          {agents_acc, [err | errors_acc], {upserted, unchanged}}
      end
    end)
    |> then(fn {agents, errors, counts} ->
      {Enum.reverse(agents), Enum.reverse(errors), counts}
    end)
  end

  defp upsert_one(root, manifest_path, manifest, manifest_hash, actor_type, actor_id, audit_fun) do
    agent_id = normalize_string(manifest["agent_id"])

    existing = Catalog.get_agent(agent_id)

    attrs = %{
      agent_id: agent_id,
      name: maybe_string(manifest["name"]),
      version: maybe_string(manifest["version"]),
      description: maybe_string(manifest["description"]),
      manifest_path: normalize_path(manifest_path),
      manifest_hash: manifest_hash
    }

    action =
      cond do
        is_nil(existing) ->
          :discovered

        match?(%Agent{}, existing) and existing.manifest_hash == manifest_hash ->
          :unchanged

        true ->
          :updated
      end

    # Keep "unchanged" fast: touch last_seen only.
    result =
      case action do
        :unchanged ->
          Catalog.touch_last_seen(agent_id)

        _ ->
          Catalog.upsert_agent(attrs)
      end

    case result do
      {:ok, _agent} ->
        maybe_emit_audit(audit_fun, %{
          event_type: "agent.#{Atom.to_string(action)}",
          actor_type: Atom.to_string(actor_type),
          actor_id: actor_id,
          subject_type: "agent",
          subject_id: agent_id,
          metadata: %{
            scan_root: root,
            manifest_path: manifest_path,
            manifest_hash: manifest_hash
          }
        })

        {:ok,
         %{
           agent_id: agent_id,
           manifest_path: manifest_path,
           manifest_hash: manifest_hash,
           action: action
         }}

      {:error, %Ecto.Changeset{} = changeset} ->
        {:error,
         %{
           kind: :manifest_invalid,
           root: root,
           path: manifest_path,
           message: "catalog upsert failed: #{format_changeset_errors(changeset)}"
         }}
    end
  end

  defp summarize_no_upsert(agent_summaries) do
    Enum.map(agent_summaries, fn {_root, path, manifest, hash} ->
      %{
        agent_id: normalize_string(manifest["agent_id"]),
        manifest_path: path,
        manifest_hash: hash,
        action: :updated
      }
    end)
  end

  defp maybe_emit_audit(nil, _event), do: :ok

  defp maybe_emit_audit(fun, event) when is_function(fun, 1) do
    try do
      _ = fun.(event)
      :ok
    rescue
      err ->
        Logger.debug("audit_fun failed (ignored): #{Exception.message(err)}")
        :ok
    end
  end

  # ----------------------------------------------------------------------------
  # Filesystem walking (no symlinks)
  # ----------------------------------------------------------------------------

  @spec find_manifests([String.t()], MapSet.t(String.t())) ::
          {[{String.t(), String.t()}], [scan_error]}
  defp find_manifests(scan_roots, ignore_dirs) do
    Enum.reduce(scan_roots, {[], []}, fn root, {paths_acc, errors_acc} ->
      root = normalize_path(root)

      cond do
        is_nil(root) or root == "" ->
          {paths_acc,
           [
             %{
               kind: :invalid_root,
               root: root,
               path: nil,
               message: "scan root is empty"
             }
             | errors_acc
           ]}

        true ->
          case File.stat(root) do
            {:ok, %File.Stat{type: :directory}} ->
              {paths, errs} = walk_dir(root, root, ignore_dirs)
              {paths_acc ++ paths, errors_acc ++ errs}

            {:ok, %File.Stat{type: type}} ->
              {paths_acc,
               errors_acc ++
                 [
                   %{
                     kind: :invalid_root,
                     root: root,
                     path: nil,
                     message: "scan root is not a directory (type=#{inspect(type)})"
                   }
                 ]}

            {:error, reason} ->
              {paths_acc,
               errors_acc ++
                 [
                   %{
                     kind: :invalid_root,
                     root: root,
                     path: nil,
                     message: "scan root not accessible: #{Atom.to_string(reason)}"
                   }
                 ]}
          end
      end
    end)
    |> then(fn {paths, errors} ->
      # De-dupe manifests by path; preserve deterministic order.
      paths =
        paths
        |> Enum.uniq_by(fn {_root, path} -> path end)
        |> Enum.sort_by(fn {_root, path} -> path end)

      {paths, errors}
    end)
  end

  @spec walk_dir(String.t(), String.t(), MapSet.t(String.t())) ::
          {[{String.t(), String.t()}], [scan_error]}
  defp walk_dir(root, dir, ignore_dirs) do
    case File.ls(dir) do
      {:ok, entries} ->
        Enum.reduce(entries, {[], []}, fn entry, {paths_acc, errors_acc} ->
          path = Path.join(dir, entry)

          case File.lstat(path) do
            {:ok, %File.Stat{type: :symlink}} ->
              # Never follow symlinks during discovery.
              {paths_acc, errors_acc}

            {:ok, %File.Stat{type: :directory}} ->
              if MapSet.member?(ignore_dirs, entry) do
                {paths_acc, errors_acc}
              else
                {paths, errs} = walk_dir(root, path, ignore_dirs)
                {paths_acc ++ paths, errors_acc ++ errs}
              end

            {:ok, %File.Stat{type: :regular}} ->
              if entry == @manifest_filename do
                {[{root, path} | paths_acc], errors_acc}
              else
                {paths_acc, errors_acc}
              end

            {:ok, _other} ->
              {paths_acc, errors_acc}

            {:error, reason} ->
              {paths_acc,
               [
                 %{
                   kind: :walk_error,
                   root: root,
                   path: path,
                   message: "lstat failed: #{Atom.to_string(reason)}"
                 }
                 | errors_acc
               ]}
          end
        end)

      {:error, reason} ->
        {[],
         [
           %{
             kind: :walk_error,
             root: root,
             path: dir,
             message: "ls failed: #{Atom.to_string(reason)}"
           }
         ]}
    end
  end

  # ----------------------------------------------------------------------------
  # Utilities
  # ----------------------------------------------------------------------------

  defp normalize_ignore_dirs(%MapSet{} = set), do: set

  defp normalize_ignore_dirs(list) when is_list(list) do
    list
    |> Enum.map(&normalize_string/1)
    |> Enum.reject(&(&1 == ""))
    |> MapSet.new()
  end

  defp normalize_ignore_dirs(_other), do: @default_ignore_dirs

  defp normalize_max_manifest_bytes(n) when is_integer(n) and n >= 1_024, do: n
  defp normalize_max_manifest_bytes(_), do: @default_max_manifest_bytes

  defp normalize_path(nil), do: nil

  defp normalize_path(path) when is_binary(path) do
    path = String.trim(path)
    if path == "", do: nil, else: Path.expand(path)
  end

  defp normalize_path(other), do: other |> to_string() |> normalize_path()

  defp normalize_string(nil), do: ""
  defp normalize_string(v) when is_binary(v), do: String.trim(v)
  defp normalize_string(v) when is_atom(v), do: v |> Atom.to_string() |> String.trim()
  defp normalize_string(v), do: v |> to_string() |> String.trim()

  defp maybe_string(nil), do: nil

  defp maybe_string(v) when is_binary(v) do
    v = String.trim(v)
    if v == "", do: nil, else: v
  end

  defp maybe_string(_), do: nil

  defp sha256_hex(bin) when is_binary(bin) do
    :crypto.hash(:sha256, bin)
    |> Base.encode16(case: :lower)
  end

  defp safe_inspect(term) do
    term
    |> inspect(limit: 20, printable_limit: 500)
    |> String.replace(~r/\r\n|\r|\n/, " ")
    |> String.slice(0, 500)
  end

  defp format_changeset_errors(%Ecto.Changeset{} = cs) do
    cs
    |> Ecto.Changeset.traverse_errors(fn {msg, opts} ->
      Enum.reduce(opts, msg, fn {k, v}, acc ->
        String.replace(acc, "%{#{k}}", to_string(v))
      end)
    end)
    |> Jason.encode!()
  rescue
    _ -> "invalid changeset"
  end
end
