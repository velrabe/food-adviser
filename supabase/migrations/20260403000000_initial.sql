-- Food adviser — initial schema (run in Supabase SQL editor or via CLI)
-- Requires: extension pgcrypto for gen_random_uuid()

create extension if not exists "pgcrypto";

-- ——— Categories & enums as text + check constraints ———

create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  internal_code text,
  name text not null,
  category text not null check (category in (
    'protein', 'carbs', 'fats', 'dairy', 'veg', 'sauce', 'mixed'
  )),
  portion_label text not null default '100 g',
  price numeric(14, 2) not null default 0,
  calories numeric(12, 2) not null default 0,
  protein numeric(12, 2) not null default 0,
  fat numeric(12, 2) not null default 0,
  carbs numeric(12, 2) not null default 0,
  fiber numeric(12, 2) not null default 0,
  sugar numeric(12, 2) not null default 0,
  storage_hours integer,
  comment text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists products_user_internal_code_uidx
  on public.products (user_id, internal_code)
  where internal_code is not null;

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_date date not null,
  meals_count smallint not null check (meals_count between 1 and 6),
  target_calories numeric(12, 2) not null,
  target_protein numeric(12, 2),
  target_fat numeric(12, 2),
  target_carbs numeric(12, 2),
  target_budget numeric(14, 2) not null default 0,
  delivery_fee numeric(14, 2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'accepted', 'archived')),
  total_price numeric(14, 2) not null default 0,
  total_calories numeric(12, 2) not null default 0,
  total_protein numeric(12, 2) not null default 0,
  total_fat numeric(12, 2) not null default 0,
  total_carbs numeric(12, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

create table public.plan_meals (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  position smallint not null default 0,
  meal_price numeric(14, 2) not null default 0,
  meal_calories numeric(12, 2) not null default 0,
  meal_protein numeric(12, 2) not null default 0,
  meal_fat numeric(12, 2) not null default 0,
  meal_carbs numeric(12, 2) not null default 0
);

create table public.plan_meal_items (
  id uuid primary key default gen_random_uuid(),
  plan_meal_id uuid not null references public.plan_meals (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  qty numeric(12, 4) not null default 1,
  locked boolean not null default false,
  item_price numeric(14, 2) not null default 0,
  item_calories numeric(12, 2) not null default 0,
  item_protein numeric(12, 2) not null default 0,
  item_fat numeric(12, 2) not null default 0,
  item_carbs numeric(12, 2) not null default 0
);

create table public.generation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  generated_for_date date not null,
  payload_json jsonb not null default '{}',
  target_json       jsonb not null default '{}',
  score numeric(12, 4),
  status text not null default 'generated' check (status in (
    'generated', 'saved', 'accepted', 'rejected'
  )),
  created_at timestamptz not null default now()
);

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() unique references auth.users (id) on delete cascade,
  default_calories numeric(12, 2) not null default 2000,
  default_meals_count smallint not null default 3 check (default_meals_count between 1 and 6),
  default_delivery_fee numeric(14, 2) not null default 0,
  default_budget numeric(14, 2) not null default 0,
  protein_target numeric(12, 2),
  fat_target numeric(12, 2),
  carbs_target numeric(12, 2),
  breakfast_share numeric(5, 4) not null default 0.30,
  lunch_share numeric(5, 4) not null default 0.40,
  dinner_share numeric(5, 4) not null default 0.30,
  snack_share numeric(5, 4) not null default 0.15,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_user_active_idx on public.products (user_id) where is_active = true;
create index plans_user_date_idx on public.plans (user_id, plan_date);
create index generation_history_user_idx on public.generation_history (user_id, created_at desc);

-- updated_at triggers
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create trigger settings_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

-- Auto-create settings row on signup
create or replace function public.handle_new_user_settings()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_settings
  after insert on auth.users
  for each row execute function public.handle_new_user_settings();

-- ——— RLS ———

alter table public.products enable row level security;
alter table public.plans enable row level security;
alter table public.plan_meals enable row level security;
alter table public.plan_meal_items enable row level security;
alter table public.generation_history enable row level security;
alter table public.settings enable row level security;

-- products
create policy products_select on public.products
  for select using (auth.uid() = user_id);
create policy products_insert on public.products
  for insert with check (auth.uid() = user_id);
create policy products_update on public.products
  for update using (auth.uid() = user_id);
create policy products_delete on public.products
  for delete using (auth.uid() = user_id);

-- plans
create policy plans_select on public.plans
  for select using (auth.uid() = user_id);
create policy plans_insert on public.plans
  for insert with check (auth.uid() = user_id);
create policy plans_update on public.plans
  for update using (auth.uid() = user_id);
create policy plans_delete on public.plans
  for delete using (auth.uid() = user_id);

-- plan_meals (via plan)
create policy plan_meals_all on public.plan_meals
  for all using (
    exists (select 1 from public.plans p where p.id = plan_meals.plan_id and p.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.plans p where p.id = plan_meals.plan_id and p.user_id = auth.uid())
  );

-- plan_meal_items (via plan_meal -> plan); product must belong to same user
create policy plan_meal_items_all on public.plan_meal_items
  for all using (
    exists (
      select 1 from public.plan_meals pm
      join public.plans p on p.id = pm.plan_id
      where pm.id = plan_meal_items.plan_meal_id and p.user_id = auth.uid()
    )
    and exists (
      select 1 from public.products pr
      where pr.id = plan_meal_items.product_id and pr.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.plan_meals pm
      join public.plans p on p.id = pm.plan_id
      where pm.id = plan_meal_items.plan_meal_id and p.user_id = auth.uid()
    )
    and exists (
      select 1 from public.products pr
      where pr.id = plan_meal_items.product_id and pr.user_id = auth.uid()
    )
  );

-- generation_history
create policy generation_history_select on public.generation_history
  for select using (auth.uid() = user_id);
create policy generation_history_insert on public.generation_history
  for insert with check (auth.uid() = user_id);
create policy generation_history_update on public.generation_history
  for update using (auth.uid() = user_id);
create policy generation_history_delete on public.generation_history
  for delete using (auth.uid() = user_id);

-- settings
create policy settings_select on public.settings
  for select using (auth.uid() = user_id);
create policy settings_insert on public.settings
  for insert with check (auth.uid() = user_id);
create policy settings_update on public.settings
  for update using (auth.uid() = user_id);
create policy settings_delete on public.settings
  for delete using (auth.uid() = user_id);
