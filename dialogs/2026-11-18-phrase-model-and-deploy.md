# Модель фраз по замеру, регенерация и деплой

**Дата:** 2026-11-18

## Задача

Фразы в Phrases генерировали слабые модели: на сервере без OmniRoute это был
Groq `gpt-oss-120b` (185 из 305 кэша), ещё часть — медленный 550B nemotron.
Нужно выбрать сильную модель замером, укрупнить батч, перегенерировать всё,
закоммитить и задеплоить на `translatepls.me`.

## Что сделано

- Бенчмарк на реальной задаче: промпт `PhraseService.build_prompt`, батч 20,
  `reasoning_effort=none`, по 40 карточек на язык. Сигналы: валидность
  `validate_item`, косинусная близость перевода к смыслу карточки, слепой
  LLM-судья с якорями (калибровка MAE 0.42).
- Победил `tokenharbor/deepseek-v4.1-flash:free`: 0.91 валидных, sim 0.70,
  судья 4.95/5, ~8 с на батч 20. Комбо `aicards-phrase`: deepseek →
  mimo-v2.6-flash → nvidia minimax-m3.1 → bluesminds deepseek-uncen.
- `BATCH_SIZE=20`, первые 5 карточек видимой очереди — отдельным батчем;
  `max_tokens=400+260×карточка` (до 6000).
- Для фраз отключён Groq-fallback. Добавлен отдельный провайдер
  `PHRASE_BASE_URL`/`PHRASE_API_KEY`/`PHRASE_MODEL` (модели через запятую) —
  сервер ходит прямо в tokenharbor.ai.
- 4xx от шлюза больше не включает 120-секундный breaker; 400 про
  `reasoning_effort` повторяется без этого поля.
- `expression_core()` убирает словарные пометы (`+ Acc`, `(нет совершенного)`,
  ведущие `to`/артикли у английских карточек); слэш внутри предложения
  (`vás/ťa`) считается одной слот-альтернативой, а не двумя версиями фразы.
- Все 305 фраз перегенерированы: 300 deepseek, 3 minimax-m3.1, 2 mimo
  (пять карточек primary не прошли с первого раза).
- Статистика: пять секций, отдельные панели зрелости en/sk, синие линии рамок
  убраны.

## Деплой

- `./deploy.sh` собрал образы, но `scp` за 40 минут залил только 180 из 445 МБ
  бэкенда (~100 КБ/с) и был остановлен.
- Фронтенд долился целиком (md5 совпал), бэкенд докачан
  `rsync --append --partial`, md5 совпал с локальным.
- Образы загружены, контейнеры пересозданы, старые tar.gz удалены.

## Проверка

- `pytest` — 27 passed; `npm run build` — ок.
- Живой сайт: `/`, `/api/cards/tags`, `/api/stats/maturity`,
  `/api/stats/maturity-trend?language=en`, `/api/stats/deck-flow` — 200.
- Прод-генерация фразы на карточке `1` (`juveniles`) через tokenharbor:
  2.1 с, модель `deepseek-v4.1-flash`, тестовая строка удалена, в кэше 305.
- Фронтенд отдаёт `index-DgW0Mwe2.js` — тот же бандл, что собран локально.

## Где файлы

- `backend/app/services/phrase_service.py`, `backend/app/services/llm_gateway.py`,
  `backend/app/config.py`, `backend/tests/test_phrase_service.py`.
- `backend/app/routers/stats.py`, `frontend/src/pages/StatsPage.tsx`,
  `frontend/src/services/api.ts`.
- `docker-compose.yml`, `README.md`, `docs/decisions.md`,
  `docs/specs/deck-flow-stats.md`.

## Следующий шаг

Пользоваться фразами на боевом сайте и собирать замечания по качеству;
следующая итерация — только по конкретным плохим примерам, а не по модели.
