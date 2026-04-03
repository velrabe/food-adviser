import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../lib/supabase'
import {
  generateDayPlans,
  generatorPrerequisiteError,
  type GeneratedPlan,
  type GeneratorTargetsInput,
} from '../lib/generator'
import type { ProductRow, SettingsRow } from '../lib/types'
import { useProfile } from '../profiles/ProfileProvider'

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
}

function formatMoney(n: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n)
}

function todayISODate() {
  const d = new Date()
  const z = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}

export function GeneratorPage() {
  const { activeProfile } = useProfile()
  const qc = useQueryClient()
  const profileId = activeProfile!.id

  const [forDate, setForDate] = useState(todayISODate)
  const [calories, setCalories] = useState('2000')
  const [protein, setProtein] = useState('')
  const [fat, setFat] = useState('')
  const [carbs, setCarbs] = useState('')
  const [mealsCount, setMealsCount] = useState('3')
  const [budget, setBudget] = useState('0')
  const [deliveryFee, setDeliveryFee] = useState('0')
  const [variants, setVariants] = useState<GeneratedPlan[]>([])
  const [genError, setGenError] = useState<string | null>(null)
  const [savedHint, setSavedHint] = useState<string | null>(null)

  const productsQuery = useQuery({
    queryKey: ['products', 'active', profileId],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('products')
        .select('*')
        .eq('profile_id', profileId)
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data as ProductRow[]
    },
  })

  const settingsQuery = useQuery({
    queryKey: ['settings', profileId],
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('settings')
        .select('*')
        .eq('profile_id', profileId)
        .maybeSingle()
      if (error) throw error
      return data as SettingsRow | null
    },
  })

  useEffect(() => {
    const s = settingsQuery.data
    if (!s) return
    setCalories(String(s.default_calories))
    setMealsCount(String(s.default_meals_count))
    setBudget(String(s.default_budget))
    setDeliveryFee(String(s.default_delivery_fee))
    if (s.protein_target != null) setProtein(String(s.protein_target))
    if (s.fat_target != null) setFat(String(s.fat_target))
    if (s.carbs_target != null) setCarbs(String(s.carbs_target))
  }, [settingsQuery.data])

  const prereqError = useMemo(
    () => generatorPrerequisiteError(productsQuery.data ?? []),
    [productsQuery.data],
  )

  const targetsPayload = useMemo((): GeneratorTargetsInput | null => {
    const mc = Number(mealsCount)
    if (!Number.isInteger(mc) || mc < 1 || mc > 6) return null
    const cal = Number(calories)
    if (!Number.isFinite(cal) || cal <= 0) return null
    return {
      calories: cal,
      protein: protein.trim() ? Number(protein) : null,
      fat: fat.trim() ? Number(fat) : null,
      carbs: carbs.trim() ? Number(carbs) : null,
      mealsCount: mc,
      budget: Number(budget) || 0,
      deliveryFee: Number(deliveryFee) || 0,
    }
  }, [calories, protein, fat, carbs, mealsCount, budget, deliveryFee])

  function runGenerate() {
    setGenError(null)
    setSavedHint(null)
    const products = productsQuery.data ?? []
    const err = generatorPrerequisiteError(products)
    if (err) {
      setGenError(err)
      return
    }
    if (!targetsPayload) {
      setGenError('Проверьте калории (число > 0) и число приёмов 1–6.')
      return
    }
    const plans = generateDayPlans(products, settingsQuery.data ?? null, targetsPayload, {
      attempts: 240,
      topN: 3,
    })
    if (!plans.length) {
      setGenError('Не удалось собрать вариант. Попробуйте ещё раз или добавьте продуктов.')
      return
    }
    setVariants(plans)
  }

  const saveHistoryMut = useMutation({
    mutationFn: async (plan: GeneratedPlan) => {
      const sb = getSupabase()
      const target_json = targetsPayload!
      const { error } = await sb.from('generation_history').insert({
        profile_id: profileId,
        generated_for_date: forDate,
        payload_json: { variants: variants.length ? variants : [plan], chosen: plan },
        target_json,
        score: plan.score,
        status: 'saved',
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['generation_history', profileId] })
      setSavedHint('Сохранено в историю')
    },
  })

  const loading = productsQuery.isLoading || settingsQuery.isLoading

  return (
    <div className="page generator-page">
      <h1>Генератор</h1>
      <p className="muted">
        Случайный подбор продуктов по категориям (белок + углеводы + до двух «добавок» на приём). Несколько
        прогонов — лучшие по очкам варианты на день.
      </p>

      {prereqError ? <p className="error">{prereqError}</p> : null}
      {genError ? <p className="error">{genError}</p> : null}
      {savedHint ? <p className="muted">{savedHint}</p> : null}

      <div className="generator-layout">
        <section className="generator-panel card-panel">
          <h2>Цели</h2>
          {loading ? <p className="muted">Загрузка…</p> : null}
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault()
              runGenerate()
            }}
          >
            <label className="field">
              <span>Дата плана</span>
              <input type="date" value={forDate} onChange={(e) => setForDate(e.target.value)} />
            </label>
            <div className="grid-2">
              <label className="field">
                <span>Калории</span>
                <input
                  inputMode="numeric"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Приёмов пищи</span>
                <select value={mealsCount} onChange={(e) => setMealsCount(e.target.value)}>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid-3">
              <label className="field">
                <span>Белок (г)</span>
                <input inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="опц." />
              </label>
              <label className="field">
                <span>Жиры (г)</span>
                <input inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} placeholder="опц." />
              </label>
              <label className="field">
                <span>Углеводы (г)</span>
                <input inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} placeholder="опц." />
              </label>
            </div>
            <div className="grid-2">
              <label className="field">
                <span>Бюджет (еда)</span>
                <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
              </label>
              <label className="field">
                <span>Доставка</span>
                <input
                  inputMode="decimal"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value)}
                />
              </label>
            </div>
            <p className="muted small">
              Доли калорий по завтраку/обеду/ужину/перекусу берутся из{' '}
              <strong>Настроек</strong> профиля.
            </p>
            <button type="submit" className="btn primary" disabled={loading || Boolean(prereqError)}>
              Сгенерировать
            </button>
          </form>
        </section>

        <section className="generator-results">
          {variants.length === 0 ? (
            <p className="muted">Нажмите «Сгенерировать», здесь появятся до трёх вариантов.</p>
          ) : (
            <div className="variants-grid">
              {variants.map((plan, idx) => (
                <article key={idx} className="variant-card">
                  <header className="variant-head">
                    <h3>Вариант {idx + 1}</h3>
                    <span className="variant-score">Очки {plan.score}</span>
                  </header>
                  <ul className="variant-totals">
                    <li>
                      {formatMoney(plan.total_calories)} ккал · Б {Math.round(plan.total_protein)} · Ж{' '}
                      {Math.round(plan.total_fat)} · У {Math.round(plan.total_carbs)}
                    </li>
                    <li>
                      Еда {formatMoney(plan.total_price)}
                      {Number(deliveryFee) > 0 ? (
                        <> + доставка {formatMoney(Number(deliveryFee))} ={' '}
                        {formatMoney(plan.total_price + Number(deliveryFee))}</>
                      ) : null}
                    </li>
                    {targetsPayload && targetsPayload.budget > 0 ? (
                      <li className={plan.total_price > targetsPayload.budget ? 'error' : 'muted'}>
                        Бюджет {formatMoney(targetsPayload.budget)} · отклонение{' '}
                        {formatMoney(plan.total_price - targetsPayload.budget)}
                      </li>
                    ) : null}
                  </ul>
                  <div className="variant-meals">
                    {plan.meals.map((m) => (
                      <div key={m.position} className="meal-block">
                        <div className="meal-title">
                          {MEAL_LABEL[m.mealType] ?? m.mealType}{' '}
                          <span className="muted small">
                            {Math.round(m.meal_calories)} ккал · {formatMoney(m.meal_price)}
                          </span>
                        </div>
                        <ul className="meal-items">
                          {m.items.map((it) => (
                            <li key={`${m.position}-${it.productId}`}>
                              {it.name}{' '}
                              <span className="muted">
                                ({it.portion_label}) {formatMoney(it.price)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn ghost small"
                    disabled={saveHistoryMut.isPending || !targetsPayload}
                    onClick={() => {
                      setSavedHint(null)
                      saveHistoryMut.mutate(plan, {
                        onError: (e) => setGenError(e instanceof Error ? e.message : 'Ошибка сохранения'),
                      })
                    }}
                  >
                    В историю
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
