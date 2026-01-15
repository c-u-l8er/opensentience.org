defmodule OpenSentience.Prompt do
  @moduledoc """
  Minimal renderer for ACP `ContentBlock[]` prompts.

  ACP user prompts are arrays of "content blocks" (maps) like:

  - `%{"type" => "text", "text" => "..."}`
  - `%{"type" => "resource", "resource" => %{...}}`
  - `%{"type" => "resource_link", "uri" => "...", ...}`

  This module converts that structured prompt into a single plain-text string
  suitable for simple agents or logging. It intentionally does not attempt to
  preserve rich formatting beyond a readable, linearized representation.
  """

  @type content_block :: map()
  @type prompt :: [content_block()]

  @doc """
  Render an ACP `prompt` (list of ContentBlocks) into a single plain-text string.

  Unknown blocks are ignored unless they have a useful textual representation.
  """
  @spec render_prompt(prompt() | nil) :: String.t()
  def render_prompt(nil), do: ""

  def render_prompt(prompt) when is_list(prompt) do
    prompt
    |> Enum.map(&render_block/1)
    |> Enum.reject(&blank?/1)
    |> Enum.join("\n\n")
    |> String.trim()
  end

  def render_prompt(_other), do: ""

  @doc """
  Render a single ACP `ContentBlock` into plain text.
  """
  @spec render_block(content_block()) :: String.t()
  def render_block(%{"type" => "text", "text" => text}) when is_binary(text) do
    text
  end

  # Some clients may send typed resources embedded directly in the prompt.
  # Example from ACP docs:
  # %{
  #   "type" => "resource",
  #   "resource" => %{
  #     "uri" => "file:///abs/path",
  #     "mimeType" => "text/x-python",
  #     "text" => "..."
  #   }
  # }
  def render_block(%{"type" => "resource", "resource" => resource}) when is_map(resource) do
    render_resource(resource)
  end

  # Resource links are references to something (often a file URI) without embedding the content.
  def render_block(%{"type" => "resource_link"} = block) do
    uri = Map.get(block, "uri") || Map.get(block, "url")
    name = Map.get(block, "name") || Map.get(block, "title")

    cond do
      is_binary(name) and is_binary(uri) -> "Resource: #{name}\n#{uri}"
      is_binary(uri) -> "Resource: #{uri}"
      is_binary(name) -> "Resource: #{name}"
      true -> ""
    end
  end

  # Images / audio are optional prompt capabilities; if present, include a placeholder.
  def render_block(%{"type" => "image"} = block) do
    uri =
      get_in(block, ["image", "uri"]) ||
        Map.get(block, "uri") ||
        Map.get(block, "url")

    alt = Map.get(block, "alt") || Map.get(block, "title") || "image"

    cond do
      is_binary(uri) -> "[#{alt}: #{uri}]"
      true -> "[#{alt}]"
    end
  end

  def render_block(%{"type" => "audio"} = block) do
    uri =
      get_in(block, ["audio", "uri"]) ||
        Map.get(block, "uri") ||
        Map.get(block, "url")

    label = Map.get(block, "title") || "audio"

    cond do
      is_binary(uri) -> "[#{label}: #{uri}]"
      true -> "[#{label}]"
    end
  end

  # Fallbacks for partially-specified or unexpected shapes.
  def render_block(%{"type" => type} = block) when is_binary(type) do
    # Try to salvage useful fields.
    cond do
      is_binary(Map.get(block, "text")) -> Map.get(block, "text")
      is_binary(Map.get(block, "content")) -> Map.get(block, "content")
      true -> ""
    end
  end

  def render_block(_), do: ""

  defp render_resource(%{"uri" => uri} = resource) when is_binary(uri) do
    mime = Map.get(resource, "mimeType") || Map.get(resource, "mime_type")
    text = Map.get(resource, "text")

    header =
      case mime do
        m when is_binary(m) -> "Resource (#{m}): #{uri}"
        _ -> "Resource: #{uri}"
      end

    cond do
      is_binary(text) and text != "" ->
        header <> "\n\n" <> text

      true ->
        header
    end
  end

  defp render_resource(resource) when is_map(resource) do
    # If uri is missing, try to surface embedded text.
    text = Map.get(resource, "text")

    cond do
      is_binary(text) -> text
      true -> ""
    end
  end

  defp blank?(s) when is_binary(s), do: String.trim(s) == ""
  defp blank?(_), do: true
end
