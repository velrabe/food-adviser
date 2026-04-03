import type { MealType, ProductCategory, ProductRow, SettingsRow } from './types'

export type GeneratorTargetsInput = {
  calories: number
  protein: number | null
  fat: number | null
  carbs: number | null
  mealsCount: number
  budget: number
  deliveryFee: number
}

export type GeneratedLineItem = {
  productId: string
  name: string
  category: ProductCategory
  portion_label: string
  qty: number
  price: number
  calories: number
  protein: number
  fat: number
  carbs: number
}

export type GeneratedMeal = {
  mealType: MealType
  position: number
  items: GeneratedLineItem[]
  meal_price: number
  meal_calories: number
  meal_protein: number
  meal_fat: number
  meal_carbs: number
}

export type GeneratedPlan = {
  meals: GeneratedMeal[]
  total_price: number
  total_calories: number
  total_protein: number
  total_fat: number
  total_carbs: number
  score: number
}

/** За один приём с этой вероятностью берутся два разных белка вместо одного. */
const DUAL_PROTEIN_PROB = 0.05

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

function mealTypesForCount(mealsCount: number): MealType[] {
  const out: MealType[] = []
  for (let i = 0; i < mealsCount; i++) {
    out.push(i < 4 ? MEAL_ORDER[i] : 'snack')
  }
  return out
}

/** Доли калорий по приёмам; для 5–6-й «лишней» доли делится перекус. */
export function buildMealShares(settings: SettingsRow | null, mealsCount: number): number[] {
  const r = [
    Number(settings?.breakfast_share) || 0.25,
    Number(settings?.lunch_share) || 0.35,
    Number(settings?.dinner_share) || 0.25,
    Number(settings?.snack_share) || 0.15,
  ]
  const shares: number[] = []
  for (let i = 0; i < mealsCount; i++) {
    if (i < 4) shares.push(r[i])
    else shares.push((r[3] || 0) / Math.max(mealsCount - 3, 1))
  }
  const sum = shares.reduce((a, b) => a + b, 0)
  if (sum <= 0) return Array(mealsCount).fill(1 / mealsCount)
  return shares.map((x) => x / sum)
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

/** Эффективная частота 0–100 для приёма: переопределение по типу приёма или базовая pick_score. */
export function effectivePickScore(p: ProductRow, meal: MealType): number {
  const o =
    meal === 'breakfast'
      ? p.pick_breakfast
      : meal === 'lunch'
        ? p.pick_lunch
        : meal === 'dinner'
          ? p.pick_dinner
          : p.pick_snack
  if (o != null) return clampScore(Number(o))
  return clampScore(Number(p.pick_score ?? 50))
}

/** Максимум эффективной частоты по любому приёму — для проверки «есть ли кого выбрать». */
function maxEffectiveScoreAcrossMeals(p: ProductRow): number {
  return Math.max(
    effectivePickScore(p, 'breakfast'),
    effectivePickScore(p, 'lunch'),
    effectivePickScore(p, 'dinner'),
    effectivePickScore(p, 'snack'),
  )
}

function pickWeightedCustom(
  products: ProductRow[],
  rng: () => number,
  weightFn: (p: ProductRow) => number,
): ProductRow | null {
  const list = products.filter((p) => weightFn(p) > 0)
  if (!list.length) return null
  const total = list.reduce((s, p) => s + weightFn(p), 0)
  if (total <= 0) return null
  let r = rng() * total
  for (const p of list) {
    r -= weightFn(p)
    if (r <= 0) return p
  }
  return list[list.length - 1]
}

function pickForMeal(products: ProductRow[], meal: MealType, rng: () => number): ProductRow | null {
  return pickWeightedCustom(products, rng, (p) => effectivePickScore(p, meal))
}

/** Для «добавок»: та же шкала + лёгкий буст клетчатке и низкой калорийности (объём без лишних ккал). */
function extraDrawWeight(p: ProductRow, meal: MealType): number {
  const base = effectivePickScore(p, meal)
  if (base <= 0) return 0
  const cal = Math.max(1, Number(p.calories))
  const fiber = Math.max(0, Number(p.fiber))
  const fillerBoost = 1 + fiber / 14 + 28 / (28 + cal)
  return base * fillerBoost
}

function pickExtra(products: ProductRow[], meal: MealType, rng: () => number): ProductRow | null {
  return pickWeightedCustom(products, rng, (p) => extraDrawWeight(p, meal))
}

function pickTwoDistinctProteins(
  proteins: ProductRow[],
  meal: MealType,
  rng: () => number,
): [ProductRow, ProductRow] | null {
  const a = pickForMeal(proteins, meal, rng)
  if (!a) return null
  const rest = proteins.filter((p) => p.id !== a.id)
  const b = pickForMeal(rest, meal, rng)
  if (!b) return null
  return [a, b]
}

function bucketProducts(products: ProductRow[]) {
  const proteins = products.filter((p) => p.category === 'protein')
  const carbs = products.filter((p) => p.category === 'carbs')
  const extras = products.filter((p) =>
    ['veg', 'dairy', 'fats', 'sauce', 'mixed'].includes(p.category),
  )
  return { proteins, carbs, extras }
}

function lineFromProduct(p: ProductRow, qty = 1): GeneratedLineItem {
  const q = qty
  return {
    productId: p.id,
    name: p.name,
    category: p.category,
    portion_label: p.portion_label,
    qty: q,
    price: Number(p.price) * q,
    calories: Number(p.calories) * q,
    protein: Number(p.protein) * q,
    fat: Number(p.fat) * q,
    carbs: Number(p.carbs) * q,
  }
}

function sumMeal(items: GeneratedLineItem[]) {
  return items.reduce(
    (acc, it) => ({
      meal_price: acc.meal_price + it.price,
      meal_calories: acc.meal_calories + it.calories,
      meal_protein: acc.meal_protein + it.protein,
      meal_fat: acc.meal_fat + it.fat,
      meal_carbs: acc.meal_carbs + it.carbs,
    }),
    { meal_price: 0, meal_calories: 0, meal_protein: 0, meal_fat: 0, meal_carbs: 0 },
  )
}

function scorePlan(
  plan: Omit<GeneratedPlan, 'score'>,
  targets: GeneratorTargetsInput,
  uniqueProducts: number,
): number {
  const t = targets
  let penalty = 0
  penalty += (Math.abs(plan.total_calories - t.calories) / Math.max(t.calories, 1)) * 120
  if (t.protein != null && t.protein > 0) {
    penalty += (Math.abs(plan.total_protein - t.protein) / t.protein) * 100
  }
  if (t.fat != null && t.fat > 0) {
    penalty += (Math.abs(plan.total_fat - t.fat) / t.fat) * 45
  }
  if (t.carbs != null && t.carbs > 0) {
    penalty += (Math.abs(plan.total_carbs - t.carbs) / t.carbs) * 45
  }
  if (plan.total_price > t.budget && t.budget > 0) {
    penalty += ((plan.total_price - t.budget) / t.budget) * 150
  }
  const diversityBonus = uniqueProducts * 12
  return Math.round(10000 - penalty + diversityBonus)
}

function tryOnce(
  products: ProductRow[],
  _settings: SettingsRow | null,
  targets: GeneratorTargetsInput,
  rng: () => number,
): GeneratedPlan | null {
  const { proteins, carbs, extras } = bucketProducts(products)
  if (!proteins.length || !carbs.length) return null

  const n = Math.min(6, Math.max(1, Math.floor(targets.mealsCount)))
  const types = mealTypesForCount(n)
  const meals: GeneratedMeal[] = []
  const usedIds = new Set<string>()

  for (let i = 0; i < n; i++) {
    const mt = types[i]
    let protList: ProductRow[]

    if (rng() < DUAL_PROTEIN_PROB) {
      const pair = pickTwoDistinctProteins(proteins, mt, rng)
      if (!pair) {
        const one = pickForMeal(proteins, mt, rng)
        if (!one) return null
        protList = [one]
      } else {
        protList = [pair[0], pair[1]]
      }
    } else {
      const one = pickForMeal(proteins, mt, rng)
      if (!one) return null
      protList = [one]
    }

    const carb = pickForMeal(carbs, mt, rng)
    if (!carb) return null

    const items: GeneratedLineItem[] = [
      ...protList.map((p) => lineFromProduct(p)),
      lineFromProduct(carb),
    ]

    const usedInMeal = new Set<string>([...protList.map((p) => p.id), carb.id])

    const anchorCal = items.reduce((s, it) => s + it.calories, 0)
    let extraN = Math.floor(rng() * 3)
    if (anchorCal < 380) {
      extraN = Math.min(4, extraN + 1 + (rng() < 0.35 ? 1 : 0))
    }

    let extraPool = extras.filter((e) => !usedInMeal.has(e.id) && extraDrawWeight(e, mt) > 0)
    let added = 0
    while (added < extraN && extraPool.length > 0) {
      const e = pickExtra(extraPool, mt, rng)
      if (!e) break
      extraPool = extraPool.filter((x) => x.id !== e.id)
      items.push(lineFromProduct(e))
      added++
    }

    const sums = sumMeal(items)
    meals.push({
      mealType: mt,
      position: i,
      items,
      ...sums,
    })
    items.forEach((it) => usedIds.add(it.productId))
  }

  const totals = meals.reduce(
    (acc, m) => ({
      total_price: acc.total_price + m.meal_price,
      total_calories: acc.total_calories + m.meal_calories,
      total_protein: acc.total_protein + m.meal_protein,
      total_fat: acc.total_fat + m.meal_fat,
      total_carbs: acc.total_carbs + m.meal_carbs,
    }),
    { total_price: 0, total_calories: 0, total_protein: 0, total_fat: 0, total_carbs: 0 },
  )

  const base = { meals, ...totals }
  const sc = scorePlan(base, targets, usedIds.size)
  return { ...base, score: sc }
}

export type GenerateOptions = {
  attempts?: number
  topN?: number
  seed?: number
}

export function generateDayPlans(
  products: ProductRow[],
  settings: SettingsRow | null,
  targets: GeneratorTargetsInput,
  options: GenerateOptions = {},
): GeneratedPlan[] {
  const attempts = options.attempts ?? 220
  const topN = options.topN ?? 3
  let seed = options.seed ?? Date.now() % 2147483647
  const rng = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }

  const candidates: GeneratedPlan[] = []
  for (let a = 0; a < attempts; a++) {
    const p = tryOnce(products, settings, targets, rng)
    if (p) candidates.push(p)
  }

  candidates.sort((a, b) => b.score - a.score)
  const seen = new Set<string>()
  const out: GeneratedPlan[] = []
  for (const c of candidates) {
    const key = c.meals
      .map((m) =>
        m.items
          .map((i) => i.productId)
          .sort()
          .join(','),
      )
      .join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
    if (out.length >= topN) break
  }
  return out
}

export function generatorPrerequisiteError(products: ProductRow[]): string | null {
  const { proteins, carbs } = bucketProducts(products)
  if (!proteins.length) return 'Нужен хотя бы один активный продукт с категорией «Белок».'
  if (!carbs.length) return 'Нужен хотя бы один активный продукт с категорией «Углеводы».'
  if (!proteins.some((p) => maxEffectiveScoreAcrossMeals(p) > 0)) {
    return 'Для белков задайте частоту > 0 (базу или для приёма) хотя бы у одной позиции.'
  }
  if (!carbs.some((p) => maxEffectiveScoreAcrossMeals(p) > 0)) {
    return 'Для углеводов задайте частоту > 0 хотя бы у одной позиции.'
  }
  return null
}
