-- Вес продукта в случайном подборе генератора: относительная частота (не проценты по каталогу).
-- Пример: 1 — как обычно, 80 — в ~80 раз чаще при равных соседях с весом 1; 0.001 — очень редко; 0 — не предлагать.

alter table public.products
  add column pick_weight numeric(14, 8) not null default 1;

alter table public.products
  add constraint products_pick_weight_nonneg check (pick_weight >= 0);

comment on column public.products.pick_weight is
  'Относительный вес в подборе генератора (≥0). Выше — чаще, ниже — реже; 0 — исключить из подбора.';
