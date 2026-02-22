defmodule OpenSentience.AgentTest do
  use ExUnit.Case, async: true

  alias OpenSentience.Agent

  defp notify_to_self do
    fn msg ->
      send(self(), {:notify, msg})
      :ok
    end
  end

  defp drain_notifications(acc \\ []) do
    receive do
      {:notify, msg} -> drain_notifications([msg | acc])
    after
      0 -> Enum.reverse(acc)
    end
  end

  defp request(method, id, params) do
    %{
      "jsonrpc" => "2.0",
      "id" => id,
      "method" => method,
      "params" => params
    }
  end

  defp notification(method, params) do
    %{
      "jsonrpc" => "2.0",
      "method" => method,
      "params" => params
    }
  end

  describe "initialize" do
    test "returns protocol version, agent capabilities/info, and updates agent state" do
      state = Agent.new()

      {state, resp} =
        Agent.handle(
          state,
          request("initialize", 1, %{
            "protocolVersion" => 1,
            "clientCapabilities" => %{"fs" => %{"readTextFile" => true}},
            "clientInfo" => %{"name" => "zed", "version" => "0.0.0"}
          }),
          notify_to_self()
        )

      assert resp["jsonrpc"] == "2.0"
      assert resp["id"] == 1
      assert is_map(resp["result"])

      result = resp["result"]
      assert result["protocolVersion"] == 1
      assert is_map(result["agentCapabilities"])
      assert is_map(result["agentInfo"])
      assert result["agentInfo"]["name"] == "opensentience"
      assert result["agentInfo"]["title"] == "OpenSentience"
      assert result["agentInfo"]["version"] == "0.1.0"
      assert result["authMethods"] == []

      # The agent should not emit notifications during initialize.
      assert drain_notifications() == []

      # Internal state should record negotiated protocol and client metadata.
      assert state.protocol_version == 1
      assert state.client_info == %{"name" => "zed", "version" => "0.0.0"}
      assert state.client_capabilities == %{"fs" => %{"readTextFile" => true}}
    end

    test "rejects invalid protocolVersion type" do
      state = Agent.new()

      {_state, resp} =
        Agent.handle(
          state,
          request("initialize", 1, %{"protocolVersion" => "1"}),
          notify_to_self()
        )

      assert resp["jsonrpc"] == "2.0"
      assert resp["id"] == 1
      assert resp["error"]["code"] == -32602
      assert resp["error"]["message"] == "Invalid params"
      assert resp["error"]["data"]["detail"] =~ "protocolVersion"
    end
  end

  describe "session lifecycle" do
    test "session/new fails before initialize" do
      state = Agent.new()

      {_state, resp} =
        Agent.handle(
          state,
          request("session/new", 1, %{"cwd" => Path.expand("."), "mcpServers" => []}),
          notify_to_self()
        )

      assert resp["error"]["code"] == -32000
      assert resp["error"]["message"] == "Not initialized"
      assert resp["error"]["data"]["detail"] =~ "initialize"
    end

    test "session/new creates a session with absolute cwd and returns a sessionId" do
      notify = notify_to_self()

      # initialize
      {state, _init_resp} =
        Agent.handle(
          Agent.new(),
          request("initialize", 1, %{"protocolVersion" => 1, "clientCapabilities" => %{}}),
          notify
        )

      cwd = Path.expand(".")

      {state, resp} =
        Agent.handle(
          state,
          request("session/new", 2, %{"cwd" => cwd, "mcpServers" => []}),
          notify
        )

      assert resp["jsonrpc"] == "2.0"
      assert resp["id"] == 2
      assert is_binary(resp["result"]["sessionId"])

      session_id = resp["result"]["sessionId"]
      assert session_id =~ "sess_"
      assert is_map(state.sessions)
      assert is_map(state.sessions[session_id])
      assert state.sessions[session_id].cwd == cwd
    end

    test "session/new rejects relative cwd" do
      notify = notify_to_self()

      {state, _} =
        Agent.handle(
          Agent.new(),
          request("initialize", 1, %{"protocolVersion" => 1, "clientCapabilities" => %{}}),
          notify
        )

      {_state, resp} =
        Agent.handle(
          state,
          request("session/new", 2, %{"cwd" => "relative/path", "mcpServers" => []}),
          notify
        )

      assert resp["error"]["code"] == -32602
      assert resp["error"]["message"] == "Invalid params"
      assert resp["error"]["data"]["detail"] =~ "absolute"
    end

    test "session/set_mode updates the session and emits a mode session/update notification" do
      notify = notify_to_self()

      {state, _} =
        Agent.handle(
          Agent.new(),
          request("initialize", 1, %{"protocolVersion" => 1, "clientCapabilities" => %{}}),
          notify
        )

      {state, resp} =
        Agent.handle(
          state,
          request("session/new", 2, %{"cwd" => Path.expand("."), "mcpServers" => []}),
          notify
        )

      session_id = resp["result"]["sessionId"]

      {state, resp} =
        Agent.handle(
          state,
          request("session/set_mode", 3, %{"sessionId" => session_id, "mode" => "assistant"}),
          notify
        )

      assert resp["jsonrpc"] == "2.0"
      assert resp["id"] == 3
      # The agent currently returns a JSON-RPC result of `null` (Elixir `nil`) for this method.
      assert Map.has_key?(resp, "result")
      assert resp["result"] == nil

      notifs = drain_notifications()

      assert Enum.any?(notifs, fn msg ->
               msg["method"] == "session/update" and
                 msg["params"]["sessionId"] == session_id and
                 msg["params"]["update"]["sessionUpdate"] == "mode" and
                 msg["params"]["update"]["mode"] == "assistant"
             end)

      assert state.sessions[session_id].mode == "assistant"
    end

    test "session/cancel emits a cancellation update notification (best-effort)" do
      notify = notify_to_self()

      {state, _} =
        Agent.handle(
          Agent.new(),
          request("initialize", 1, %{"protocolVersion" => 1, "clientCapabilities" => %{}}),
          notify
        )

      {state, resp} =
        Agent.handle(
          state,
          request("session/new", 2, %{"cwd" => Path.expand("."), "mcpServers" => []}),
          notify
        )

      session_id = resp["result"]["sessionId"]

      {new_state, response_or_nil} =
        Agent.handle(state, notification("session/cancel", %{"sessionId" => session_id}), notify)

      assert response_or_nil == nil
      assert new_state == state

      notifs = drain_notifications()

      assert Enum.any?(notifs, fn msg ->
               msg["method"] == "session/update" and
                 msg["params"]["sessionId"] == session_id and
                 msg["params"]["update"]["sessionUpdate"] == "agent_message_chunk" and
                 get_in(msg, ["params", "update", "content", "type"]) == "text" and
                 (get_in(msg, ["params", "update", "content", "text"]) || "") =~
                   "Cancellation requested"
             end)
    end
  end

  describe "session/prompt streaming updates" do
    test "emits plan + agent_message_chunk updates and returns stopReason=end_turn" do
      notify = notify_to_self()

      # initialize
      {state, _} =
        Agent.handle(
          Agent.new(),
          request("initialize", 1, %{"protocolVersion" => 1, "clientCapabilities" => %{}}),
          notify
        )

      # session/new
      {state, resp} =
        Agent.handle(
          state,
          request("session/new", 2, %{"cwd" => Path.expand("."), "mcpServers" => []}),
          notify
        )

      session_id = resp["result"]["sessionId"]

      prompt = [
        %{"type" => "text", "text" => "Hello from test"},
        %{"type" => "resource_link", "uri" => "file:///tmp/example.txt"}
      ]

      {state, resp} =
        Agent.handle(
          state,
          request("session/prompt", 3, %{"sessionId" => session_id, "prompt" => prompt}),
          notify
        )

      assert resp["jsonrpc"] == "2.0"
      assert resp["id"] == 3
      assert resp["result"]["stopReason"] == "end_turn"

      notifs = drain_notifications()

      # All notifications should be session/update for this session id.
      assert Enum.all?(notifs, fn msg ->
               msg["jsonrpc"] == "2.0" and
                 msg["method"] == "session/update" and
                 msg["params"]["sessionId"] == session_id and
                 is_map(msg["params"]["update"])
             end)

      assert Enum.any?(notifs, fn msg ->
               msg["params"]["update"]["sessionUpdate"] == "plan"
             end)

      chunks =
        Enum.filter(notifs, fn msg ->
          msg["params"]["update"]["sessionUpdate"] == "agent_message_chunk"
        end)

      assert length(chunks) >= 1

      assert Enum.all?(chunks, fn msg ->
               get_in(msg, ["params", "update", "content", "type"]) == "text" and
                 is_binary(get_in(msg, ["params", "update", "content", "text"]))
             end)

      # History should record user and agent entries.
      session = state.sessions[session_id]
      assert is_list(session.history)
      assert Enum.any?(session.history, &match?(%{role: :user}, &1))
      assert Enum.any?(session.history, &match?(%{role: :agent}, &1))
    end

    test "rejects prompts with non-list prompt param" do
      notify = notify_to_self()

      {state, _} =
        Agent.handle(
          Agent.new(),
          request("initialize", 1, %{"protocolVersion" => 1, "clientCapabilities" => %{}}),
          notify
        )

      {state, resp} =
        Agent.handle(
          state,
          request("session/new", 2, %{"cwd" => Path.expand("."), "mcpServers" => []}),
          notify
        )

      session_id = resp["result"]["sessionId"]

      {_state, resp} =
        Agent.handle(
          state,
          request("session/prompt", 3, %{"sessionId" => session_id, "prompt" => "not a list"}),
          notify
        )

      assert resp["error"]["code"] == -32602
      assert resp["error"]["message"] == "Invalid params"
      assert resp["error"]["data"]["detail"] =~ "prompt must be a list"
    end
  end
end
