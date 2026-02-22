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

  alias OpenSentience.AuditLog
  alias OpenSentience.Build
  alias OpenSentience.Catalog
  alias OpenSentience.Discovery.ManifestReader
  alias OpenSentience.Enablement.Approvals
  alias OpenSentience.Install
  alias OpenSentience.Launcher

  @read_only_methods ~w(GET HEAD OPTIONS)

  # In a plain Plug router (no Phoenix endpoint), cookie sessions require
  # `conn.secret_key_base` to be set. We set it via a plug below.
  @secret_key_base_key {__MODULE__, :secret_key_base}

  # ---------------------------------------------------------------------------
  # Plugs
  # ---------------------------------------------------------------------------

  plug(Plug.RequestId)
  plug(Plug.Logger)

  plug(:put_security_headers)

  # Required for cookie sessions (and therefore CSRF).
  plug(:put_secret_key_base)

  # Cookie session is required for CSRF protection.
  # This is local-only admin UI, but we still keep CSRF on by default.
  plug(Plug.Session,
    store: :cookie,
    key: "_opensentience_core_key",
    signing_salt: "opensentience_core_signing_salt",
    same_site: "Lax"
  )

  # Required by Plug.CSRFProtection (it reads from the session).
  plug(:fetch_session)

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

  # ---------------------------------------------------------------------------
  # JSON API (Phase 1): CSRF + login + lifecycle actions
  #
  # Client flow (token + CSRF):
  # 1) GET  /api/csrf     -> receive CSRF token + session cookie
  # 2) POST /api/login    -> send x-csrf-token + admin token; establishes admin session
  # 3) POST /agents/:id/run|stop -> send x-csrf-token + session cookie (and optionally token header)
  # ---------------------------------------------------------------------------

  get "/api/csrf" do
    csrf = Plug.CSRFProtection.get_csrf_token()

    conn
    |> put_resp_header("x-csrf-token", csrf)
    |> json(200, %{
      ok: true,
      csrf_token: csrf,
      authenticated: get_session(conn, :opensentience_admin) == true
    })
  end

  post "/api/login" do
    # NOTE: This route is allowed through the token-gate plug (it still requires CSRF).
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
      csrf = Plug.CSRFProtection.get_csrf_token()

      conn
      |> configure_session(renew: true)
      |> put_session(:opensentience_admin, true)
      |> put_session(
        :opensentience_admin_authenticated_at,
        DateTime.utc_now() |> DateTime.to_iso8601()
      )
      |> put_resp_header("x-csrf-token", csrf)
      |> json(200, %{ok: true, csrf_token: csrf})
    else
      json(conn, 401, %{ok: false, error: %{code: "unauthorized", message: "Unauthorized"}})
    end
  end

  post "/api/logout" do
    conn
    |> configure_session(drop: true)
    |> json(200, %{ok: true})
  end

  # ---------------------------------------------------------------------------
  # HTML login/logout (Phase 1): browser-friendly session bootstrap
  # ---------------------------------------------------------------------------

  get "/login" do
    body =
      layout("Login", conn, fn csrf ->
        """
        <h1>Admin login</h1>

        <p class="muted">
          This UI is localhost-only. To perform actions (install/build/enable/run/stop), you must establish an admin session.
        </p>

        <form method="post" action="/login">
          <input type="hidden" name="_csrf_token" value="#{h(csrf)}" />
          <label>
            Admin token
            <input name="token" type="password" autocomplete="off" />
          </label>

          <input type="hidden" name="next" value="#{h(normalize_optional(conn.params["next"]) || "/agents")}" />

          <button type="submit">Login</button>
        </form>

        <p class="muted">
          Token file is stored on disk under <code>~/.opensentience/state/admin.token</code> (default).
        </p>

        <meta name="csrf-token" content="#{h(csrf)}" />
        """
      end)

    html(conn, 200, body)
  end

  post "/login" do
    provided = normalize_optional(conn.params["token"])
    expected = read_admin_token()
    next = normalize_optional(conn.params["next"]) || "/agents"

    if token_valid?(provided, expected) do
      conn
      |> configure_session(renew: true)
      |> put_session(:opensentience_admin, true)
      |> put_session(
        :opensentience_admin_authenticated_at,
        DateTime.utc_now() |> DateTime.to_iso8601()
      )
      |> redirect(next, 303)
    else
      body =
        layout("Login failed", conn, fn csrf ->
          """
          <h1>Unauthorized</h1>
          <p>Invalid admin token.</p>
          <p><a href="/login">Try again</a></p>
          <meta name="csrf-token" content="#{h(csrf)}" />
          """
        end)

      html(conn, 401, body)
    end
  end

  post "/logout" do
    conn
    |> configure_session(drop: true)
    |> redirect("/login", 303)
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
        logged_in? = get_session(conn, :opensentience_admin) == true

        """
        <h1>Agents</h1>

        <p class="muted">
          #{if logged_in?, do: "You are logged in for actions.", else: "You are not logged in for actions."}
          #{if logged_in?, do: "", else: ~s(<a href="/login">Login</a>)}
        </p>

        <p class="muted">
          Minimal admin UI. After logging in, you can install/build/enable and run/stop agents (including “Prepare &amp; Run”) from the agent detail page.
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

          #{notice_error_banner_html(conn)}

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

          <h2>Actions</h2>

          #{agent_actions_html(conn, csrf, agent.agent_id)}

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

  # ---------------------------------------------------------------------------
  # Lifecycle actions (Phase 1): run/stop
  # ---------------------------------------------------------------------------

  post "/agents/:agent_id/run" do
    agent_id = conn.params["agent_id"] |> to_string() |> String.trim()

    redirect_to =
      normalize_optional(conn.params["redirect_to"]) ||
        "/agents/" <> URI.encode_www_form(agent_id)

    correlation_id = normalize_optional(conn.params["correlation_id"])
    causation_id = normalize_optional(conn.params["causation_id"])

    result =
      try do
        OpenSentience.Launcher.start_agent(agent_id,
          actor_type: :human,
          actor_id: "admin_ui",
          correlation_id: correlation_id,
          causation_id: causation_id
        )
      rescue
        err ->
          {:error,
           %OpenSentience.Launcher.Error{
             code: :exception,
             message: "run failed",
             details: %{exception: Exception.message(err)}
           }}
      end

    case result do
      {:ok, info} ->
        if wants_html?(conn) do
          redirect(conn, append_query_param(redirect_to, "notice", "run_started"), 303)
        else
          json(conn, 200, %{ok: true, result: info})
        end

      {:error, %OpenSentience.Launcher.Error{} = e} ->
        if wants_html?(conn) do
          redirect(
            conn,
            redirect_to
            |> append_query_param("error", "run_failed")
            |> append_query_param("code", Atom.to_string(e.code)),
            303
          )
        else
          json(conn, 400, %{
            ok: false,
            error: %{code: Atom.to_string(e.code), message: e.message, details: e.details}
          })
        end

      {:error, other} ->
        if wants_html?(conn) do
          redirect(
            conn,
            redirect_to
            |> append_query_param("error", "run_failed")
            |> append_query_param("code", "unknown"),
            303
          )
        else
          json(conn, 400, %{
            ok: false,
            error: %{
              code: "run_failed",
              message: "run failed",
              details: %{reason: inspect(other)}
            }
          })
        end
    end
  end

  post "/agents/:agent_id/stop" do
    agent_id = conn.params["agent_id"] |> to_string() |> String.trim()

    redirect_to =
      normalize_optional(conn.params["redirect_to"]) ||
        "/agents/" <> URI.encode_www_form(agent_id)

    correlation_id = normalize_optional(conn.params["correlation_id"])
    causation_id = normalize_optional(conn.params["causation_id"])

    result =
      try do
        OpenSentience.Launcher.stop_agent(agent_id,
          actor_type: :human,
          actor_id: "admin_ui",
          correlation_id: correlation_id,
          causation_id: causation_id
        )
      rescue
        err ->
          {:error,
           %OpenSentience.Launcher.Error{
             code: :exception,
             message: "stop failed",
             details: %{exception: Exception.message(err)}
           }}
      end

    case result do
      :ok ->
        if wants_html?(conn) do
          redirect(conn, append_query_param(redirect_to, "notice", "run_stop_requested"), 303)
        else
          json(conn, 200, %{ok: true})
        end

      {:error, %OpenSentience.Launcher.Error{} = e} ->
        if wants_html?(conn) do
          redirect(
            conn,
            redirect_to
            |> append_query_param("error", "stop_failed")
            |> append_query_param("code", Atom.to_string(e.code)),
            303
          )
        else
          json(conn, 400, %{
            ok: false,
            error: %{code: Atom.to_string(e.code), message: e.message, details: e.details}
          })
        end

      {:error, other} ->
        if wants_html?(conn) do
          redirect(
            conn,
            redirect_to
            |> append_query_param("error", "stop_failed")
            |> append_query_param("code", "unknown"),
            303
          )
        else
          json(conn, 400, %{
            ok: false,
            error: %{
              code: "stop_failed",
              message: "stop failed",
              details: %{reason: inspect(other)}
            }
          })
        end
    end
  end

  # ---------------------------------------------------------------------------
  # Lifecycle actions (Phase 1): install/build/enable + prepare-run
  # ---------------------------------------------------------------------------

  post "/agents/:agent_id/install" do
    agent_id = conn.params["agent_id"] |> to_string() |> String.trim()

    redirect_to =
      normalize_optional(conn.params["redirect_to"]) ||
        "/agents/" <> URI.encode_www_form(agent_id)

    correlation_id = normalize_optional(conn.params["correlation_id"])
    causation_id = normalize_optional(conn.params["causation_id"])

    result =
      try do
        Install.install(agent_id,
          actor_type: :human,
          actor_id: "admin_ui",
          correlation_id: correlation_id,
          causation_id: causation_id
        )
      rescue
        err ->
          {:error,
           %Install.Error{
             code: :exception,
             message: "install failed",
             details: %{exception: Exception.message(err)}
           }}
      end

    case result do
      {:ok, info} ->
        if wants_html?(conn) do
          redirect(conn, append_query_param(redirect_to, "notice", "installed"), 303)
        else
          json(conn, 200, %{ok: true, result: info})
        end

      {:error, %Install.Error{} = e} ->
        if wants_html?(conn) do
          redirect(
            conn,
            redirect_to
            |> append_query_param("error", "install_failed")
            |> append_query_param("code", Atom.to_string(e.code)),
            303
          )
        else
          json(conn, 400, %{
            ok: false,
            error: %{code: Atom.to_string(e.code), message: e.message, details: e.details}
          })
        end

      {:error, other} ->
        if wants_html?(conn) do
          redirect(
            conn,
            redirect_to
            |> append_query_param("error", "install_failed")
            |> append_query_param("code", "unknown"),
            303
          )
        else
          json(conn, 400, %{
            ok: false,
            error: %{
              code: "install_failed",
              message: "install failed",
              details: %{reason: inspect(other)}
            }
          })
        end
    end
  end

  post "/agents/:agent_id/build" do
    agent_id = conn.params["agent_id"] |> to_string() |> String.trim()

    redirect_to =
      normalize_optional(conn.params["redirect_to"]) ||
        "/agents/" <> URI.encode_www_form(agent_id)

    correlation_id = normalize_optional(conn.params["correlation_id"])
    causation_id = normalize_optional(conn.params["causation_id"])
    mix_env = normalize_optional(conn.params["mix_env"]) || "prod"

    result =
      try do
        Build.build(agent_id,
          actor_type: :human,
          actor_id: "admin_ui",
          correlation_id: correlation_id,
          causation_id: causation_id,
          mix_env: mix_env
        )
      rescue
        err ->
          {:error,
           %Build.Error{
             code: :exception,
             message: "build failed",
             details: %{exception: Exception.message(err)}
           }}
      end

    case result do
      {:ok, info} ->
        if wants_html?(conn) do
          redirect(conn, append_query_param(redirect_to, "notice", "built"), 303)
        else
          json(conn, 200, %{ok: true, result: info})
        end

      {:error, %Build.Error{} = e} ->
        if wants_html?(conn) do
          redirect(
            conn,
            redirect_to
            |> append_query_param("error", "build_failed")
            |> append_query_param("code", Atom.to_string(e.code)),
            303
          )
        else
          json(conn, 400, %{
            ok: false,
            error: %{code: Atom.to_string(e.code), message: e.message, details: e.details}
          })
        end

      {:error, other} ->
        if wants_html?(conn) do
          redirect(
            conn,
            redirect_to
            |> append_query_param("error", "build_failed")
            |> append_query_param("code", "unknown"),
            303
          )
        else
          json(conn, 400, %{
            ok: false,
            error: %{
              code: "build_failed",
              message: "build failed",
              details: %{reason: inspect(other)}
            }
          })
        end
    end
  end

  post "/agents/:agent_id/enable" do
    agent_id = conn.params["agent_id"] |> to_string() |> String.trim()

    redirect_to =
      normalize_optional(conn.params["redirect_to"]) ||
        "/agents/" <> URI.encode_www_form(agent_id)

    correlation_id = normalize_optional(conn.params["correlation_id"])
    causation_id = normalize_optional(conn.params["causation_id"])

    result =
      try do
        case Catalog.get_agent(agent_id) do
          nil ->
            {:error,
             %{
               code: :not_found,
               message: "agent not found in catalog",
               details: %{agent_id: agent_id}
             }}

          agent ->
            manifest_path = normalize_optional(agent.manifest_path)

            if not is_binary(manifest_path) do
              {:error,
               %{
                 code: :missing_manifest,
                 message: "agent has no manifest_path",
                 details: %{agent_id: agent_id}
               }}
            else
              with {:ok, manifest} <- ManifestReader.read(manifest_path) do
                requested = Map.get(manifest, :permissions) || []
                approved = requested

                case Approvals.approve(agent_id, requested, approved,
                       actor_type: :human,
                       actor_id: "admin_ui",
                       correlation_id: correlation_id,
                       causation_id: causation_id,
                       revoke_existing?: true,
                       manifest_hash: Map.get(manifest, :manifest_hash),
                       source_ref: normalize_optional(agent.source_ref)
                     ) do
                  {:ok, approval} ->
                    {:ok,
                     %{
                       agent_id: agent_id,
                       approval_id: approval.id,
                       status: approval.status,
                       requested_permissions_hash: approval.requested_permissions_hash
                     }}

                  {:error, reason} ->
                    {:error,
                     %{
                       code: :enable_failed,
                       message: "enable failed",
                       details: %{reason: inspect(reason)}
                     }}
                end
              end
            end
        end
      rescue
        err ->
          {:error,
           %{
             code: :exception,
             message: "enable failed",
             details: %{exception: Exception.message(err)}
           }}
      end

    case result do
      {:ok, info} ->
        if wants_html?(conn) do
          redirect(conn, append_query_param(redirect_to, "notice", "enabled"), 303)
        else
          json(conn, 200, %{ok: true, result: info})
        end

      {:error, %ManifestReader.Error{} = e} ->
        if wants_html?(conn) do
          redirect(
            conn,
            redirect_to
            |> append_query_param("error", "enable_failed")
            |> append_query_param("code", Atom.to_string(e.code)),
            303
          )
        else
          json(conn, 400, %{
            ok: false,
            error: %{code: Atom.to_string(e.code), message: e.message, details: e.details}
          })
        end

      {:error, %{} = e} ->
        code = e[:code] || e["code"] || :enable_failed
        message = e[:message] || e["message"] || "enable failed"
        details = e[:details] || e["details"] || %{}

        if wants_html?(conn) do
          redirect(
            conn,
            redirect_to
            |> append_query_param("error", "enable_failed")
            |> append_query_param("code", to_string(code)),
            303
          )
        else
          json(conn, 400, %{
            ok: false,
            error: %{code: to_string(code), message: message, details: details}
          })
        end

      {:error, other} ->
        if wants_html?(conn) do
          redirect(
            conn,
            redirect_to
            |> append_query_param("error", "enable_failed")
            |> append_query_param("code", "unknown"),
            303
          )
        else
          json(conn, 400, %{
            ok: false,
            error: %{
              code: "enable_failed",
              message: "enable failed",
              details: %{reason: inspect(other)}
            }
          })
        end
    end
  end

  post "/agents/:agent_id/prepare-run" do
    agent_id = conn.params["agent_id"] |> to_string() |> String.trim()

    redirect_to =
      normalize_optional(conn.params["redirect_to"]) ||
        "/agents/" <> URI.encode_www_form(agent_id)

    correlation_id = normalize_optional(conn.params["correlation_id"])
    causation_id = normalize_optional(conn.params["causation_id"])
    mix_env = normalize_optional(conn.params["mix_env"]) || "prod"

    actor_opts = [
      actor_type: :human,
      actor_id: "admin_ui",
      correlation_id: correlation_id,
      causation_id: causation_id
    ]

    result =
      try do
        with agent when not is_nil(agent) <- Catalog.get_agent(agent_id),
             manifest_path when is_binary(manifest_path) <-
               normalize_optional(agent.manifest_path),
             {:ok, manifest} <- ManifestReader.read(manifest_path),
             {:ok, agent} <-
               (
                 install_path = normalize_optional(agent.install_path)

                 needs_install? =
                   is_nil(install_path) or
                     (is_binary(install_path) and not File.dir?(install_path))

                 if needs_install? do
                   case Install.install(agent_id, actor_opts) do
                     {:ok, _info} ->
                       {:ok, Catalog.get_agent(agent_id) || agent}

                     {:error, %Install.Error{} = e} ->
                       {:error, e}

                     {:error, other} ->
                       {:error,
                        %Install.Error{
                          code: :install_failed,
                          message: "install failed",
                          details: %{reason: inspect(other)}
                        }}
                   end
                 else
                   {:ok, agent}
                 end
               ),
             {:ok, agent} <-
               (
                 build_status = normalize_optional(agent.build_status)

                 needs_build? = build_status != "built"

                 if needs_build? do
                   case Build.build(agent_id, Keyword.merge(actor_opts, mix_env: mix_env)) do
                     {:ok, _info} ->
                       {:ok, Catalog.get_agent(agent_id) || agent}

                     {:error, %Build.Error{} = e} ->
                       {:error, e}

                     {:error, other} ->
                       {:error,
                        %Build.Error{
                          code: :build_failed,
                          message: "build failed",
                          details: %{reason: inspect(other)}
                        }}
                   end
                 else
                   {:ok, agent}
                 end
               ),
             {:ok, _approved_permissions} <-
               (
                 requested = Map.get(manifest, :permissions) || []
                 requested_hash = Map.get(manifest, :requested_permissions_hash) |> to_string()

                 scope = %{
                   manifest_hash: Map.get(manifest, :manifest_hash),
                   source_ref: normalize_optional(agent.source_ref)
                 }

                 case Approvals.ensure_enabled(agent_id, requested_hash, scope) do
                   {:ok, perms} ->
                     {:ok, perms}

                   {:error, :not_enabled} ->
                     case Approvals.approve(
                            agent_id,
                            requested,
                            requested,
                            actor_type: :human,
                            actor_id: "admin_ui",
                            correlation_id: correlation_id,
                            causation_id: causation_id,
                            revoke_existing?: true,
                            manifest_hash: scope.manifest_hash,
                            source_ref: scope.source_ref
                          ) do
                       {:ok, _approval} -> {:ok, requested}
                       {:error, reason} -> {:error, {:enable_failed, reason}}
                     end

                   {:error, :approval_drift} ->
                     case Approvals.approve(
                            agent_id,
                            requested,
                            requested,
                            actor_type: :human,
                            actor_id: "admin_ui",
                            correlation_id: correlation_id,
                            causation_id: causation_id,
                            revoke_existing?: true,
                            manifest_hash: scope.manifest_hash,
                            source_ref: scope.source_ref
                          ) do
                       {:ok, _approval} -> {:ok, requested}
                       {:error, reason} -> {:error, {:enable_failed, reason}}
                     end

                   {:error, other} ->
                     {:error, {:enable_failed, other}}
                 end
               ),
             {:ok, run_info} <- Launcher.start_agent(agent_id, actor_opts) do
          {:ok, run_info}
        else
          {:error, %Install.Error{} = e} ->
            {:error, {:install_failed, e}}

          {:error, %Build.Error{} = e} ->
            {:error, {:build_failed, e}}

          {:error, %ManifestReader.Error{} = e} ->
            {:error, {:manifest_failed, e}}

          {:error, %Launcher.Error{} = e} ->
            {:error, {:run_failed, e}}

          {:error, {:enable_failed, other}} ->
            {:error, {:prepare_failed, other}}

          nil ->
            {:error,
             {:not_found,
              %{
                code: :not_found,
                message: "agent not found in catalog",
                details: %{agent_id: agent_id}
              }}}

          false ->
            {:error,
             {:missing_manifest,
              %{
                code: :missing_manifest,
                message: "agent has no manifest_path",
                details: %{agent_id: agent_id}
              }}}

          {:error, other} ->
            {:error, {:prepare_failed, other}}

          other ->
            {:error, {:prepare_failed, other}}
        end
      rescue
        err ->
          {:error,
           {:prepare_failed,
            %{
              code: :exception,
              message: "prepare-run failed",
              details: %{exception: Exception.message(err)}
            }}}
      end

    case result do
      {:ok, info} ->
        if wants_html?(conn) do
          redirect(conn, append_query_param(redirect_to, "notice", "prepared_and_running"), 303)
        else
          json(conn, 200, %{ok: true, result: info})
        end

      {:error, {:install_failed, %Install.Error{} = e}} ->
        if wants_html?(conn) do
          redirect(
            conn,
            redirect_to
            |> append_query_param("error", "install_failed")
            |> append_query_param("code", Atom.to_string(e.code)),
            303
          )
        else
          json(conn, 400, %{
            ok: false,
            error: %{code: Atom.to_string(e.code), message: e.message, details: e.details}
          })
        end

      {:error, {:build_failed, %Build.Error{} = e}} ->
        if wants_html?(conn) do
          redirect(
            conn,
            redirect_to
            |> append_query_param("error", "build_failed")
            |> append_query_param("code", Atom.to_string(e.code)),
            303
          )
        else
          json(conn, 400, %{
            ok: false,
            error: %{code: Atom.to_string(e.code), message: e.message, details: e.details}
          })
        end

      {:error, {:manifest_failed, %ManifestReader.Error{} = e}} ->
        if wants_html?(conn) do
          redirect(
            conn,
            redirect_to
            |> append_query_param("error", "enable_failed")
            |> append_query_param("code", Atom.to_string(e.code)),
            303
          )
        else
          json(conn, 400, %{
            ok: false,
            error: %{code: Atom.to_string(e.code), message: e.message, details: e.details}
          })
        end

      {:error, {:run_failed, %Launcher.Error{} = e}} ->
        if wants_html?(conn) do
          redirect(
            conn,
            redirect_to
            |> append_query_param("error", "run_failed")
            |> append_query_param("code", Atom.to_string(e.code)),
            303
          )
        else
          json(conn, 400, %{
            ok: false,
            error: %{code: Atom.to_string(e.code), message: e.message, details: e.details}
          })
        end

      {:error, {_tag, %{} = e}} ->
        code = e[:code] || e["code"] || :prepare_failed
        message = e[:message] || e["message"] || "prepare-run failed"
        details = e[:details] || e["details"] || %{}

        if wants_html?(conn) do
          redirect(
            conn,
            redirect_to
            |> append_query_param("error", "prepare_failed")
            |> append_query_param("code", to_string(code)),
            303
          )
        else
          json(conn, 400, %{
            ok: false,
            error: %{code: to_string(code), message: message, details: details}
          })
        end

      {:error, {_tag, other}} ->
        if wants_html?(conn) do
          redirect(
            conn,
            redirect_to
            |> append_query_param("error", "prepare_failed")
            |> append_query_param("code", "unknown"),
            303
          )
        else
          json(conn, 400, %{
            ok: false,
            error: %{
              code: "prepare_failed",
              message: "prepare-run failed",
              details: %{reason: inspect(other)}
            }
          })
        end
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

  defp put_secret_key_base(%{secret_key_base: secret} = conn, _opts)
       when is_binary(secret) and secret != "" do
    conn
  end

  defp put_secret_key_base(conn, _opts) do
    configured =
      System.get_env("OPENSENTIENCE_SECRET_KEY_BASE") ||
        case Application.get_env(:opensentience_core, :web, []) do
          cfg when is_list(cfg) -> Keyword.get(cfg, :secret_key_base)
          cfg when is_map(cfg) -> Map.get(cfg, :secret_key_base)
          _ -> nil
        end

    secret =
      cond do
        is_binary(configured) and String.trim(configured) != "" ->
          String.trim(configured)

        true ->
          case :persistent_term.get(@secret_key_base_key, nil) do
            nil ->
              generated =
                64
                |> :crypto.strong_rand_bytes()
                |> Base.url_encode64(padding: false)

              :persistent_term.put(@secret_key_base_key, generated)
              generated

            existing ->
              existing
          end
      end

    %{conn | secret_key_base: secret}
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
        # Allow unauthenticated access to the login routes so clients can establish a session.
        # These routes are still protected by CSRF (clients should call GET /api/csrf first for JSON,
        # and GET /login already renders a form with the token).
        if conn.request_path in ["/api/login", "/login"] do
          conn
        else
          session_ok? = get_session(conn, :opensentience_admin) == true

          if session_ok? do
            conn
          else
            # Backwards-compatible: allow token-per-request callers (e.g. non-browser clients).
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
              _ =
                audit_security_denied(conn,
                  code: "unauthorized",
                  reason: "admin_gate_denied"
                )

              conn
              |> put_resp_content_type("text/plain; charset=utf-8")
              |> send_resp(401, "Unauthorized")
              |> halt()
            end
          end
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

  defp audit_security_denied(conn, opts) when is_list(opts) do
    audit_security_denied(conn, Map.new(opts))
  end

  defp audit_security_denied(conn, %{} = opts) do
    remote_ip =
      case conn.remote_ip do
        {a, b, c, d} -> "#{a}.#{b}.#{c}.#{d}"
        other -> inspect(other)
      end

    user_agent =
      conn
      |> get_req_header("user-agent")
      |> List.first()
      |> normalize_optional()

    reason =
      Map.get(opts, :reason) ||
        Map.get(opts, "reason") ||
        "admin_gate_denied"

    code =
      Map.get(opts, :code) ||
        Map.get(opts, "code") ||
        "unauthorized"

    # Best-effort only: never block the request path on audit persistence.
    try do
      _ =
        AuditLog.append(%{
          event_type: "security.denied",
          actor_type: :system,
          actor_id: "web",
          subject_type: "http_request",
          subject_id: "#{conn.method} #{conn.request_path}",
          severity: :security,
          metadata: %{
            reason: to_string(reason),
            code: to_string(code),
            remote_ip: remote_ip,
            user_agent: user_agent
          }
        })

      :ok
    rescue
      _ -> :ok
    end
  end

  # ---------------------------------------------------------------------------
  # Rendering helpers
  # ---------------------------------------------------------------------------

  defp html(conn, status, body) when is_binary(body) do
    conn
    |> put_resp_content_type("text/html; charset=utf-8")
    |> send_resp(status, body)
  end

  defp json(conn, status, %{} = body) do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(status, Jason.encode!(body))
  end

  defp redirect(conn, location, status \\ 303) when is_binary(location) do
    conn
    |> put_resp_header("location", location)
    |> send_resp(status, "")
  end

  defp wants_html?(conn) do
    accept =
      conn
      |> get_req_header("accept")
      |> Enum.join(",")
      |> String.downcase()

    String.contains?(accept, "text/html") and not String.contains?(accept, "application/json")
  end

  defp append_query_param(url, key, value) when is_binary(url) do
    key = URI.encode_www_form(to_string(key))
    value = URI.encode_www_form(to_string(value))

    if String.contains?(url, "?") do
      url <> "&" <> key <> "=" <> value
    else
      url <> "?" <> key <> "=" <> value
    end
  end

  defp notice_error_banner_html(conn) do
    notice = normalize_optional(conn.params["notice"])
    error = normalize_optional(conn.params["error"])
    code = normalize_optional(conn.params["code"])

    cond do
      is_binary(error) ->
        """
        <div style="padding: 10px; border: 1px solid rgba(200,80,80,0.6); background: rgba(200,80,80,0.08); margin: 12px 0;">
          <strong>Error:</strong> <code>#{h(error)}</code>
          #{if is_binary(code), do: " <span class=\"muted\">(code: <code>#{h(code)}</code>)</span>", else: ""}
        </div>
        """

      is_binary(notice) ->
        """
        <div style="padding: 10px; border: 1px solid rgba(80,200,120,0.6); background: rgba(80,200,120,0.08); margin: 12px 0;">
          <strong>OK:</strong> <code>#{h(notice)}</code>
        </div>
        """

      true ->
        ""
    end
  end

  defp agent_actions_html(conn, csrf, agent_id) do
    logged_in? = get_session(conn, :opensentience_admin) == true
    encoded = URI.encode_www_form(to_string(agent_id))
    back = "/agents/" <> encoded

    if logged_in? do
      """
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <form method="post" action="/agents/#{h(encoded)}/prepare-run">
          <input type="hidden" name="_csrf_token" value="#{h(csrf)}" />
          <input type="hidden" name="redirect_to" value="#{h(back)}" />
          <input type="hidden" name="mix_env" value="prod" />
          <button type="submit">Prepare &amp; Run</button>
        </form>

        <form method="post" action="/agents/#{h(encoded)}/install">
          <input type="hidden" name="_csrf_token" value="#{h(csrf)}" />
          <input type="hidden" name="redirect_to" value="#{h(back)}" />
          <button type="submit">Install</button>
        </form>

        <form method="post" action="/agents/#{h(encoded)}/build">
          <input type="hidden" name="_csrf_token" value="#{h(csrf)}" />
          <input type="hidden" name="redirect_to" value="#{h(back)}" />
          <input type="hidden" name="mix_env" value="prod" />
          <button type="submit">Build</button>
        </form>

        <form method="post" action="/agents/#{h(encoded)}/enable">
          <input type="hidden" name="_csrf_token" value="#{h(csrf)}" />
          <input type="hidden" name="redirect_to" value="#{h(back)}" />
          <button type="submit">Enable (approve all)</button>
        </form>

        <form method="post" action="/agents/#{h(encoded)}/run">
          <input type="hidden" name="_csrf_token" value="#{h(csrf)}" />
          <input type="hidden" name="redirect_to" value="#{h(back)}" />
          <button type="submit">Run</button>
        </form>

        <form method="post" action="/agents/#{h(encoded)}/stop">
          <input type="hidden" name="_csrf_token" value="#{h(csrf)}" />
          <input type="hidden" name="redirect_to" value="#{h(back)}" />
          <button type="submit">Stop</button>
        </form>

        <form method="post" action="/logout">
          <input type="hidden" name="_csrf_token" value="#{h(csrf)}" />
          <button type="submit">Logout</button>
        </form>
      </div>
      """
    else
      """
      <p class="muted">
        You are not logged in for actions. <a href="/login?next=#{h(URI.encode_www_form(back))}">Login</a> to install/build/enable and run/stop this agent.
      </p>
      """
    end
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
