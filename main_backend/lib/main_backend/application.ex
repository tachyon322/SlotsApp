defmodule MainBackend.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      MainBackendWeb.Telemetry,
      MainBackend.Repo,
      {DNSCluster, query: Application.get_env(:main_backend, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: MainBackend.PubSub},
      # Start a worker by calling: MainBackend.Worker.start_link(arg)
      # {MainBackend.Worker, arg},
      # Start to serve requests, typically the last entry
      MainBackendWeb.Endpoint
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: MainBackend.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    MainBackendWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
