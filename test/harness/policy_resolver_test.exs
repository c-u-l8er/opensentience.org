defmodule OpenSentience.Harness.PolicyResolverTest do
  use ExUnit.Case, async: true

  alias OpenSentience.Harness.PolicyResolver
  alias OpenSentience.Harness.AuditEntry

  @action %{type: :sprint_execution, description: "Build auth"}

  describe "resolve/3 enforcement order" do
    test "contract block takes precedence (no Delegatic check)" do
      violations = [%{field: :target, not_in: ["prod"]}]

      assert {:block, ^violations} =
               PolicyResolver.resolve(
                 @action,
                 {:block, :hard_constraint_violation, violations},
                 fn _ -> :allow end
               )
    end

    test "contract escalation takes precedence" do
      triggers = [%{rule: :confidence_below}]

      assert {:escalate, ^triggers} =
               PolicyResolver.resolve(
                 @action,
                 {:escalate, triggers},
                 fn _ -> :allow end
               )
    end

    test "Delegatic allow after contract allow returns :ok" do
      assert :ok =
               PolicyResolver.resolve(
                 @action,
                 {:allow, []},
                 fn _action -> :allow end
               )
    end

    test "Delegatic block overrides contract allow" do
      assert {:block, "Policy: denied"} =
               PolicyResolver.resolve(
                 @action,
                 {:allow, []},
                 fn _action -> {:block, "Policy: denied"} end
               )
    end

    test "Delegatic escalate overrides contract allow" do
      assert {:escalate, "Needs approval"} =
               PolicyResolver.resolve(
                 @action,
                 {:allow, []},
                 fn _action -> {:escalate, "Needs approval"} end
               )
    end

    test "no Delegatic function defaults to :ok" do
      assert :ok = PolicyResolver.resolve(@action, {:allow, []}, nil)
    end
  end

  describe "audit_entry/3" do
    test "builds allow entry with delegatic source" do
      entry = PolicyResolver.audit_entry("sess-1", :allow, %{type: :test})
      assert %AuditEntry{} = entry
      assert entry.event_type == :contract_validated
      assert entry.metadata.policy_source == :delegatic
    end

    test "builds block entry with delegatic source" do
      entry = PolicyResolver.audit_entry("sess-1", {:block, "denied"}, %{type: :test})
      assert entry.event_type == :contract_violated
      assert entry.metadata.policy_source == :delegatic
      assert entry.metadata.reason == "denied"
    end

    test "builds escalate entry with delegatic source" do
      entry = PolicyResolver.audit_entry("sess-1", {:escalate, "needs approval"})
      assert entry.event_type == :confidence_gate_triggered
      assert entry.metadata.policy_source == :delegatic
    end
  end
end
