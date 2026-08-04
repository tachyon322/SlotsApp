# back

API сервис на [Hono](https://hono.dev) + [Bun](https://bun.sh) с аутентификацией [Better Auth](https://www.better-auth.com) (email + пароль, без подтверждения) и базой данных [PostgreSQL](https://www.postgresql.org) в Docker.

## Стек

- **Runtime:** Bun
- **HTTP:** Hono
- **Auth:** Better Auth (`/api/auth/*`)
- **ORM:** Drizzle + drizzle-kit
- **БД:** PostgreSQL 17 (docker-compose)

## Запуск

### Всё в Docker (рекомендуется)

Из корня репозитория:

```sh
# 1. Настроить .env
cp back/.env.example back/.env

# 2. Поднять весь стек: Postgres + Redis + backend + frontend
docker compose up --build
```

- Backend: `http://localhost:8080`
- Frontend: `http://localhost:3000`

Миграции `drizzle` применяются автоматически при старте backend-контейнера. Отдельные сервисы: `docker compose up db redis backend` / `docker compose up frontend`.

### Локально (dev)

```sh
# 1. Скопировать конфигурацию
cp .env.example .env

# 2. Поднять Postgres и Redis в Docker
docker compose -f ../docker-compose.yml up db redis

# 3. Применить миграции
bun run db:migrate

# 4. Запустить сервер
bun run dev
```

Сервер слушает `http://localhost:8080`.

## Полезные команды

| Команда | Описание |
| --- | --- |
| `bun run dev` | Запуск сервера с hot-reload |
| `bun run db:generate` | Сгенерировать миграцию по схеме `src/db/schema.ts` |
| `bun run db:migrate` | Применить миграции к БД |
| `bun run db:studio` | Открыть Drizzle Studio |
| `bun run typecheck` | Проверка типов |

## Endpoints

- `POST /api/auth/sign-up/email` — регистрация (`email`, `password`, `name`)
- `POST /api/auth/sign-in/email` — вход (`email`, `password`)
- `GET /api/auth/get-session` — текущая сессия
- `POST /api/auth/sign-out` — выход
- `GET /api/me` — текущий пользователь (требует сессию)
- `GET /health` — healthcheck

Все роуты `/api/auth/*` предоставляются Better Auth. Пример регистрации:

```sh
curl -X POST http://localhost:8080/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secret123","name":"User"}'
```

## Структура

```
src/
├── index.ts        # Hono app: auth handler, CORS, session middleware
├── lib/auth.ts     # Конфигурация Better Auth
└── db/
    ├── index.ts    # pg pool + drizzle client
    └── schema.ts   # Схема таблиц (user, session, account, verification)
```

## Переменные окружения (`.env`)

- `BETTER_AUTH_SECRET` — секрет для подписи токенов/кук
- `BETTER_AUTH_URL` — базовый URL сервера (`http://localhost:8080`)
- `DATABASE_URL` — строка подключения к Postgres
- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` — креды контейнера
- `FRONTEND_ORIGIN` — разрешённый origin фронтенда для CORS
