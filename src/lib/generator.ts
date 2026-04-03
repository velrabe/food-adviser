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

function pick<T>(arr: T[], rng: () => number): T | null {
  if (!arr.length) return null
  return arr[Math.floor(rng() * arr.length)]
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
    const prot = pick(proteins, rng)
    const carb = pick(carbs, rng)
    if (!prot || !carb) return null

    const items: GeneratedLineItem[] = [lineFromProduct(prot), lineFromProduct(carb)]
    const extraN = Math.floor(rng() * 3)
    const shuffled = [...extras].sort(() => rng() - 0.5)
    let added = 0
    for (const e of shuffled) {
      if (added >= extraN) break
      if (e.id === prot.id || e.id === carb.id) continue
      items.push(lineFromProduct(e))
      added++
    }

    const sums = sumMeal(items)
    meals.push({
      mealType: types[i],
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
  return null
}
