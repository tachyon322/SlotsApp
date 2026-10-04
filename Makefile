# Запуск проекта для локальной разработки.
#
#   make backend  — backend (Bun + Hono): http://localhost:8080
#   make web      — frontend (Next.js):   http://localhost:3000
#
# Перед первым запуском: make install && make db && make migrate

.PHONY: help backend web db migrate install

help:
	@echo "make backend  - запустить backend (http://localhost:8080)"
	@echo "make web      - запустить frontend (http://localhost:3000)"
	@echo "make db       - поднять Postgres и Redis (docker compose)"
	@echo "make migrate  - применить миграции backend"
	@echo "make install  - установить зависимости backend и frontend"

backend:
	cd back && bun run dev

web:
	cd front && npm run dev

db:
	docker compose up -d db redis

migrate:
	cd back && bun run db:migrate

install:
	cd back && bun install
	cd front && npm install
