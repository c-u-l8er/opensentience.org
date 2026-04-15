defmodule OpenSentience.Harness.TierAdapterTest do
  use ExUnit.Case, async: true

  alias OpenSentience.Harness.TierAdapter

  describe "config_for/1" do
    test "local_small has minimal harness" do
      config = TierAdapter.config_for(:local_small)
      assert config.planner_enabled == false
      assert config.evaluator_enabled == false
      assert config.separate_evaluator_context == false
      assert config.max_sprints_per_task == 1
      assert config.max_iterations_per_sprint == 2
      assert config.context_compaction_threshold == 0.40
      assert config.subagent_delegation == :disabled
      assert config.sprint_contracts == :implicit
    end

    test "local_large has moderate harness" do
      config = TierAdapter.config_for(:local_large)
      assert config.planner_enabled == true
      assert config.evaluator_enabled == true
      assert config.separate_evaluator_context == false
      assert config.max_sprints_per_task == 3
      assert config.max_iterations_per_sprint == 3
    end

    test "cloud_frontier has full harness" do
      config = TierAdapter.config_for(:cloud_frontier)
      assert config.planner_enabled == true
      assert config.evaluator_enabled == true
      assert config.separate_evaluator_context == true
      assert config.max_sprints_per_task == 10
      assert config.max_iterations_per_sprint == 5
      assert config.subagent_delegation == :full
      assert config.sprint_contracts == :explicit_negotiated
    end
  end

  describe "next_tier/1" do
    test "local_small → local_large" do
      assert {:ok, :local_large} = TierAdapter.next_tier(:local_small)
    end

    test "local_large → cloud_frontier" do
      assert {:ok, :cloud_frontier} = TierAdapter.next_tier(:local_large)
    end

    test "cloud_frontier → escalate_to_human" do
      assert :escalate_to_human = TierAdapter.next_tier(:cloud_frontier)
    end
  end

  describe "convenience functions" do
    test "max_iterations/1" do
      assert TierAdapter.max_iterations(:local_small) == 2
      assert TierAdapter.max_iterations(:cloud_frontier) == 5
    end

    test "max_sprints/1" do
      assert TierAdapter.max_sprints(:local_small) == 1
      assert TierAdapter.max_sprints(:cloud_frontier) == 10
    end

    test "separate_evaluator?/1" do
      refute TierAdapter.separate_evaluator?(:local_small)
      refute TierAdapter.separate_evaluator?(:local_large)
      assert TierAdapter.separate_evaluator?(:cloud_frontier)
    end

    test "compaction_threshold/1" do
      assert TierAdapter.compaction_threshold(:local_small) == 0.40
      assert TierAdapter.compaction_threshold(:cloud_frontier) == 0.55
    end
  end
end
