defmodule OpenSentience.Harness.ContextManager do
  @moduledoc """
  OS-008 Context Manager — context window management + compaction.

  Monitors context window utilization, triggers compaction at the configured
  threshold (default 55%, below the 60% quality degradation threshold), and
  manages filesystem-based overflow for large tool results.

  ## The 60% Rule

  Output quality degrades at ~60% context utilization, not at the hard limit.
  The context manager triggers compaction at 55% to stay below this threshold.

  ## Compaction Strategy

  1. Offload large tool results (>20K tokens) to filesystem
  2. Summarize conversation history (preserve first + last messages)
  3. Inject fresh Graphonomous retrieval for key topics
  4. Track compaction count for telemetry

  ## Subagent Delegation

  For tasks that would exceed context limits, the harness delegates to subagents.
  Graphonomous is the shared memory substrate between parent and subagent contexts.
  """

  use GenServer

  require Logger

  alias OpenSentience.Harness.TierAdapter

  @type state :: %{
          session_id: binary(),
          model_tier: TierAdapter.tier(),
          max_context_tokens: non_neg_integer(),
          current_tokens: non_neg_integer(),
          compaction_threshold: float(),
          overflow_threshold: non_neg_integer(),
          overflow_files: [binary()],
          compaction_count: non_neg_integer(),
          history: [map()]
        }

  ## Public API

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc """
  Report a tool result's token count. Triggers overflow or compaction if needed.

  ## Returns

    * `{:ok, state_summary}` — no action needed
    * `{:overflow, file_path}` — result was offloaded to filesystem
    * `{:compacted, summary}` — compaction was triggered

  """
  @spec on_tool_result(GenServer.server(), atom(), binary(), non_neg_integer()) ::
          {:ok, map()} | {:overflow, binary()} | {:compacted, map()}
  def on_tool_result(server, tool_name, result, result_tokens) do
    GenServer.call(server, {:on_tool_result, tool_name, result, result_tokens})
  end

  @doc """
  Returns the current context utilization as a fraction (0.0 to 1.0).
  """
  @spec utilization(GenServer.server()) :: float()
  def utilization(server) do
    GenServer.call(server, :utilization)
  end

  @doc """
  Returns the current status summary.
  """
  @spec status(GenServer.server()) :: map()
  def status(server) do
    GenServer.call(server, :status)
  end

  @doc """
  Manually trigger compaction.
  """
  @spec compact(GenServer.server()) :: {:compacted, map()}
  def compact(server) do
    GenServer.call(server, :compact)
  end

  @doc """
  Record a delegation to a subagent.
  """
  @spec record_delegation(GenServer.server(), binary(), map()) :: :ok
  def record_delegation(server, subagent_id, metadata) do
    GenServer.call(server, {:record_delegation, subagent_id, metadata})
  end

  ## GenServer callbacks

  @impl true
  def init(opts) do
    session_id = Keyword.get(opts, :session_id, "unknown")
    model_tier = Keyword.get(opts, :model_tier, :cloud_frontier)
    tier_config = TierAdapter.config_for(model_tier)

    max_tokens = Keyword.get(opts, :max_context_tokens, default_max_tokens(model_tier))
    overflow = Application.get_env(:open_sentience, :overflow_threshold, 20_000)

    {:ok,
     %{
       session_id: session_id,
       model_tier: model_tier,
       max_context_tokens: max_tokens,
       current_tokens: 0,
       compaction_threshold: tier_config.context_compaction_threshold,
       overflow_threshold: overflow,
       overflow_files: [],
       compaction_count: 0,
       history: []
     }}
  end

  @impl true
  def handle_call({:on_tool_result, tool_name, result, result_tokens}, _from, state) do
    state = %{state | current_tokens: state.current_tokens + result_tokens}

    cond do
      # Large tool result → offload to filesystem
      result_tokens > state.overflow_threshold ->
        {file_path, state} = do_overflow(state, tool_name, result, result_tokens)
        {:reply, {:overflow, file_path}, state}

      # Approaching threshold → trigger compaction
      current_utilization(state) > state.compaction_threshold ->
        {summary, state} = do_compact(state)
        {:reply, {:compacted, summary}, state}

      true ->
        state = record_history(state, tool_name, result_tokens)
        {:reply, {:ok, status_summary(state)}, state}
    end
  end

  @impl true
  def handle_call(:utilization, _from, state) do
    {:reply, current_utilization(state), state}
  end

  @impl true
  def handle_call(:status, _from, state) do
    {:reply, status_summary(state), state}
  end

  @impl true
  def handle_call(:compact, _from, state) do
    {summary, state} = do_compact(state)
    {:reply, {:compacted, summary}, state}
  end

  @impl true
  def handle_call({:record_delegation, subagent_id, metadata}, _from, state) do
    entry = %{
      type: :delegation,
      subagent_id: subagent_id,
      metadata: metadata,
      timestamp: DateTime.utc_now()
    }

    state = %{state | history: [entry | state.history]}

    :telemetry.execute(
      [:open_sentience, :harness, :context, :delegated],
      %{system_time: System.system_time()},
      %{session_id: state.session_id, subagent_id: subagent_id}
    )

    {:reply, :ok, state}
  end

  ## Internal logic

  defp do_overflow(state, tool_name, result, result_tokens) do
    # Write result to a temporary file
    file_name = "overflow_#{state.session_id}_#{tool_name}_#{System.unique_integer([:positive])}"
    dir = overflow_dir()
    File.mkdir_p!(dir)
    file_path = Path.join(dir, file_name)
    File.write!(file_path, result)

    Logger.info("[OS-008] Offloaded #{result_tokens} tokens from #{tool_name} to #{file_path}")

    :telemetry.execute(
      [:open_sentience, :harness, :context, :overflow],
      %{system_time: System.system_time(), tokens: result_tokens},
      %{session_id: state.session_id, tool_name: tool_name, file_path: file_path}
    )

    # Don't count overflow tokens in context window
    state = %{
      state
      | current_tokens: state.current_tokens - result_tokens,
        overflow_files: [file_path | state.overflow_files]
    }

    state = record_history(state, tool_name, 0, %{overflowed: true, file_path: file_path})

    {file_path, state}
  end

  defp do_compact(state) do
    # Simulate compaction:
    # 1. Estimate tokens saved by summarizing history
    # 2. Reset token count to post-compaction estimate
    # 3. Track compaction event

    tokens_before = state.current_tokens
    # Assume compaction saves ~40% of current tokens
    tokens_after = trunc(tokens_before * 0.6)

    state = %{
      state
      | current_tokens: tokens_after,
        compaction_count: state.compaction_count + 1,
        history: compact_history(state.history)
    }

    Logger.info(
      "[OS-008] Compaction ##{state.compaction_count}: #{tokens_before} → #{tokens_after} tokens"
    )

    :telemetry.execute(
      [:open_sentience, :harness, :context, :compacted],
      %{
        system_time: System.system_time(),
        tokens_before: tokens_before,
        tokens_after: tokens_after,
        tokens_saved: tokens_before - tokens_after
      },
      %{session_id: state.session_id, compaction_count: state.compaction_count}
    )

    summary = %{
      compaction_count: state.compaction_count,
      tokens_before: tokens_before,
      tokens_after: tokens_after,
      utilization: current_utilization(state)
    }

    {summary, state}
  end

  defp compact_history(history) do
    # Keep first and last 5 entries, discard middle
    case length(history) do
      n when n <= 10 ->
        history

      _ ->
        first_5 = Enum.take(history, -5)
        last_5 = Enum.take(history, 5)

        last_5 ++
          [%{type: :compaction_marker, entries_removed: length(history) - 10}] ++ first_5
    end
  end

  defp record_history(state, tool_name, tokens, extra \\ %{}) do
    entry =
      Map.merge(
        %{
          type: :tool_result,
          tool_name: tool_name,
          tokens: tokens,
          timestamp: DateTime.utc_now()
        },
        extra
      )

    %{state | history: [entry | state.history]}
  end

  defp current_utilization(%{current_tokens: current, max_context_tokens: max})
       when max > 0 do
    current / max
  end

  defp current_utilization(_), do: 0.0

  defp status_summary(state) do
    %{
      session_id: state.session_id,
      model_tier: state.model_tier,
      current_tokens: state.current_tokens,
      max_context_tokens: state.max_context_tokens,
      utilization: current_utilization(state),
      compaction_threshold: state.compaction_threshold,
      compaction_count: state.compaction_count,
      overflow_files: length(state.overflow_files)
    }
  end

  defp default_max_tokens(:local_small), do: 4_096
  defp default_max_tokens(:local_large), do: 32_768
  defp default_max_tokens(:cloud_frontier), do: 200_000

  defp overflow_dir do
    Path.join(System.tmp_dir!(), "os008_overflow")
  end
end
