defmodule OpenSentience.Web.Views do
  @moduledoc """
  Minimal HTML view helpers for the Phase 1 localhost admin UI.

  This module intentionally avoids Phoenix dependencies. It focuses on:
  - safe HTML escaping
  - small helpers to build consistent pages
  - defensive formatting (bounded output, no secret enrichment)

  Return values are iodata (preferred) or binaries.
  """

  @type iodata_like :: iodata() | String.t()

  # ----------------------------------------------------------------------------
  # Escaping / safety
  # ----------------------------------------------------------------------------

  @doc """
  HTML-escapes a value for safe insertion into element text or attribute values.

  `nil` becomes `""`.
  """
  @spec h(term()) :: String.t()
  def h(nil), do: ""

  def h(value) when is_binary(value) do
    value
    |> String.replace("&", "&amp;")
    |> String.replace("<", "&lt;")
    |> String.replace(">", "&gt;")
    |> String.replace("\"", "&quot;")
    |> String.replace("'", "&#39;")
  end

  def h(value) do
    value
    |> to_string()
    |> h()
  end

  @doc """
  Bounds a string to `max_len` characters (best-effort UTF-8), returning `""` for nil.
  """
  @spec truncate(String.t() | nil, non_neg_integer()) :: String.t()
  def truncate(nil, _max_len), do: ""

  def truncate(str, max_len) when is_binary(str) and is_integer(max_len) and max_len >= 0 do
    if String.length(str) <= max_len, do: str, else: String.slice(str, 0, max_len)
  end

  @doc """
  Formats a DateTime-ish value as ISO8601, else returns `""`.
  """
  @spec dt_iso(term()) :: String.t()
  def dt_iso(%DateTime{} = dt), do: DateTime.to_iso8601(dt)
  def dt_iso(%NaiveDateTime{} = ndt), do: NaiveDateTime.to_iso8601(ndt)
  def dt_iso(_), do: ""

  # ----------------------------------------------------------------------------
  # HTML building blocks
  # ----------------------------------------------------------------------------

  @doc """
  Wraps content in a basic HTML page layout.

  Options:
  - `:title` (string)
  - `:active_nav` (atom) one of `:agents | :audit | nil`
  """
  @spec page(iodata_like(), Keyword.t()) :: String.t()
  def page(content, opts \\ []) do
    title = opts |> Keyword.get(:title, "OpenSentience Core") |> h()
    active = Keyword.get(opts, :active_nav)

    doc = [
      "<!doctype html>",
      "<html lang=\"en\">",
      "<head>",
      "<meta charset=\"utf-8\"/>",
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>",
      "<title>",
      title,
      "</title>",
      "<style>",
      base_css(),
      "</style>",
      "</head>",
      "<body>",
      header_nav(active),
      "<main class=\"container\">",
      content,
      "</main>",
      "<footer class=\"footer container\">",
      "<div class=\"muted\">",
      "OpenSentience Core (Phase 1)",
      "</div>",
      "</footer>",
      "</body>",
      "</html>"
    ]

    IO.iodata_to_binary(doc)
  end

  @doc """
  Renders a simple alert box.

  `kind` is `:info | :warn | :error`.
  """
  @spec alert(atom(), iodata_like()) :: iodata()
  def alert(kind, body) when kind in [:info, :warn, :error] do
    class =
      case kind do
        :info -> "alert info"
        :warn -> "alert warn"
        :error -> "alert error"
      end

    ["<div class=\"", class, "\">", body, "</div>"]
  end

  @doc """
  Generates an anchor tag.

  `href` is escaped.
  `text` is escaped.
  """
  @spec link(String.t(), term(), Keyword.t()) :: iodata()
  def link(href, text, opts \\ []) when is_binary(href) do
    class =
      case Keyword.get(opts, :class) do
        nil -> nil
        v -> h(v)
      end

    attrs =
      []
      |> maybe_attr("class", class)
      |> maybe_attr("href", href)

    ["<a", attrs, ">", h(text), "</a>"]
  end

  @doc """
  Generates a small badge span. Useful for agent status.

  `tone`: `:neutral | :good | :warn | :bad`
  """
  @spec badge(term(), atom()) :: iodata()
  def badge(text, tone \\ :neutral) do
    cls =
      case tone do
        :good -> "badge good"
        :warn -> "badge warn"
        :bad -> "badge bad"
        _ -> "badge"
      end

    ["<span class=\"", cls, "\">", h(text), "</span>"]
  end

  @doc """
  Best-effort CSRF hidden input tag.

  If `Plug.CSRFProtection` is not available, returns `""`.
  """
  @spec csrf_input_tag() :: iodata()
  def csrf_input_tag do
    if Code.ensure_loaded?(Plug.CSRFProtection) and
         function_exported?(Plug.CSRFProtection, :get_csrf_token, 0) do
      token = Plug.CSRFProtection.get_csrf_token()
      ["<input type=\"hidden\" name=\"_csrf_token\" value=\"", h(token), "\"/>"]
    else
      ""
    end
  end

  @doc """
  Renders a key/value definition list (`<dl>`).

  Values are HTML-escaped.
  """
  @spec dl([{term(), term()}]) :: iodata()
  def dl(pairs) when is_list(pairs) do
    items =
      Enum.map(pairs, fn {k, v} ->
        [
          "<div class=\"dl-row\">",
          "<dt>",
          h(k),
          "</dt>",
          "<dd>",
          h(v),
          "</dd>",
          "</div>"
        ]
      end)

    ["<dl class=\"dl\">", items, "</dl>"]
  end

  # ----------------------------------------------------------------------------
  # Internal helpers
  # ----------------------------------------------------------------------------

  defp maybe_attr(attrs_iodata, _k, nil), do: attrs_iodata

  defp maybe_attr(attrs_iodata, k, v) when is_binary(k) do
    [attrs_iodata, " ", k, "=\"", h(v), "\""]
  end

  defp header_nav(active) do
    nav_link = fn label, href, key ->
      cls =
        if active == key do
          "nav-link active"
        else
          "nav-link"
        end

      ["<a class=\"", cls, "\" href=\"", h(href), "\">", h(label), "</a>"]
    end

    [
      "<header class=\"header\">",
      "<div class=\"container header-inner\">",
      "<div class=\"brand\">OpenSentience</div>",
      "<nav class=\"nav\">",
      nav_link.("Agents", "/agents", :agents),
      nav_link.("Audit", "/audit", :audit),
      "</nav>",
      "</div>",
      "</header>"
    ]
  end

  defp base_css do
    """
    :root {
      --bg: #0b0d10;
      --panel: #11151b;
      --text: #e8eef6;
      --muted: #a7b3c2;
      --border: #243041;
      --link: #7fb1ff;
      --good: #2ecc71;
      --warn: #f1c40f;
      --bad: #e74c3c;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.4 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
    }

    a { color: var(--link); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .container { max-width: 1100px; margin: 0 auto; padding: 16px; }

    .header { border-bottom: 1px solid var(--border); background: rgba(17,21,27,0.7); backdrop-filter: blur(8px); }
    .header-inner { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .brand { font-weight: 700; letter-spacing: 0.2px; }
    .nav { display: flex; gap: 10px; }
    .nav-link { padding: 6px 10px; border-radius: 8px; }
    .nav-link.active { background: var(--panel); border: 1px solid var(--border); }

    main { padding-top: 12px; }

    .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 12px; }
    .panel + .panel { margin-top: 12px; }

    .muted { color: var(--muted); }
    .footer { padding-bottom: 28px; }

    .alert { border-radius: 12px; padding: 10px 12px; border: 1px solid var(--border); background: rgba(255,255,255,0.04); }
    .alert.info { border-color: rgba(127,177,255,0.35); }
    .alert.warn { border-color: rgba(241,196,15,0.35); }
    .alert.error { border-color: rgba(231,76,60,0.35); }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.04);
      font-size: 12px;
      color: var(--muted);
      white-space: nowrap;
    }
    .badge.good { border-color: rgba(46,204,113,0.35); color: #baf3cf; }
    .badge.warn { border-color: rgba(241,196,15,0.35); color: #fff1b2; }
    .badge.bad  { border-color: rgba(231,76,60,0.35); color: #ffd0cb; }

    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
    th { color: var(--muted); font-weight: 600; }
    tr:hover td { background: rgba(255,255,255,0.02); }

    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; }

    .dl { margin: 0; }
    .dl-row { display: grid; grid-template-columns: 200px 1fr; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--border); }
    .dl-row:last-child { border-bottom: none; }
    dt { color: var(--muted); }
    dd { margin: 0; }
    """
  end
end
