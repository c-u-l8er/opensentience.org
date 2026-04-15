defmodule OpenSentience.Harness.ContextManagerTest do
  use ExUnit.Case, async: true

  alias OpenSentience.Harness.ContextManager

  setup do
    {:ok, pid} =
      ContextManager.start_link(
        session_id: "test-cm",
        model_tier: :cloud_frontier,
        max_context_tokens: 100_000
      )

    %{manager: pid}
  end

  describe "on_tool_result/4" do
    test "tracks token usage for normal results", %{manager: m} do
      assert {:ok, status} = ContextManager.on_tool_result(m, :retrieve, "data", 500)
      assert status.current_tokens == 500
    end

    test "triggers overflow for large results", %{manager: m} do
      large_result = String.duplicate("x", 25_000)

      assert {:overflow, file_path} =
               ContextManager.on_tool_result(m, :big_tool, large_result, 25_000)

      assert File.exists?(file_path)

      # Overflow tokens should NOT count in context
      assert ContextManager.utilization(m) < 0.01

      # Cleanup
      File.rm(file_path)
    end

    test "triggers compaction when threshold exceeded", %{manager: m} do
      # Push utilization just below 55% then trigger with one more result
      {:ok, _} = ContextManager.on_tool_result(m, :tool1, "data", 18_000)
      {:ok, _} = ContextManager.on_tool_result(m, :tool2, "data", 18_000)
      {:ok, _} = ContextManager.on_tool_result(m, :tool3, "data", 18_000)

      # Total is now 54K (54% of 100K) — just below threshold
      # Next result pushes to 56K (56%) → compaction
      assert {:compacted, summary} = ContextManager.on_tool_result(m, :tool4, "more", 2_000)

      assert summary.compaction_count == 1
      assert summary.tokens_before > summary.tokens_after
    end
  end

  describe "utilization/1" do
    test "returns 0.0 initially", %{manager: m} do
      assert ContextManager.utilization(m) == 0.0
    end

    test "increases with tool results", %{manager: m} do
      {:ok, _} = ContextManager.on_tool_result(m, :tool, "data", 10_000)
      assert ContextManager.utilization(m) == 0.1
    end
  end

  describe "compact/1" do
    test "manual compaction works", %{manager: m} do
      {:ok, _} = ContextManager.on_tool_result(m, :tool, "data", 15_000)
      {:compacted, summary} = ContextManager.compact(m)

      assert summary.compaction_count == 1
      assert summary.tokens_after < summary.tokens_before
    end
  end

  describe "status/1" do
    test "returns full status summary", %{manager: m} do
      status = ContextManager.status(m)
      assert status.session_id == "test-cm"
      assert status.model_tier == :cloud_frontier
      assert status.max_context_tokens == 100_000
      assert status.compaction_count == 0
    end
  end

  describe "tier-specific behavior" do
    test "local_small has lower compaction threshold" do
      {:ok, pid} =
        ContextManager.start_link(
          session_id: "test-small",
          model_tier: :local_small,
          max_context_tokens: 4_096
        )

      status = ContextManager.status(pid)
      assert status.compaction_threshold == 0.40
    end
  end

  describe "delegation tracking" do
    test "records subagent delegations", %{manager: m} do
      :ok = ContextManager.record_delegation(m, "sub-agent-1", %{task: "research"})
      # Just verify no crash — delegation is recorded in history
    end
  end
end
