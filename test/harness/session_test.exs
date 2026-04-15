defmodule OpenSentience.Harness.SessionTest do
  use ExUnit.Case, async: false

  alias OpenSentience.Harness

  describe "session lifecycle" do
    test "start and stop a session" do
      {:ok, pid} = Harness.start_session(session_id: "sess-lifecycle")
      assert Process.alive?(pid)

      status = Harness.session_status(pid)
      assert status.session_id == "sess-lifecycle"
      assert status.status == :active
      assert status.autonomy_level == :act
      assert status.model_tier == :cloud_frontier

      :ok = Harness.stop_session(pid)
      refute Process.alive?(pid)
    end

    test "session with workspace scoping" do
      {:ok, pid} =
        Harness.start_session(
          session_id: "sess-ws",
          workspace_id: "ws-123",
          user_id: "user-456",
          agent_id: "agent-789",
          goal_id: "goal-abc"
        )

      status = Harness.session_status(pid)
      assert status.workspace_id == "ws-123"
      assert status.agent_id == "agent-789"
      assert status.goal_id == "goal-abc"

      Harness.stop_session(pid)
    end

    test "session with custom model tier and autonomy" do
      {:ok, pid} =
        Harness.start_session(
          session_id: "sess-tier",
          model_tier: :local_small,
          autonomy_level: :observe
        )

      status = Harness.session_status(pid)
      assert status.model_tier == :local_small
      assert status.autonomy_level == :observe

      Harness.stop_session(pid)
    end

    test "auto-generates session_id when not provided" do
      {:ok, pid} = Harness.start_session()
      status = Harness.session_status(pid)
      assert is_binary(status.session_id)
      assert byte_size(status.session_id) > 0

      Harness.stop_session(pid)
    end
  end

  describe "pipeline enforcement through session" do
    test "session delegates prerequisite checks to enforcer" do
      {:ok, pid} = Harness.start_session(session_id: "sess-enforce")

      # Write tool should be blocked before retrieval
      assert {:block, _reason, [:retrieve_context]} =
               Harness.check_prerequisites(pid, :store_node)

      # Record retrieval
      :ok = Harness.record_completion(pid, :retrieve_context)

      # Now write tool should be allowed
      assert :ok = Harness.check_prerequisites(pid, :store_node)

      Harness.stop_session(pid)
    end

    test "session lifecycle check for completion" do
      {:ok, pid} = Harness.start_session(session_id: "sess-lifecycle-check")

      assert {:block, _, [:store_node]} =
               Harness.check_lifecycle(pid, {:session, :complete})

      :ok = Harness.record_completion(pid, :store_node)
      assert :ok = Harness.check_lifecycle(pid, {:session, :complete})

      Harness.stop_session(pid)
    end

    test "session audit log tracks events" do
      {:ok, pid} = Harness.start_session(session_id: "sess-audit")

      {:block, _, _} = Harness.check_prerequisites(pid, :store_node)
      :ok = Harness.record_completion(pid, :retrieve_context)

      log = Harness.audit_log(pid)
      assert length(log) == 2

      event_types = Enum.map(log, & &1.event_type)
      assert :pipeline_stage_blocked in event_types
      assert :pipeline_stage_completed in event_types

      Harness.stop_session(pid)
    end
  end

  describe "multiple concurrent sessions" do
    test "sessions are independent" do
      {:ok, pid1} = Harness.start_session(session_id: "sess-a")
      {:ok, pid2} = Harness.start_session(session_id: "sess-b")

      # Complete retrieval in session 1 only
      :ok = Harness.record_completion(pid1, :retrieve_context)

      # Session 1 allows writes, session 2 does not
      assert :ok = Harness.check_prerequisites(pid1, :store_node)

      assert {:block, _, _} = Harness.check_prerequisites(pid2, :store_node)

      Harness.stop_session(pid1)
      Harness.stop_session(pid2)
    end
  end

  describe "session lookup" do
    test "lookup_session finds active sessions" do
      {:ok, pid} = Harness.start_session(session_id: "sess-lookup")
      assert {:ok, ^pid} = Harness.lookup_session("sess-lookup")

      Harness.stop_session(pid)
    end

    test "lookup_session returns :error for unknown sessions" do
      assert :error = Harness.lookup_session("nonexistent")
    end
  end

  describe "active_sessions count" do
    test "tracks active session count" do
      initial = Harness.active_sessions()

      {:ok, pid1} = Harness.start_session(session_id: "sess-count-1")
      {:ok, pid2} = Harness.start_session(session_id: "sess-count-2")

      assert Harness.active_sessions() == initial + 2

      Harness.stop_session(pid1)
      Harness.stop_session(pid2)
    end
  end

  describe "coverage routing (pure function)" do
    test "recommend_dispatch delegates to Coverage module" do
      assert :escalate = Harness.recommend_dispatch(:escalate, 0, :act)
      assert :act = Harness.recommend_dispatch(:act, 0, :act)
      assert :focus = Harness.recommend_dispatch(:act, 0.5, :act)
      assert :idle = Harness.recommend_dispatch(:none, 0, :act)
    end
  end
end
