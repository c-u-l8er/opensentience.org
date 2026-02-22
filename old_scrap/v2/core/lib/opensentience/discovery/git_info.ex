defmodule OpenSentience.Discovery.GitInfo do
  @moduledoc """
  Safe Git metadata reader for discovery (Phase 1).

  This module is intentionally *read-only* and *best-effort*:
  - It does **not** shell out to `git` (no code execution).
  - It only reads a small set of files under `.git/`.
  - It returns secret-safe values suitable for durable storage.

  Primary use-case:
  - During discovery, enrich a manifest-derived agent record with:
    - `source_git_url` (redacted)
    - `source_ref` (branch/ref if available; otherwise commit hash)

  Notes / limitations:
  - "Dirty" working tree detection is not attempted (would require scanning all files or running git).
  - Worktrees are supported via `.git` *file* containing `gitdir: ...` pointers.
  - Commit resolution supports `refs/*` and `packed-refs` (best-effort).
  """

  @default_max_bytes 128_000

  defmodule Error do
    @moduledoc "Structured, secret-safe error for Git metadata reads."
    @enforce_keys [:code, :message]
    defstruct [:code, :message, details: %{}]

    @type t :: %__MODULE__{
            code: atom(),
            message: String.t(),
            details: map()
          }
  end

  @type git_info :: %{
          git_dir: String.t(),
          source_git_url: String.t() | nil,
          source_ref: String.t() | nil,
          head: String.t() | nil,
          head_commit: String.t() | nil
        }

  @doc """
  Reads Git metadata for a repository root.

  Options:
  - `:max_bytes` (pos_integer, default #{@default_max_bytes}): maximum bytes to read per file.

  Returns:
  - `{:ok, git_info_map}` even if some fields are nil
  - `{:error, %Error{...}}` if the repo doesn't look like a Git repo or files are unreadable
  """
  @spec read(String.t(), Keyword.t()) :: {:ok, git_info()} | {:error, Error.t()}
  def read(repo_root, opts \\ []) when is_binary(repo_root) and is_list(opts) do
    max_bytes = normalize_max_bytes(opts)

    with {:ok, repo_root} <- normalize_path(repo_root),
         {:ok, git_dir} <- resolve_git_dir(repo_root, max_bytes) do
      config_path = Path.join(git_dir, "config")
      head_path = Path.join(git_dir, "HEAD")
      packed_refs_path = Path.join(git_dir, "packed-refs")

      source_git_url =
        case read_text_file(config_path, max_bytes) do
          {:ok, cfg} -> cfg |> parse_origin_url() |> redact_url() |> normalize_optional()
          {:error, _} -> nil
        end

      {head, head_commit} =
        case read_text_file(head_path, max_bytes) do
          {:ok, head_contents} ->
            head = head_contents |> parse_head() |> normalize_optional()

            commit =
              case head do
                nil ->
                  nil

                <<"ref:", _::binary>> = ref_line ->
                  ref =
                    ref_line
                    |> String.replace_prefix("ref:", "")
                    |> String.trim()

                  resolve_ref_to_commit(git_dir, ref, packed_refs_path, max_bytes)

                # Detached HEAD with raw commit-ish
                other ->
                  other
                  |> String.trim()
                  |> normalize_optional()
              end

            {head, normalize_optional(commit)}

          {:error, _} ->
            {nil, nil}
        end

      source_ref =
        cond do
          is_binary(head) and String.starts_with?(head, "ref:") ->
            head
            |> String.replace_prefix("ref:", "")
            |> String.trim()
            |> friendly_ref_name()
            |> normalize_optional()

          is_binary(head_commit) and head_commit != "" ->
            head_commit

          true ->
            nil
        end

      {:ok,
       %{
         git_dir: git_dir,
         source_git_url: source_git_url,
         source_ref: source_ref,
         head: head,
         head_commit: head_commit
       }}
    end
  end

  # ----------------------------------------------------------------------------
  # .git directory resolution
  # ----------------------------------------------------------------------------

  defp resolve_git_dir(repo_root, max_bytes) do
    dot_git = Path.join(repo_root, ".git")

    case File.lstat(dot_git) do
      {:ok, %File.Stat{type: :directory}} ->
        {:ok, dot_git}

      {:ok, %File.Stat{type: :regular}} ->
        # Worktree pointer file: "gitdir: /path/to/actual/git/dir"
        with {:ok, contents} <- read_text_file(dot_git, max_bytes),
             {:ok, gitdir_path} <- parse_gitdir_pointer(contents),
             {:ok, git_dir} <- resolve_gitdir_path(repo_root, gitdir_path),
             :ok <- ensure_directory(git_dir) do
          {:ok, git_dir}
        else
          {:error, %Error{} = e} ->
            {:error, e}

          {:error, reason} ->
            {:error, error(:gitdir_invalid, "Invalid .git worktree pointer", %{reason: reason})}
        end

      {:ok, %File.Stat{type: other}} ->
        {:error,
         error(:not_a_git_repo, ".git is not a directory or regular file", %{
           repo_root: repo_root,
           type: other
         })}

      {:error, :enoent} ->
        {:error, error(:not_a_git_repo, "No .git directory found", %{repo_root: repo_root})}

      {:error, reason} ->
        {:error, error(:stat_failed, "Failed to stat .git path", %{reason: reason})}
    end
  end

  defp parse_gitdir_pointer(contents) when is_binary(contents) do
    # Accept common format: "gitdir: <path>"
    line =
      contents
      |> String.split(~r/\r\n|\r|\n/, parts: 2)
      |> List.first()
      |> to_string()
      |> String.trim()

    if String.starts_with?(String.downcase(line), "gitdir:") do
      path =
        line
        |> String.split(":", parts: 2)
        |> case do
          [_k, v] -> String.trim(v)
          _ -> ""
        end

      if path == "" do
        {:error, error(:gitdir_invalid, "gitdir pointer is empty")}
      else
        {:ok, path}
      end
    else
      {:error, error(:gitdir_invalid, "Unexpected .git file format")}
    end
  end

  defp resolve_gitdir_path(repo_root, gitdir_path) when is_binary(repo_root) and is_binary(gitdir_path) do
    # gitdir can be absolute or relative to repo_root.
    resolved =
      if Path.type(gitdir_path) == :absolute do
        gitdir_path
      else
        Path.expand(gitdir_path, repo_root)
      end

    normalize_path(resolved)
  end

  defp ensure_directory(path) do
    case File.lstat(path) do
      {:ok, %File.Stat{type: :directory}} -> :ok
      {:ok, %File.Stat{type: other}} -> {:error, error(:not_a_git_repo, "gitdir is not a directory", %{type: other})}
      {:error, reason} -> {:error, error(:stat_failed, "Failed to stat gitdir", %{reason: reason})}
    end
  end

  # ----------------------------------------------------------------------------
  # config parsing (minimal)
  # ----------------------------------------------------------------------------

  defp parse_origin_url(config_contents) when is_binary(config_contents) do
    # Minimal INI-ish parser that only cares about:
    #   [remote "origin"]
    #     url = ...
    #
    # We ignore includes and other advanced config features in Phase 1.
    lines = String.split(config_contents, ~r/\r\n|\r|\n/)

    {_section, url} =
      Enum.reduce(lines, {nil, nil}, fn line, {section, url} ->
        line = String.trim(line)

        cond do
          line == "" ->
            {section, url}

          String.starts_with?(line, "#") or String.starts_with?(line, ";") ->
            {section, url}

          String.starts_with?(line, "[") and String.ends_with?(line, "]") ->
            sec = line |> String.trim_leading("[") |> String.trim_trailing("]") |> String.trim()
            {sec, url}

          url != nil ->
            {section, url}

          is_binary(section) and String.starts_with?(section, ~s(remote "origin")) ->
            case parse_ini_kv(line) do
              {:ok, "url", value} -> {section, value}
              _ -> {section, url}
            end

          true ->
            {section, url}
        end
      end)

    url
  end

  defp parse_ini_kv(line) when is_binary(line) do
    # Accept "key = value" (spaces optional)
    case String.split(line, "=", parts: 2) do
      [k, v] ->
        key = k |> String.trim() |> String.downcase()
        value = v |> String.trim()
        {:ok, key, value}

      _ ->
        :error
    end
  end

  # ----------------------------------------------------------------------------
  # HEAD + ref resolution
  # ----------------------------------------------------------------------------

  defp parse_head(head_contents) when is_binary(head_contents) do
    head_contents
    |> String.split(~r/\r\n|\r|\n/, parts: 2)
    |> List.first()
    |> to_string()
    |> String.trim()
    |> case do
      "" -> nil
      s -> s
    end
  end

  defp resolve_ref_to_commit(git_dir, ref, packed_refs_path, max_bytes)
       when is_binary(git_dir) and is_binary(ref) and is_binary(packed_refs_path) do
    # 1) Try loose ref file: .git/<ref>
    loose_ref_path = Path.join(git_dir, ref)

    case read_text_file(loose_ref_path, max_bytes) do
      {:ok, contents} ->
        commit =
          contents
          |> String.split(~r/\r\n|\r|\n/, parts: 2)
          |> List.first()
          |> to_string()
          |> String.trim()

        if commit == "", do: nil, else: commit

      {:error, _} ->
        # 2) Try packed-refs
        case read_text_file(packed_refs_path, max_bytes) do
          {:ok, packed} -> parse_packed_refs_for(packed, ref)
          {:error, _} -> nil
        end
    end
  end

  defp parse_packed_refs_for(packed_refs_contents, ref) when is_binary(packed_refs_contents) and is_binary(ref) do
    # packed-refs format: lines like "<hash> <ref>"
    # plus comments and peeled lines starting with "^" (ignored).
    packed_refs_contents
    |> String.split(~r/\r\n|\r|\n/)
    |> Enum.find_value(fn line ->
      line = String.trim(line)

      cond do
        line == "" -> nil
        String.starts_with?(line, "#") -> nil
        String.starts_with?(line, "^") -> nil
        true ->
          case String.split(line, " ", parts: 2) do
            [hash, ^ref] -> hash
            _ -> nil
          end
      end
    end)
  end

  # ----------------------------------------------------------------------------
  # Redaction / safety
  # ----------------------------------------------------------------------------

  @doc """
  Redacts credentials from a Git remote URL (best-effort).

  Examples:
  - "https://user:pass@github.com/org/repo.git" -> "https://github.com/org/repo.git"
  - "https://token@github.com/org/repo.git" -> "https://github.com/org/repo.git"
  - "git@github.com:org/repo.git" -> unchanged
  """
  @spec redact_url(String.t() | nil) :: String.t() | nil
  def redact_url(nil), do: nil

  def redact_url(url) when is_binary(url) do
    url = String.trim(url)

    # Only attempt to redact URLs that look like they include a scheme.
    # For SCP-like syntax (git@host:org/repo.git), keep as-is.
    if String.contains?(url, "://") do
      case URI.parse(url) do
        %URI{scheme: scheme, host: host} = uri when is_binary(scheme) and is_binary(host) ->
          # Drop userinfo by rebuilding without it.
          # Keep path/query/fragment if present.
          safe =
            %URI{uri | userinfo: nil}
            |> URI.to_string()

          # URI.to_string/1 can sometimes normalize strangely; as defense-in-depth,
          # also remove any lingering "@host" userinfo patterns in the authority.
          scrub_basic_userinfo(safe)

        _ ->
          scrub_basic_userinfo(url)
      end
    else
      url
    end
    |> normalize_optional()
    |> bounded(4_096)
  end

  defp scrub_basic_userinfo(url) when is_binary(url) do
    # Replace "://userinfo@" with "://"
    Regex.replace(~r/(https?|ssh|git):\/\/[^\/@]+@/i, url, "\\g{1}://")
  end

  # ----------------------------------------------------------------------------
  # Small I/O helpers (bounded, regular files only)
  # ----------------------------------------------------------------------------

  defp read_text_file(path, max_bytes) when is_binary(path) and is_integer(max_bytes) do
    case File.stat(path) do
      {:ok, %File.Stat{type: :regular, size: size}} ->
        cond do
          size <= 0 ->
            {:error, error(:empty_file, "File is empty", %{path: path})}

          size > max_bytes ->
            {:error, error(:file_too_large, "File is too large", %{path: path, size_bytes: size, max_bytes: max_bytes})}

          true ->
            case File.read(path) do
              {:ok, contents} -> {:ok, contents}
              {:error, reason} -> {:error, error(:read_failed, "Failed to read file", %{path: path, reason: reason})}
            end
        end

      {:ok, %File.Stat{type: other}} ->
        {:error, error(:not_a_file, "Path is not a regular file", %{path: path, type: other})}

      {:error, reason} ->
        {:error, error(:stat_failed, "Failed to stat file", %{path: path, reason: reason})}
    end
  end

  # ----------------------------------------------------------------------------
  # Normalization utilities
  # ----------------------------------------------------------------------------

  defp normalize_path(path) when is_binary(path) do
    path = path |> Path.expand() |> String.trim()

    if path == "" do
      {:error, error(:invalid_path, "Path is empty")}
    else
      {:ok, path}
    end
  end

  defp normalize_max_bytes(opts) when is_list(opts) do
    case Keyword.get(opts, :max_bytes, @default_max_bytes) do
      n when is_integer(n) and n >= 1_024 -> n
      _ -> @default_max_bytes
    end
  end

  defp friendly_ref_name(nil), do: nil

  defp friendly_ref_name(ref) when is_binary(ref) do
    ref = String.trim(ref)

    cond do
      String.starts_with?(ref, "refs/heads/") ->
        String.replace_prefix(ref, "refs/heads/", "")

      String.starts_with?(ref, "refs/tags/") ->
        String.replace_prefix(ref, "refs/tags/", "")

      String.starts_with?(ref, "refs/remotes/") ->
        String.replace_prefix(ref, "refs/remotes/", "")

      true ->
        ref
    end
  end

  defp friendly_ref_name(other), do: other |> to_string() |> friendly_ref_name()

  defp normalize_optional(nil), do: nil

  defp normalize_optional(v) when is_binary(v) do
    v = String.trim(v)
    if v == "", do: nil, else: v
  end

  defp normalize_optional(other), do: other |> to_string() |> normalize_optional()

  defp bounded(nil, _max), do: nil
  defp bounded(s, max) when is_binary(s) and is_integer(max) and max >= 1, do: String.slice(s, 0, max)

  defp error(code, message, details \\ %{}) when is_atom(code) and is_binary(message) and is_map(details) do
    %Error{code: code, message: message, details: details}
  end
end
