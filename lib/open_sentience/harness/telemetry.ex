defmodule OpenSentience.Harness.Telemetry do
  @moduledoc """
  Telemetry events for OS-008 harness operations.

  All events are prefixed with `[:open_sentience, :harness]`.

  ## Events

    * `[:open_sentience, :harness, :session, :start]` — session started
    * `[:open_sentience, :harness, :session, :stop]` — session stopped
    * `[:open_sentience, :harness, :pipeline, :stage_completed]` — pipeline stage finished
    * `[:open_sentience, :harness, :pipeline, :stage_blocked]` — prerequisite check blocked
    * `[:open_sentience, :harness, :coverage, :routed]` — coverage routing decision made

  """

  @doc """
  Emits a telemetry event for a pipeline stage completion.
  """
  @spec stage_completed(binary(), atom(), map()) :: :ok
  def stage_completed(session_id, stage, metadata \\ %{}) do
    :telemetry.execute(
      [:open_sentience, :harness, :pipeline, :stage_completed],
      %{system_time: System.system_time()},
      %{session_id: session_id, stage: stage, metadata: metadata}
    )
  end

  @doc """
  Emits a telemetry event for a blocked pipeline stage.
  """
  @spec stage_blocked(binary(), atom(), [atom()]) :: :ok
  def stage_blocked(session_id, tool_name, missing_stages) do
    :telemetry.execute(
      [:open_sentience, :harness, :pipeline, :stage_blocked],
      %{system_time: System.system_time()},
      %{session_id: session_id, tool_name: tool_name, missing_stages: missing_stages}
    )
  end

  @doc """
  Emits a telemetry event for session lifecycle.
  """
  @spec session_event(atom(), binary(), map()) :: :ok
  def session_event(action, session_id, metadata \\ %{}) when action in [:start, :stop] do
    :telemetry.execute(
      [:open_sentience, :harness, :session, action],
      %{system_time: System.system_time()},
      Map.merge(%{session_id: session_id}, metadata)
    )
  end

  @doc """
  Emits a telemetry event for coverage routing.
  """
  @spec coverage_routed(binary(), atom(), map()) :: :ok
  def coverage_routed(session_id, dispatch_mode, context \\ %{}) do
    :telemetry.execute(
      [:open_sentience, :harness, :coverage, :routed],
      %{system_time: System.system_time()},
      %{session_id: session_id, dispatch_mode: dispatch_mode, context: context}
    )
  end
end
