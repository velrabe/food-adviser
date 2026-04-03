-- Переход с auth.users на профили без логина (личный проект, открытый доступ по anon).
-- Выполните в SQL Editor после initial migration.

-- ——— снять старые политики ———
drop policy if exists products_select on public.products;
drop policy if exists products_insert on public.products;
drop policy if exists products_update on public.products;
drop policy if exists products_delete on public.products;
drop policy if exists plans_select on public.plans;
drop policy if exists plans_insert on public.plans;
drop policy if exists plans_update on public.plans;
drop policy if exists plans_delete on public.plans;
drop policy if exists plan_meals_all on public.plan_meals;
drop policy if exists plan_meal_items_all on public.plan_meal_items;
drop policy if exists generation_history_select on public.generation_history;
drop policy if exists generation_history_insert on public.generation_history;
drop policy if exists generation_history_update on public.generation_history;
drop policy if exists generation_history_delete on public.generation_history;
drop policy if exists settings_select on public.settings;
drop policy if exists settings_insert on public.settings;
drop policy if exists settings_update on public.settings;
drop policy if exists settings_delete on public.settings;

drop trigger if exists on_auth_user_created_settings on auth.users;
drop function if exists public.handle_new_user_settings();

-- ——— профили ———
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  label text not null default 'Профиль',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ——— связать строки с профилем ———
alter table public.products add column profile_id uuid references public.profiles(id) on delete cascade;
alter table public.plans add column profile_id uuid references public.profiles(id) on delete cascade;
alter table public.generation_history add column profile_id uuid references public.profiles(id) on delete cascade;
alter table public.settings add column profile_id uuid references public.profiles(id) on delete cascade;

insert into public.profiles (label) values ('Основной');

update public.products
set profile_id = (select id from public.profiles order by created_at limit 1)
where profile_id is null;

update public.plans
set profile_id = (select id from public.profiles order by created_at limit 1)
where profile_id is null;

update public.generation_history
set profile_id = (select id from public.profiles order by created_at limit 1)
where profile_id is null;

-- settings: могли быть строки от разных auth-пользователей — оставляем одну на дефолтный профиль
delete from public.settings;

insert into public.settings (profile_id)
select id from public.profiles order by created_at limit 1;

alter table public.products alter column profile_id set not null;
alter table public.plans alter column profile_id set not null;
alter table public.generation_history alter column profile_id set not null;
alter table public.settings alter column profile_id set not null;

-- ——— убрать user_id ———
drop index if exists products_user_active_idx;
drop index if exists plans_user_date_idx;
drop index if exists generation_history_user_idx;
drop index if exists products_user_internal_code_uidx;

alter table public.products drop constraint if exists products_user_id_fkey;
alter table public.products drop column user_id;

alter table public.plans drop constraint if exists plans_user_id_plan_date_key;
alter table public.plans drop constraint if exists plans_user_id_fkey;
alter table public.plans drop column user_id;
alter table public.plans add constraint plans_profile_plan_date_key unique (profile_id, plan_date);

create unique index if not exists products_profile_internal_code_uidx
  on public.products (profile_id, internal_code)
  where internal_code is not null;

create index if not exists products_profile_active_idx on public.products (profile_id) where is_active = true;
create index if not exists plans_profile_date_idx on public.plans (profile_id, plan_date);
create index if not exists generation_history_profile_idx
  on public.generation_history (profile_id, created_at desc);

alter table public.generation_history drop constraint if exists generation_history_user_id_fkey;
alter table public.generation_history drop column user_id;

alter table public.settings drop constraint if exists settings_user_id_key;
alter table public.settings drop constraint if exists settings_user_id_fkey;
alter table public.settings drop column user_id;
alter table public.settings add constraint settings_profile_id_key unique (profile_id);

-- ——— RLS: любой с anon-ключом (без логина) ———
create policy profiles_all on public.profiles
  for all using (true) with check (true);

create policy products_all on public.products
  for all using (true) with check (true);

create policy plans_all on public.plans
  for all using (true) with check (true);

create policy plan_meals_all on public.plan_meals
  for all using (true) with check (true);

create policy plan_meal_items_all on public.plan_meal_items
  for all using (true) with check (true);

create policy generation_history_all on public.generation_history
  for all using (true) with check (true);

create policy settings_all on public.settings
  for all using (true) with check (true);
