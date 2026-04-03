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

3. Без `.env` на экране входа будет подсказка про Supabase. С ключами — регистрация и вход, затем раздел **«Продукты»**.

## Supabase (база и auth)

1. [Supabase Dashboard](https://supabase.com/dashboard) → **New project** (или существующий).
2. **Project Settings → API**: скопируйте **Project URL** и **anon public** key.
3. **SQL Editor → New query**: вставьте весь файл `supabase/migrations/20260403000000_initial.sql` → **Run**.
4. **Authentication** включите **Email** (при желании отключите подтверждение почты для быстрых тестов: *Authentication → Providers → Email → Confirm email*).
5. В корне проекта:

   ```bash
   cp .env.example .env
   ```

   Заполните `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`.

6. Снова `npm run dev` — зарегистрируйтесь, добавьте продукт.

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
