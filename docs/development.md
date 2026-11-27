# Разработка

Frontend: Angular 22, standalone-компоненты, signals и FormsModule.
Backend: PHP 8.4+, PDO SQLite, JSON API. Зависимостей Composer нет.
Схема создаётся `backend/src/Database.php` из `backend/schema.sql` при первом
обращении; данные хранятся в `var/project-desk.sqlite`.

## Локально без Docker

Нужны PHP с `pdo_sqlite`, Node 22.23.3+ и npm. В двух терминалах:

```bash
# Из корня репозитория
php -S 127.0.0.1:8098 backend/router.php
```

```bash
cd frontend
npm ci
npm start
```

Frontend доступен на http://localhost:4200, `/api` проксируется на порт 8098.

```bash
php backend/tests/smoke.php
php backend/tests/attention.php
cd frontend
npm run build
```

Тест API поднимает отдельный сервер и временную SQLite, затем удаляет её.
Smoke проверяет существующие сценарии, запись комментариев, ограничения доступа
и API обзора. Тест внимания использует отдельную БД в памяти и фиксированное время,
чтобы проверить ранжирование и точные границы сроков независимо от даты запуска.
`DB_PATH` позволяет указать отдельную БД; `SEED_NOW=2026-11-11T08:00:00Z`
задаёт исходную дату только при создании новой БД. Текущее серверное время
возвращается в `/api/context`; это не остановленные часы приложения.

## Docker

`docker compose up --build -d --wait` собирает frontend и отдаёт его тем же PHP
сервером, что обслуживает API. Это сервер для локального тестового задания;
production web-сервер и настоящая аутентификация в комплект не входят.

`make up`, `make test`, `make down` — сокращения команд Compose.
`docker compose build` пересобирает код; существующая БД остаётся в volume.

## Структура

- `frontend/src/app.*` — текущие экраны проектов и карточка задачи.
- `frontend/src/api.ts`, `models.ts` — клиент API и типы.
- `backend/router.php` — API и выдача собранного frontend.
- `backend/src/Application.php` — маршруты, проверки доступа и изменения данных.
- `backend/src/Attention.php` — область ответственности, причины внимания и ранжирование.
- `backend/src/Database.php`, `schema.sql` — создание БД и демонстрационный набор.
- `backend/tests/smoke.php` — проверка существующих сценариев API.
- `backend/tests/attention.php` — детерминированные проверки обзора внимания.

Ошибки изменений API возвращаются с HTTP-статусом и полем `error`.
Конфликт версии при редактировании — 409: откройте задачу заново.
Собранный frontend, node_modules, БД и секреты игнорируются Git.
