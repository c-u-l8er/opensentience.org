defmodule OpenSentience.Install do
  @moduledoc """
  Install orchestration for OpenSentience Core (Phase 1).

  Installs an agent by cloning/fetching its source repository into the Core agents
  directory (default `~/.opensentience/agents/<agent_id>/src`).

  Trust boundary:
  - This module shells out to `git` via `OpenSentience.Install.Git`.
  - Install is explicit and auditable.
  - Install does not build or run the agent.

  Persistence:
  - Updates the catalog (`OpenSentience.Catalog`) with:
    - `status = "installed"`
    - `install_path`
    - `source_git_url` (redacted best-effort)
    - `source_ref` (the requested ref, if provided)
  - Emits audit events via `OpenSentience.AuditLog` (best-effort).
  """

  require Logger

  alias OpenSentience.AuditLog
  alias OpenSentience.Catalog
  alias OpenSentience.Catalog.Agent
  alias OpenSentience.Install.Git
  alias OpenSentience.Paths

  defmodule Error do
    @moduledoc "Structured, secret-safe error for install orchestration."
    @enforce_keys [:code, :message]
    defstruct [:code, :message, details: %{}]

    @type t :: %__MODULE__{
            code: atom(),
            message: String.t(),
            details: map()
          }
  end

  @type actor_type :: :human | :system | :agent

  @type install_result :: %{
          agent_id: String.t(),
          dest_dir: String.t(),
          git_url: String.t(),
          ref: String.t() | nil,
          steps: %{
            clone: map() | nil,
            fetch: map() | nil,
            checkout: map() | nil
          },
          catalog_agent: Agent.t() | nil
        }

  @doc """
  Installs an agent by id.

  The source URL is determined as:
  1) `opts[:git_url]` if provided
  2) `agent.source_git_url` from the catalog (if present)

  Options:
  - `:git_url` (string) - override source URL
  - `:ref` (string) - git ref/branch/tag/commit to checkout (optional)
  - `:agents_dir` (string) - override base agents dir (defaults to `OpenSentience.Paths.agents_dir/0`)
  - `:force` (boolean) - passed to checkout (`git checkout --force`) when ref is provided
  - `:timeout_ms` (integer) - git command timeout (bounded in Git helper)
  - `:max_output_bytes` (integer) - bound captured git output
  - `:actor_type` (atom) - `:system|:human|:agent` (default `:system`)
  - `:actor_id` (string) - defaults to `"core"`
  - `:audit?` (boolean) - defaults to `true` (best-effort)
  - `:correlation_id` (string) - optional audit correlation id
  - `:causation_id` (string) - optional audit causation id

  Returns:
  - `{:ok, install_result}`
  - `{:error, %OpenSentience.Install.Error{...}}`
  """
  @spec install(String.t(), Keyword.t()) :: {:ok, install_result()} | {:error, Error.t()}
  def install(agent_id, opts \\ []) when is_binary(agent_id) and is_list(opts) do
    actor_type = normalize_actor_type(Keyword.get(opts, :actor_type, :system))
    actor_id = Keyword.get(opts, :actor_id, "core") |> to_string() |> String.trim()
    audit? = Keyword.get(opts, :audit?, true) != false
    correlation_id = normalize_optional_string(Keyword.get(opts, :correlation_id))
    causation_id = normalize_optional_string(Keyword.get(opts, :causation_id))

    with :ok <- validate_agent_id(agent_id),
         %Agent{} = agent <- Catalog.get_agent(agent_id) || :not_found,
         {:ok, git_url} <- resolve_git_url(agent, opts) |> fallback_git_url_from_manifest(agent),
         {:ok, dest_dir} <- compute_dest_dir(agent_id, opts),
         :ok <- ensure_install_dirs(dest_dir) do
      ref = normalize_optional_string(Keyword.get(opts, :ref))
      force? = Keyword.get(opts, :force, false) == true

      emit_audit(audit?, %{
        event_type: "agent.install_started",
        actor_type: actor_type,
        actor_id: actor_id,
        subject_type: "agent",
        subject_id: agent_id,
        correlation_id: correlation_id,
        causation_id: causation_id,
        severity: :info,
        metadata: %{
          git_url: Git.redact_url(git_url),
          dest_dir: dest_dir,
          ref: ref
        }
      })

      git_opts =
        []
        |> maybe_put(:timeout_ms, Keyword.get(opts, :timeout_ms))
        |> maybe_put(:max_output_bytes, Keyword.get(opts, :max_output_bytes))

      git_steps_result =
        if is_binary(ref) do
          # Ensure repo exists and checkout ref.
          Git.ensure_repo_at(git_url, dest_dir, ref, Keyword.put(git_opts, :force, force?))
        else
          # No ref requested: clone or fetch only, do not checkout explicitly.
          ensure_repo_without_checkout(git_url, dest_dir, git_opts)
        end

      case git_steps_result do
        {:ok, steps} ->
          safe_git_url = Git.redact_url(git_url)

          inferred_ref =
            ref ||
              case OpenSentience.Discovery.GitInfo.read(dest_dir) do
                {:ok, info} -> info[:source_ref] || info[:head_commit]
                {:error, _} -> nil
              end

          # Persist catalog lifecycle fields.
          {:ok, catalog_agent} =
            Catalog.mark_installed(agent_id, %{
              install_path: dest_dir,
              source_git_url: safe_git_url,
              source_ref: inferred_ref
            })

          emit_audit(audit?, %{
            event_type: "agent.installed",
            actor_type: actor_type,
            actor_id: actor_id,
            subject_type: "agent",
            subject_id: agent_id,
            correlation_id: correlation_id,
            causation_id: causation_id,
            severity: :info,
            metadata: %{
              git_url: safe_git_url,
              dest_dir: dest_dir,
              ref: inferred_ref,
              steps: summarize_steps(steps)
            }
          })

          {:ok,
           %{
             agent_id: agent_id,
             dest_dir: dest_dir,
             git_url: safe_git_url,
             ref: inferred_ref,
             steps: steps_to_map(steps),
             catalog_agent: catalog_agent
           }}

        {:error, %Git.Error{} = git_err} ->
          # If git install fails, try a best-effort fallback: copy the agent source from the
          # local manifest directory (useful for example agents and local-only manifests).
          #
          # This keeps the Phase 1 trust boundary explicit (this is still an explicit install action),
          # but avoids requiring that `source.git_url` points at a git repository.
          case maybe_install_from_local_manifest_dir(agent, dest_dir) do
            {:ok, %{source_dir: source_dir, copy_step: copy_step}} ->
              safe_source_url = Git.redact_url("file://" <> source_dir)
              inferred_ref = ref || "local_manifest_dir"

              {:ok, catalog_agent} =
                Catalog.mark_installed(agent_id, %{
                  install_path: dest_dir,
                  source_git_url: safe_source_url,
                  source_ref: inferred_ref
                })

              _ = Catalog.clear_error(agent_id)

              emit_audit(audit?, %{
                event_type: "agent.installed",
                actor_type: actor_type,
                actor_id: actor_id,
                subject_type: "agent",
                subject_id: agent_id,
                correlation_id: correlation_id,
                causation_id: causation_id,
                severity: :info,
                metadata: %{
                  install_method: "local_copy",
                  source_dir: source_dir,
                  dest_dir: dest_dir,
                  ref: inferred_ref,
                  # record that git failed (safe summary only)
                  git_clone_failed: true,
                  git_error: %{
                    code: git_err.code,
                    message: git_err.message
                  },
                  steps: summarize_steps(%{clone: copy_step, fetch: nil, checkout: nil})
                }
              })

              {:ok,
               %{
                 agent_id: agent_id,
                 dest_dir: dest_dir,
                 git_url: safe_source_url,
                 ref: inferred_ref,
                 steps: steps_to_map(%{clone: copy_step, fetch: nil, checkout: nil}),
                 catalog_agent: catalog_agent
               }}

            :no_fallback ->
              # Persist a safe summary (Catalog.Agent will clamp/bound it).
              _ = Catalog.set_error(agent_id, "install failed: #{git_err.message}")

              emit_audit(audit?, %{
                event_type: "agent.install_failed",
                actor_type: actor_type,
                actor_id: actor_id,
                subject_type: "agent",
                subject_id: agent_id,
                correlation_id: correlation_id,
                causation_id: causation_id,
                severity: :error,
                metadata: %{
                  git_url: Git.redact_url(git_url),
                  dest_dir: dest_dir,
                  ref: ref,
                  error: %{
                    code: git_err.code,
                    message: git_err.message,
                    details: safe_details(git_err.details)
                  }
                }
              })

              {:error,
               error(:install_failed, "Install failed", %{
                 agent_id: agent_id,
                 git_error_code: git_err.code,
                 git_error_message: git_err.message
               })}
          end

        {:error, other} ->
          _ = Catalog.set_error(agent_id, "install failed: #{inspect(other)}")
          {:error, error(:install_failed, "Install failed", %{agent_id: agent_id})}
      end
    else
      :not_found ->
        {:error, error(:not_found, "No agent with id #{agent_id} in the catalog")}

      {:error, %Error{} = e} ->
        {:error, e}

      {:error, other} ->
        {:error, error(:install_failed, "Install failed", %{reason: inspect(other)})}
    end
  end

  # ----------------------------------------------------------------------------
  # Repo handling helpers
  # ----------------------------------------------------------------------------

  defp ensure_repo_without_checkout(git_url, dest_dir, git_opts) do
    if File.dir?(Path.join(dest_dir, ".git")) do
      case Git.fetch(dest_dir, git_opts) do
        {:ok, fetch_res} -> {:ok, %{clone: nil, fetch: fetch_res, checkout: nil}}
        {:error, %Git.Error{} = e} -> {:error, e}
      end
    else
      case Git.clone(git_url, dest_dir, git_opts) do
        {:ok, clone_res} -> {:ok, %{clone: clone_res, fetch: nil, checkout: nil}}
        {:error, %Git.Error{} = e} -> {:error, e}
      end
    end
  end

  defp compute_dest_dir(agent_id, opts) do
    base =
      Keyword.get(opts, :agents_dir) ||
        Paths.agents_dir()

    base = base |> Path.expand() |> String.trim()

    if base == "" do
      {:error, error(:invalid_path, "agents_dir is empty")}
    else
      {:ok, Path.join([base, agent_id, "src"])}
    end
  end

  defp ensure_install_dirs(dest_dir) when is_binary(dest_dir) do
    # Create the parent of dest_dir; git clone will create dest_dir itself.
    parent = Path.dirname(dest_dir)

    case File.mkdir_p(parent) do
      :ok ->
        :ok

      {:error, reason} ->
        {:error,
         error(:mkdir_failed, "Failed to create install directory", %{
           path: parent,
           reason: reason
         })}
    end
  end

  # ----------------------------------------------------------------------------
  # Local-copy fallback (supports example agents and local manifests)
  # ----------------------------------------------------------------------------

  defp fallback_git_url_from_manifest({:ok, url}, _agent), do: {:ok, url}

  defp fallback_git_url_from_manifest({:error, _} = err, %Agent{} = agent) do
    manifest_path = agent.manifest_path |> normalize_optional_string()

    if is_binary(manifest_path) do
      source_dir = manifest_path |> Path.expand() |> Path.dirname()

      if File.dir?(source_dir) do
        # Return a file:// URL so the git path is still the "primary" attempt; if the
        # directory is not a git repo, the git attempt will fail and we'll fall back to copy.
        {:ok, "file://" <> source_dir}
      else
        err
      end
    else
      err
    end
  end

  defp fallback_git_url_from_manifest(other, _agent), do: other

  defp maybe_install_from_local_manifest_dir(%Agent{} = agent, dest_dir)
       when is_binary(dest_dir) do
    manifest_path = agent.manifest_path |> normalize_optional_string()

    if is_binary(manifest_path) do
      source_dir = manifest_path |> Path.expand() |> Path.dirname()

      if File.dir?(source_dir) do
        case copy_agent_source_dir(source_dir, dest_dir) do
          :ok ->
            {:ok,
             %{
               source_dir: source_dir,
               copy_step: %{
                 command: ["copy", "--from", source_dir, "--to", dest_dir],
                 cwd: nil,
                 exit_code: 0,
                 output: "copied from local manifest dir",
                 redacted: false
               }
             }}

          {:error, _reason} ->
            :no_fallback
        end
      else
        :no_fallback
      end
    else
      :no_fallback
    end
  rescue
    _ -> :no_fallback
  end

  defp copy_agent_source_dir(source_dir, dest_dir)
       when is_binary(source_dir) and is_binary(dest_dir) do
    # Best-effort safe copy:
    # - skip common build/dependency directories
    # - skip symlinks (avoid copying arbitrary host files)
    exclude = MapSet.new([".git", "_build", "deps", "node_modules"])

    # Ensure a clean dest dir (git clone expects it to not exist; copy should behave similarly).
    _ = File.rm_rf(dest_dir)

    with :ok <- File.mkdir_p(dest_dir),
         :ok <- do_copy_dir_filtered(source_dir, dest_dir, exclude) do
      :ok
    else
      {:error, reason} -> {:error, reason}
      other -> {:error, other}
    end
  end

  defp do_copy_dir_filtered(src, dst, %MapSet{} = exclude) do
    case File.ls(src) do
      {:ok, entries} ->
        Enum.reduce_while(entries, :ok, fn entry, :ok ->
          if MapSet.member?(exclude, entry) do
            {:cont, :ok}
          else
            src_path = Path.join(src, entry)
            dst_path = Path.join(dst, entry)

            case File.lstat(src_path) do
              {:ok, %File.Stat{type: :symlink}} ->
                # Skip symlinks (safe-by-default).
                {:cont, :ok}

              {:ok, %File.Stat{type: :directory}} ->
                with :ok <- File.mkdir_p(dst_path),
                     :ok <- do_copy_dir_filtered(src_path, dst_path, exclude) do
                  {:cont, :ok}
                else
                  {:error, reason} -> {:halt, {:error, reason}}
                  other -> {:halt, {:error, other}}
                end

              {:ok, %File.Stat{type: :regular}} ->
                case File.copy(src_path, dst_path) do
                  {:ok, _bytes} -> {:cont, :ok}
                  {:error, reason} -> {:halt, {:error, reason}}
                end

              {:ok, %File.Stat{type: _other}} ->
                # Skip other filesystem objects.
                {:cont, :ok}

              {:error, reason} ->
                {:halt, {:error, reason}}
            end
          end
        end)

      {:error, reason} ->
        {:error, reason}
    end
  end

  # ----------------------------------------------------------------------------
  # URL resolution / validation
  # ----------------------------------------------------------------------------

  defp resolve_git_url(%Agent{} = agent, opts) do
    url =
      Keyword.get(opts, :git_url) ||
        agent.source_git_url

    url = normalize_optional_string(url)

    cond do
      is_nil(url) ->
        {:error,
         error(:missing_git_url, "No git_url provided and catalog has no source_git_url", %{
           agent_id: agent.agent_id
         })}

      true ->
        # Do basic validation here; Git helper will also validate.
        if String.match?(url, ~r/[\s\0]/) do
          {:error, error(:invalid_git_url, "git_url contains whitespace/control characters")}
        else
          {:ok, url}
        end
    end
  end

  defp validate_agent_id(agent_id) when is_binary(agent_id) do
    agent_id = String.trim(agent_id)

    cond do
      agent_id == "" ->
        {:error, error(:invalid_agent_id, "agent_id is empty")}

      byte_size(agent_id) > 200 ->
        {:error, error(:invalid_agent_id, "agent_id is too long")}

      not String.match?(agent_id, ~r/^[A-Za-z0-9][A-Za-z0-9._-]*$/) ->
        {:error,
         error(:invalid_agent_id, "agent_id has invalid format", %{
           expected: "^[A-Za-z0-9][A-Za-z0-9._-]*$"
         })}

      true ->
        :ok
    end
  end

  # ----------------------------------------------------------------------------
  # Audit helpers (best-effort)
  # ----------------------------------------------------------------------------

  defp emit_audit(false, _attrs), do: :ok

  defp emit_audit(true, attrs) when is_map(attrs) do
    # Best-effort: audit failures should not block installs.
    try do
      _ =
        AuditLog.append(%{
          event_type: Map.fetch!(attrs, :event_type),
          actor_type: Map.fetch!(attrs, :actor_type),
          actor_id: Map.fetch!(attrs, :actor_id),
          subject_type: Map.fetch!(attrs, :subject_type),
          subject_id: Map.fetch!(attrs, :subject_id),
          correlation_id: Map.get(attrs, :correlation_id),
          causation_id: Map.get(attrs, :causation_id),
          severity: Map.get(attrs, :severity),
          metadata: Map.get(attrs, :metadata, %{})
        })

      :ok
    rescue
      e ->
        Logger.debug("audit append failed (ignored): #{Exception.message(e)}")
        :ok
    end
  end

  defp summarize_steps(%{} = steps) do
    # Avoid persisting large outputs in audit metadata; keep only command/exit_code.
    # Steps may be nil (e.g., no checkout when no ref was requested).
    steps
    |> steps_to_map()
    |> Enum.reduce(%{}, fn {k, v}, acc ->
      if is_map(v) do
        Map.put(acc, k, %{
          command: Map.get(v, :command) || Map.get(v, "command"),
          exit_code: Map.get(v, :exit_code) || Map.get(v, "exit_code")
        })
      else
        acc
      end
    end)
  end

  defp steps_to_map(%{clone: _, fetch: _, checkout: _} = steps), do: steps

  defp steps_to_map(other) when is_map(other) do
    # Support steps returned by helper as a map already.
    other
  end

  defp safe_details(%{} = details) do
    # Ensure we never persist huge nested data here; keep it shallow.
    details
    |> Map.take([:command, :cwd, :exit_code, :timeout_ms])
    |> Enum.into(%{}, fn {k, v} -> {to_string(k), v} end)
  end

  defp safe_details(_), do: %{}

  # ----------------------------------------------------------------------------
  # Small normalization utilities
  # ----------------------------------------------------------------------------

  defp normalize_actor_type(v) when v in [:human, :system, :agent], do: v

  defp normalize_actor_type(v) do
    v =
      v
      |> to_string()
      |> String.trim()
      |> String.downcase()

    case v do
      "human" -> :human
      "agent" -> :agent
      _ -> :system
    end
  end

  defp normalize_optional_string(nil), do: nil

  defp normalize_optional_string(v) when is_binary(v) do
    v = String.trim(v)
    if v == "", do: nil, else: v
  end

  defp normalize_optional_string(v), do: v |> to_string() |> normalize_optional_string()

  defp maybe_put(opts, _k, nil), do: opts
  defp maybe_put(opts, k, v), do: Keyword.put(opts, k, v)

  defp error(code, message, details \\ %{})
       when is_atom(code) and is_binary(message) and is_map(details) do
    %Error{code: code, message: message, details: details}
  end
end
