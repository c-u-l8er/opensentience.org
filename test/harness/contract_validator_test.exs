defmodule OpenSentience.Harness.ContractValidatorTest do
  use ExUnit.Case, async: true

  alias OpenSentience.Harness.ContractValidator

  setup do
    governance = %{
      hard: [
        %{field: :target, not_in: ["production_db", "admin_panel"]},
        %{field: :cost_usd, max: 100.0}
      ],
      soft: [
        %{field: :tool, not_in: ["dangerous_tool"], message: "Prefer safe alternatives"}
      ],
      escalate_when: %{
        confidence_below: 0.7,
        cost_exceeds_usd: 50.0
      }
    }

    {:ok, pid} = ContractValidator.start_link(session_id: "test-cv", governance_block: governance)
    %{validator: pid, governance: governance}
  end

  describe "hard constraint enforcement" do
    test "blocks when hard constraint violated", %{validator: v} do
      action = %{target: "production_db", tool: "query"}

      assert {:block, :hard_constraint_violation, violations} =
               ContractValidator.validate(v, action)

      assert length(violations) == 1
    end

    test "blocks on cost hard constraint", %{validator: v} do
      action = %{cost_usd: 150.0}

      assert {:block, :hard_constraint_violation, _} = ContractValidator.validate(v, action)
    end
  end

  describe "soft constraint warnings" do
    test "allows with warnings when only soft constraints violated", %{validator: v} do
      action = %{tool: "dangerous_tool", target: "safe_db"}

      assert {:allow, warnings} = ContractValidator.validate(v, action)
      assert length(warnings) == 1
      assert hd(warnings) =~ "safe alternatives"
    end

    test "allows with no warnings when nothing violated", %{validator: v} do
      action = %{tool: "safe_tool", target: "test_db", cost_usd: 5.0}
      assert {:allow, []} = ContractValidator.validate(v, action)
    end
  end

  describe "escalation triggers" do
    test "escalates on low confidence", %{validator: v} do
      action = %{confidence: 0.5, target: "test_db"}

      assert {:escalate, triggers} = ContractValidator.validate(v, action)
      assert Enum.any?(triggers, fn t -> t.rule == :confidence_below end)
    end

    test "escalates on high cost", %{validator: v} do
      action = %{cost_usd: 60.0, target: "test_db"}

      assert {:escalate, triggers} = ContractValidator.validate(v, action)
      assert Enum.any?(triggers, fn t -> t.rule == :cost_exceeds_usd end)
    end
  end

  describe "confidence gate" do
    test "ok when confidence above threshold", %{validator: v} do
      assert :ok =
               ContractValidator.check_confidence_gate(v, %{decision_confidence: 0.9})
    end

    test "escalates when confidence below threshold", %{validator: v} do
      assert {:escalate, :confidence_below_threshold, details} =
               ContractValidator.check_confidence_gate(v, %{decision_confidence: 0.5})

      assert details.threshold == 0.7
      assert details.score == 0.5
    end
  end

  describe "cost tracking" do
    test "ok when under budget", %{validator: v} do
      assert :ok = ContractValidator.record_cost(v, 10.0)
    end

    test "escalates when cumulative cost exceeds budget", %{validator: v} do
      :ok = ContractValidator.record_cost(v, 30.0)

      assert {:escalate, :cost_exceeds_budget, details} =
               ContractValidator.record_cost(v, 25.0)

      assert details.total == 55.0
      assert details.limit == 50.0
    end
  end

  describe "no governance block" do
    test "allows everything when no governance loaded" do
      {:ok, pid} = ContractValidator.start_link(session_id: "test-no-gov")
      assert {:allow, []} = ContractValidator.validate(pid, %{anything: "goes"})
    end
  end

  describe "load_governance/2" do
    test "can load governance block after startup" do
      {:ok, pid} = ContractValidator.start_link(session_id: "test-load")
      assert {:allow, []} = ContractValidator.validate(pid, %{target: "production_db"})

      gov = %{hard: [%{field: :target, not_in: ["production_db"]}]}
      :ok = ContractValidator.load_governance(pid, gov)

      assert {:block, _, _} = ContractValidator.validate(pid, %{target: "production_db"})
    end
  end

  describe "audit log" do
    test "records validation events", %{validator: v} do
      ContractValidator.validate(v, %{target: "test_db"})
      ContractValidator.validate(v, %{target: "production_db"})

      log = ContractValidator.audit_log(v)
      assert length(log) == 2

      event_types = Enum.map(log, & &1.event_type)
      assert :contract_validated in event_types
      assert :contract_violated in event_types
    end
  end
end
