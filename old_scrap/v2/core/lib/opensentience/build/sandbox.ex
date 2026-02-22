defmodule OpenSentience.Build.Sandbox do
  @moduledoc """
  Build sandbox helpers for OpenSentience Core (Phase 1).

  Purpose:
  - Provide a *controlled* environment for agent build steps (e.g. `mix deps.get`, `mix deps.compile`).
  - Keep build state/caches under OpenSentience-managed directories (default: `~/.opensentience/state/...`).
  - Minimize ambient environment leakage (best-effort).

  Security posture:
  - Building/compiling executes third-party code and is an explicit trust boundary.
  - This module does **not** perform auditing itself; callers should emit audit events
    for build start/success/failure.
  - This module attempts to avoid passing arbitrary parent process environment variables
    into build subprocesses. It is not a perfect sandbox; it is a pragmatic "controlled env".

  Typical usage:
    1) `dirs = OpenSentience.Build.Sandbox.ensure_build_dirs!(agent_id)`
    2) `env = OpenSentience.Build.Sandbox.env_for_build(agent_id)`
    3) `System.cmd("mix", ["deps.get"], cd: agent_src_dir, env: env, stderr_to_stdout: true)`
  """

  alias OpenSentience.Paths

  @type agent_id :: String.t()
  @type env_kv :: {String.t(), String.t()}
  @type env_list :: [env_kv()]

  # Conservative allowlist: enough to run typical CLI tooling without leaking secrets.
  @default_passthrough_vars ~w(
    LANG
    LC_ALL
    PATH
    TERM
    TMPDIR
  )

  @doc """
  Returns the build sandbox root directory for an agent.

  Default:
  - `~/.opensentience/state/build/<agent_id>`
  """
  @spec build_root_dir(agent_id()) :: String.t()
  def build_root_dir(agent_id) when is_binary(agent_id) do
    agent_id = validate_agent_id!(agent_id)
    Path.join([Paths.state_dir(), "build", agent_id])
  end

  @doc """
  Returns a map of sandbox directories for an agent build.

  Keys:
  - `:root`
  - `:tmp`
  - `:mix_home`
  - `:hex_home`
  - `:rebar3_cache`
  """
  @spec build_dirs(agent_id()) :: %{
          root: String.t(),
          tmp: String.t(),
          mix_home: String.t(),
          hex_home: String.t(),
          rebar3_cache: String.t()
        }
  def build_dirs(agent_id) when is_binary(agent_id) do
    root = build_root_dir(agent_id)

    %{
      root: root,
      tmp: Path.join(root, "tmp"),
      mix_home: Path.join(root, "mix_home"),
      hex_home: Path.join(root, "hex_home"),
      rebar3_cache: Path.join(root, "rebar3_cache")
    }
  end

  @doc """
  Ensures sandbox directories exist for an agent build and returns `build_dirs/1`.

  Options:
  - `:mode` - chmod mode to apply to created directories (default: `0o700`)

  Notes:
  - This performs filesystem writes (mkdir/chmod). Call it only at the build trust boundary.
  """
  @spec ensure_build_dirs!(agent_id(), Keyword.t()) :: %{
          root: String.t(),
          tmp: String.t(),
          mix_home: String.t(),
          hex_home: String.t(),
          rebar3_cache: String.t()
        }
  def ensure_build_dirs!(agent_id, opts \\ []) when is_binary(agent_id) and is_list(opts) do
    mode = opts |> Keyword.get(:mode, 0o700) |> normalize_mode!()

    dirs = build_dirs(agent_id)

    dirs
    |> Map.values()
    |> Enum.each(fn dir ->
      File.mkdir_p!(dir)
      _ = File.chmod(dir, mode)
    end)

    dirs
  end

  @doc """
  Computes a controlled environment (`env` keyword list) for running build commands.

  Options:
  - `:passthrough` - list of env var names to inherit from the parent env
    (default: #{@default_passthrough_vars |> Enum.join(", ")})
  - `:extra` - additional env kv pairs to merge in (wins over defaults)
    - accepts a map or keyword list; values are stringified
  - `:mix_env` - value for `MIX_ENV` (default: `"prod"`)

  Returned env includes:
  - `MIX_HOME`, `HEX_HOME`, `REBAR3_CACHE_DIR` pinned to OpenSentience state
  - `HOME` pinned to the sandbox root (reduces writes to user home)
  - `TMPDIR` pinned to sandbox `tmp` (unless explicitly overridden)
  """
  @spec env_for_build(agent_id(), Keyword.t()) :: env_list()
  def env_for_build(agent_id, opts \\ []) when is_binary(agent_id) and is_list(opts) do
    dirs = build_dirs(agent_id)

    passthrough =
      opts
      |> Keyword.get(:passthrough, @default_passthrough_vars)
      |> normalize_passthrough_vars()

    inherited =
      passthrough
      |> Enum.reduce(%{}, fn var, acc ->
        case System.get_env(var) do
          nil -> acc
          value -> Map.put(acc, var, value)
        end
      end)

    mix_env =
      opts
      |> Keyword.get(:mix_env, "prod")
      |> to_string()
      |> String.trim()
      |> case do
        "" -> "prod"
        v -> v
      end

    base = %{
      # Reduce ambient writes to the user's real HOME during builds.
      "HOME" => dirs.root,
      "TMPDIR" => inherited["TMPDIR"] || dirs.tmp,
      "MIX_ENV" => mix_env,
      "MIX_HOME" => dirs.mix_home,
      "HEX_HOME" => dirs.hex_home,
      "REBAR3_CACHE_DIR" => dirs.rebar3_cache
    }

    extra =
      opts
      |> Keyword.get(:extra, %{})
      |> normalize_extra_env()

    # Deterministic merge order:
    # 1) inherited allowlist
    # 2) sandbox base
    # 3) explicit extras
    env_map =
      inherited
      |> Map.merge(base)
      |> Map.merge(extra)
      |> drop_invalid_env_values()

    env_map
    |> Enum.map(fn {k, v} -> {k, v} end)
    |> Enum.sort_by(fn {k, _v} -> k end)
  end

  @doc """
  Convenience helper to build `System.cmd/3` options for a build command.

  Inputs:
  - `agent_id` - agent id used to compute sandbox env/dirs
  - `cwd` - working directory for the command (e.g. installed agent source dir)

  Options:
  - forwarded to `env_for_build/2` (`:passthrough`, `:extra`, `:mix_env`)
  - `:stderr_to_stdout` (default: `true`)
  """
  @spec cmd_opts(agent_id(), String.t(), Keyword.t()) :: Keyword.t()
  def cmd_opts(agent_id, cwd, opts \\ [])
      when is_binary(agent_id) and is_binary(cwd) and is_list(opts) do
    cwd = ensure_existing_directory!(cwd)

    stderr_to_stdout = Keyword.get(opts, :stderr_to_stdout, true) == true

    env =
      env_for_build(
        agent_id,
        opts
        |> Keyword.take([:passthrough, :extra, :mix_env])
      )

    [
      cd: cwd,
      env: env,
      stderr_to_stdout: stderr_to_stdout
    ]
  end

  # ----------------------------------------------------------------------------
  # Internal helpers
  # ----------------------------------------------------------------------------

  defp validate_agent_id!(agent_id) when is_binary(agent_id) do
    agent_id = String.trim(agent_id)

    cond do
      agent_id == "" ->
        raise ArgumentError, "agent_id is empty"

      byte_size(agent_id) > 200 ->
        raise ArgumentError, "agent_id is too long"

      not String.match?(agent_id, ~r/^[A-Za-z0-9][A-Za-z0-9._-]*$/) ->
        raise ArgumentError, "agent_id has invalid format"

      true ->
        agent_id
    end
  end

  defp normalize_passthrough_vars(list) when is_list(list) do
    list
    |> Enum.map(&to_string/1)
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 == ""))
    |> Enum.uniq()
  end

  defp normalize_passthrough_vars(_), do: @default_passthrough_vars

  defp normalize_extra_env(%{} = map) do
    map
    |> Enum.reduce(%{}, fn {k, v}, acc ->
      k = k |> to_string() |> String.trim()

      cond do
        k == "" -> acc
        is_nil(v) -> acc
        true -> Map.put(acc, k, v |> to_string())
      end
    end)
  end

  defp normalize_extra_env(list) when is_list(list) do
    list
    |> Enum.into(%{}, fn
      {k, v} -> {k, v}
      other -> {other, nil}
    end)
    |> normalize_extra_env()
  end

  defp normalize_extra_env(_), do: %{}

  defp drop_invalid_env_values(env_map) when is_map(env_map) do
    env_map
    |> Enum.reduce(%{}, fn {k, v}, acc ->
      cond do
        not is_binary(k) ->
          acc

        k == "" ->
          acc

        not is_binary(v) ->
          acc

        String.contains?(k, "\u0000") or String.contains?(v, "\u0000") ->
          acc

        true ->
          Map.put(acc, k, v)
      end
    end)
  end

  defp ensure_existing_directory!(path) when is_binary(path) do
    path = Path.expand(path)

    case File.stat(path) do
      {:ok, %File.Stat{type: :directory}} ->
        path

      {:ok, %File.Stat{type: other}} ->
        raise ArgumentError, "cwd is not a directory (type=#{inspect(other)} path=#{path})"

      {:error, reason} ->
        raise ArgumentError, "cwd is not accessible (reason=#{inspect(reason)} path=#{path})"
    end
  end

  defp normalize_mode!(mode) when is_integer(mode) and mode >= 0 and mode <= 0o777, do: mode
  defp normalize_mode!(_), do: 0o700
end
