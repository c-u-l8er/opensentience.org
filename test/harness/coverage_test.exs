defmodule OpenSentience.Harness.CoverageTest do
  use ExUnit.Case, async: true

  alias OpenSentience.Harness.Coverage

  describe "escalate decision" do
    test "escalate always returns :escalate regardless of kappa or autonomy" do
      assert :escalate = Coverage.recommend(:escalate, 0, :act)
      assert :escalate = Coverage.recommend(:escalate, 0.5, :advise)
      assert :escalate = Coverage.recommend(:escalate, 1.0, :observe)
    end
  end

  describe "learn decision" do
    test "learn with low kappa returns :explore" do
      assert :explore = Coverage.recommend(:learn, 0, :act)
      assert :explore = Coverage.recommend(:learn, 0.2, :advise)
      assert :explore = Coverage.recommend(:learn, 0.44, :observe)
    end

    test "learn with high kappa returns :focus" do
      assert :focus = Coverage.recommend(:learn, 0.45, :act)
      assert :focus = Coverage.recommend(:learn, 0.8, :advise)
      assert :focus = Coverage.recommend(:learn, 1.0, :observe)
    end
  end

  describe "act decision" do
    test "act with kappa > 0 returns :focus (κ-driven deliberation)" do
      assert :focus = Coverage.recommend(:act, 0.1, :act)
      assert :focus = Coverage.recommend(:act, 0.5, :advise)
      assert :focus = Coverage.recommend(:act, 1.0, :observe)
    end

    test "act with kappa = 0 and :act autonomy returns :act" do
      assert :act = Coverage.recommend(:act, 0, :act)
    end

    test "act with kappa = 0 and :advise autonomy returns :deferred" do
      assert :deferred = Coverage.recommend(:act, 0, :advise)
    end

    test "act with kappa = 0 and :observe autonomy returns :log" do
      assert :log = Coverage.recommend(:act, 0, :observe)
    end
  end

  describe "none decision (gap-dependent)" do
    test "none with high gap and :act autonomy returns :propose" do
      assert :propose = Coverage.recommend(:none, 0, :act, gap: 0.5)
      assert :propose = Coverage.recommend(:none, 0.5, :act, gap: 0.31)
    end

    test "none with high gap and non-act autonomy returns :deferred" do
      assert :deferred = Coverage.recommend(:none, 0, :advise, gap: 0.5)
      assert :deferred = Coverage.recommend(:none, 0, :observe, gap: 0.5)
    end

    test "none with low gap returns :idle" do
      assert :idle = Coverage.recommend(:none, 0, :act, gap: 0.1)
      assert :idle = Coverage.recommend(:none, 0, :advise, gap: 0.3)
      assert :idle = Coverage.recommend(:none, 0, :observe, gap: 0.0)
    end

    test "none with no gap option defaults to 0.0 (idle)" do
      assert :idle = Coverage.recommend(:none, 0, :act)
    end
  end

  describe "boundary conditions" do
    test "kappa exactly at 0.45 threshold for learn is :focus" do
      assert :focus = Coverage.recommend(:learn, 0.45, :act)
    end

    test "kappa just below 0.45 threshold for learn is :explore" do
      assert :explore = Coverage.recommend(:learn, 0.449, :act)
    end

    test "gap exactly at 0.3 threshold is :idle (not :propose)" do
      assert :idle = Coverage.recommend(:none, 0, :act, gap: 0.3)
    end

    test "gap just above 0.3 threshold is :propose" do
      assert :propose = Coverage.recommend(:none, 0, :act, gap: 0.301)
    end
  end
end
