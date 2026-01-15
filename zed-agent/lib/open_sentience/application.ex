defmodule OpenSentience.Application do
  @moduledoc """
  OTP application entrypoint for the OpenSentience ACP agent.

  This project is primarily intended to run as a CLI (stdio JSON-RPC).
  We still provide an Application module so the code can be started under
  OTP supervision when desired.
  """

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      # Intentionally empty for now.
      # The CLI entrypoint can run without starting an OTP supervision tree.
    ]

    Supervisor.start_link(children, strategy: :one_for_one, name: OpenSentience.Supervisor)
  end
end
