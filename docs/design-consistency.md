<!-- opencode-report -->

# Единый дизайн при вайбкодинге: почему кнопки «не те» и что с этим делать

**Дата:** 2026-11-15  
**Статус:** исследование + план; код приложения не менялся  
**Вопрос:** после каждой AI-правки в AI Cards появляются кнопки, которые не совпадают
по цвету с существующими. Как держать единый дизайн, когда код пишет агент?

---

## Короткий ответ

Проблема не в том, что модель «плохо рисует». Проблема в том, что у неё **нет
ограничителя**: цвет можно написать где угодно и каким угодно, а проверки нет.
Пока самое дешёвое действие — написать `style={{ background: '#e68a00' }}` —
агент будет делать именно это, каждый раз заново выбирая «подходящий» оттенок.

Работает не «более длинный промпт», а **дизайн-система как пульт управления**:

1. **`DESIGN.md` в репозитории** — короткий документ, который агент читает до кода:
   палитра, шкалы, правила, «нельзя».
2. **Семантические токены** — цвета и размеры существуют только как `var(--...)`,
   причём роли (`accent`, `danger`, `warning`), а не сырые hex.
3. **Закрытый API компонентов** — `Button` с вариантами `primary / secondary /
   ghost / danger`; страницы не стилизуют кнопки вообще.
4. **Автоматический линт** — hex в inline-стилях и в CSS падает в CI.
5. **Скриншот-тест витрины** (`/styleguide`) в обеих темах — дрейф видно глазами,
   а не через месяц.
6. **Один владелец** правила «так нельзя» — иначе первые же срочные правки
   обойдут всё остальное.

Для проекта масштаба AI Cards этого достаточно. Реестр компонентов, Storybook,
Chromatic и дизайнер в штате — не нужны (источники ниже говорят то же самое про
pre-PMF и соло-проекты).

---

## 1. Что именно происходит в AI Cards

Я посчитал дрейф по текущему коду, а не на глаз:

| Метрика | Значение |
|---|---|
| Inline-стилей `style={{...}}` в `frontend/src` | **311** |
| Hex-цветов в `.tsx` вне `styles/` | **15 литералов, 9 разных цветов** |
| CSS-переменных в `main.css` | 25 цветовых; **0** для spacing / radius / типографики |
| Токен-файл компонентов | `theme.ts` — набор inline-объектов, не компонентов |
| Глобальный hover | `button:hover { opacity: .8 }` — гасит и primary, и disabled-подобные |

Конкретные места:

- `pages/StatsPage.tsx:50-51, 160-162, 331, 367, 530-531` — синие и зелёные
  `#7fb3d5`, `#5dade2`, `#7fc47f`, `#a8d8a8`, `#d4ead4`, плюс `#000` для подписи
  на цветной плашке. В тёмной теме это либо нечитаемо, либо выпадает из палитры.
- `components/CardDisplay.tsx:487, 506` — янтарные `#d9a400` / `#a67c00` для
  состояния «almost»; в токенах янтарного нет вообще.
- `pages/WordListPage.tsx:69` — `#e68a00` для «скоро повтор», ещё один янтарный,
  не совпадающий с двумя предыдущими.
- `pages/WordListPage.tsx:185` — «Cancel» сделан через `btnPrimary` с
  перевёрнутыми цветами: `{ ...btnPrimary, background: 'var(--bg-primary)' }`.
  То есть **primary-цвет уже значит и «подтвердить», и «отменить»**.
- `pages/WordListPage.tsx:362` — «Del» это `btnSmall` плюс inline `color:
  var(--text-danger)`: вариант опасного действия существует только как локальная
  поправка.
- `styles/main.css:31-34` — `--sound-accent` дублирует `--accent` под локальным
  именем: ещё один признак, что общей роли «акцент» не хватает.

Вывод: **это не случайные ошибки модели, а структурная дырка.** Нет ни одного
места, где сказано «какие цвета разрешены» и «какие кнопки бывают». Агент честно
закрывает локальную задачу («сделай предупреждение заметным») самым прямым
способом — новым hex.

---

## 2. Почему промпт «делай красиво и единообразно» не помогает

Пять механизмов, которые сходятся в одну точку:

1. **Контекст модели заканчивается**. Она видит 2–3 файла, а не все 20 кнопок
   приложения. «Как у нас принято» физически нет в контексте, если это не
   записано в репозитории.
2. **Inline-стили обходят любую систему**. Даже идеальные токены бесполезны,
   если рядом разрешено `style={{ color: '#...' }}`.
3. **Инлайн не умеет состояний**. `:hover`, `:focus-visible`, `:disabled`,
   `:active` в объект `CSSProperties` не записать — поэтому в приложении и
   появился глобальный `opacity: .8`, который приглушает всё подряд, включая
   главную кнопку.
4. **Каждый экран генерируется изолированно**. Новый экран = новый набор
   локальных решений; никто не сверяет его с соседним.
5. **Цвет — самый дешёвый способ решить локальную задачу**. Нужен контраст для
   «почти правильно» — проще взять янтарный, чем искать существующую роль.
   Три разных янтарных в трёх файлах — ровно этот эффект.

Это же описывают практики: Boldare называет это **visual debt / token drift**,
Foundey — «design system drift», а O'Reilly Radar формулирует вывод прямо:
дизайн-система должна стать **control plane** для AI-generated UI, а не
библиотекой, которую агент «может использовать».

---

## 3. Что говорит интернет (2026)

### 3.1 Консенсус

- **Промпты не держат**. Все источники сходятся: без файла в репозитории и без
  проверки в CI модель возвращается к локальным решениям через 1–2 итерации.
- **Самое дешёвое действие должно быть правильным**. Компонент должен быть
  проще, чем inline-стиль: импорт `Button` — одна строка; правильный hex —
  поиск токена. Если наоборот, дрейф неизбежен.
- **Ограничения важнее инструкций**. Линт-правило сильнее абзаца в промпте:
  агент может проигнорировать текст, но не может смержить красный CI.
- **Владелец обязателен**. Кто-то должен говорить «нет» новому оттенку. В
  соло-проекте это значит: правило зафиксировано в `AGENTS.md` и проверяется
  машиной, а не памятью.

### 3.2 Пять слоёв, которые называют практики

Foundey описывает стек из пяти слоёв; та же логика у O'Reilly и в гайдах по
DESIGN.md:

1. **Контекст** — `DESIGN.md` + `AGENTS.md`: что за продукт, какая эстетика,
   какие ограничения.
2. **Токены** — цвет, spacing, radius, типографика, тени; только семантические
   имена, light/dark пары.
3. **Компоненты** — 5–8 примитивов с закрытым API; страницы их не переопределяют.
4. **Проверки** — линт на сырые значения + визуальные снапшоты + ревью.
5. **Владелец и процесс** — definition of done, «новый цвет только через токен»,
   осознанное обновление снапшотов.

### 3.3 Форумный сигнал

- **r/cursor, август 2026** (`1vz94r0`): «модели выдают несогласованный дизайн».
  В ответах — Impeccable, `vercel-labs/web-design-guidelines`, anti-ui-slop;
  главный совет — не просить «красиво», а дать системе имя и проверку.
- **r/vibecoding, ноябрь 2026** (`1xvibpr`): топ-навыки — Impeccable и Hallmark,
  но сильнее всего работает **свой project-specific skill с definition of done**
  и code review как реальный гейт. То есть даже готовые инструменты вторичны
  по сравнению с «в проекте записано, что считается готовым».
- **HN, июнь 2026** («Slightly reducing the sloppiness of AI generated front
  end»): автор снижает slop не промптами, а жёсткими правилами по токенам и
  компонентам.
- **HN, апрель 2026** (getdesign.md): спрос на «дизайн-референс для агента» —
  64K+ ответов онбординга, 102K звёзд; 59.4% хотят «improve how my site looks».
- **GitHub, октябрь 2026** (`Yeraze/meshmonitor#5594`): ровно наша болезнь —
  агенты пишут hex в `style={{}}` в обход `--color-*`. В issue есть готовый
  ESLint/Stylelint-конфиг и поэтапное включение `warn → error`. Это самый
  практичный источник для шага 4.

### 3.4 Инструменты 2026 (что брать, что нет)

| Инструмент | Что даёт | Вердикт для AI Cards |
|---|---|---|
| **Google `DESIGN.md`** (`google-labs-code/design.md`) | формат: YAML-токены + проза; CLI `lint` / `diff` / `export` в Tailwind/DTCG | Брать **формат**, CLI пока не завязывать (alpha) |
| **Impeccable** (`pbakaus/impeccable`, Apache-2.0, ~110k★) | 24 команды, 62 правила «AI slop», `/impeccable document` генерирует `DESIGN.md`, есть поддержка OpenCode | Полезно точечно (`detect`), но install-hook и телеметрия — проверить до установки |
| **shadcn/ui theming** | семантические пары `background/foreground` | Не библиотека, а образец нейминга токенов |
| **Tailwind v4 `@theme`** | токены в CSS, `--*: initial` убирает дефолты | Не нужен: проект без Tailwind; идею «закрыть дефолты» можно повторить |
| **DTCG spec 2025.10** | стандарт формата токенов | Полезен, если токены пойдут в Figma; сейчас overkill |
| **Playwright `toHaveScreenshot`** | визуальные снапшоты | Брать: уже есть Playwright-стек в окружении, дешёво |
| **UIQuarter / Marque** | статический анализ UI / MCP дизайн-идентичности | Смотреть позже, не в первую волну |

---

## 4. Минимум, который реально нужен маленькому проекту

| Нужно | Не нужно (пока) |
|---|---|
| `DESIGN.md` на 1–2 страницы | Полный брендбук |
| ~25–35 семантических токенов | Триста токенов из Figma |
| 5–8 компонентов (`Button`, `Input`, `Select`, `Modal`, `Card`, `Badge`, `Field`) | Storybook, реестр, Chromatic |
| Один lint-гейт на hex | Кастомный плагин на каждый компонент |
| Одна витрина `/styleguide` + 2 скриншота | 200 снапшотов всех страниц |
| Правило в `AGENTS.md` + один владелец | Дизайн-комитет |

Ключевая мысль: **система должна быть меньше, чем искушение её обойти.** Если
добавить новый цвет через токен быстрее, чем через inline-стиль, дрейф
останавливается.

---

## 5. План для AI Cards

Порядок специально такой: сначала «разрешённые значения», потом «разрешённые
компоненты», и только потом запрет. Иначе агент останется без легального способа
сделать работу и начнёт обходить линт.

### Шаг 0. Зафиксировать правила (30 мин)

- Создать `docs/DESIGN.md` (черновик ниже).
- Добавить в `AGENTS.md` раздел «UI»: новый цвет — только токен; интерактив — только
  из `components/ui`; проверять обе темы; `npm run lint:design` перед сдачей.
- Решить, кто владелец: в соло-проекте это «я, но по правилу, а не по памяти».

**Готово, когда:** агент, открыв репозиторий, за 2 минуты понимает палитру и
запреты.

### Шаг 1. Токены (1–2 ч)

- Вынести `:root` / `.dark-mode` из `main.css` в `src/styles/tokens.css`.
- Добавить недостающие роли: `warning`, `danger` (solid), `focus-ring`,
  `chart-1..3`, `heat-0..3`, spacing, radius, control heights, размеры текста.
- `stylelint` разрешает hex **только** в `tokens.css` — это единственный файл,
  где сырые значения легальны.
- `--sound-accent` заменить на `--accent` (или оставить alias и пометить).

**Готово, когда:** в приложении нет цвета, для которого нет роли.

### Шаг 2. Компоненты (2–4 ч)

- `src/components/ui/Button.tsx` + `ui.css`: варианты `primary`, `secondary`,
  `ghost`, `danger`, `danger-ghost`; размеры `sm`, `md`, `lg`; `loading`,
  `disabled`; `:hover`, `:focus-visible`, `:active` — в CSS, не в JS.
- `Input`, `Select`, `Textarea`, `Field`, `Modal`, `Badge` — по мере переезда
  страниц, не «на будущее».
- `theme.ts` сокращается до раскладок/утилит; `btn`, `btnPrimary`, `btnSmall`,
  `btnGrade` удаляются.
- Убрать глобальный `button:hover { opacity: .8 }`; hover становится
  ответственностью варианта.

**Готово, когда:** новая кнопка не требует ни одной строки стилей на странице.

### Шаг 3. Переезд страниц (3–5 ч)

Порядок по частоте использования:

1. `WordListPage.tsx` — Cancel/Del/Save, самое явное рассогласование.
2. `CardDisplay.tsx` — оценки и «almost», три янтарных сводятся к одному токену.
3. `StatsPage.tsx` — графики и heatmap на `chart-*` / `heat-*`.
4. `LanguagePage.tsx` — `btn` + ad-hoc padding, переключатель Phrases.
5. `SettingsPage.tsx` — `--sound-accent` → `--accent`.

Правило переезда: **не менять внешний вид молча**. Сначала компонент повторяет
текущий вид 1:1, потом сознательно улучшаем.

**Готово, когда:** в `pages/` не осталось `btn*` из `theme.ts`, а hex — только в
`tokens.css`.

### Шаг 4. Автоматика (1 ч)

- ESLint flat config: запрет hex в `style={{}}` и в JSX-литералах.
- Stylelint: `color-no-hex` для всего, кроме `tokens.css`.
- `npm run lint:design` = eslint + stylelint; сначала `warn`, через неделю
  `error`.
- Опционально: `npx impeccable detect src` как разовая проверка, не в CI.

**Готово, когда:** добавление `#e68a00` в страницу валит `npm run lint:design`.

### Шаг 5. Витрина и скриншоты (2 ч)

- Роут `/styleguide` (в dev / за флагом): все варианты кнопок, полей, бейджей,
  состояний — в обеих темах.
- Playwright: `toHaveScreenshot('styleguide-light.png')` и `dark`.
- Обновление снапшота — только осознанно, вместе с изменением токена.

**Готово, когда:** случайная правка цвета в токене видна как diff в CI.

### Шаг 6. Процесс (15 мин)

- Definition of done для любой UI-правки (ниже).
- Раз в месяц — 10-минутный аудит: `grep` по hex, `lint:design`, глазами витрину.
- Новый оттенок принимается только вместе с ролью и парой для тёмной темы.

---

## 6. Черновик `docs/DESIGN.md`

Не копировать в код целиком — это ориентир. Формат совместим с идеей Google
DESIGN.md (YAML-токены + короткая проза), но без зависимости от alpha-CLI.

```md
# AI Cards — визуальный язык

## Характер
Спокойный учебный инструмент. Чёрно-белая база, один синий акцент,
цвет — только для смысла: правильно / почти / ошибка / предупреждение.
Никаких градиентов, теней и «стеклянных» карточек.

## Цвет
- База: bg-primary, text-primary, border-primary.
- Акцент: `--accent` — только главное действие на экране. Одно на экран.
- Смыслы: `--success`, `--warning`, `--danger` — только статус, не декор.
- Данные: `--chart-1..3`, `--heat-0..3` — только графики.
- Запрещено: hex вне tokens.css, `rgba()` в компонентах, новый оттенок без роли.

## Типографика
- Системный стек, без веб-шрифтов.
- h1 2rem/700, h2 1.25rem/700, body 1rem/1.5, small 0.875rem, micro 0.75rem.

## Ритм
- Spacing: 4 / 8 / 12 / 16 / 20 / 24 / 32.
- Radius: 4px (sm), 6px (md), 999px (pill — только теги).
- Контролы: 28 / 44 / 48 px; на мобиле минимум 44px.

## Компоненты
- Кнопки: `primary` (одна на экран), `secondary` (по умолчанию),
  `ghost` (третичное), `danger` (подтверждение удаления),
  `danger-ghost` (удаление в строке таблицы).
- Поля: label сверху, ошибка под полем, рамка 2px.
- Карточка: рамка 2px, без тени, радиус 4px.

## Состояния
- hover: смена фона/рамки, не opacity.
- focus-visible: 3px `--focus-ring` с отступом 2px.
- disabled: opacity .5 + `cursor: not-allowed`.
- active: на 1px темнее hover.

## Нельзя
- inline-стили для цвета и интерактивных состояний;
- `btnPrimary` для отмены;
- новые hex, `rgb()`, `rgba()` вне tokens.css;
- цвет, который работает только в одной теме.
```

---

## 7. Токены: что добавить к существующим 25

Существующие имена оставляем (переименование 50+ использований сейчас дороже
пользы), добавляем роли:

| Токен | Light | Dark | Зачем |
|---|---|---|---|
| `--warning` | `#b45309` | `#fbbf24` | текст «почти правильно», «скоро повтор» |
| `--warning-bg` | `#fffbeb` | `#2a1f0a` | фон плашки |
| `--warning-border` | `#f59e0b` | `#b45309` | рамка/подсветка |
| `--success-solid` | `#2a8a2a` | `#66cc66` | заливка «правильно» |
| `--danger` | `#cc0000` | `#ff6666` | solid-кнопка удаления |
| `--danger-hover` | `#a30000` | `#ff8a8a` | hover опасной кнопки |
| `--focus-ring` | `#2563eb` | `#60a5fa` | `:focus-visible` |
| `--chart-1` | `#2563eb` | `#60a5fa` | ряд «≥1 повтор» |
| `--chart-2` | `#7c3aed` | `#a78bfa` | ряд «≥2 повтора» |
| `--chart-3` | `#0d9488` | `#2dd4bf` | третий ряд, если появится |
| `--heat-0` | `#f5f5f5` | `#1a1a1a` | heatmap, пусто |
| `--heat-1` | `#dbeafe` | `#1e3a5f` | heatmap, мало |
| `--heat-2` | `#93c5fd` | `#2563eb` | heatmap, средне |
| `--heat-3` | `#2563eb` | `#60a5fa` | heatmap, много |
| `--space-1..7` | 4…32px | — | ритм |
| `--radius-sm/md` | 4/6px | — | скругления |
| `--control-sm/md/lg` | 28/44/48px | — | высоты контролов |
| `--text-xs/sm/md/lg/xl` | .75/.875/1/1.25/2rem | — | типографика |

Важно: **смысловые цвета — это роли, а не оттенки.** `--warning` не «жёлтый»,
а «внимание, но не ошибка». Если завтра палитра станет другой, меняется только
`tokens.css`.

Для графиков правило отдельное: цвет серии не должен нести смысл «плохо/хорошо»,
иначе диаграмма превращается в светофор. Поэтому `chart-*`, а не `success/danger`.

---

## 8. Компонент `Button`: закрытый API

```tsx
// src/components/ui/Button.tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './ui.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;       // default: secondary
  size?: Size;             // default: md
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  className,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const cls = ['btn', `btn--${variant}`, `btn--${size}`, className]
    .filter(Boolean).join(' ');
  return (
    <button className={cls} disabled={disabled || loading} aria-busy={loading} {...rest}>
      {loading ? '…' : children}
    </button>
  );
}
```

```css
/* src/components/ui/ui.css — фрагмент */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font: inherit;
  font-weight: 600;
  border: 2px solid var(--border-primary);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  color: var(--text-primary);
  min-height: var(--control-md);
  padding: 0 var(--space-4);
  cursor: pointer;
  transition: background-color .15s, border-color .15s, color .15s;
}

.btn:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px; }
.btn:disabled { opacity: .5; cursor: not-allowed; }

.btn--primary { background: var(--accent); border-color: var(--accent); color: var(--text-on-accent); }
.btn--primary:hover:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); }

.btn--ghost { background: transparent; border-color: transparent; }
.btn--ghost:hover:not(:disabled) { background: var(--bg-muted); }

.btn--danger { background: var(--danger); border-color: var(--danger); color: var(--text-on-accent); }
.btn--danger:hover:not(:disabled) { background: var(--danger-hover); border-color: var(--danger-hover); }

.btn--danger-ghost { background: transparent; border-color: transparent; color: var(--text-danger); }
.btn--danger-ghost:hover:not(:disabled) { background: var(--bg-danger); }

.btn--sm { min-height: var(--control-sm); padding: 0 var(--space-2); font-size: var(--text-xs); }
.btn--lg { min-height: var(--control-lg); padding: 0 var(--space-5); font-size: var(--text-md); }
```

Почему именно так:

- **Вариант — это роль, а не цвет.** Страница пишет `<Button variant="danger">`,
  а не думает, какой red взять.
- **`Cancel` — это `secondary` или `ghost`**, но никогда не `primary`. Одна
  главная кнопка на экран — правило, которое легко проверить глазами.
- **Состояния в CSS.** Инлайн-объекты физически не могут `:focus-visible`;
  после переезда пропадает глобальный `opacity: .8`, и primary перестаёт
  «мигать» при наведении.
- **`danger-ghost` для строк таблицы.** Удаление в списке не должно быть
  красной заливкой — оно не главное действие экрана.

Аналогично `Input`/`Select`/`Textarea` принимают `invalid?: boolean` и рисуют
рамку через `data-invalid`, а `Modal` — только `title`, `children`, `onClose`.
Никаких `style`-пропов в этих компонентах: если очень нужно отступить, есть
`className` и утилитарные классы `mt-2` / `row` / `stack`.

---

## 9. Автоматика: точные конфиги

### 9.1 ESLint (flat config)

Ставим `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks` (последний,
скорее всего, уже нужен). Ключевое правило:

```js
// eslint.config.js
export default [
  // ...остальная конфигурация
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          selector: "JSXAttribute[name.name='style'] Literal[value=/#[0-9a-fA-F]{3,8}/]",
          message: 'Hex-цвет в inline style. Используй var(--token) или компонент из components/ui.',
        },
        {
          selector: "JSXAttribute[name.name='style'] TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}/]",
          message: 'Hex-цвет в inline style. Используй var(--token) или компонент из components/ui.',
        },
      ],
    },
  },
  {
    files: ['src/styles/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' }, // токены — легальное место
  },
];
```

Селектор намеренно **не якорится** на начало строки: иначе
`'2px solid #d9a400'` проскочит. Именно этот баг разбирают в
`meshmonitor#5594`.

Дополнительно можно запретить `style` целиком для интерактивных элементов, но
это лучше делать после переезда, иначе будет сотня ошибок и соблазн отключить
правило.

### 9.2 Stylelint

```json
{
  "rules": {
    "color-no-hex": true,
    "function-disallowed-list": ["rgb", "rgba", "hsl", "hsla"]
  },
  "overrides": [
    {
      "files": ["src/styles/tokens.css"],
      "rules": { "color-no-hex": null, "function-disallowed-list": null }
    }
  ]
}
```

`tokens.css` — единственный файл, где живут сырые значения. Всё остальное
обязано ссылаться на `var(--...)`. Если очень нужен `rgba` для оверлея — он
тоже становится токеном (`--overlay` уже есть).

### 9.3 Скрипты

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:css": "stylelint \"src/**/*.css\"",
    "lint:design": "npm run lint && npm run lint:css"
  }
}
```

Порядок включения: неделю `warn`, потом `error`. В соло-проекте можно сразу
`error`, если переезд страниц уже сделан.

### 9.4 Playwright

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5173' },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
});
```

```ts
// e2e/styleguide.spec.ts
import { test, expect } from '@playwright/test';

for (const theme of ['light', 'dark'] as const) {
  test(`styleguide ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
    await page.goto('/styleguide');
    await expect(page).toHaveScreenshot(`styleguide-${theme}.png`, { fullPage: true });
  });
}
```

Тонкость: приложение проверяет авторизацию. Витрину нужно либо смонтировать до
auth-гейта (dev-only), либо замокать `/auth/status` в тесте. Второй вариант
честнее: он проверяет реальный рендер.

### 9.5 Опционально: Impeccable

`npx impeccable detect src` даёт быстрый отчёт по «AI slop» и умеет генерировать
`DESIGN.md`. Полезно как разовая проверка. В CI не ставить: Apache-2.0, но
install-hook выполняется вне подтверждения модели, плюс телеметрия — сначала
прочитать, что именно ставится.

---

## 10. Definition of Done для UI-правки

Добавить в `AGENTS.md` и в конец каждой задачи:

- [ ] Новый цвет — только токен в `tokens.css`, с парой для тёмной темы.
- [ ] Интерактивный элемент — только `components/ui/*`, без inline-стилей цвета.
- [ ] Одна главная кнопка на экран; «Отмена» — не `primary`.
- [ ] Проверены `hover`, `focus-visible`, `disabled`.
- [ ] Проверены обе темы (переключатель в шапке).
- [ ] `npm run lint:design` зелёный.
- [ ] Если витрина изменилась — снапшот обновлён осознанно.

Если пункт нельзя выполнить за 5 минут, значит система слишком тяжёлая —
упростить систему, а не обойти пункт.

---

## 11. Риски и расхождения

1. **Фрагментация DESIGN.md.** Есть формат Google (`google-labs-code/design.md`),
   формат Impeccable, каталог getdesign.md. Выбираем один (Google-подобный
   YAML + проза), храним в репо и не тащим CLI в CI, пока он alpha.
2. **Impeccable — не серебряная пуля.** 110k звёзд и 24 команды впечатляют, но
   это внешний слой поверх тех же правил. Без токенов и компонентов он лишь
   опишет бардак.
3. **Линт-усталость.** Полный запрет `style` сразу даст сотни ошибок. Поэтому
   сначала hex, потом интерактив, потом остальное. Каждое правило — с легальным
   путём обхода через токен/компонент.
4. **Слишком большая система.** Storybook, Chromatic, реестр и 50 компонентов
   для соло-приложения — способ бросить систему через месяц. 5–8 компонентов и
   один lint-гейт достаточно.
5. **Тёмная тема для данных.** Графики и heatmap — главный источник hex. Если
   `chart-*`/`heat-*` не появятся, дрейф вернётся именно там.
6. **Владелец.** Без человека, который говорит «нет», через 3 месяца появится
   `--accent-2` и `--accent-new`. В соло-проекте роль владельца выполняет
   definition of done + CI; это работает, только если правила не отключают «на
   минутку».
7. **Визуальные снапшоты шумят.** Шрифты и сглаживание различаются между
   машинами; поэтому `maxDiffPixelRatio`, фиксированный viewport и отключённые
   анимации. Снапшоты — про структуру и цвет, не про пиксель-в-пиксель.

---

## 12. Источники

Даты — по публикации/коммиту; ссылки проверены 2026-11-15.

**Практика и обзоры**

1. Foundey. *Vibe Coding Design System: Keep AI UIs Consistent.* 2026-10-25.
   https://foundey.com/blog/vibe-coding-design-system
2. Boldare. *Design system for vibe coding teams.* 2026.
   https://www.boldare.com/blog/vibe-coding-design-system/
3. O'Reilly Radar. *The Design System as the Control Plane for AI-Generated UI.*
   2026-08-25. https://www.oreilly.com/radar/the-design-system-as-the-control-plane-for-ai-generated-ui/
4. Agent Design. *The Vibe Coding Stack for Design Systems + 15 Resources.*
   2026-07-14. https://agent-design.com/blog/vibe-coding-stack-design-systems

**Форматы и инструменты**

5. Google Labs. *DESIGN.md — a format specification for describing a visual
   identity to coding agents.* https://github.com/google-labs-code/design.md
6. getdesign.md. *State of DESIGN.md 2026.* https://getdesign.md/state-of-design-md
7. Impeccable (Paul Bakaus), Apache-2.0. https://github.com/pbakaus/impeccable
8. shadcn/ui. *Theming.* https://ui.shadcn.com/docs/theming
9. Tailwind CSS. *Theme variables (v4).* https://tailwindcss.com/docs/theme
10. W3C Design Tokens Community Group. *Design Tokens Format Module 2025.10.*
    https://tr.designtokens.org/format/
11. Playwright. *Visual comparisons.* https://playwright.dev/docs/test-snapshots

**Конкретный кейс и конфиги**

12. Yeraze/meshmonitor, issue #5594. *[FEAT] Lint guardrails to block hardcoded
    hex colors.* 2026-10-04. https://github.com/Yeraze/meshmonitor/issues/5594
13. HN. *Slightly reducing the sloppiness of AI generated front end.* 2026-06-12.
    https://envs.net/~volpe/blog/posts/reduce-slop.html
14. HN. *Show HN: Figma for Coding Agents (getdesign.md).* 2026-04-10.
    https://news.ycombinator.com/item?id=47719485
15. HN. *Show HN: UIQuarter — static analysis CLI for UI codebases.* 2026-02-25.
    https://github.com/fuatkeles/uiquarter
16. HN. *Show HN: Marque — MCP/CLI server for persistent agent design identity.*
    2026-03-09. https://marque-web.vercel.app/

**Форумный сигнал**

17. r/cursor. *Модели выдают несогласованный дизайн.* 2026-08-26.
    https://www.reddit.com/r/cursor/comments/1vz94r0/
18. r/vibecoding. *Top skills / definition of done.* 2026-11-13.
    https://www.reddit.com/r/vibecoding/comments/1xvibpr/

**Русскоязычное**

19. pimenov.ai. Обзор Impeccable. 2026-07-23. https://pimenov.ai
20. open-design.ai/ru — материалы по дизайн-системам для AI-разработки.
21. wpcraft.ru — обзоры вайбкодинга и AI-инструментов.

Habr и Stack Overflow на момент исследования отдавали 403; статья
`habr.com/ru/companies/domclick/articles/1062674/` была скрытым черновиком и
недоступна. Поэтому фундамент — англоязычные первоисточники и GitHub-issue с
реальным конфигом, а не пересказы.
