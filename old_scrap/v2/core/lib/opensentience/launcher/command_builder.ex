defmodule OpenSentience.Launcher.CommandBuilder do
  @moduledoc """
  Builds a safe OS command invocation from an agent manifest `entrypoint`.

  Phase 1 intent:
  - Launch agents as **separate OS processes** (no in-process code loading).
  - Construct commands without invoking a shell (i.e., suitable for `System.cmd/3` or Ports).
  - Be strict and explicit about what we accept from `opensentience.agent.json`.

  Manifest entrypoint shape (per portfolio standard):
    - `entrypoint.type`: `"mix_task" | "release" | "command"`
    - `entrypoint.value`: string

  Important semantics:
  - This module **does not** split `entrypoint.value` into argv. It treats `value` as:
    - for `"mix_task"`: the Mix task name (argv becomes `["mix", <task>]`)
    - for `"command"` / `"release"`: the executable path/name (argv becomes `[<value>]`)
  - If you need arguments, provide them via `opts[:extra_args]` (list of strings).

  Security notes:
  - Even without a shell, running an agent is a trust boundary. This module only builds
    a command struct; it does not execute it.
  - Callers should avoid persisting raw argv/env to durable logs if it might contain secrets.
    Use `safe_summary/1` when you need something durable.
  """

  defmodule Error do
    @moduledoc "Structured, secret-safe error for launcher command building."
    @enforce_keys [:code, :message]
    defstruct [:code, :message, details: %{}]

    @type t :: %__MODULE__{
            code: atom(),
            message: String.t(),
            details: map()
          }
  end

  defmodule Command do
    @moduledoc """
    A fully-specified command invocation suitable for an OS subprocess.

    Fields:
    - `cmd`: executable (string) passed as argv0 to `exec`
    - `args`: argv list **excluding** argv0 (list of strings)
    - `cwd`: working directory (string or nil)
    - `env`: environment overrides (list of `{key, value}` tuples)
    - `kind`: `:mix_task | :release | :command` (normalized)
    """
    @enforce_keys [:cmd, :args, :kind]
    defstruct [:cmd, :args, :cwd, :env, :kind]

    @type t :: %__MODULE__{
            cmd: String.t(),
            args: [String.t()],
            cwd: String.t() | nil,
            env: [{String.t(), String.t()}],
            kind: :mix_task | :release | :command
          }
  end

  @type entrypoint_input :: map()
  @type build_opts :: [
          cwd: String.t() | nil,
          env: [{String.t(), String.t()}] | map() | Keyword.t(),
          extra_args: [String.t()],
          allow_types: [:mix_task | :release | :command]
        ]

  @default_allow_types [:mix_task, :release, :command]

  # Allow overriding the `mix` executable used for `mix_task` entrypoints.
  #
  # This is useful when the Core process runs in an environment where `mix` is not
  # on PATH (e.g., different shell/service manager PATH than your interactive terminal).
  #
  # Example:
  #   OPENSENTIENCE_MIX_BIN=/usr/local/bin/mix
  defp mix_bin do
    case System.get_env("OPENSENTIENCE_MIX_BIN") do
      v when is_binary(v) ->
        v = String.trim(v)
        if v == "", do: "mix", else: v

      _ ->
        "mix"
    end
  end

  defp mix_task_cmd_and_args(task, extra_args) when is_binary(task) and is_list(extra_args) do
    mix = mix_bin()

    # If OPENSENTIENCE_MIX_BIN points at an absolute mix *script* path, prefer running it via
    # the absolute `elixir` in the same directory:
    #
    #   /path/to/elixir /path/to/mix <task> ...
    #
    # This avoids relying on the mix script's shebang:
    #   #!/usr/bin/env elixir
    #
    # and avoids relying on `elixir` being present on PATH.
    if is_binary(mix) and String.contains?(mix, "/") and Path.basename(mix) == "mix" do
      dir = Path.dirname(mix)
      elixir = Path.join(dir, "elixir")

      cmd =
        if File.exists?(elixir) and File.regular?(elixir) do
          elixir
        else
          "elixir"
        end

      {cmd, [mix, task | extra_args]}
    else
      {mix, [task | extra_args]}
    end
  end

  @doc """
  Builds a `Command` from an entrypoint map.

  Options:
  - `:cwd` - working directory for the launched process (optional)
  - `:env` - environment overrides to pass to the process (optional; map/keyword/list)
  - `:extra_args` - argv to append after the entrypoint-derived argv (default: `[]`)
  - `:allow_types` - restrict which entrypoint kinds are permitted (default: all)

  Returns:
  - `{:ok, %Command{...}}`
  - `{:error, %Error{...}}`
  """
  @spec build(entrypoint_input(), build_opts()) :: {:ok, Command.t()} | {:error, Error.t()}
  def build(entrypoint, opts \\ []) when is_map(entrypoint) and is_list(opts) do
    allow_types = Keyword.get(opts, :allow_types, @default_allow_types) |> normalize_allow_types()

    with {:ok, type} <- fetch_type(entrypoint),
         {:ok, kind} <- normalize_type(type),
         :ok <- ensure_type_allowed(kind, allow_types),
         {:ok, value} <- fetch_value(entrypoint),
         {:ok, value} <- validate_value(kind, value),
         {:ok, extra_args} <- normalize_extra_args(Keyword.get(opts, :extra_args, [])),
         {:ok, cwd} <- normalize_cwd(Keyword.get(opts, :cwd)),
         {:ok, env} <- normalize_env(Keyword.get(opts, :env, [])) do
      case kind do
        :mix_task ->
          # value is the task name; args are task + extra args
          {cmd, args} = mix_task_cmd_and_args(value, extra_args)

          {:ok,
           %Command{
             kind: :mix_task,
             cmd: cmd,
             args: args,
             cwd: cwd,
             env: env
           }}

        :command ->
          {:ok,
           %Command{
             kind: :command,
             cmd: value,
             args: extra_args,
             cwd: cwd,
             env: env
           }}

        :release ->
          # Phase 1 doesn't standardize release argv semantics; treat `value` as the executable.
          # Callers can add `extra_args` like ["start"] if they want.
          {:ok,
           %Command{
             kind: :release,
             cmd: value,
             args: extra_args,
             cwd: cwd,
             env: env
           }}
      end
    end
  end

  def build(_entrypoint, _opts) do
    {:error, error(:invalid_entrypoint, "entrypoint must be a map")}
  end

  @doc """
  Produces a durable, secret-minimizing summary of a `Command`.

  Use this for audit metadata. Do **not** store raw env or full argv if it might
  include secrets.

  The summary includes:
  - `kind`
  - `cmd`
  - `args_count`
  - `argv_preview` (bounded)
  """
  @spec safe_summary(Command.t()) :: map()
  def safe_summary(%Command{} = cmd) do
    argv = [cmd.cmd | cmd.args]

    %{
      kind: cmd.kind,
      cmd: cmd.cmd,
      args_count: length(cmd.args),
      argv_preview: argv_preview(argv, 6, 120)
    }
  end

  @doc """
  Formats a command for *non-durable* debugging output (still bounded).

  This should not be used for durable logs if `args` may contain secrets.
  """
  @spec format_for_debug(Command.t()) :: String.t()
  def format_for_debug(%Command{} = cmd) do
    [cmd.cmd | cmd.args]
    |> Enum.map(&debug_quote/1)
    |> Enum.join(" ")
    |> String.slice(0, 2_000)
  end

  # ----------------------------------------------------------------------------
  # Entry point parsing / validation
  # ----------------------------------------------------------------------------

  defp fetch_type(%{} = entrypoint) do
    type = Map.get(entrypoint, "type") || Map.get(entrypoint, :type)

    if is_binary(type) or is_atom(type) do
      {:ok, type}
    else
      {:error, error(:missing_type, "entrypoint.type is required", %{field: "type"})}
    end
  end

  defp fetch_value(%{} = entrypoint) do
    value = Map.get(entrypoint, "value") || Map.get(entrypoint, :value)

    if is_binary(value) or is_atom(value) do
      {:ok, value |> to_string()}
    else
      {:error, error(:missing_value, "entrypoint.value is required", %{field: "value"})}
    end
  end

  defp normalize_type(type) when is_atom(type), do: normalize_type(Atom.to_string(type))

  defp normalize_type(type) when is_binary(type) do
    t =
      type
      |> String.trim()
      |> String.downcase()

    case t do
      "mix_task" -> {:ok, :mix_task}
      "release" -> {:ok, :release}
      "command" -> {:ok, :command}
      other -> {:error, error(:invalid_type, "Unsupported entrypoint.type", %{type: other})}
    end
  end

  defp normalize_type(_),
    do: {:error, error(:invalid_type, "entrypoint.type must be a string", %{})}

  defp ensure_type_allowed(kind, allow_types) when is_list(allow_types) do
    if kind in allow_types do
      :ok
    else
      {:error,
       error(:type_not_allowed, "entrypoint.type is not allowed by policy", %{
         kind: kind,
         allowed: allow_types
       })}
    end
  end

  defp validate_value(kind, value) when is_binary(value) do
    value = String.trim(value)

    cond do
      value == "" ->
        {:error, error(:invalid_value, "entrypoint.value must not be empty", %{kind: kind})}

      byte_size(value) > 4_096 ->
        {:error, error(:invalid_value, "entrypoint.value is too long", %{max: 4096, kind: kind})}

      String.contains?(value, "\u0000") ->
        {:error, error(:invalid_value, "entrypoint.value contains NUL", %{kind: kind})}

      String.contains?(value, ["\n", "\r"]) ->
        {:error, error(:invalid_value, "entrypoint.value contains newlines", %{kind: kind})}

      kind == :mix_task and not String.match?(value, ~r/^[A-Za-z0-9][A-Za-z0-9._:-]*$/) ->
        # Mix task names are simple tokens; disallow whitespace and weird characters.
        {:error,
         error(:invalid_value, "mix_task entrypoint.value has invalid format", %{
           expected: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
           kind: kind
         })}

      true ->
        {:ok, value}
    end
  end

  defp validate_value(kind, value),
    do:
      {:error,
       error(:invalid_value, "entrypoint.value must be a string", %{kind: kind, got: value})}

  # ----------------------------------------------------------------------------
  # Opt normalization
  # ----------------------------------------------------------------------------

  defp normalize_extra_args(args) when is_list(args) do
    args
    |> Enum.reduce_while({:ok, []}, fn a, {:ok, acc} ->
      cond do
        is_nil(a) ->
          {:cont, {:ok, acc}}

        true ->
          s = a |> to_string() |> String.trim()

          cond do
            s == "" ->
              {:cont, {:ok, acc}}

            byte_size(s) > 4_096 ->
              {:halt,
               {:error,
                error(:invalid_args, "extra_args contains an overly long arg", %{max: 4096})}}

            String.contains?(s, "\u0000") or String.contains?(s, ["\n", "\r"]) ->
              {:halt,
               {:error,
                error(:invalid_args, "extra_args contains invalid characters", %{
                  arg: "[redacted]"
                })}}

            true ->
              {:cont, {:ok, acc ++ [s]}}
          end
      end
    end)
  end

  defp normalize_extra_args(_),
    do: {:error, error(:invalid_args, "extra_args must be a list", %{})}

  defp normalize_cwd(nil), do: {:ok, nil}

  defp normalize_cwd(cwd) do
    cwd =
      cwd
      |> to_string()
      |> String.trim()

    cond do
      cwd == "" ->
        {:ok, nil}

      byte_size(cwd) > 4_096 ->
        {:error, error(:invalid_cwd, "cwd is too long", %{max: 4096})}

      String.contains?(cwd, "\u0000") or String.contains?(cwd, ["\n", "\r"]) ->
        {:error, error(:invalid_cwd, "cwd contains invalid characters", %{})}

      true ->
        {:ok, cwd}
    end
  end

  defp normalize_env(%{} = map) do
    map
    |> Enum.map(fn {k, v} -> {k, v} end)
    |> normalize_env()
  end

  defp normalize_env(list) when is_list(list) do
    list
    |> Enum.reduce_while({:ok, []}, fn
      {k, v}, {:ok, acc} ->
        key = k |> to_string() |> String.trim()
        val = v |> to_string()

        cond do
          key == "" ->
            {:cont, {:ok, acc}}

          String.contains?(key, "\u0000") or String.contains?(val, "\u0000") ->
            {:halt, {:error, error(:invalid_env, "env contains NUL", %{})}}

          String.contains?(key, ["\n", "\r"]) or String.contains?(val, ["\n", "\r"]) ->
            {:halt, {:error, error(:invalid_env, "env contains newlines", %{})}}

          byte_size(key) > 200 ->
            {:halt, {:error, error(:invalid_env, "env key is too long", %{max: 200})}}

          byte_size(val) > 20_000 ->
            {:halt, {:error, error(:invalid_env, "env value is too long", %{max: 20000})}}

          true ->
            {:cont, {:ok, acc ++ [{key, val}]}}
        end

      other, {:ok, _acc} ->
        {:halt,
         {:error, error(:invalid_env, "env must be a list of {key, value} pairs", %{got: other})}}
    end)
  end

  defp normalize_env(_),
    do: {:error, error(:invalid_env, "env must be a map or list", %{})}

  defp normalize_allow_types(list) when is_list(list) do
    list
    |> Enum.map(fn
      :mix_task -> :mix_task
      :release -> :release
      :command -> :command
      "mix_task" -> :mix_task
      "release" -> :release
      "command" -> :command
      other -> other
    end)
    |> Enum.filter(&(&1 in @default_allow_types))
    |> case do
      [] -> @default_allow_types
      allow -> allow
    end
  end

  defp normalize_allow_types(_), do: @default_allow_types

  # ----------------------------------------------------------------------------
  # Formatting helpers
  # ----------------------------------------------------------------------------

  defp argv_preview(argv, max_items, max_chars) when is_list(argv) do
    argv =
      argv
      |> Enum.map(&to_string/1)
      |> Enum.map(&String.replace(&1, "\u0000", ""))
      |> Enum.map(&String.replace(&1, ~r/\r\n|\r|\n/, " "))
      |> Enum.map(&String.trim/1)

    shown = argv |> Enum.take(max_items)
    preview = shown |> Enum.join(" ")

    truncated =
      cond do
        length(argv) > max_items -> true
        String.length(preview) > max_chars -> true
        true -> false
      end

    preview = String.slice(preview, 0, max_chars)

    if truncated do
      preview <> " …"
    else
      preview
    end
  end

  defp debug_quote(s) when is_binary(s) do
    s = s |> String.replace("\u0000", "") |> String.replace(~r/\r\n|\r|\n/, " ") |> String.trim()

    if String.contains?(s, [" ", "\t"]) do
      ~s("#{String.replace(s, "\"", "\\\"")}")
    else
      s
    end
  end

  defp debug_quote(other), do: other |> to_string() |> debug_quote()

  # ----------------------------------------------------------------------------
  # Error helpers
  # ----------------------------------------------------------------------------

  defp error(code, message, details \\ %{})
       when is_atom(code) and is_binary(message) and is_map(details) do
    %Error{code: code, message: message, details: details}
  end
end
