defmodule OpenSentience.Harness.SprintControllerTest do
  use ExUnit.Case, async: true

  alias OpenSentience.Harness.SprintController

  setup do
    {:ok, pid} = SprintController.start_link(session_id: "test-sc", model_tier: :cloud_frontier)
    %{controller: pid}
  end

  defp load_simple_plan(controller) do
    sprints = [
      %{
        id: "sprint-1",
        description: "Implement auth",
        acceptance_criteria: [
          %{id: "ac-1", description: "Login form renders"}
        ]
      },
      %{
        id: "sprint-2",
        description: "Implement dashboard",
        acceptance_criteria: [
          %{id: "ac-2", description: "Dashboard shows data"}
        ]
      }
    ]

    :ok = SprintController.load_plan(controller, "task-1", sprints)
  end

  describe "load_plan/3" do
    test "loads sprints and sets state to in_progress", %{controller: c} do
      load_simple_plan(c)

      status = SprintController.status(c)
      assert status.overall_state == :in_progress
      assert status.total_sprints == 2
      assert status.current_sprint_index == 0
    end

    test "respects tier max sprints limit" do
      {:ok, pid} = SprintController.start_link(session_id: "test-tier", model_tier: :local_small)

      # local_small has max_sprints_per_task = 1
      sprints = [
        %{id: "s1", description: "A", acceptance_criteria: []},
        %{id: "s2", description: "B", acceptance_criteria: []}
      ]

      :ok = SprintController.load_plan(pid, "task", sprints)

      status = SprintController.status(pid)
      assert status.total_sprints == 1
    end
  end

  describe "sprint lifecycle transitions" do
    test "full happy path: planned → generating → evaluating → passed → committed", %{
      controller: c
    } do
      load_simple_plan(c)

      # Start generating
      assert {:ok, :generating} = SprintController.transition(c, :start_generating)

      sprint = SprintController.current_sprint(c)
      assert sprint.state == :generating
      assert sprint.iteration == 1

      # Submit artifacts
      assert {:ok, :evaluating} =
               SprintController.transition(c, :submit_artifacts, %{artifacts: %{code: "..."}})

      # Evaluation passes
      eval = %{evaluator_confidence: 0.95}

      assert {:ok, :passed} =
               SprintController.transition(c, :evaluation_passed, %{evaluation: eval})

      # Commit
      assert {:ok, :committed} = SprintController.transition(c, :commit)

      # Should advance to sprint-2
      status = SprintController.status(c)
      assert status.current_sprint_index == 1
    end

    test "evaluation failure → feedback → retry", %{controller: c} do
      load_simple_plan(c)

      {:ok, :generating} = SprintController.transition(c, :start_generating)
      {:ok, :evaluating} = SprintController.transition(c, :submit_artifacts, %{artifacts: %{}})

      eval = %{evaluator_confidence: 0.3}
      {:ok, :feedback} = SprintController.transition(c, :evaluation_failed, %{evaluation: eval})

      # Can start generating again from feedback state
      {:ok, :generating} = SprintController.transition(c, :start_generating)

      sprint = SprintController.current_sprint(c)
      assert sprint.iteration == 2
    end

    test "escalates after max iterations", %{controller: c} do
      # Use local_small tier (max 2 iterations)
      {:ok, pid} =
        SprintController.start_link(session_id: "test-esc", model_tier: :local_small)

      sprints = [%{id: "s1", description: "Test", acceptance_criteria: []}]
      :ok = SprintController.load_plan(pid, "task", sprints)

      # Iteration 1: fail
      {:ok, :generating} = SprintController.transition(pid, :start_generating)
      {:ok, :evaluating} = SprintController.transition(pid, :submit_artifacts, %{artifacts: %{}})
      {:ok, :feedback} = SprintController.transition(pid, :evaluation_failed, %{evaluation: %{}})

      # Iteration 2: fail → escalate (max_iterations = 2)
      {:ok, :generating} = SprintController.transition(pid, :start_generating)
      {:ok, :evaluating} = SprintController.transition(pid, :submit_artifacts, %{artifacts: %{}})
      {:ok, :escalated} = SprintController.transition(pid, :evaluation_failed, %{evaluation: %{}})
    end

    test "invalid transitions return errors", %{controller: c} do
      load_simple_plan(c)

      # Can't submit artifacts from :planned state
      assert {:error, _} = SprintController.transition(c, :submit_artifacts, %{artifacts: %{}})

      # Can't commit from :planned state
      assert {:error, _} = SprintController.transition(c, :commit)
    end
  end

  describe "sprint contract" do
    test "generates sprint contract on plan load", %{controller: c} do
      load_simple_plan(c)

      contract = SprintController.sprint_contract(c)
      assert contract.sprint_id == "sprint-1"
      assert contract.task_id == "task-1"
      assert contract.generator_constraints.must_retrieve_before_generating == true
    end

    test "can look up contract by sprint_id", %{controller: c} do
      load_simple_plan(c)

      contract = SprintController.sprint_contract(c, "sprint-2")
      assert contract.sprint_id == "sprint-2"
    end
  end

  describe "status/1" do
    test "returns comprehensive status", %{controller: c} do
      status = SprintController.status(c)
      assert status.overall_state == :idle
      assert status.total_sprints == 0
    end
  end

  describe "complete task" do
    test "marks completed after all sprints committed", %{controller: c} do
      # Single sprint plan
      sprints = [%{id: "s1", description: "Only sprint", acceptance_criteria: []}]
      :ok = SprintController.load_plan(c, "task", sprints)

      {:ok, :generating} = SprintController.transition(c, :start_generating)
      {:ok, :evaluating} = SprintController.transition(c, :submit_artifacts, %{artifacts: %{}})
      {:ok, :passed} = SprintController.transition(c, :evaluation_passed, %{evaluation: %{}})
      {:ok, :committed} = SprintController.transition(c, :commit)

      status = SprintController.status(c)
      assert status.overall_state == :completed
    end
  end
end
