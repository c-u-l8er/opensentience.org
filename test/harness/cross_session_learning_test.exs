defmodule OpenSentience.Harness.CrossSessionLearningTest do
  use ExUnit.Case, async: false

  alias OpenSentience.Harness.CrossSessionLearning

  setup do
    CrossSessionLearning.clear()
    :ok
  end

  @outcome %{
    type: :harness_outcome,
    status: :failed,
    session_id: "sess-001",
    workspace_id: "ws-test",
    agent_id: "agent-a",
    spec_hash: "hash-1",
    details: %{reason: :max_iterations_reached, sprint_id: "s1"},
    timestamp: ~U[2026-04-15 12:00:00Z]
  }

  describe "store_local/1 and retrieve_local/2" do
    test "stores and retrieves outcomes by agent_id + spec_hash" do
      :ok = CrossSessionLearning.store_local(@outcome)
      {:ok, outcomes} = CrossSessionLearning.retrieve_local("agent-a", "hash-1")

      assert length(outcomes) == 1
      assert hd(outcomes).session_id == "sess-001"
      assert hd(outcomes).status == :failed
    end

    test "accumulates multiple outcomes for same key" do
      :ok = CrossSessionLearning.store_local(@outcome)

      outcome2 = %{@outcome | session_id: "sess-002", status: :succeeded}
      :ok = CrossSessionLearning.store_local(outcome2)

      {:ok, outcomes} = CrossSessionLearning.retrieve_local("agent-a", "hash-1")
      assert length(outcomes) == 2
    end

    test "different agent_id/spec_hash tuples are independent" do
      :ok = CrossSessionLearning.store_local(@outcome)

      other = %{@outcome | agent_id: "agent-b", spec_hash: "hash-2"}
      :ok = CrossSessionLearning.store_local(other)

      {:ok, outcomes_a} = CrossSessionLearning.retrieve_local("agent-a", "hash-1")
      {:ok, outcomes_b} = CrossSessionLearning.retrieve_local("agent-b", "hash-2")

      assert length(outcomes_a) == 1
      assert length(outcomes_b) == 1
    end

    test "returns empty list for unknown key" do
      {:ok, outcomes} = CrossSessionLearning.retrieve_local("unknown", "unknown")
      assert outcomes == []
    end
  end

  describe "to_graphonomous_node/1" do
    test "builds a valid Graphonomous-compatible node" do
      node = CrossSessionLearning.to_graphonomous_node(@outcome)

      assert node.node_type == "outcome"
      assert node.source == "os008_harness"
      assert node.confidence == 0.3
      assert is_binary(node.content)
      assert String.contains?(node.content, "agent-a")

      metadata = Jason.decode!(node.metadata)
      assert metadata["agent_id"] == "agent-a"
      assert metadata["spec_hash"] == "hash-1"
      assert metadata["status"] == "failed"
    end

    test "succeeded outcomes get higher confidence" do
      succeeded = %{@outcome | status: :succeeded}
      node = CrossSessionLearning.to_graphonomous_node(succeeded)
      assert node.confidence == 0.9
    end
  end

  describe "to_learning_signal/1" do
    test "builds a valid learning signal" do
      signal = CrossSessionLearning.to_learning_signal(@outcome)

      assert signal.action == "from_outcome"
      assert signal.status == "failed"
      assert signal.confidence == 0.3
      assert signal.action_id == "sess-001"
    end
  end

  describe "clear/0" do
    test "removes all stored outcomes" do
      :ok = CrossSessionLearning.store_local(@outcome)
      :ok = CrossSessionLearning.clear()

      {:ok, outcomes} = CrossSessionLearning.retrieve_local("agent-a", "hash-1")
      assert outcomes == []
    end
  end
end
