defmodule MainBackend.Repo do
  use Ecto.Repo,
    otp_app: :main_backend,
    adapter: Ecto.Adapters.Postgres
end
