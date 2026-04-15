defmodule OpenSentience.Harness.DarkFactoryTest do
  use ExUnit.Case, async: false

  alias OpenSentience.Harness.DarkFactory
  alias OpenSentience.Harness.CrossSessionLearning

  defp trigger do
    %{
      type: "ConsolidationEvent",
      source: "specprompt",
      workspace_id: "ws-test",
      agent_id: "agent-test",
      spec_hash: "abc123",
      task_description: "Build auth flow",
      model_tier: :cloud_frontier,
      governance_block: nil,
      sprint_specs: [
        %{
          id: "sprint-1",
          description: "Implement login",
          acceptance_criteria: [
            %{id: "ac-1", test_fn: fn _ -> true end}
          ]
        }
      ]
    }
  end

  describe "process_trigger/2" do
    test "succeeds with auto-pass when no generate_fn provided" do
      assert {:succeeded, details} = DarkFactory.process_trigger(trigger())
      assert details.sprints_completed == 1
    end

    test "succeeds with custom generate_fn" do
      generate_fn = fn _contract, _iter, _feedback ->
        {:ok, %{code: "implemented"}}
      end

      result = DarkFactory.process_trigger(trigger(), %{generate_fn: generate_fn})
      assert {:succeeded, _} = result
    end

    test "fails when sprint_specs is empty" do
      trigger = %{trigger() | sprint_specs: []}
      assert {:failed, %{reason: :no_sprint_specs}} = DarkFactory.process_trigger(trigger)
    end

    test "invokes on_success callback" do
      test_pid = self()

      callbacks = %{
        on_success: fn result -> send(test_pid, {:success, result}) end
      }

      DarkFactory.process_trigger(trigger(), callbacks)
      assert_receive {:success, {:succeeded, _}}
    end

    test "invokes on_failure callback on failure" do
      test_pid = self()
      trigger = %{trigger() | sprint_specs: []}

      callbacks = %{
        on_failure: fn result -> send(test_pid, {:failure, result}) end
      }

      DarkFactory.process_trigger(trigger, callbacks)
      assert_receive {:failure, {:failed, _}}
    end

    test "stores outcome for cross-session learning" do
      CrossSessionLearning.clear()
      DarkFactory.process_trigger(trigger())

      {:ok, outcomes} = CrossSessionLearning.retrieve_local("agent-test", "abc123")
      assert length(outcomes) >= 1
      assert hd(outcomes).status == :succeeded
    end
  end

  describe "retrieve_prior_outcomes/3" do
    test "returns empty list when no prior outcomes" do
      outcomes = DarkFactory.retrieve_prior_outcomes("agent-new", "new-hash", %{})
      assert outcomes == []
    end

    test "returns prior outcomes from local store" do
      CrossSessionLearning.clear()

      outcome = %{
        type: :harness_outcome,
        status: :failed,
        session_id: "old-session",
        workspace_id: "ws-test",
        agent_id: "agent-retry",
        spec_hash: "retry-hash",
        details: %{reason: :max_iterations_reached},
        timestamp: DateTime.utc_now()
      }

      CrossSessionLearning.store_local(outcome)

      outcomes = DarkFactory.retrieve_prior_outcomes("agent-retry", "retry-hash", %{})
      assert length(outcomes) == 1
      assert hd(outcomes).status == :failed
    end
  end

  describe "with Delegatic policy check" do
    test "blocks when Delegatic rejects" do
      trigger = %{
        trigger()
        | sprint_specs: [
            %{id: "s1", description: "Blocked", acceptance_criteria: []}
          ]
      }

      callbacks = %{
        delegatic_check_fn: fn _action -> {:block, "Policy: not authorized"} end
      }

      assert {:failed, %{reason: :contract_blocked}} =
               DarkFactory.process_trigger(trigger, callbacks)
    end

    test "escalates when Delegatic requires approval" do
      trigger = %{
        trigger()
        | sprint_specs: [
            %{id: "s1", description: "Needs approval", acceptance_criteria: []}
          ]
      }

      callbacks = %{
        delegatic_check_fn: fn _action -> {:escalate, "Needs manager approval"} end
      }

      assert {:escalated, %{reason: :policy_escalation}} =
               DarkFactory.process_trigger(trigger, callbacks)
    end
  end
end
