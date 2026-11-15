# 2026-11-13 — Фикс зависания словацкой колоды

## Задача

Словацкая версия приложения не работала: при переключении на `sk` интерфейс
оставался на «Loading...», nginx отдавал 504, backend переставал отвечать на
любые запросы. Нужно было найти причину и сделать поведение устойчивым, не
меняя Phrase mode, очередь, таймер и FSRS. Emergency не трогать.

## Что сделано

- Найдена причина: `auth_gate` (async middleware) синхронно вызывал
  `auth.token_is_valid()`, который ходил в PostgreSQL; зависший запрос блокировал
  event loop. `py-spy` показал MainThread в `auth_gate -> token_is_valid`.
- `auth_gate` переведён на `run_in_threadpool`; добавлен положительный кэш
  токена на 30 с (не дольше срока жизни токена), logout сбрасывает его сразу.
- Пул SQLAlchemy: `pool_pre_ping`, `pool_recycle=300`, `pool_timeout=10`,
  `connect_timeout=10`, `statement_timeout=20s`,
  `idle_in_transaction_session_timeout=60s`.
- Убраны N+1 запросы подсчёта отзывов в `/due`, `/search`, `/by-tag` — теперь
  один grouped-запрос; `/tags` больше не поднимает все карточки.
- Frontend: таймауты queue/tags/counts, guard по sequence при смене языка,
  `setLoading(false)` в `finally`, ошибка с кнопкой `Retry` вместо вечной
  загрузки.
- Образы backend/frontend пересобраны, контейнеры пересозданы с рабочими env
  (Azure PostgreSQL, auth включён).

## Решения

- Не увеличивать nginx timeout: это лишь маскирует блокировку.
- Не кэшировать токены навсегда: TTL 30 с + инвалидация при logout.
- Ограничить запросы на стороне сервера, а не только на клиенте: иначе
  зависший запрос продолжает занимать воркер.
- Оставить Phrase mode, очередь, `Item N of M`, таймер и FSRS без изменений.

## Где файлы

- `backend/app/main.py`, `backend/app/routers/auth.py`,
  `backend/app/database.py`, `backend/app/routers/cards.py`.
- `frontend/src/pages/LanguagePage.tsx`, `frontend/src/services/api.ts`.
- `docs/decisions.md` — запись от 2026-11-13 про freeze.

## Проверка

- `backend/.venv/bin/python -m pytest tests/test_phrase_service.py -q` — 15 passed.
- `npm run build` — успешно.
- Прямой вызов изменённых запросов на рабочей БД: `sk /due` 50 карточек —
  0.22 с, `sk /due-counts` — 0.29 с (было ~2.9 с через API).
- Через nginx: en/sk `/due` по 3 раза — 200, 0.30–0.78 с; tags/counts — 200.
- 24 параллельных запроса en/sk — все 200, максимум 0.97 с.
- Браузер: быстрые переключения en→sk→en→sk→en, затем sk — очередь и счётчик
  корректные, «Loading...» не залипает; en `Due: 978`, sk `Due: 6782`.
- Браузер, ветка ошибки: запрос `/due` принудительно оборван → показана ошибка
  и `Retry`; после Retry очередь и счётчик восстановились (en 978 → sk 6782).
- Auth: временный токен — 200, повторный запрос быстрее (кэш), после logout —
  401; bogus-токен — 401.

## Следующий шаг

Проверить прод-деплой после фикса; при необходимости — `./deploy.sh`.
