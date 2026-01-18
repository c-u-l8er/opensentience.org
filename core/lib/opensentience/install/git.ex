defmodule OpenSentience.Install.Git do
  @moduledoc """
  Git clone/fetch/checkout helper for agent installation (Phase 1).

  Design goals:
  - Explicit trust boundary: this module shells out to `git` (external process).
  - Safe-by-default invocation: no shell, arguments passed as a list.
  - Best-effort secret safety: redact credentials in URLs and command output.
  - Bounded output: clamp captured output for durable storage / UI.

  Notes:
  - We do NOT attempt to perfectly validate URLs; we apply conservative checks to
    avoid obviously unsafe inputs (control chars / whitespace).
  - For simplicity and portability, we capture output as a single combined stream.
    `git` frequently writes progress to stderr; merging improves usability.
  """

  require Logger

  @default_git_bin "git"
  @default_timeout_ms 180_000
  @default_max_output_bytes 200_000

  defmodule Error do
    @moduledoc "Structured, secret-safe error for Git operations."
    @enforce_keys [:code, :message]
    defstruct [:code, :message, details: %{}]

    @type t :: %__MODULE__{
            code: atom(),
            message: String.t(),
            details: map()
          }
  end

  @type git_result :: %{
          command: [String.t()],
          cwd: String.t() | nil,
          exit_code: non_neg_integer(),
          output: String.t(),
          redacted: boolean()
        }

  @doc """
  Clone `url` into `dest_dir`.

  Options:
  - `:git_bin` (string) default `"git"`
  - `:timeout_ms` (integer) default #{@default_timeout_ms}
  - `:max_output_bytes` (integer) default #{@default_max_output_bytes}
  - `:depth` (pos_integer) optional shallow clone depth
  - `:branch` (string) optional branch name (passed to `--branch`)
  - `:single_branch` (boolean) default true
  - `:no_checkout` (boolean) default false
  - `:env` (map) additional env vars for the git process
  - `:cwd` (string) working directory (rarely needed for clone)

  Returns `{:ok, git_result}` or `{:error, %Error{...}}`.
  """
  @spec clone(String.t(), String.t(), Keyword.t()) :: {:ok, git_result()} | {:error, Error.t()}
  def clone(url, dest_dir, opts \\ []) when is_binary(url) and is_binary(dest_dir) and is_list(opts) do
    with :ok <- validate_git_url(url),
         {:ok, dest_dir} <- normalize_path(dest_dir),
         :ok <- ensure_parent_dir(dest_dir) do
      git_bin = Keyword.get(opts, :git_bin, @default_git_bin)
      depth = Keyword.get(opts, :depth)
      branch = Keyword.get(opts, :branch)
      single_branch? = Keyword.get(opts, :single_branch, true) != false
      no_checkout? = Keyword.get(opts, :no_checkout, false) == true

      args =
        ["clone", "--no-tags"]
        |> maybe_add_single_branch(single_branch?)
        |> maybe_add_depth(depth)
        |> maybe_add_branch(branch)
        |> maybe_add_flag("--no-checkout", no_checkout?)
        |> then(fn base -> base ++ ["--", url, dest_dir] end)

      run_git(git_bin, args, opts)
    end
  end

  @doc """
  Fetch updates for an existing repo at `repo_dir`.

  Options:
  - `:git_bin`, `:timeout_ms`, `:max_output_bytes`, `:env`, `:cwd`
  - `:prune` (boolean) default true
  - `:all` (boolean) default true

  Returns `{:ok, git_result}` or `{:error, %Error{...}}`.
  """
  @spec fetch(String.t(), Keyword.t()) :: {:ok, git_result()} | {:error, Error.t()}
  def fetch(repo_dir, opts \\ []) when is_binary(repo_dir) and is_list(opts) do
    with {:ok, repo_dir} <- normalize_path(repo_dir),
         :ok <- ensure_git_repo(repo_dir) do
      git_bin = Keyword.get(opts, :git_bin, @default_git_bin)

      prune? = Keyword.get(opts, :prune, true) != false
      all? = Keyword.get(opts, :all, true) != false

      args =
        ["fetch"]
        |> maybe_add_flag("--all", all?)
        |> maybe_add_flag("--prune", prune?)
        |> then(fn base -> base ++ ["--tags"] end)

      run_git(git_bin, args, Keyword.put(opts, :cwd, repo_dir))
    end
  end

  @doc """
  Checkout `ref` (branch/tag/commit) in an existing repo.

  Options:
  - `:git_bin`, `:timeout_ms`, `:max_output_bytes`, `:env`, `:cwd`
  - `:detach` (boolean) default true (uses `--detach` for commit-ish refs)
  - `:force` (boolean) default false

  Returns `{:ok, git_result}` or `{:error, %Error{...}}`.
  """
  @spec checkout(String.t(), String.t(), Keyword.t()) :: {:ok, git_result()} | {:error, Error.t()}
  def checkout(repo_dir, ref, opts \\ [])
      when is_binary(repo_dir) and is_binary(ref) and is_list(opts) do
    ref = String.trim(ref)

    if ref == "" do
      {:error, error(:invalid_ref, "ref is empty")}
    else
      with {:ok, repo_dir} <- normalize_path(repo_dir),
           :ok <- ensure_git_repo(repo_dir) do
        git_bin = Keyword.get(opts, :git_bin, @default_git_bin)
        force? = Keyword.get(opts, :force, false) == true

        # `git checkout --detach <ref>` is tolerant for commit hashes.
        # For branch names, detach is not strictly required, but it's safe.
        # If you want branch checkout semantics, pass `detach: false` and `ref` as branch.
        detach? = Keyword.get(opts, :detach, true) != false

        args =
          ["checkout"]
          |> maybe_add_flag("--force", force?)
          |> maybe_add_flag("--detach", detach?)
          |> then(fn base -> base ++ ["--", ref] end)

        run_git(git_bin, args, Keyword.put(opts, :cwd, repo_dir))
      end
    end
  end

  @doc """
  Ensure a repository exists at `dest_dir` for `url`, and checkout `ref`.

  Behavior:
  - If `dest_dir/.git` exists, performs `fetch` then `checkout`.
  - Otherwise performs `clone` (optionally shallow), then `checkout`.

  This is a convenience for higher-level install orchestration.

  Returns `{:ok, %{clone: ..., fetch: ..., checkout: ...}}` where steps that did
  not run are `nil`.
  """
  @spec ensure_repo_at(String.t(), String.t(), String.t(), Keyword.t()) ::
          {:ok, %{clone: git_result() | nil, fetch: git_result() | nil, checkout: git_result()}} | {:error, Error.t()}
  def ensure_repo_at(url, dest_dir, ref, opts \\ [])
      when is_binary(url) and is_binary(dest_dir) and is_binary(ref) and is_list(opts) do
    with :ok <- validate_git_url(url),
         {:ok, dest_dir} <- normalize_path(dest_dir),
         :ok <- ensure_parent_dir(dest_dir) do
      if File.dir?(Path.join(dest_dir, ".git")) do
        with {:ok, fetch_res} <- fetch(dest_dir, opts),
             {:ok, checkout_res} <- checkout(dest_dir, ref, opts) do
          {:ok, %{clone: nil, fetch: fetch_res, checkout: checkout_res}}
        end
      else
        with {:ok, clone_res} <- clone(url, dest_dir, opts),
             {:ok, checkout_res} <- checkout(dest_dir, ref, opts) do
          {:ok, %{clone: clone_res, fetch: nil, checkout: checkout_res}}
        end
      end
    end
  end

  # ----------------------------------------------------------------------------
  # Command runner (no shell)
  # ----------------------------------------------------------------------------

  defp run_git(git_bin, args, opts) when is_binary(git_bin) and is_list(args) and is_list(opts) do
    timeout_ms = normalize_timeout_ms(Keyword.get(opts, :timeout_ms, @default_timeout_ms))
    max_output = normalize_max_output_bytes(Keyword.get(opts, :max_output_bytes, @default_max_output_bytes))
    cwd = Keyword.get(opts, :cwd) |> normalize_optional_path()
    # Safe-by-default environment for non-interactive installs:
    # - Avoid credential prompts hanging the Core process.
    # - Keep it conservative; callers can extend via `:env`.
    base_env = %{
      "GIT_TERMINAL_PROMPT" => "0",
      "GCM_INTERACTIVE" => "Never"
    }
    env =
      opts
      |> Keyword.get(:env, %{})
      |> normalize_env_map()
      |> then(&Map.merge(base_env, &1))

    {safe_args, redacted?} = redact_sensitive_in_args(args)
    safe_cmd = [git_bin | safe_args]

    # Use `System.cmd/3` without a shell. We merge stderr into stdout because git writes
    # progress to stderr and Elixir's System.cmd does not provide robust separate capture.
    case run_port_cmd(git_bin, args,
           cd: cwd,
           env: env,
           timeout_ms: timeout_ms,
           max_output_bytes: max_output
         ) do
      {:ok, {output, exit_code}} ->
        output =
          output
          |> redact_output()
          |> clamp_bytes(max_output)

        if exit_code == 0 do
          {:ok,
           %{
             command: safe_cmd,
             cwd: cwd,
             exit_code: exit_code,
             output: output,
             redacted: redacted?
           }}
        else
          {:error,
           error(:git_failed, "Git command failed", %{
             command: safe_cmd,
             cwd: cwd,
             exit_code: exit_code,
             output: output,
             timeout_ms: timeout_ms
           })}
        end

      {:error, %Error{} = err} ->
        {:error, err}
    end
  end

  defp run_port_cmd(bin, args, opts) when is_binary(bin) and is_list(args) and is_list(opts) do
    cd = Keyword.get(opts, :cd)
    env = Keyword.get(opts, :env, %{})
    timeout_ms = normalize_timeout_ms(Keyword.get(opts, :timeout_ms, @default_timeout_ms))
    max_output_bytes = normalize_max_output_bytes(Keyword.get(opts, :max_output_bytes, @default_max_output_bytes))

    exec =
      case System.find_executable(bin) do
        nil -> nil
        path -> path
      end

    if is_nil(exec) do
      {:error,
       error(:git_exec_failed, "Git executable not found", %{
         command: [bin | args]
       })}
    else
      port_opts =
        [
          :binary,
          :exit_status,
          {:args, Enum.map(args, &to_charlist/1)},
          {:env, env_to_port_env(env)},
          {:stderr_to_stdout, true}
        ]
        |> maybe_put(:cd, cd_to_charlist(cd))

      port =
        try do
          Port.open({:spawn_executable, to_charlist(exec)}, port_opts)
        rescue
          e ->
            return_port_error(:git_exec_failed, "Failed to start git process", %{
              command: [bin | args],
              error: Exception.message(e)
            })
        end

      started_at_ms = System.monotonic_time(:millisecond)

      {output, exit_code} =
        try do
          recv_port_output(port, started_at_ms, timeout_ms, max_output_bytes)
        after
          # Best-effort cleanup. If the port already exited, close is a no-op.
          _ = safe_port_close(port)
        end

      {:ok, {output, exit_code}}
    end
  catch
    {:opensentience_port_error, %Error{} = err} ->
      {:error, err}
  end

  defp return_port_error(code, message, details) do
    throw({:opensentience_port_error, error(code, message, details)})
  end

  defp recv_port_output(port, started_at_ms, timeout_ms, max_output_bytes) do
    recv_port_output(port, started_at_ms, timeout_ms, max_output_bytes, [], 0, nil)
  end

  defp recv_port_output(port, started_at_ms, timeout_ms, max_output_bytes, chunks, bytes, exit_code) do
    now_ms = System.monotonic_time(:millisecond)
    elapsed_ms = now_ms - started_at_ms
    remaining_ms = max(timeout_ms - elapsed_ms, 0)

    if remaining_ms == 0 do
      _ = safe_port_close(port)

      output =
        chunks
        |> Enum.reverse()
        |> IO.iodata_to_binary()
        |> clamp_bytes(max_output_bytes)

      throw({:opensentience_port_error,
             error(:git_timeout, "Git command timed out", %{
               timeout_ms: timeout_ms,
               output: output
             })})
    else
      receive do
        {^port, {:data, data}} when is_binary(data) ->
          {chunks, bytes} =
            if bytes >= max_output_bytes do
              {chunks, bytes}
            else
              take = min(byte_size(data), max_output_bytes - bytes)
              <<prefix::binary-size(take), _::binary>> = data
              {[prefix | chunks], bytes + take}
            end

          recv_port_output(port, started_at_ms, timeout_ms, max_output_bytes, chunks, bytes, exit_code)

        {^port, {:exit_status, status}} when is_integer(status) ->
          output =
            chunks
            |> Enum.reverse()
            |> IO.iodata_to_binary()
            |> clamp_bytes(max_output_bytes)

          {output, status}
      after
        remaining_ms ->
          recv_port_output(port, started_at_ms, timeout_ms, max_output_bytes, chunks, bytes, exit_code)
      end
    end
  end

  defp env_to_port_env(%{} = env) do
    env
    |> Enum.reduce([], fn {k, v}, acc ->
      key = k |> to_string() |> String.trim()
      val = v |> to_string()

      if key == "" do
        acc
      else
        [{to_charlist(key), to_charlist(val)} | acc]
      end
    end)
    |> Enum.reverse()
  end

  defp env_to_port_env(_), do: []

  defp cd_to_charlist(nil), do: nil

  defp cd_to_charlist(path) when is_binary(path) do
    path = path |> Path.expand() |> String.trim()
    if path == "", do: nil, else: to_charlist(path)
  end

  defp cd_to_charlist(other), do: other |> to_string() |> cd_to_charlist()

  defp safe_port_close(nil), do: :ok

  defp safe_port_close(port) do
    try do
      Port.close(port)
    catch
      _, _ -> :ok
    end
  end

  # Allow `throw` to escape the `try` in `run_git/3`.
  defp maybe_put(opts, _k, nil), do: opts
  defp maybe_put(opts, k, v), do: Keyword.put(opts, k, v)

  # ----------------------------------------------------------------------------
  # Validation / normalization
  # ----------------------------------------------------------------------------

  defp validate_git_url(url) when is_binary(url) do
    url = String.trim(url)

    cond do
      url == "" ->
        {:error, error(:invalid_url, "git url is empty")}

      String.match?(url, ~r/[\s\0]/) ->
        {:error, error(:invalid_url, "git url contains whitespace/control characters")}

      true ->
        :ok
    end
  end

  defp normalize_path(path) when is_binary(path) do
    path = path |> Path.expand() |> String.trim()
    if path == "", do: {:error, error(:invalid_path, "path is empty")}, else: {:ok, path}
  end

  defp normalize_optional_path(nil), do: nil
  defp normalize_optional_path(path) when is_binary(path), do: path |> Path.expand() |> String.trim() |> blank_to_nil()
  defp normalize_optional_path(other), do: other |> to_string() |> normalize_optional_path()

  defp ensure_parent_dir(dest_dir) when is_binary(dest_dir) do
    parent = Path.dirname(dest_dir)

    case File.mkdir_p(parent) do
      :ok -> :ok
      {:error, reason} -> {:error, error(:mkdir_failed, "Failed to create parent directory", %{path: parent, reason: reason})}
    end
  end

  defp ensure_git_repo(repo_dir) when is_binary(repo_dir) do
    git_dir = Path.join(repo_dir, ".git")

    case File.stat(git_dir) do
      {:ok, %File.Stat{type: :directory}} ->
        :ok

      {:ok, %File.Stat{type: other}} ->
        {:error, error(:not_a_git_repo, "Repo .git is not a directory", %{repo_dir: repo_dir, type: other})}

      {:error, :enoent} ->
        {:error, error(:not_a_git_repo, "No .git directory found", %{repo_dir: repo_dir})}

      {:error, reason} ->
        {:error, error(:stat_failed, "Failed to stat .git directory", %{repo_dir: repo_dir, reason: reason})}
    end
  end

  defp normalize_timeout_ms(n) when is_integer(n) and n > 0, do: min(n, 3_600_000)
  defp normalize_timeout_ms(_), do: @default_timeout_ms

  defp normalize_max_output_bytes(n) when is_integer(n) and n >= 1024, do: min(n, 5_000_000)
  defp normalize_max_output_bytes(_), do: @default_max_output_bytes

  defp normalize_env_map(%{} = env) do
    # System.cmd expects a keyword list or map depending on Elixir version;
    # map is accepted in modern Elixir; keep values as strings.
    env
    |> Enum.reduce(%{}, fn {k, v}, acc ->
      key = k |> to_string() |> String.trim()
      val = v |> to_string()
      if key == "", do: acc, else: Map.put(acc, key, val)
    end)
  end

  defp normalize_env_map(_), do: %{}

  # ----------------------------------------------------------------------------
  # Args building
  # ----------------------------------------------------------------------------

  defp maybe_add_flag(args, _flag, false), do: args
  defp maybe_add_flag(args, flag, true), do: args ++ [flag]

  defp maybe_add_depth(args, nil), do: args

  defp maybe_add_depth(args, depth) when is_integer(depth) and depth > 0 do
    args ++ ["--depth", Integer.to_string(depth)]
  end

  defp maybe_add_depth(args, _), do: args

  defp maybe_add_branch(args, nil), do: args

  defp maybe_add_branch(args, branch) when is_binary(branch) do
    branch = String.trim(branch)
    if branch == "", do: args, else: args ++ ["--branch", branch]
  end

  defp maybe_add_branch(args, _), do: args

  defp maybe_add_single_branch(args, true), do: args ++ ["--single-branch"]
  defp maybe_add_single_branch(args, false), do: args

  # ----------------------------------------------------------------------------
  # Redaction / clamping
  # ----------------------------------------------------------------------------

  defp redact_sensitive_in_args(args) when is_list(args) do
    # Redact credentials in URL-like args (best-effort).
    {safe, redacted?} =
      Enum.map_reduce(args, false, fn arg, acc ->
        if is_binary(arg) do
          safe = redact_url(arg)
          {safe, acc or safe != arg}
        else
          {arg, acc}
        end
      end)

    {safe, redacted?}
  end

  @doc """
  Redact credentials/userinfo in URLs (best-effort).

  - `https://user:pass@host/path` -> `https://host/path`
  - `https://token@host/path` -> `https://host/path`

  SCP-like `git@host:org/repo.git` is left as-is.
  """
  @spec redact_url(String.t()) :: String.t()
  def redact_url(url) when is_binary(url) do
    url = String.trim(url)

    if String.contains?(url, "://") do
      # Replace `scheme://userinfo@` with `scheme://`
      Regex.replace(~r/(https?|ssh|git):\/\/[^\/@]+@/i, url, "\\g{1}://")
    else
      url
    end
  end

  defp redact_output(output) when is_binary(output) do
    output
    |> String.replace("\u0000", "")
    |> Regex.replace(~r/(https?|ssh|git):\/\/[^\/\s@]+@/i, "\\g{1}://")
  end

  defp clamp_bytes(str, max) when is_binary(str) and is_integer(max) and max > 0 do
    if byte_size(str) <= max do
      str
    else
      # Clamp by bytes, not graphemes, to preserve the guarantee.
      <<prefix::binary-size(max), _rest::binary>> = str
      prefix <> "\n[TRUNCATED]\n"
    end
  end

  defp blank_to_nil(nil), do: nil
  defp blank_to_nil(v) when is_binary(v), do: if(String.trim(v) == "", do: nil, else: v)
  defp blank_to_nil(v), do: v

  defp error(code, message, details \\ %{}) when is_atom(code) and is_binary(message) and is_map(details) do
    %Error{code: code, message: message, details: details}
  end
end
