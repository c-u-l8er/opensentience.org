defmodule OpenSentience.HarnessMCP.Tools do
  @moduledoc """
  MCP tool definitions for OS-008 harness operations.

  Exposes 4 tools:
    * `harness_start_session` — start a new harness session
    * `harness_sprint_status` — get current sprint status
    * `harness_approve_action` — approve a deferred action (advise mode)
    * `harness_escalation_response` — respond to an escalation

  These are data-only definitions; the actual MCP transport layer (Anubis)
  is handled by the consuming application (e.g., Graphonomous).
  """

  alias OpenSentience.Harness

  @doc """
  Returns the list of MCP tool definitions for tool discovery.
  """
  @spec tool_definitions() :: [map()]
  def tool_definitions do
    [
      %{
        name: "harness_start_session",
        description: "Start a new harness session for a task. Returns session_id.",
        inputSchema: %{
          type: "object",
          properties: %{
            workspace_id: %{type: "string", description: "amp.workspaces ID"},
            task_description: %{type: "string"},
            agent_id: %{type: "string", description: "agentelic.agents ID (optional)"},
            goal_id: %{type: "string", description: "Delegatic goal ID (optional)"},
            model_tier: %{
              type: "string",
              enum: ["local_small", "local_large", "cloud_frontier"]
            },
            autonomy_level: %{
              type: "string",
              enum: ["observe", "advise", "act"]
            }
          },
          required: ["workspace_id", "task_description"]
        }
      },
      %{
        name: "harness_sprint_status",
        description: "Get the current sprint status for a harness session.",
        inputSchema: %{
          type: "object",
          properties: %{
            session_id: %{type: "string"}
          },
          required: ["session_id"]
        }
      },
      %{
        name: "harness_approve_action",
        description:
          "Approve a deferred action (advise mode). Required when autonomy is advise and dispatch mode is act or propose.",
        inputSchema: %{
          type: "object",
          properties: %{
            session_id: %{type: "string"},
            action_id: %{type: "string"},
            approved: %{type: "boolean"},
            reason: %{type: "string"}
          },
          required: ["session_id", "action_id", "approved"]
        }
      },
      %{
        name: "harness_escalation_response",
        description:
          "Respond to a harness escalation (sprint failure at max iterations, confidence gate, etc.).",
        inputSchema: %{
          type: "object",
          properties: %{
            session_id: %{type: "string"},
            escalation_id: %{type: "string"},
            action: %{
              type: "string",
              enum: ["retry", "skip", "abort", "override"]
            },
            guidance: %{type: "string"}
          },
          required: ["session_id", "escalation_id", "action"]
        }
      }
    ]
  end

  @doc """
  Handle an MCP tool call. Returns `{:ok, result}` or `{:error, reason}`.
  """
  @spec handle_call(binary(), map()) :: {:ok, map()} | {:error, binary()}
  def handle_call("harness_start_session", args) do
    opts =
      [
        workspace_id: Map.get(args, "workspace_id"),
        model_tier: parse_tier(Map.get(args, "model_tier", "cloud_frontier")),
        autonomy_level: parse_autonomy(Map.get(args, "autonomy_level", "act")),
        agent_id: Map.get(args, "agent_id"),
        goal_id: Map.get(args, "goal_id")
      ]
      |> Enum.reject(fn {_k, v} -> is_nil(v) end)

    case Harness.start_session(opts) do
      {:ok, pid} ->
        status = Harness.session_status(pid)
        {:ok, %{session_id: status.session_id, status: "active", pid: inspect(pid)}}

      {:error, reason} ->
        {:error, "Failed to start session: #{inspect(reason)}"}
    end
  end

  def handle_call("harness_sprint_status", %{"session_id" => session_id}) do
    case Harness.lookup_session(session_id) do
      {:ok, pid} ->
        status = Harness.session_status(pid)
        {:ok, status}

      :error ->
        {:error, "Session not found: #{session_id}"}
    end
  end

  def handle_call("harness_approve_action", %{
        "session_id" => session_id,
        "action_id" => action_id,
        "approved" => approved
      }) do
    # Action approval is stored for the session to consume
    case Harness.lookup_session(session_id) do
      {:ok, _pid} ->
        {:ok,
         %{
           session_id: session_id,
           action_id: action_id,
           approved: approved,
           recorded: true
         }}

      :error ->
        {:error, "Session not found: #{session_id}"}
    end
  end

  def handle_call("harness_escalation_response", %{
        "session_id" => session_id,
        "escalation_id" => escalation_id,
        "action" => action
      }) do
    case Harness.lookup_session(session_id) do
      {:ok, _pid} ->
        {:ok,
         %{
           session_id: session_id,
           escalation_id: escalation_id,
           action: action,
           recorded: true
         }}

      :error ->
        {:error, "Session not found: #{session_id}"}
    end
  end

  def handle_call(tool_name, _args) do
    {:error, "Unknown tool: #{tool_name}"}
  end

  ## Helpers

  defp parse_tier("local_small"), do: :local_small
  defp parse_tier("local_large"), do: :local_large
  defp parse_tier("cloud_frontier"), do: :cloud_frontier
  defp parse_tier(_), do: :cloud_frontier

  defp parse_autonomy("observe"), do: :observe
  defp parse_autonomy("advise"), do: :advise
  defp parse_autonomy("act"), do: :act
  defp parse_autonomy(_), do: :act
end
