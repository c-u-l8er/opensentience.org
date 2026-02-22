defmodule OpenSentience.Discovery.Scanner do
  @moduledoc """
  Filesystem scanner for agent manifests (`opensentience.agent.json`).

  Phase 1 requirements (per project spec):
  - Discovery MUST NOT execute any code (no `mix`, no shelling out).
  - Discovery should be safe-by-default: avoid following symlinks, bound recursion,
    and skip common build/dependency directories.
  - Errors should be actionable and secret-free.

  This module is *pure filesystem traversal*:
  it returns paths to manifest files; parsing and hashing are handled elsewhere.
  """

  require Logger

  @manifest_filename "opensentience.agent.json"

  @default_exclude_dirnames MapSet.new([
                              ".git",
                              ".hg",
                              ".svn",
                              "_build",
                              "deps",
                              "node_modules",
                              ".next",
                              ".turbo",
                              ".DS_Store"
                            ])

  @typedoc "Absolute filesystem path."
  @type abs_path :: String.t()

  @typedoc "Non-fatal scan warning."
  @type warning :: %{
          root: abs_path(),
          path: abs_path(),
          reason: atom(),
          detail: String.t()
        }

  @typedoc """
  Scan options.

  - `:max_depth` (non_neg_integer) - recursion depth, starting at 0 for the root directory.
    Default: 10
  - `:max_manifests` (pos_integer) - stop after this many manifests across all roots.
    Default: 2_000
  - `:exclude_dirnames` (Enumerable of dir basenames) - directory basenames to skip.
    Default: #{@default_exclude_dirnames |> MapSet.to_list() |> Enum.sort() |> Enum.join(", ")}
  - `:follow_symlinks` (boolean) - whether to traverse symlink directories.
    Default: false (recommended)
  - `:include_hidden_dirs` (boolean) - whether to traverse hidden directories (basename starts with ".").
    Default: false (recommended)
  """
  @type scan_opt ::
          {:max_depth, non_neg_integer()}
          | {:max_manifests, pos_integer()}
          | {:exclude_dirnames, Enumerable.t()}
          | {:follow_symlinks, boolean()}
          | {:include_hidden_dirs, boolean()}

  @doc """
  Scans a list of roots for agent manifests.

  Returns:
  - `{:ok, manifest_paths, warnings}`

  Notes:
  - Roots are expanded to absolute paths.
  - Non-existent roots are skipped with a warning (not an error).
  - Results are de-duplicated and sorted.
  """
  @spec scan_roots([String.t()], [scan_opt()]) :: {:ok, [abs_path()], [warning()]}
  def scan_roots(roots, opts \\ []) when is_list(roots) and is_list(opts) do
    opts = normalize_opts(opts)

    roots
    |> Enum.map(&Path.expand/1)
    |> Enum.uniq()
    |> Enum.reduce({[], [], 0}, fn root, {paths_acc, warns_acc, count} ->
      if count >= opts.max_manifests do
        {paths_acc, warns_acc, count}
      else
        case scan_root(root, opts, opts.max_manifests - count) do
          {:ok, paths, warnings} ->
            {paths_acc ++ paths, warns_acc ++ warnings, count + length(paths)}

          {:error, warning} ->
            {paths_acc, warns_acc ++ [warning], count}
        end
      end
    end)
    |> then(fn {paths, warnings, _count} ->
      {:ok, paths |> Enum.uniq() |> Enum.sort(), warnings}
    end)
  end

  @doc """
  Scans a single root directory for agent manifests.

  Returns:
  - `{:ok, manifest_paths, warnings}` on success
  - `{:error, warning}` if the root cannot be scanned at all (e.g., not a directory)

  The `remaining_budget` argument is used by `scan_roots/2` to enforce `:max_manifests`.
  """
  @spec scan_root(abs_path(), map(), non_neg_integer()) ::
          {:ok, [abs_path()], [warning()]} | {:error, warning()}
  def scan_root(root, opts, remaining_budget)
      when is_binary(root) and is_map(opts) and is_integer(remaining_budget) and
             remaining_budget >= 0 do
    case File.stat(root) do
      {:ok, %File.Stat{type: :directory}} ->
        do_scan_directory(root, opts, remaining_budget)

      {:ok, %File.Stat{type: other}} ->
        {:error,
         warning(root, root, :not_a_directory, "expected directory root, got #{inspect(other)}")}

      {:error, :enoent} ->
        {:error, warning(root, root, :root_missing, "root does not exist")}

      {:error, reason} ->
        {:error, warning(root, root, :root_unreadable, "cannot stat root: #{inspect(reason)}")}
    end
  end

  # ----------------------------------------------------------------------------
  # Internal traversal
  # ----------------------------------------------------------------------------

  defp do_scan_directory(root, opts, remaining_budget) do
    # BFS traversal to avoid deep recursion stack.
    queue = :queue.from_list([{root, 0}])

    {paths, warnings, _queue, _seen, _budget_left} =
      bfs(queue, MapSet.new(), [], [], remaining_budget, root, opts)

    {:ok, paths, warnings}
  end

  defp bfs(queue, seen_dirs, paths, warnings, budget_left, root, opts) do
    case :queue.out(queue) do
      {:empty, queue} ->
        {paths, warnings, queue, seen_dirs, budget_left}

      {{:value, {dir, depth}}, queue} ->
        cond do
          budget_left <= 0 ->
            {paths, warnings, queue, seen_dirs, budget_left}

          MapSet.member?(seen_dirs, dir) ->
            bfs(queue, seen_dirs, paths, warnings, budget_left, root, opts)

          true ->
            case should_enter_dir?(dir, depth, opts) do
              {:skip, _reason} ->
                bfs(queue, MapSet.put(seen_dirs, dir), paths, warnings, budget_left, root, opts)

              :enter ->
                case list_dir(dir) do
                  {:ok, entries} ->
                    {queue, paths, warnings, budget_left} =
                      Enum.reduce(entries, {queue, paths, warnings, budget_left}, fn entry,
                                                                                     {q, p_acc,
                                                                                      w_acc,
                                                                                      b_left} ->
                        if b_left <= 0 do
                          {q, p_acc, w_acc, b_left}
                        else
                          full = Path.join(dir, entry)

                          case classify_path(full, opts) do
                            {:manifest, path} ->
                              {q, [path | p_acc], w_acc, b_left - 1}

                            {:dir, path} ->
                              {:queue.in({path, depth + 1}, q), p_acc, w_acc, b_left}

                            :skip ->
                              {q, p_acc, w_acc, b_left}

                            {:warn, reason_atom, detail} ->
                              {q, p_acc, [warning(root, full, reason_atom, detail) | w_acc],
                               b_left}
                          end
                        end
                      end)

                    bfs(
                      queue,
                      MapSet.put(seen_dirs, dir),
                      paths,
                      warnings,
                      budget_left,
                      root,
                      opts
                    )

                  {:error, reason} ->
                    # Non-fatal: keep scanning other directories.
                    warnings = [
                      warning(root, dir, :list_failed, "cannot list dir: #{inspect(reason)}")
                      | warnings
                    ]

                    bfs(
                      queue,
                      MapSet.put(seen_dirs, dir),
                      paths,
                      warnings,
                      budget_left,
                      root,
                      opts
                    )
                end
            end
        end
    end
  end

  defp list_dir(dir) do
    # File.ls/1 already returns basenames (entries), which is what we want.
    File.ls(dir)
  end

  defp should_enter_dir?(_dir, depth, %{max_depth: max_depth}) when depth > max_depth,
    do: {:skip, :max_depth}

  defp should_enter_dir?(_dir, _depth, _opts), do: :enter

  defp classify_path(path, opts) do
    base = Path.basename(path)

    # Fast path: manifest filename check (then verify it's a regular file).
    if base == @manifest_filename do
      case File.stat(path) do
        {:ok, %File.Stat{type: :regular}} ->
          {:manifest, path}

        {:ok, %File.Stat{type: :symlink}} ->
          :skip

        {:ok, %File.Stat{type: other}} ->
          {:warn, :not_a_regular_file, "manifest is not a file: #{inspect(other)}"}

        {:error, reason} ->
          {:warn, :stat_failed, "cannot stat potential manifest: #{inspect(reason)}"}
      end
    else
      # Otherwise, decide whether to enqueue directory traversal.
      case lstat_type(path) do
        {:ok, :directory} ->
          if should_skip_dir_basename?(base, opts) do
            :skip
          else
            {:dir, path}
          end

        {:ok, :symlink} ->
          # Only traverse symlink dirs if explicitly allowed.
          if opts.follow_symlinks do
            case File.stat(path) do
              {:ok, %File.Stat{type: :directory}} ->
                if should_skip_dir_basename?(base, opts), do: :skip, else: {:dir, path}

              {:ok, _} ->
                :skip

              {:error, reason} ->
                {:warn, :stat_failed, "cannot stat symlink target: #{inspect(reason)}"}
            end
          else
            :skip
          end

        {:ok, _other} ->
          :skip

        {:error, reason} ->
          {:warn, :lstat_failed, "cannot stat path: #{inspect(reason)}"}
      end
    end
  end

  defp lstat_type(path) do
    case File.lstat(path) do
      {:ok, %File.Stat{type: type}} -> {:ok, type}
      {:error, reason} -> {:error, reason}
    end
  end

  defp should_skip_dir_basename?(basename, opts) do
    excluded? = MapSet.member?(opts.exclude_dirnames, basename)
    hidden? = String.starts_with?(basename, ".")
    excluded? or (hidden? and not opts.include_hidden_dirs)
  end

  defp normalize_opts(opts) do
    max_depth =
      case Keyword.get(opts, :max_depth, 10) do
        n when is_integer(n) and n >= 0 -> n
        _ -> 10
      end

    max_manifests =
      case Keyword.get(opts, :max_manifests, 2_000) do
        n when is_integer(n) and n > 0 -> n
        _ -> 2_000
      end

    exclude_dirnames =
      opts
      |> Keyword.get(:exclude_dirnames, @default_exclude_dirnames)
      |> Enum.map(fn
        s when is_binary(s) -> s
        a when is_atom(a) -> Atom.to_string(a)
        other -> to_string(other)
      end)
      |> MapSet.new()

    follow_symlinks = Keyword.get(opts, :follow_symlinks, false) == true
    include_hidden_dirs = Keyword.get(opts, :include_hidden_dirs, false) == true

    %{
      max_depth: max_depth,
      max_manifests: max_manifests,
      exclude_dirnames: exclude_dirnames,
      follow_symlinks: follow_symlinks,
      include_hidden_dirs: include_hidden_dirs
    }
  end

  defp warning(root, path, reason, detail)
       when is_binary(root) and is_binary(path) and is_atom(reason) and is_binary(detail) do
    %{
      root: root,
      path: path,
      reason: reason,
      detail: sanitize_detail(detail)
    }
  end

  defp sanitize_detail(detail) do
    # Ensure warnings are printable and bounded; keep them secret-free by design.
    detail
    |> String.replace("\u0000", "")
    |> String.replace(~r/\r\n|\r|\n/, " ")
    |> String.trim()
    |> String.slice(0, 500)
  end
end
