# 2026-11-14 — Сильная модель для фраз через OmniRoute-комбо

## Задача

Собрать в OmniRoute рабочую связку из сильных моделей и перевести генерацию фраз
на неё, чтобы словацкие примеры были естественными и стабильными.

## Что найдено

- Профиль OmniRoute в БД указывал на VPS `91.184.253.167:20128`, который не
  отвечает. Каждый запрос падал по таймауту и молча уходил в Groq
  `openai/gpt-oss-120b` — отсюда слабые фразы и подпись `groq/...` на карточке.
- Локальный OmniRoute (`host.docker.internal:20128`) жив и отдаёт 1510 моделей.
- Проверка реальным промптом `PhraseService` (7 словацких + 3 английских карточки):
  `gemini/gemini-3.6-flash` — 10/10 валидных, ~21.5 с на 7 карточек;
  `nvidia/nvidia/nemotron-3-ultra-550b-a55b` — 8/10, ~15.6 с;
  `bluesminds/nvidia/nemotron-3-ultra-550b-a55b` — 7/10, ~6.3 с.
  `auto/*`, `gpt-5.5`, `qwen3.8-max`, Claude-эндпоинты и часть NVIDIA — таймауты,
  403/404/429, в комбо не включены.
- Промпт сам предлагал фолбэк `To je presne ono, čo som hľadal.` (7 слов), а
  валидатор резал фразу на `card + 2` = 6 слов. Модель делала ровно то, что её
  просили, и получала retry.

## Что сделано

- В локальном OmniRoute создано комбо `aicards-phrase` (strategy `priority`):
  `gemini/gemini-3.6-flash` → `nvidia/nvidia/nemotron-3-ultra-550b-a55b` →
  `bluesminds/nvidia/nemotron-3-ultra-550b-a55b`.
- Проверено на временном комбо с мёртвой первой моделью: `priority` реально
  переключается на следующую запись, а не возвращает ошибку.
- В БД обновлены `omnirouter.base_url` (локальный OmniRoute) и
  `omnirouter.chat_model` / `omnirouter.local.chat_model` = `aicards-phrase`.
- `max_phrase_words()` теперь общий для промпта и валидатора: 4 слова для
  карточек из 1–2 слов, иначе `front + 3`. `PHRASE_PROMPT_VERSION` = `8`,
  старый кэш автоматически считается устаревшим и перегенерируется в фоне.
- Дефолты `config.py` и `docker-compose.yml` переведены на `aicards-phrase`.
- Backend пересобран и перезапущен с боевым env (Azure DB), см. ниже.

## Проверка

- `pytest tests/` в `srs_backend`: 25 passed.
- `POST /api/phrases/ensure` для 5 словацких карточек → все 5 фраз готовы за
  ~15 с, у всех `model: gemini-3.6-flash`; `Podarilo sa mi to na prvý pokus`
  больше не режется лимитом.
- Playwright на `http://localhost:3006` (Slovak + Phrases ON): фраза
  `všetko bude v poriadku` подменила слово без перезагрузки, подпись
  `model (phrase): gemini-3.6-flash`, таймер продолжил идти.
- В БД 27 свежих фраз с `gemini-3.6-flash`, ошибок в логах backend нет.

## Где файлы

- `backend/app/services/phrase_service.py` — `max_phrase_words`, v8, промпт.
- `backend/tests/test_phrase_service.py` — тест на пример из промпта.
- `backend/app/config.py`, `docker-compose.yml`, `README.md`,
  `docs/specs/phrase-mode.md`, `docs/decisions.md`.
- Боевой env для пересборки: `/tmp/opencode/aicards-runtime.env`
  (в репозиторий не коммитить; в `.env` лежит локальная БД).

## Следующий шаг

Пройти несколько карточек в браузере и просмотреть свежие словацкие фразы;
при желании — оформить автозапуск OmniRoute (сейчас это ручной daemon).
