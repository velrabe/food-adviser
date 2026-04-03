-- Шкала 0–100: относительная «частота» внутри категории (70/50/30 у углеводов ≈ 41%/29%/18% и т.д.).
-- NULL в pick_breakfast / … / pick_snack — использовать pick_score для этого приёма.
-- pick_score = 0 — не предлагать.

alter table public.products
  add column pick_score smallint not null default 50
    constraint products_pick_score_range check (pick_score >= 0 and pick_score <= 100);

alter table public.products
  add column pick_breakfast smallint null
    constraint products_pick_brk_range check (
      pick_breakfast is null or (pick_breakfast >= 0 and pick_breakfast <= 100)
    );

alter table public.products
  add column pick_lunch smallint null
    constraint products_pick_lun_range check (
      pick_lunch is null or (pick_lunch >= 0 and pick_lunch <= 100)
    );

alter table public.products
  add column pick_dinner smallint null
    constraint products_pick_din_range check (
      pick_dinner is null or (pick_dinner >= 0 and pick_dinner <= 100)
    );

alter table public.products
  add column pick_snack smallint null
    constraint products_pick_snk_range check (
      pick_snack is null or (pick_snack >= 0 and pick_snack <= 100)
    );

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'pick_weight'
  ) then
    execute $u$
      update public.products
      set pick_score = case
        when pick_weight <= 0 then 0
        else 50
      end
    $u$;
    execute 'alter table public.products drop column pick_weight';
  end if;
end $$;

comment on column public.products.pick_score is
  'Частота 0–100 внутри категории; доли как при «процентах» между товарами одной группы.';

comment on column public.products.pick_breakfast is
  'Если задано — подставляется вместо pick_score только на завтрак.';

comment on column public.products.pick_lunch is
  'Если задано — вместо pick_score только на обед.';

comment on column public.products.pick_dinner is
  'Если задано — вместо pick_score только на ужин.';

comment on column public.products.pick_snack is
  'Если задано — вместо pick_score только на перекус.';
