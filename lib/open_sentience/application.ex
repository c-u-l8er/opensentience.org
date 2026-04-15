defmodule OpenSentience.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      {Registry, keys: :unique, name: OpenSentience.Harness.Registry},
      {OpenSentience.Harness.Supervisor, []}
    ]

    opts = [strategy: :one_for_one, name: OpenSentience.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
