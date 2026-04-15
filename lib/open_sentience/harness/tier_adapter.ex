defmodule OpenSentience.Harness.TierAdapter do
  @moduledoc """
  OS-008 Model Tier Adaptation (spec section 11).

  Adapts harness behavior to the model tier per OS-005. The harness overhead
  must be proportional to model capability.

  ## Tier-Specific Behavior

  | Parameter                     | local_small       | local_large        | cloud_frontier         |
  |-------------------------------|-------------------|--------------------|------------------------|
  | `planner_enabled`             | false             | true               | true                   |
  | `evaluator_enabled`           | false             | true (lightweight)  | true (full adversarial)|
  | `separate_evaluator_context`  | false             | false              | true                   |
  | `max_sprints_per_task`        | 1                 | 3                  | 10                     |
  | `max_iterations_per_sprint`   | 2                 | 3                  | 5                      |
  | `context_compaction_threshold`| 0.40              | 0.55               | 0.55                   |
  | `subagent_delegation`         | :disabled         | :limited           | :full                  |
  | `sprint_contracts`            | :implicit         | :explicit          | :explicit_negotiated   |

  ## Graceful Degradation

  When the current tier fails (confidence too low, iterations exhausted):

      local_small fails → retry at local_large
      local_large fails → retry at cloud_frontier
      cloud_frontier fails → escalate to human

  """

  @type tier :: :local_small | :local_large | :cloud_frontier

  @type tier_config :: %{
          planner_enabled: boolean(),
          evaluator_enabled: boolean(),
          separate_evaluator_context: boolean(),
          max_sprints_per_task: pos_integer(),
          max_iterations_per_sprint: pos_integer(),
          context_compaction_threshold: float(),
          subagent_delegation: :disabled | :limited | :full,
          sprint_contracts: :implicit | :explicit | :explicit_negotiated
        }

  @tier_configs %{
    local_small: %{
      planner_enabled: false,
      evaluator_enabled: false,
      separate_evaluator_context: false,
      max_sprints_per_task: 1,
      max_iterations_per_sprint: 2,
      context_compaction_threshold: 0.40,
      subagent_delegation: :disabled,
      sprint_contracts: :implicit
    },
    local_large: %{
      planner_enabled: true,
      evaluator_enabled: true,
      separate_evaluator_context: false,
      max_sprints_per_task: 3,
      max_iterations_per_sprint: 3,
      context_compaction_threshold: 0.55,
      subagent_delegation: :limited,
      sprint_contracts: :explicit
    },
    cloud_frontier: %{
      planner_enabled: true,
      evaluator_enabled: true,
      separate_evaluator_context: true,
      max_sprints_per_task: 10,
      max_iterations_per_sprint: 5,
      context_compaction_threshold: 0.55,
      subagent_delegation: :full,
      sprint_contracts: :explicit_negotiated
    }
  }

  @degradation_chain [:local_small, :local_large, :cloud_frontier]

  @doc """
  Returns the configuration for a given model tier.
  """
  @spec config_for(tier()) :: tier_config()
  def config_for(tier) when tier in [:local_small, :local_large, :cloud_frontier] do
    Map.fetch!(@tier_configs, tier)
  end

  @doc """
  Returns the next tier in the graceful degradation chain.

  ## Examples

      iex> TierAdapter.next_tier(:local_small)
      {:ok, :local_large}

      iex> TierAdapter.next_tier(:cloud_frontier)
      :escalate_to_human

  """
  @spec next_tier(tier()) :: {:ok, tier()} | :escalate_to_human
  def next_tier(current_tier) do
    case Enum.find_index(@degradation_chain, &(&1 == current_tier)) do
      nil ->
        :escalate_to_human

      idx ->
        case Enum.at(@degradation_chain, idx + 1) do
          nil -> :escalate_to_human
          next -> {:ok, next}
        end
    end
  end

  @doc """
  Returns the max iterations for a given tier.
  """
  @spec max_iterations(tier()) :: pos_integer()
  def max_iterations(tier) do
    config_for(tier).max_iterations_per_sprint
  end

  @doc """
  Returns the max sprints for a given tier.
  """
  @spec max_sprints(tier()) :: pos_integer()
  def max_sprints(tier) do
    config_for(tier).max_sprints_per_task
  end

  @doc """
  Checks if a separate evaluator context is required for this tier.
  """
  @spec separate_evaluator?(tier()) :: boolean()
  def separate_evaluator?(tier) do
    config_for(tier).separate_evaluator_context
  end

  @doc """
  Returns the compaction threshold for a given tier.
  """
  @spec compaction_threshold(tier()) :: float()
  def compaction_threshold(tier) do
    config_for(tier).context_compaction_threshold
  end

  @doc """
  Returns the full degradation chain.
  """
  @spec degradation_chain() :: [tier()]
  def degradation_chain, do: @degradation_chain

  @doc """
  Returns all known tiers.
  """
  @spec tiers() :: [tier()]
  def tiers, do: [:local_small, :local_large, :cloud_frontier]
end
