# 2026-11-13 — Phrase mode в Learning

## Задача

Добавить в Learning режим Phrases: карточка показывает короткую AI-фразу с
изучаемым словом и её русский перевод, слово/инфлектированная форма
подсвечивается с обеих сторон. Генерация не должна заставлять ждать: текущая
очередь и следующие 50 карточек готовятся в фоне. Прогресс, очередь, таймер и
FSRS не меняются; Emergency не трогать.

## Что сделано

- `card_phrases` + Alembic-миграция: одна фраза на карточку, инвалидация по
  хэшу `front/back/hint/language`.
- `phrase_service.py`: фоновый daemon-воркер, приоритеты (первые 5 карточек,
  остаток очереди по 10, следующие 50 по 10), толерантный парсинг, валидация
  спанов/леммы, повтор невалидных карточек, cooldown при ошибках.
- `/api/phrases/ensure` и `/api/phrases/status`; status заодно пере-enqueue'ит
  пропавшие карточки после рестарта бэкенда.
- Frontend: кнопка `Phrases ON/OFF`, хук с кэшем и polling, highlight через
  `<mark>` по точным спанам, fallback на слово и тихая подмена, TTS читает
  фразу, префетч аудио для следующих карточек.
- Emergency: кнопка и фразы скрыты, hook выключен.
- Тесты: 15 unit-тестов; `npm run build` проходит.
- Миграция применена к рабочей БД, образы пересобраны, контейнеры обновлены.

## Решения

- Кэш в БД, а не в карточке: не загрязняет `cards`, общий для normal/reverse.
- `ensure` никогда не генерирует синхронно; клиент сразу показывает слово.
- Модель возвращает точные surface-спаны, frontend не парсит HTML/регексы.
- OmniRoute — основной путь через существующий `chat_completion_ex`; при
  недоступности работает уже существующий Groq-fallback.
- Карточки из 3+ слов не режем: разрешено до двух контекстных слов сверху.

## Где файлы

- `docs/specs/phrase-mode.md` — спека и acceptance checks.
- `docs/decisions.md` — архитектурное решение.
- `backend/app/services/phrase_service.py`, `backend/app/routers/phrases.py`.
- `backend/alembic/versions/2026_11_13_6efe8d14e8b3_add_card_phrases.py`.
- `backend/tests/test_phrase_service.py`.
- `frontend/src/hooks/usePhrases.ts`, `frontend/src/components/HighlightedText.tsx`,
  `frontend/src/components/CardDisplay.tsx`, `frontend/src/pages/LanguagePage.tsx`.

## Проверка

- `backend/.venv/bin/python -m pytest tests/test_phrase_service.py -q` — 15 passed.
- `npm run build` — успешно.
- Живой smoke через API: `ensure` → `status`, фразы и спаны пришли, кэш
  записался; тестовые строки удалены.
- Проверка в контейнере `aicards-backend` (Python 3.12) с рабочей БД: старт,
  миграции, `ensure/status` — ок.
- Auth-проверка через nginx: `/api/phrases/status` с токеном — 200.

## Следующий шаг

Проверить в браузере: toggle, обе стороны, reverse-карточки, подсветку,
fallback/подмену, TTS и отсутствие режима в Emergency. Затем при необходимости
— `./deploy.sh`.
