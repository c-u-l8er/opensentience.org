defmodule OpenSentience.Discovery.ManifestReader do
  @moduledoc """
  Safe reader + basic validator for `opensentience.agent.json`.

  Phase 1 requirements:
  - Discovery must not execute agent code.
  - Manifest parsing must be safe, bounded, and produce actionable errors.
  - Compute a stable `manifest_hash` for change detection / drift re-approval.

  This module:
  - reads a manifest from disk (bounded by `:max_bytes`)
  - parses JSON (Jason)
  - validates a minimal required shape/fields
  - returns a normalized map plus derived hashes

  It intentionally does **not**:
  - run `mix`, `git`, or any external commands
  - evaluate code
  - follow symlinks in any special way (it reads the file path given)
  """

  @manifest_filename "opensentience.agent.json"
  @default_max_bytes 256_000

  defmodule Error do
    @moduledoc """
    Structured, secret-safe error for manifest reading/validation.
    """
    @enforce_keys [:code, :message]
    defstruct [:code, :message, details: %{}]

    @type t :: %__MODULE__{
            code: atom(),
            message: String.t(),
            details: map()
          }
  end

  @type manifest :: %{
          required(:agent_id) => String.t(),
          optional(:name) => String.t() | nil,
          optional(:version) => String.t() | nil,
          optional(:description) => String.t() | nil,
          required(:permissions) => [String.t()],
          required(:entrypoint) => map(),
          required(:manifest_path) => String.t(),
          required(:manifest_hash) => String.t(),
          required(:requested_permissions_hash) => String.t(),
          required(:raw) => map()
        }

  @doc """
  Reads and validates a manifest from `path`.

  Options:
  - `:max_bytes` (pos_integer, default #{@default_max_bytes}): maximum file size to read.
  - `:require_filename` (boolean, default true): require file basename to be `#{@manifest_filename}`.

  Returns:
  - `{:ok, manifest_map}` on success
  - `{:error, %Error{...}}` on failure
  """
  @spec read(String.t(), Keyword.t()) :: {:ok, manifest()} | {:error, Error.t()}
  def read(path, opts \\ []) when is_binary(path) and is_list(opts) do
    with {:ok, opts} <- normalize_opts(opts),
         {:ok, abs_path} <- normalize_path(path),
         :ok <- enforce_filename(abs_path, opts),
         {:ok, contents} <- read_bounded(abs_path, opts.max_bytes),
         {:ok, raw} <- decode_json_object(contents),
         {:ok, normalized} <- validate_and_normalize(raw, abs_path, contents) do
      {:ok, normalized}
    end
  end

  @doc """
  Computes a stable hash for a requested permissions list (for drift detection).

  This is *not* the manifest hash; it is specifically for the permissions list.

  It uses SHA-256 over a canonical JSON encoding of the (trimmed) permission strings.
  """
  @spec requested_permissions_hash([String.t()]) :: String.t()
  def requested_permissions_hash(perms) when is_list(perms) do
    perms =
      perms
      |> Enum.map(&normalize_string!/1)

    # Canonical enough for our Phase 1 use: Jason encodes a list deterministically.
    json = Jason.encode!(perms)
    sha256_hex(json)
  end

  @doc """
  Returns the canonical manifest filename discovery should look for.
  """
  @spec manifest_filename() :: String.t()
  def manifest_filename, do: @manifest_filename

  # ----------------------------------------------------------------------------
  # I/O (bounded)
  # ----------------------------------------------------------------------------

  defp read_bounded(path, max_bytes) when is_binary(path) and is_integer(max_bytes) do
    case File.stat(path) do
      {:ok, %File.Stat{type: :regular, size: size}} ->
        cond do
          size <= 0 ->
            {:error,
             error(:empty_manifest, "Manifest file is empty", %{
               manifest_path: path
             })}

          size > max_bytes ->
            {:error,
             error(:manifest_too_large, "Manifest file is too large", %{
               manifest_path: path,
               size_bytes: size,
               max_bytes: max_bytes
             })}

          true ->
            case File.read(path) do
              {:ok, contents} ->
                {:ok, contents}

              {:error, reason} ->
                {:error, error(:read_failed, "Failed to read manifest file", %{reason: reason})}
            end
        end

      {:ok, %File.Stat{type: other}} ->
        {:error,
         error(:not_a_file, "Manifest path is not a regular file", %{
           manifest_path: path,
           type: other
         })}

      {:error, reason} ->
        {:error, error(:stat_failed, "Failed to stat manifest file", %{reason: reason})}
    end
  end

  # ----------------------------------------------------------------------------
  # Parsing
  # ----------------------------------------------------------------------------

  defp decode_json_object(contents) when is_binary(contents) do
    case Jason.decode(contents) do
      {:ok, %{} = obj} ->
        {:ok, obj}

      {:ok, other} ->
        {:error,
         error(:invalid_manifest_shape, "Manifest JSON must be an object", %{
           got: type_of(other)
         })}

      {:error, %Jason.DecodeError{} = e} ->
        {:error,
         error(:invalid_json, "Manifest is not valid JSON", %{
           position: Map.get(e, :position),
           data: Map.get(e, :data)
         })}
    end
  end

  # ----------------------------------------------------------------------------
  # Validation / normalization
  # ----------------------------------------------------------------------------

  defp validate_and_normalize(raw, manifest_path, contents)
       when is_map(raw) and is_binary(manifest_path) and is_binary(contents) do
    # Accept both:
    # - spec field: "id"
    # - legacy field: "agent_id"
    #
    # Normalize to "agent_id" for internal usage.
    raw = Map.put_new(raw, "agent_id", Map.get(raw, "id"))

    with {:ok, agent_id} <-
           require_string(raw, "agent_id", max: 200, pattern: ~r/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
         {:ok, name} <- optional_string(raw, "name", max: 200),
         {:ok, version} <- optional_string(raw, "version", max: 100),
         {:ok, description} <- optional_string(raw, "description", max: 2_000),
         {:ok, permissions} <-
           require_string_list(raw, "permissions", max_len: 500, item_max: 300),
         {:ok, entrypoint} <- require_map(raw, "entrypoint"),
         :ok <- validate_entrypoint(entrypoint) do
      manifest_hash = sha256_hex(contents)

      normalized = %{
        agent_id: agent_id,
        name: name,
        version: version,
        description: description,
        permissions: permissions,
        entrypoint: entrypoint,
        manifest_path: manifest_path,
        manifest_hash: manifest_hash,
        requested_permissions_hash: requested_permissions_hash(permissions),
        raw: raw
      }

      {:ok, normalized}
    end
  end

  defp validate_entrypoint(%{} = entrypoint) do
    type = Map.get(entrypoint, "type")

    cond do
      not is_binary(type) or String.trim(type) == "" ->
        {:error,
         error(:invalid_entrypoint, "entrypoint.type is required", %{
           entrypoint: scrub(entrypoint)
         })}

      true ->
        # Phase 1 launcher will likely support a minimal set (e.g., mix_task first),
        # but discovery should not be overly strict yet. We only sanity-check that
        # type exists and is string-y.
        :ok
    end
  end

  # ----------------------------------------------------------------------------
  # Option/path normalization
  # ----------------------------------------------------------------------------

  defp normalize_opts(opts) do
    # Avoid raising; return structured error if invalid.
    schema = [
      max_bytes: [type: :pos_integer, default: @default_max_bytes],
      require_filename: [type: :boolean, default: true]
    ]

    case NimbleOptions.validate(opts, schema) do
      {:ok, validated} ->
        {:ok, %{max_bytes: validated[:max_bytes], require_filename: validated[:require_filename]}}

      {:error, %NimbleOptions.ValidationError{} = e} ->
        {:error,
         error(:invalid_options, "Invalid manifest reader options", %{
           message: Exception.message(e)
         })}
    end
  end

  defp normalize_path(path) when is_binary(path) do
    path = Path.expand(path)

    if String.trim(path) == "" do
      {:error, error(:invalid_path, "Manifest path is empty")}
    else
      {:ok, path}
    end
  end

  defp enforce_filename(_path, %{require_filename: false}), do: :ok

  defp enforce_filename(path, %{require_filename: true}) do
    if Path.basename(path) == @manifest_filename do
      :ok
    else
      {:error,
       error(:unexpected_filename, "Manifest filename must be #{@manifest_filename}", %{
         manifest_path: path,
         basename: Path.basename(path)
       })}
    end
  end

  # ----------------------------------------------------------------------------
  # Field helpers
  # ----------------------------------------------------------------------------

  defp require_string(map, key, opts) when is_map(map) and is_binary(key) and is_list(opts) do
    case Map.fetch(map, key) do
      {:ok, value} ->
        value = normalize_string(value)

        cond do
          value == nil ->
            {:error, error(:missing_field, "Required field #{key} is missing", %{field: key})}

          value == "" ->
            {:error, error(:invalid_field, "Field #{key} must not be empty", %{field: key})}

          (max = Keyword.get(opts, :max)) && byte_size(value) > max ->
            {:error, error(:invalid_field, "Field #{key} is too long", %{field: key, max: max})}

          (pattern = Keyword.get(opts, :pattern)) && not String.match?(value, pattern) ->
            {:error, error(:invalid_field, "Field #{key} has invalid format", %{field: key})}

          true ->
            {:ok, value}
        end

      :error ->
        {:error, error(:missing_field, "Required field #{key} is missing", %{field: key})}
    end
  end

  defp optional_string(map, key, opts) when is_map(map) and is_binary(key) and is_list(opts) do
    case Map.fetch(map, key) do
      :error ->
        {:ok, nil}

      {:ok, value} ->
        value = normalize_string(value)

        cond do
          value == nil or value == "" ->
            {:ok, nil}

          (max = Keyword.get(opts, :max)) && byte_size(value) > max ->
            {:error, error(:invalid_field, "Field #{key} is too long", %{field: key, max: max})}

          true ->
            {:ok, value}
        end
    end
  end

  defp require_string_list(map, key, opts)
       when is_map(map) and is_binary(key) and is_list(opts) do
    case Map.fetch(map, key) do
      {:ok, list} when is_list(list) ->
        max_len = Keyword.get(opts, :max_len, 500)
        item_max = Keyword.get(opts, :item_max, 300)

        cond do
          length(list) > max_len ->
            {:error,
             error(:invalid_field, "Field #{key} has too many items", %{
               field: key,
               max_len: max_len
             })}

          true ->
            list
            |> Enum.with_index()
            |> Enum.reduce_while({:ok, []}, fn {item, idx}, {:ok, acc} ->
              item = normalize_string(item)

              cond do
                item == nil or item == "" ->
                  {:halt,
                   {:error,
                    error(:invalid_field, "Field #{key}[#{idx}] must be a non-empty string", %{
                      field: key,
                      index: idx
                    })}}

                byte_size(item) > item_max ->
                  {:halt,
                   {:error,
                    error(:invalid_field, "Field #{key}[#{idx}] is too long", %{
                      field: key,
                      index: idx,
                      max: item_max
                    })}}

                String.contains?(item, ["\u0000", "\n", "\r"]) ->
                  {:halt,
                   {:error,
                    error(:invalid_field, "Field #{key}[#{idx}] contains invalid characters", %{
                      field: key,
                      index: idx
                    })}}

                true ->
                  {:cont, {:ok, [item | acc]}}
              end
            end)
            |> case do
              {:ok, acc} ->
                # Preserve original order.
                {:ok, Enum.reverse(acc)}

              {:error, _} = err ->
                err
            end
        end

      {:ok, _other} ->
        {:error, error(:invalid_field, "Field #{key} must be a list of strings", %{field: key})}

      :error ->
        {:error, error(:missing_field, "Required field #{key} is missing", %{field: key})}
    end
  end

  defp require_map(map, key) when is_map(map) and is_binary(key) do
    case Map.fetch(map, key) do
      {:ok, %{} = v} ->
        {:ok, v}

      {:ok, _other} ->
        {:error, error(:invalid_field, "Field #{key} must be an object", %{field: key})}

      :error ->
        {:error, error(:missing_field, "Required field #{key} is missing", %{field: key})}
    end
  end

  defp normalize_string(nil), do: nil
  defp normalize_string(value) when is_binary(value), do: String.trim(value)

  defp normalize_string(value) do
    value
    |> to_string()
    |> String.trim()
  rescue
    _ -> nil
  end

  defp normalize_string!(value) when is_binary(value), do: String.trim(value)

  defp normalize_string!(value) do
    value
    |> to_string()
    |> String.trim()
  end

  # ----------------------------------------------------------------------------
  # Hashing
  # ----------------------------------------------------------------------------

  defp sha256_hex(data) when is_binary(data) do
    :crypto.hash(:sha256, data)
    |> Base.encode16(case: :lower)
  end

  # ----------------------------------------------------------------------------
  # Error helpers
  # ----------------------------------------------------------------------------

  defp error(code, message, details \\ %{})
       when is_atom(code) and is_binary(message) and is_map(details) do
    %Error{code: code, message: message, details: details}
  end

  defp type_of(%{}), do: "object"
  defp type_of(list) when is_list(list), do: "array"
  defp type_of(bin) when is_binary(bin), do: "string"
  defp type_of(num) when is_number(num), do: "number"
  defp type_of(true), do: "boolean"
  defp type_of(false), do: "boolean"
  defp type_of(nil), do: "null"
  defp type_of(_), do: "unknown"

  # Ensure we don't accidentally include large or secret-ish payloads in error details.
  defp scrub(%{} = map) do
    map
    |> Map.take(["type", "command", "args", "mix_task", "module", "function"])
  end
end
