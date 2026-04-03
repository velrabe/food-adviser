# Food Adviser

План питания: продукты в Supabase, генерация меню на клиенте (Vite + React + TypeScript).

## Быстрая проверка локально

1. Установите зависимости и запустите dev-сервер:

   ```bash
   cd food-adviser
   npm install
   npm run dev
   ```

2. Откройте в браузере адрес, который покажет Vite (обычно [http://localhost:5173](http://localhost:5173)).

3. Без `.env` — подсказка про Supabase. С ключами и миграциями — сразу интерфейс: в шапке **профиль** (без логина), раздел **«Продукты»**.

## Где взять ключи Supabase и куда их положить

Ключи **не хранятся в репозитории** — только у вас в `.env` локально и в **Secrets** на GitHub (для деплоя).

### Откуда копировать

1. Зайдите в [Supabase Dashboard](https://supabase.com/dashboard) → выберите проект (или создайте **New project**).
2. Слева: **Project Settings** (шестерёнка) → раздел **Data API**.
3. Там же блок **API Keys**:
   - **Publishable key** — это и есть бывший *anon* ключ (публичный, им пользуется браузер). Скопируйте его.
4. Чуть выше виден **Project URL** вида `https://xxxx.supabase.co` — скопируйте целиком.

В старых проектах те же поля бывают на вкладке **Settings → API**: **Project URL** и ключ **`anon` `public`** — используйте их, если так удобнее.

### Куда вставить локально

В корне репозитория:

```bash
cp .env.example .env
```

Откройте `.env` и пропишите (без кавычек, без пробелов по краям):

```env
VITE_SUPABASE_URL=https://ВАШ-ПРОЕКТ.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Перезапустите `npm run dev`.

### Куда вставить для сайта на GitHub Pages

Сборка на GitHub «запекает» эти значения в JS на этапе **build**, поэтому их нужно задать как **секреты репозитория**:

1. Откройте [настройки репозитория → Secrets → Actions](https://github.com/velrabe/food-adviser/settings/secrets/actions).
2. **New repository secret** — создайте два секрета с **точно такими именами**:
   - `VITE_SUPABASE_URL` — тот же Project URL.
   - `VITE_SUPABASE_ANON_KEY` — тот же publishable / anon ключ.
3. После сохранения зайдите в **Actions** → последний workflow **Deploy to GitHub Pages** → **Re-run all jobs** (или сделайте пустой коммит и push).

Пока секретов нет или они пустые, на [сайте](https://velrabe.github.io/food-adviser/) будет экран с подсказкой настроить Supabase (раньше из‑за пустого URL падал весь JS и был просто «чёрный экран»).

## Supabase (схема)

В **SQL Editor** по очереди выполните файлы (каждый целиком → **Run**):

1. `supabase/migrations/20260403000000_initial.sql` — таблицы и старые политики под auth.
2. `supabase/migrations/20260403120000_profiles_open_rls.sql` — **профили** вместо аккаунтов, открытый доступ по anon-ключу (см. ниже).

После этого: «+ Профиль» в шапке создаёт нового пользователя (только название). Данные разделены по `profile_id`; переключение — в выпадающем списке.

**Безопасность:** любой, у кого есть URL сайта и ваш **anon** ключ (он в JS), может читать и менять все данные. Нормально только для личного пет-проекта. Для публичного продукта нужны логин и строгие RLS.

## Продакшен на GitHub Pages

После пуша в `main` workflow **Deploy to GitHub Pages** собирает и публикует сайт.

**Важно:** если в репозитории ещё не включён GitHub Pages, job `deploy` падает с ошибкой `HttpError: Not Found` / *Creating Pages deployment failed*. Сначала включите Pages, потом перезапустите workflow (кнопка **Re-run jobs** в Actions) или сделайте пустой коммит.

1. Репозиторий → **Settings → Pages → Build and deployment → Source**: выберите **GitHub Actions** (не ветку `gh-pages`).
2. **Settings → Secrets and variables → Actions** добавьте секреты:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`  
   Иначе задеплоенный сайт откроется, но не подключится к базе.

3. Сайт будет по адресу: `https://<user>.github.io/food-adviser/` (для репозитория `food-adviser`).

Локальный аналог депоя:

```bash
VITE_BASE_PATH=/food-adviser/ npm run build
npx gh-pages -d dist
```

## Скрипты

| Команда    | Назначение        |
|-----------|-------------------|
| `npm run dev`    | разработка        |
| `npm run build`  | production-сборка |
| `npm run deploy` | `build` + публикация в ветку `gh-pages` (без Actions) |
