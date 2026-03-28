# Telecom Scrum Agent — UI Design Plan (Google Stitch)

## Project Brief

**Продукт:** Kabanchik — AI-агент для Scrum-команд домена @municorn.com.

**Проблема:** после каждой встречи команде нужно вручную переносить action items в Jira, обновлять статусы задач, создавать meeting notes в Notion и восстанавливать контекст по прошлым решениям. Это занимает время и часто не делается.

**Решение:** агент автоматически забирает транскрипты из Google Meet, анализирует их (summary, action items, decisions), индексирует в единую базу знаний и предлагает конкретные обновления в Jira и Notion. Пользователь только подтверждает или отклоняет предложения. Чатовый интерфейс позволяет задавать вопросы по всей истории встреч, задач и документов.

**Пользователи:** разработчики и менеджеры команды @municorn.com.

**Ключевые сценарии:**
1. После встречи → агент сам обрабатывает транскрипт и готовит список изменений для review
2. "Что решили на последнем планировании?" → чат отвечает со ссылками на источники
3. Bulk-approve предложенных Jira-обновлений за 30 секунд вместо ручного разбора

**Технический контекст:**
- Backend: FastAPI + LangGraph + Claude (Anthropic)
- RAG: RAG-Anything (LightRAG-based), единая база знаний для всей команды
- Интеграции: Google Calendar/Meet (сервисный аккаунт), Jira (Atlassian MCP), Notion (Notion MCP)
- Auth: Google OAuth, только @municorn.com
- Deploy: Cloud Run

**Интерфейс:** веб-приложение (desktop-first), 5 разделов — Chat, Meetings, Updates, Agent Trace, Settings.

---

Прототип веб-интерфейса для работы в Google Stitch. Охватывает все экраны MVP.

Примечание: дизайн рассчитан на несколько проектов, каждый с отдельным Google-аккаунтом. Тех. спеки и план MVP под это не адаптированы — только дизайн.

---

## Общие принципы

- Desktop-first (1280px), минимум адаптации под планшет
- Тёмная боковая навигация + светлый контент-блок
- Язык интерфейса: английский (данные — как есть)
- Компонентная система: shadcn/ui-style (card, badge, button, input, dialog)
- Шрифт: **Inter** (regular → medium → semibold → bold)

---

## Design System

### Color Palette

| Token | Hex | Использование |
|---|---|---|
| `color-ink` | `#1C1917` | Основной текст, тёмные фоны (sidebar, nav) |
| `color-muted` | `#D6D3D1` | Разделители, placeholder текст, disabled состояния |
| `color-surface` | `#FFFFFF` | Фон страниц, карточки, модалки |
| `color-accent-light` | `#ADDBFF` | Hover-состояния, выделения, фон активного пункта nav |
| `color-primary` | `#0077E6` | Primary кнопки, ссылки, активные элементы, progress bar |

### Status Colors (Badges)

| Статус | Цвет | Использование |
|---|---|---|
| `status-done` / Paid | Зелёный | Завершено, оплачено, успешно |
| `status-pending` / Unpaid | Оранжевый | Ожидание, не оплачено, в очереди |
| `status-error` / Overdue | Красный | Ошибка, просрочено, критично |
| `status-draft` / Draft | Серый (`#D6D3D1`) | Черновик, неактивно |

Для состояний обработки встреч:
- **Pending** → Draft (серый)
- **Processing / Transcribing / Analyzing** → Unpaid/orange
- **Done** → Paid/green
- **Error** → Overdue/red

### Typography Scale (Font: Inter)

| Стиль | Weight | Size | Line Height | Letter Spacing |
|---|---|---|---|---|
| Title L | Bold | 36px | 40px | 0% |
| Title M | Semi Bold | 24px | 32px | 0% |
| Title S | Semi Bold | 18px | 24px | 0% |
| Headline L | Bold | 16px | 20px | 0% |
| Headline M | Semi Bold | 16px | 20px | 0% |
| Headline S | Medium | 16px | 20px | 0% |
| Caption | Medium | 14px | 16px | 0% |
| Body L | Regular | 16px | 24px | 0% |
| Body M | Medium | 14px | 18px | 0% |
| Body S | Medium | 12px | 16px | 0.1px |
| Headline Caps | Semi Bold | 12px | 16px | 0.4px |

### Buttons

| Вариант | Состояние | Стиль |
|---|---|---|
| Primary | Default | Фон `#0077E6`, текст белый, скруглённый |
| Primary | Tap / Hover | Тёмнее `#0077E6` |
| Primary | Disabled | Фон `#D6D3D1`, текст серый |
| Secondary | Default | Белый фон, серый бордер |
| Secondary | Tap / Hover | Белый фон, бордер темнее |
| Secondary | Disabled | Белый фон, светлый бордер, текст `#D6D3D1` |

### Inputs

| Тип | Особенности |
|---|---|
| Text Field | Outline-стиль, 3 состояния: placeholder / focused / filled |
| Currency | Флаг + символ валюты слева, числовое поле |
| Password | Правая иконка show/hide (eye / eye-off) |
| Calendar / Date | Правая иконка календаря, формат `DD.MM.YYYY` |

### Swipe Actions (мобиль / touch-контекст)

| Действие | Цвет иконки |
|---|---|
| Unpaid | Оранжевый |
| Paid | Зелёный |
| Delete | Красный |
| Share | Синий (`#0077E6`) |

### Иконки

Линейный стиль (stroke). Набор покрывает: навигацию, действия (удалить, поделиться, поиск, загрузка), пользователи, безопасность, звезда, глобус, изображения, файлы, видимость.

---

---

## Структура экранов

```
/ (redirect)
├── /login                    — вход через Google
├── /projects                 — список проектов
├── /projects/new             — добавить проект
├── /projects/[id]/           — проект: главная (redirect → /chat)
│   ├── chat                  — RAG-чат
│   ├── meetings              — список встреч
│   ├── meetings/[meetingId]  — детали встречи
│   ├── updates               — предложенные изменения
│   ├── trace                 — agent trace
│   └── settings              — настройки проекта
```

---

## Экран 1: Login

**Маршрут:** `/login`

**Цель:** аутентификация через Google.

### Содержимое
- Логотип (анимация бегущего кабанчика) / название "Kabanchik"
- Краткое описание (1 строка): "Scrum agent for your team"
- Кнопка "Sign in with Google" (стандартный Google OAuth стиль)
- Мелкая подпись: "Only @municorn.com accounts are allowed"

### Поведение
- После успешного OAuth → redirect на `/projects`
- Если домен не @municorn.com → показать ошибку на этом же экране

### Stitch-заметки
- Показать состояние: default, loading (кнопка spinner), error (red banner)

---

## Экран 2: Projects List

**Маршрут:** `/projects`

**Цель:** выбор рабочего проекта или создание нового.

### Содержимое
- Header: "Projects" + кнопка "Add Project"
- Список карточек проектов:
  - Название проекта
  - Привязанный Google-аккаунт (email)
  - Статус синхронизации (last sync: X min ago / Never)
  - Кнопка "Open"
- Пустое состояние: иллюстрация + "No projects yet. Add your first project."

### Stitch-заметки
- Показать 2–3 проекта в разных состояниях: active, never synced, error
- Показать пустое состояние отдельно

---

## Экран 3: Add Project

**Маршрут:** `/projects/new`

**Цель:** настройка нового проекта с отдельным Google-аккаунтом.

### Форма (wizard, 3 шага)

**Шаг 1: Базовая информация**
- Project name (text input)
- Description (optional, textarea)

**Шаг 2: Google Account**
- Кнопка "Connect Scrum Agent Google Account" → OAuth для сервисного аккаунта этого проекта
- После подключения: показать email аккаунта + зелёный checkmark
- Примечание: "This account will be used to access Google Calendar and Meet"

**Шаг 3: Integrations**
- Jira: поле API token + поле Jira base URL
- Notion: поле Integration Token
- Оба опциональны, можно добавить позже в Settings

**Footer:** кнопки "Back" / "Create Project"

### Stitch-заметки
- Показать шаги как progress steps вверху
- Показать состояние после успешного подключения Google

---

## Экран 4: Chat

**Маршрут:** `/projects/[id]/chat`

**Цель:** RAG-чат по базе знаний проекта (встречи + Jira + Notion).

### Layout
- Левая панель (240px): навигация по проекту (см. Nav)
- Правая область: чат

### Чат-область
- История сообщений (scroll)
- Каждый ответ агента:
  - Текст ответа (markdown rendering)
  - Citations block: список источников (meeting title + timestamp, Jira issue key, Notion page title)
  - Collapsed "Sources" accordion
- Input area внизу: textarea + кнопка "Send" + иконка стоп (если streaming)
- Placeholder: "Ask about meetings, tasks, decisions..."

### Состояния
- Streaming: typing indicator / постепенное появление текста
- Empty state: "Ask me about your meetings, action items, or project decisions"
- Error: inline error banner с retry

### Stitch-заметки
- Показать: пустой чат, чат с историей (2–3 обмена), streaming state
- Показать раскрытый и свёрнутый citations block

---

## Экран 5: Meetings List

**Маршрут:** `/projects/[id]/meetings`

**Цель:** список обработанных и ожидающих встреч.

### Фильтры (toolbar)
- Search по названию
- Date range picker
- Status filter: All / Pending / Processing / Done / Error

### Список встреч (таблица или карточки)
Каждая запись:
- Название встречи
- Дата и время
- Участники (аватары, max 4 + "+N more")
- Статус обработки (badge: Pending / Processing / Transcribing / Analyzing / Done / Error)
- Кнопка "View" → переход в детали

### Пустое состояние
- "No meetings yet. Meetings will appear here after your Google Calendar syncs."

### Stitch-заметки
- Показать встречи в разных статусах
- Показать пустое состояние

---

## Экран 6: Meeting Detail

**Маршрут:** `/projects/[id]/meetings/[meetingId]`

**Цель:** полная информация по одной встрече.

### Структура

**Header**
- Название встречи
- Дата, время, длительность
- Участники
- Статус-badge

**Tabs:** Summary | Transcript | Action Items | Decisions | Updates

---

**Tab: Summary**
- Текст summary (markdown)
- Linked Jira issues (список карточек: key + title + status)
- Linked Notion pages (список: title + icon)

**Tab: Transcript**
- Список utterances с timestamp и speaker
- Поиск по тексту транскрипта
- Если нет транскрипта → "Transcript not available"

**Tab: Action Items**
- Список action items: owner, text, due date, статус (open/done/linked)
- Linked Jira issue (если есть): inline badge с ссылкой
- Кнопка "Link to Jira" (открывает dialog)

**Tab: Decisions**
- Список decisions: текст + confidence badge

**Tab: Updates**
- Предложенные изменения для этой встречи (subset экрана Updates)
- Approve / Reject inline

### Stitch-заметки
- Показать каждый tab отдельно
- Показать transcript с несколькими спикерами
- Показать action item с linked Jira issue

---

## Экран 7: Updates (Proposed Changes)

**Маршрут:** `/projects/[id]/updates`

**Цель:** просмотр и подтверждение предложенных изменений в Jira / Notion.

### Фильтры
- All / Pending / Approved / Rejected
- Target: All / Jira / Notion
- Meeting filter (dropdown)

### Список изменений
Каждое изменение — карточка:
- Target: иконка Jira / Notion + object name
- Update type: "Add comment", "Change status", "Set assignee", etc.
- Diff view: Before → After (две колонки, подсветка изменений)
- Reasoning: collapsible "Agent reasoning" секция
- Confidence badge (High / Medium / Low)
- Кнопки: "Approve" (Primary green / `status-done`) / "Reject" (Secondary / `#D6D3D1`) / "Edit" (`#0077E6`)
- Bulk actions toolbar: "Approve all" / "Reject all" для выбранных

### Состояния карточки
- Pending — badge `status-draft` (серый)
- Approved — бордер `status-done` (зелёный), checkmark
- Rejected — бордер `#D6D3D1` (серый), текст зачёркнут
- Applied — badge `status-done` (зелёный, filled)
- Failed — бордер `status-error` (красный), retry кнопка

### Stitch-заметки
- Показать несколько карточек в разных состояниях
- Показать diff view с конкретным примером (Jira status change, Notion comment)
- Показать bulk selection

---

## Экран 8: Agent Trace

**Маршрут:** `/projects/[id]/trace`

**Цель:** просмотр шагов агента для отладки и прозрачности.

### Структура

**Левая панель:** список agent runs
- Дата/время
- Meeting title (если привязан)
- Статус
- Длительность

**Правая панель:** детали выбранного run
- Список шагов (timeline/accordion):
  - Step name
  - Input (collapsed)
  - Output (collapsed)
  - Tool calls: tool name, arguments, result
  - Duration
- Summary: агент, кол-во шагов, использованные tools, общее время

### Stitch-заметки
- Показать run с 4–6 шагами
- Показать раскрытый tool call
- Пустое состояние: "No agent runs yet"

---

## Экран 9: Settings

**Маршрут:** `/projects/[id]/settings`

**Цель:** управление настройками проекта.

### Разделы (левое меню внутри страницы)

**General**
- Project name (edit)
- Delete project (destructive, confirmation dialog)

**Google Account**
- Текущий подключённый аккаунт (email)
- Last calendar sync: время + "Sync now" кнопка
- Disconnect / Reconnect

**Jira**
- Jira base URL
- API Token (masked, edit)
- Test connection кнопка
- Disconnect

**Notion**
- Integration Token (masked, edit)
- Test connection кнопка
- Disconnect

**Sync Policy**
- Toggle: "Auto-apply safe changes" (comments, links, tags)
- Toggle: "Require approval for all changes"
- Info: что считается safe

### Stitch-заметки
- Показать раздел Google Account с подключённым аккаунтом
- Показать раздел Jira с успешным тест-коннектом и с ошибкой

---

## Nav Component

Левая боковая панель (240px), присутствует на всех экранах внутри проекта.

### Содержимое
- Project name + стрелка → dropdown для переключения проектов
- Навигационные ссылки:
  - Chat (иконка сообщения)
  - Meetings (иконка видеокамеры)
  - Updates (иконка чекмарка + badge с числом pending)
  - Agent Trace (иконка списка)
  - Settings (иконка шестерёнки)
- Footer: аватар пользователя + email + "Sign out"

### Stitch-заметки
- Показать активное состояние каждого пункта
- Показать project switcher dropdown
- Показать badge на Updates с числом

---

## Порядок прототипирования в Stitch

1. Design system: цвета и токены из раздела Design System выше, типографика Inter, базовые компоненты (button, badge, card, input, dialog)
2. Nav component
3. Login
4. Projects List + пустое состояние
5. Add Project (wizard, все шаги)
6. Chat (empty, with history, streaming)
7. Meetings List
8. Meeting Detail (все tabs)
9. Updates
10. Agent Trace
11. Settings (все разделы)
12. Linkage: соединить все экраны кликабельными переходами
