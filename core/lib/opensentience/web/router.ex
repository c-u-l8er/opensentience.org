defmodule OpenSentience.Web.Router do
  @moduledoc """
  Minimal Plug router for the Phase 1 localhost-only admin UI skeleton.

  Scope (Phase 1):
  - Read-only pages:
    - Agents list
    - Agent detail
    - Audit log listing
  - Safe-by-default security headers
  - Token gate for any state-changing requests (non-GET/HEAD/OPTIONS)
  - CSRF scaffold (cookie session + Plug.CSRFProtection)

  Notes:
  - Binding to `127.0.0.1:6767` is handled by the HTTP server, not here.
  - This router intentionally avoids executing any agent code. It only reads Core storage.
  """

  use Plug.Router

  import Plug.Conn

  require Logger

  @read_only_methods ~w(GET HEAD OPTIONS)

  # ---------------------------------------------------------------------------
  # Plugs
  # ---------------------------------------------------------------------------

  plug(Plug.RequestId)
  plug(Plug.Logger)

  plug(:put_security_headers)

  # Cookie session is required for CSRF protection.
  # This is local-only admin UI, but we still keep CSRF on by default.
  plug(Plug.Session,
    store: :cookie,
    key: "_opensentience_core_key",
    signing_salt: "opensentience_core_signing_salt",
    same_site: "Lax"
  )

  # Parse request bodies for future state-changing operations (Phase 1+).
  plug(Plug.Parsers,
    parsers: [:urlencoded, :multipart, :json],
    pass: ["*/*"],
    json_decoder: Jason
  )

  # CSRF applies to state-changing requests (POST/PUT/PATCH/DELETE).
  plug(Plug.CSRFProtection)

  # Enforce admin token gate for any non-read-only method (defense-in-depth).
  plug(:require_admin_token_for_state_changes)

  plug(:match)
  plug(:dispatch)

  # ---------------------------------------------------------------------------
  # Routes
  # ---------------------------------------------------------------------------

  get "/" do
    conn
    |> put_resp_header("location", "/agents")
    |> send_resp(302, "")
  end

  get "/health" do
    send_resp(conn, 200, "ok")
  end

  get "/agents" do
    agents =
      try do
        OpenSentience.Catalog.list_agents(limit: 200, order: :last_seen_desc)
      rescue
        err ->
          Logger.warning("agents list failed: #{Exception.message(err)}")
          []
      end

    body =
      layout("Agents", conn, fn csrf ->
        """
        <h1>Agents</h1>

        <p class="muted">
          Read-only admin UI skeleton. Discovery/install/build/enable/run/stop actions are exposed via CLI in Phase 1.
        </p>

        <table>
          <thead>
            <tr>
              <th>Agent ID</th>
              <th>Status</th>
              <th>Name</th>
              <th>Version</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            #{Enum.map_join(agents, "\n", &agent_row_html/1)}
          </tbody>
        </table>

        <hr />

        <p>
          <a href="/audit">View audit log</a>
        </p>

        <meta name="csrf-token" content="#{h(csrf)}" />
        """
      end)

    html(conn, 200, body)
  end

  get "/agents/:agent_id" do
    agent_id = conn.params["agent_id"]

    agent =
      try do
        OpenSentience.Catalog.get_agent(agent_id)
      rescue
        err ->
          Logger.warning("agent lookup failed (agent_id=#{agent_id}): #{Exception.message(err)}")
          nil
      end

    if is_nil(agent) do
      body =
        layout("Agent not found", conn, fn csrf ->
          """
          <h1>Agent not found</h1>
          <p>No agent with id <code>#{h(agent_id)}</code>.</p>
          <p><a href="/agents">Back to agents</a></p>
          <meta name="csrf-token" content="#{h(csrf)}" />
          """
        end)

      html(conn, 404, body)
    else
      approvals =
        try do
          OpenSentience.Enablement.Approvals.list_for_agent(agent.agent_id, limit: 20)
        rescue
          _ -> []
        end

      body =
        layout("Agent #{agent.agent_id}", conn, fn csrf ->
          """
          <h1>Agent: <code>#{h(agent.agent_id)}</code></h1>

          <div class="grid">
            <div>
              <h2>Summary</h2>
              <dl>
                <dt>Status</dt><dd><code>#{h(agent.status || "")}</code></dd>
                <dt>Name</dt><dd>#{h(agent.name || "")}</dd>
                <dt>Version</dt><dd><code>#{h(agent.version || "")}</code></dd>
                <dt>Manifest</dt><dd><code>#{h(agent.manifest_path || "")}</code></dd>
                <dt>Manifest hash</dt><dd><code class="small">#{h(agent.manifest_hash || "")}</code></dd>
                <dt>Discovered at</dt><dd><code>#{h(dt(agent.discovered_at))}</code></dd>
                <dt>Last seen at</dt><dd><code>#{h(dt(agent.last_seen_at))}</code></dd>
              </dl>
            </div>

            <div>
              <h2>Lifecycle</h2>
              <dl>
                <dt>Install path</dt><dd><code>#{h(agent.install_path || "")}</code></dd>
                <dt>Source git URL</dt><dd><code class="small">#{h(agent.source_git_url || "")}</code></dd>
                <dt>Source ref</dt><dd><code>#{h(agent.source_ref || "")}</code></dd>
                <dt>Build status</dt><dd><code>#{h(agent.build_status || "")}</code></dd>
                <dt>Build last at</dt><dd><code>#{h(dt(agent.build_last_at))}</code></dd>
                <dt>Last error</dt><dd><code class="small">#{h(agent.last_error || "")}</code></dd>
              </dl>
            </div>
          </div>

          <h2>Permission approvals (recent)</h2>

          #{approvals_table_html(approvals)}

          <hr />

          <p>
            <a href="/agents">Back to agents</a>
            &nbsp;|&nbsp;
            <a href="/audit?subject_type=agent&amp;subject_id=#{URI.encode_www_form(agent.agent_id)}">View audit for this agent</a>
          </p>

          <meta name="csrf-token" content="#{h(csrf)}" />
          """
        end)

      html(conn, 200, body)
    end
  end

  get "/audit" do
    filters = %{
      event_type: normalize_optional(conn.params["event_type"]),
      actor_type: normalize_optional(conn.params["actor_type"]),
      actor_id: normalize_optional(conn.params["actor_id"]),
      subject_type: normalize_optional(conn.params["subject_type"]),
      subject_id: normalize_optional(conn.params["subject_id"]),
      correlation_id: normalize_optional(conn.params["correlation_id"])
    }

    events =
      try do
        OpenSentience.AuditLog.list_events(
          limit: 200,
          order: :at_desc,
          event_type: filters.event_type,
          actor_type: filters.actor_type,
          actor_id: filters.actor_id,
          subject_type: filters.subject_type,
          subject_id: filters.subject_id,
          correlation_id: filters.correlation_id
        )
      rescue
        err ->
          Logger.warning("audit list failed: #{Exception.message(err)}")
          []
      end

    body =
      layout("Audit log", conn, fn csrf ->
        """
        <h1>Audit log</h1>

        <form method="get" action="/audit" class="filters">
          <label>event_type <input name="event_type" value="#{h(filters.event_type || "")}" /></label>
          <label>actor_type <input name="actor_type" value="#{h(filters.actor_type || "")}" /></label>
          <label>actor_id <input name="actor_id" value="#{h(filters.actor_id || "")}" /></label>
          <label>subject_type <input name="subject_type" value="#{h(filters.subject_type || "")}" /></label>
          <label>subject_id <input name="subject_id" value="#{h(filters.subject_id || "")}" /></label>
          <label>correlation_id <input name="correlation_id" value="#{h(filters.correlation_id || "")}" /></label>
          <button type="submit">Filter</button>
        </form>

        <p class="muted">
          Showing up to 200 most recent events (newest first).
        </p>

        <table>
          <thead>
            <tr>
              <th>At</th>
              <th>Severity</th>
              <th>Event</th>
              <th>Actor</th>
              <th>Subject</th>
              <th>Correlation</th>
            </tr>
          </thead>
          <tbody>
            #{Enum.map_join(events, "\n", &audit_row_html/1)}
          </tbody>
        </table>

        <p><a href="/agents">Back to agents</a></p>

        <meta name="csrf-token" content="#{h(csrf)}" />
        """
      end)

    html(conn, 200, body)
  end

  match _ do
    body =
      layout("Not found", conn, fn csrf ->
        """
        <h1>Not found</h1>
        <p>No route for <code>#{h(conn.method)} #{h(conn.request_path)}</code>.</p>
        <p><a href="/agents">Back to agents</a></p>
        <meta name="csrf-token" content="#{h(csrf)}" />
        """
      end)

    html(conn, 404, body)
  end

  # ---------------------------------------------------------------------------
  # Security
  # ---------------------------------------------------------------------------

  defp put_security_headers(conn, _opts) do
    conn
    |> put_resp_header("x-content-type-options", "nosniff")
    |> put_resp_header("x-frame-options", "DENY")
    |> put_resp_header("referrer-policy", "no-referrer")
    |> put_resp_header("permissions-policy", "interest-cohort=()")
    # Minimal CSP: deny framing; keep it permissive enough for simple inline HTML in Phase 1.
    |> put_resp_header(
      "content-security-policy",
      "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    )
  end

  defp require_admin_token_for_state_changes(conn, _opts) do
    if conn.method in @read_only_methods do
      conn
    else
      require_token? =
        case Application.get_env(:opensentience_core, :web, []) do
          cfg when is_list(cfg) -> Keyword.get(cfg, :require_token, true)
          _ -> true
        end

      if require_token? do
        provided =
          get_req_header(conn, "x-opensentience-token")
          |> List.first()
          |> case do
            nil -> conn.params["token"]
            v -> v
          end
          |> normalize_optional()

        expected = read_admin_token()

        if token_valid?(provided, expected) do
          conn
        else
          # Avoid leaking whether a token file exists; keep message generic.
          conn
          |> put_resp_content_type("text/plain; charset=utf-8")
          |> send_resp(401, "Unauthorized")
          |> halt()
        end
      else
        conn
      end
    end
  end

  defp read_admin_token do
    token_path =
      try do
        OpenSentience.Paths.admin_token_path()
      rescue
        _ ->
          # Fallback to config, then to default path under ~/.opensentience/state/admin.token
          nil
      end

    token_path =
      token_path ||
        case Application.get_env(:opensentience_core, :paths) do
          cfg when is_list(cfg) -> Keyword.get(cfg, :admin_token_path)
          cfg when is_map(cfg) -> Map.get(cfg, :admin_token_path)
          _ -> nil
        end

    token_path =
      token_path ||
        Path.join([System.user_home!(), ".opensentience", "state", "admin.token"])

    token_path = Path.expand(token_path)

    case File.read(token_path) do
      {:ok, contents} -> normalize_optional(contents)
      {:error, _} -> nil
    end
  end

  defp token_valid?(provided, expected) when is_binary(provided) and is_binary(expected) do
    # Constant-time compare to avoid timing leakage.
    Plug.Crypto.secure_compare(provided, expected)
  end

  defp token_valid?(_, _), do: false

  # ---------------------------------------------------------------------------
  # Rendering helpers
  # ---------------------------------------------------------------------------

  defp html(conn, status, body) when is_binary(body) do
    conn
    |> put_resp_content_type("text/html; charset=utf-8")
    |> send_resp(status, body)
  end

  defp layout(title, conn, inner_fun) when is_binary(title) and is_function(inner_fun, 1) do
    csrf = Plug.CSRFProtection.get_csrf_token()

    """
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>#{h(title)} — OpenSentience Core</title>
        <style>
          :root { color-scheme: light dark; }
          body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; margin: 24px; }
          code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
          code.small { font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border-bottom: 1px solid rgba(127,127,127,0.3); padding: 8px; text-align: left; vertical-align: top; }
          th { position: sticky; top: 0; background: rgba(127,127,127,0.08); }
          .muted { opacity: 0.8; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
          dl { display: grid; grid-template-columns: 160px 1fr; gap: 6px 12px; }
          dt { font-weight: 600; opacity: 0.9; }
          dd { margin: 0; }
          .filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; align-items: end; margin: 12px 0; }
          .filters label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; opacity: 0.9; }
          .filters input { padding: 6px; }
          .filters button { padding: 8px 10px; }
          @media (max-width: 1000px) {
            .grid { grid-template-columns: 1fr; }
            .filters { grid-template-columns: 1fr; }
          }
        </style>
      </head>
      <body>
        #{inner_fun.(csrf)}
        <hr />
        <p class="muted">
          OpenSentience Core admin UI (Phase 1). Request path: <code>#{h(conn.request_path)}</code>
        </p>
      </body>
    </html>
    """
  end

  defp agent_row_html(agent) do
    agent_id = agent.agent_id || ""
    status = agent.status || ""
    name = agent.name || ""
    version = agent.version || ""
    last_seen = dt(agent.last_seen_at) || ""
    href = "/agents/" <> URI.encode_www_form(to_string(agent_id))

    """
    <tr>
      <td><a href="#{h(href)}"><code>#{h(agent_id)}</code></a></td>
      <td><code>#{h(status)}</code></td>
      <td>#{h(name)}</td>
      <td><code>#{h(version)}</code></td>
      <td><code>#{h(last_seen)}</code></td>
    </tr>
    """
  end

  defp approvals_table_html([]) do
    """
    <p class="muted">No approvals found.</p>
    """
  end

  defp approvals_table_html(approvals) do
    rows =
      Enum.map_join(approvals, "\n", fn a ->
        approved_count =
          case Jason.decode(a.approved_permissions_json || "[]") do
            {:ok, list} when is_list(list) -> length(list)
            _ -> 0
          end

        """
        <tr>
          <td><code>#{h(a.id || "")}</code></td>
          <td><code>#{h(a.status || "")}</code></td>
          <td><code>#{h(dt(a.approved_at) || "")}</code></td>
          <td><code>#{h(a.approved_by || "")}</code></td>
          <td><code>#{h(to_string(approved_count))}</code></td>
          <td><code class="small">#{h(a.requested_permissions_hash || "")}</code></td>
        </tr>
        """
      end)

    """
    <table>
      <thead>
        <tr>
          <th>Approval ID</th>
          <th>Status</th>
          <th>Approved at</th>
          <th>Approved by</th>
          <th>Approved count</th>
          <th>Requested permissions hash</th>
        </tr>
      </thead>
      <tbody>
        #{rows}
      </tbody>
    </table>
    """
  end

  defp audit_row_html(event) do
    at = dt(event.at) || ""
    severity = normalize_optional(event.severity) || "info"
    event_type = normalize_optional(event.event_type) || ""

    actor =
      "#{normalize_optional(event.actor_type) || ""}:#{normalize_optional(event.actor_id) || ""}"

    subject =
      "#{normalize_optional(event.subject_type) || ""}:#{normalize_optional(event.subject_id) || ""}"

    correlation = normalize_optional(event.correlation_id) || ""

    """
    <tr>
      <td><code>#{h(at)}</code></td>
      <td><code>#{h(severity)}</code></td>
      <td><code>#{h(event_type)}</code></td>
      <td><code class="small">#{h(actor)}</code></td>
      <td><code class="small">#{h(subject)}</code></td>
      <td><code class="small">#{h(correlation)}</code></td>
    </tr>
    """
  end

  defp dt(nil), do: nil
  defp dt(%DateTime{} = dt), do: DateTime.to_iso8601(dt)
  defp dt(%NaiveDateTime{} = ndt), do: NaiveDateTime.to_iso8601(ndt)
  defp dt(other), do: to_string(other)

  defp normalize_optional(nil), do: nil

  defp normalize_optional(v) when is_binary(v) do
    v = String.trim(v)
    if v == "", do: nil, else: v
  end

  defp normalize_optional(v), do: v |> to_string() |> normalize_optional()

  defp h(nil), do: ""
  defp h(v), do: v |> to_string() |> Plug.HTML.html_escape_to_iodata() |> IO.iodata_to_binary()
end
