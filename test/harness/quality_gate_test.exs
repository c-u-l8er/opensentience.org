defmodule OpenSentience.Harness.QualityGateTest do
  use ExUnit.Case, async: true

  alias OpenSentience.Harness.QualityGate

  setup do
    {:ok, pid} = QualityGate.start_link(session_id: "test-qg")
    %{gate: pid}
  end

  describe "grade/4" do
    test "passes when all criteria have test_fn returning true", %{gate: gate} do
      criteria = [
        %{id: "ac-1", test_fn: fn _artifacts -> true end},
        %{id: "ac-2", test_fn: fn _artifacts -> {:pass, "found it"} end}
      ]

      assert {:pass, eval} = QualityGate.grade(gate, "sprint-1", %{code: "hello"}, criteria)
      assert eval.overall == :pass
      assert length(eval.criteria_results) == 2
      assert Enum.all?(eval.criteria_results, fn r -> r.result == :pass end)
    end

    test "fails when any criterion test_fn returns false", %{gate: gate} do
      criteria = [
        %{id: "ac-1", test_fn: fn _artifacts -> true end},
        %{id: "ac-2", test_fn: fn _artifacts -> {:fail, "missing field X"} end}
      ]

      assert {:fail, eval} = QualityGate.grade(gate, "sprint-1", %{}, criteria)
      assert eval.overall == :fail

      failed = Enum.find(eval.criteria_results, fn r -> r.result == :fail end)
      assert failed.id == "ac-2"
      assert failed.feedback == "missing field X"
    end

    test "artifact_key criteria pass when key exists", %{gate: gate} do
      criteria = [%{id: "ac-1", artifact_key: :output}]

      assert {:pass, _} = QualityGate.grade(gate, "s1", %{output: "data"}, criteria)
      assert {:fail, _} = QualityGate.grade(gate, "s2", %{other: "data"}, criteria)
    end
  end

  describe "iterate/5" do
    test "passes on first iteration when generator succeeds", %{gate: gate} do
      criteria = [%{id: "ac-1", test_fn: fn _ -> true end}]

      generate_fn = fn _iter, _feedback ->
        {:ok, %{output: "done"}}
      end

      assert {:pass, eval, artifacts} =
               QualityGate.iterate(gate, "sprint-iter-1", criteria, generate_fn,
                 max_iterations: 3
               )

      assert eval.overall == :pass
      assert artifacts == %{output: "done"}
    end

    test "retries and passes on second iteration", %{gate: gate} do
      criteria = [%{id: "ac-1", artifact_key: :result}]

      # First call returns no :result key, second call does
      counter = :counters.new(1, [:atomics])

      generate_fn = fn _iter, _feedback ->
        count = :counters.get(counter, 1)
        :counters.add(counter, 1, 1)

        if count == 0 do
          {:ok, %{wrong_key: "nope"}}
        else
          {:ok, %{result: "success"}}
        end
      end

      assert {:pass, eval, _artifacts} =
               QualityGate.iterate(gate, "sprint-retry", criteria, generate_fn, max_iterations: 3)

      assert eval.iteration == 2
    end

    test "escalates after max iterations exhausted", %{gate: gate} do
      criteria = [%{id: "ac-1", test_fn: fn _ -> false end}]

      generate_fn = fn _iter, _feedback ->
        {:ok, %{output: "always fails"}}
      end

      assert {:escalate, evals} =
               QualityGate.iterate(gate, "sprint-esc", criteria, generate_fn, max_iterations: 2)

      assert length(evals) == 2
    end

    test "handles generator errors gracefully", %{gate: gate} do
      criteria = [%{id: "ac-1", test_fn: fn _ -> true end}]
      counter = :counters.new(1, [:atomics])

      generate_fn = fn _iter, _feedback ->
        count = :counters.get(counter, 1)
        :counters.add(counter, 1, 1)

        if count == 0 do
          {:error, :boom}
        else
          {:ok, %{output: "recovered"}}
        end
      end

      assert {:pass, eval, _} =
               QualityGate.iterate(gate, "sprint-err", criteria, generate_fn, max_iterations: 3)

      assert eval.iteration == 2
    end
  end

  describe "evaluations/2" do
    test "tracks all evaluations for a sprint", %{gate: gate} do
      criteria = [%{id: "ac-1", test_fn: fn _ -> true end}]

      QualityGate.grade(gate, "s1", %{}, criteria)
      QualityGate.grade(gate, "s1", %{}, criteria)

      evals = QualityGate.evaluations(gate, "s1")
      assert length(evals) == 2
    end
  end
end
