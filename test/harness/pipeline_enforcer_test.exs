defmodule OpenSentience.Harness.PipelineEnforcerTest do
  use ExUnit.Case, async: true

  alias OpenSentience.Harness.PipelineEnforcer

  setup do
    {:ok, pid} = PipelineEnforcer.start_link(session_id: "test-session")
    %{enforcer: pid}
  end

  describe "read tools" do
    test "read tools are always allowed without prerequisites", %{enforcer: enforcer} do
      read_tools = [
        :retrieve_context,
        :retrieve_episodic,
        :retrieve_procedural,
        :query_graph,
        :graph_stats,
        :graph_traverse,
        :topology_analyze,
        :coverage_query,
        :attention_survey,
        :attention_run_cycle,
        :run_consolidation,
        :learn_detect_novelty
      ]

      for tool <- read_tools do
        assert :ok = PipelineEnforcer.check_prerequisites(enforcer, tool),
               "Expected #{tool} to be allowed"
      end
    end
  end

  describe "retrieve-before-act enforcement" do
    test "write tools are blocked before retrieval", %{enforcer: enforcer} do
      # Tools that only need retrieve_context
      for tool <- [:store_node, :store_edge, :learn_from_feedback] do
        assert {:block, _reason, [:retrieve_context]} =
                 PipelineEnforcer.check_prerequisites(enforcer, tool),
               "Expected #{tool} to be blocked"
      end

      # learn_from_outcome has TWO prerequisites: retrieve_context AND execute_action
      assert {:block, _reason, missing} =
               PipelineEnforcer.check_prerequisites(enforcer, :learn_from_outcome)

      assert :retrieve_context in missing
      assert :execute_action in missing
    end

    test "write tools are allowed after retrieval completes", %{enforcer: enforcer} do
      :ok = PipelineEnforcer.record_completion(enforcer, :retrieve_context)

      assert :ok = PipelineEnforcer.check_prerequisites(enforcer, :store_node)
      assert :ok = PipelineEnforcer.check_prerequisites(enforcer, :store_edge)
    end
  end

  describe "deliberation prerequisites" do
    test "deliberate is blocked before topology_analyze", %{enforcer: enforcer} do
      assert {:block, _reason, [:topology_analyze]} =
               PipelineEnforcer.check_prerequisites(enforcer, :deliberate)
    end

    test "deliberate is allowed after topology_analyze completes", %{enforcer: enforcer} do
      :ok = PipelineEnforcer.record_completion(enforcer, :topology_analyze)
      assert :ok = PipelineEnforcer.check_prerequisites(enforcer, :deliberate)
    end
  end

  describe "coverage-gated execution" do
    test "execute_action is blocked before coverage_query", %{enforcer: enforcer} do
      assert {:block, _reason, [:coverage_query]} =
               PipelineEnforcer.check_prerequisites(enforcer, :execute_action)
    end

    test "execute_action is allowed after coverage_query", %{enforcer: enforcer} do
      :ok = PipelineEnforcer.record_completion(enforcer, :coverage_query)
      assert :ok = PipelineEnforcer.check_prerequisites(enforcer, :execute_action)
    end
  end

  describe "outcome learning prerequisites" do
    test "learn_from_outcome requires both retrieve and execute", %{enforcer: enforcer} do
      # Blocked by retrieve-before-act AND execute_action prerequisite
      assert {:block, _reason, missing} =
               PipelineEnforcer.check_prerequisites(enforcer, :learn_from_outcome)

      assert :retrieve_context in missing
      assert :execute_action in missing
    end

    test "learn_from_outcome is allowed after full pipeline", %{enforcer: enforcer} do
      :ok = PipelineEnforcer.record_completion(enforcer, :retrieve_context)
      :ok = PipelineEnforcer.record_completion(enforcer, :execute_action)
      assert :ok = PipelineEnforcer.check_prerequisites(enforcer, :learn_from_outcome)
    end
  end

  describe "lifecycle checks" do
    test "session complete requires store_node", %{enforcer: enforcer} do
      assert {:block, _reason, [:store_node]} =
               PipelineEnforcer.check_lifecycle(enforcer, {:session, :complete})
    end

    test "session complete passes after store_node", %{enforcer: enforcer} do
      :ok = PipelineEnforcer.record_completion(enforcer, :store_node)
      assert :ok = PipelineEnforcer.check_lifecycle(enforcer, {:session, :complete})
    end

    test "sprint advance requires quality gate pass", %{enforcer: enforcer} do
      assert {:block, _reason, [:quality_gate]} =
               PipelineEnforcer.check_lifecycle(enforcer, {:sprint, :advance})
    end

    test "sprint advance passes after quality gate with pass result", %{enforcer: enforcer} do
      :ok = PipelineEnforcer.record_completion(enforcer, :quality_gate, %{result: :pass})
      assert :ok = PipelineEnforcer.check_lifecycle(enforcer, {:sprint, :advance})
    end

    test "sprint advance fails if quality gate result is not pass", %{enforcer: enforcer} do
      :ok = PipelineEnforcer.record_completion(enforcer, :quality_gate, %{result: :fail})

      assert {:block, _reason, [:quality_gate]} =
               PipelineEnforcer.check_lifecycle(enforcer, {:sprint, :advance})
    end
  end

  describe "stage tracking" do
    test "completed_stages returns all recorded completions", %{enforcer: enforcer} do
      :ok = PipelineEnforcer.record_completion(enforcer, :retrieve_context)
      :ok = PipelineEnforcer.record_completion(enforcer, :topology_analyze, %{kappa: 0})

      stages = PipelineEnforcer.completed_stages(enforcer)
      assert Map.has_key?(stages, :retrieve_context)
      assert Map.has_key?(stages, :topology_analyze)
      assert stages[:topology_analyze].metadata == %{kappa: 0}
    end

    test "current_stage advances through reactive pipeline", %{enforcer: enforcer} do
      assert :idle = PipelineEnforcer.current_stage(enforcer)

      :ok = PipelineEnforcer.record_completion(enforcer, :retrieve_context)
      assert :analyzing = PipelineEnforcer.current_stage(enforcer)

      :ok = PipelineEnforcer.record_completion(enforcer, :topology_analyze)
      assert :deliberating = PipelineEnforcer.current_stage(enforcer)
    end
  end

  describe "audit log" do
    test "audit log records completions and blocks", %{enforcer: enforcer} do
      # Trigger a block
      {:block, _, _} = PipelineEnforcer.check_prerequisites(enforcer, :store_node)

      # Record a completion
      :ok = PipelineEnforcer.record_completion(enforcer, :retrieve_context)

      log = PipelineEnforcer.audit_log(enforcer)
      assert length(log) == 2

      [blocked_entry, completed_entry] = log
      assert blocked_entry.event_type == :pipeline_stage_blocked
      assert completed_entry.event_type == :pipeline_stage_completed
    end
  end

  describe "reset" do
    test "reset clears all state", %{enforcer: enforcer} do
      :ok = PipelineEnforcer.record_completion(enforcer, :retrieve_context)
      :ok = PipelineEnforcer.reset(enforcer)

      # Should be blocked again after reset
      assert {:block, _, _} = PipelineEnforcer.check_prerequisites(enforcer, :store_node)
      assert %{} = PipelineEnforcer.completed_stages(enforcer)
      assert :idle = PipelineEnforcer.current_stage(enforcer)
    end
  end

  describe "unknown tools" do
    test "unknown tools that are not in read or write lists are allowed", %{enforcer: enforcer} do
      assert :ok = PipelineEnforcer.check_prerequisites(enforcer, :some_unknown_tool)
    end
  end
end
