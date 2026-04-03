import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../lib/supabase'
import type { SettingsRow } from '../lib/types'
import { useProfile } from '../profiles/ProfileProvider'

type Draft = {
  default_calories: string
  default_meals_count: string
  default_delivery_fee: string
  default_budget: string
  protein_target: string
  fat_target: string
  carbs_target: string
  breakfast_share: string
  lunch_share: string
  dinner_share: string
  snack_share: string
}

function defaults(): Draft {
  return {
    default_calories: '2000',
    default_meals_count: '3',
    default_delivery_fee: '0',
    default_budget: '0',
    protein_target: '',
    fat_target: '',
    carbs_target: '',
    breakfast_share: '0.30',
    lunch_share: '0.40',
    dinner_share: '0.30',
    snack_share: '0.15',
  }
}

function rowToDraft(row: SettingsRow): Draft {
  const n = (v: number | null | undefined) =>
    v == null || Number.isNaN(Number(v)) ? '' : String(v)
  return {
    default_calories: String(row.default_calories),
    default_meals_count: String(row.default_meals_count),
    default_delivery_fee: String(row.default_delivery_fee),
    default_budget: String(row.default_budget),
    protein_target: n(row.protein_target),
    fat_target: n(row.fat_target),
    carbs_target: n(row.carbs_target),
    breakfast_share: String(row.breakfast_share),
    lunch_share: String(row.lunch_share),
    dinner_share: String(row.dinner_share),
    snack_share: String(row.snack_share),
  }
}

function parseOptNum(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const x = Number(t)
  return Number.isFinite(x) ? x : null
}

export function SettingsPage() {
  const { activeProfile } = useProfile()
  const qc = useQueryClient()
  const profileId = activeProfile!.id
  const [draft, setDraft] = useState<Draft>(defaults)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

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
    if (settingsQuery.data) {
      setDraft(rowToDraft(settingsQuery.data))
    } else if (settingsQuery.isSuccess && !settingsQuery.data) {
      setDraft(defaults())
    }
  }, [settingsQuery.data, settingsQuery.isSuccess])

  const shareSum = useMemo(() => {
    const a = [
      Number(draft.breakfast_share) || 0,
      Number(draft.lunch_share) || 0,
      Number(draft.dinner_share) || 0,
      Number(draft.snack_share) || 0,
    ]
    return a.reduce((s, x) => s + x, 0)
  }, [draft])

  const saveMut = useMutation({
    mutationFn: async (payload: {
      profile_id: string
      default_calories: number
      default_meals_count: number
      default_delivery_fee: number
      default_budget: number
      protein_target: number | null
      fat_target: number | null
      carbs_target: number | null
      breakfast_share: number
      lunch_share: number
      dinner_share: number
      snack_share: number
    }) => {
      const sb = getSupabase()
      const { error } = await sb.from('settings').upsert(
        {
          profile_id: payload.profile_id,
          default_calories: payload.default_calories,
          default_meals_count: payload.default_meals_count,
          default_delivery_fee: payload.default_delivery_fee,
          default_budget: payload.default_budget,
          protein_target: payload.protein_target,
          fat_target: payload.fat_target,
          carbs_target: payload.carbs_target,
          breakfast_share: payload.breakfast_share,
          lunch_share: payload.lunch_share,
          dinner_share: payload.dinner_share,
          snack_share: payload.snack_share,
        },
        { onConflict: 'profile_id' },
      )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', profileId] })
    },
  })

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSavedMsg(null)

    const mc = Number(draft.default_meals_count)
    if (!Number.isInteger(mc) || mc < 1 || mc > 6) {
      setFormError('Число приёмов пищи: от 1 до 6')
      return
    }

    const payload = {
      profile_id: profileId,
      default_calories: Number(draft.default_calories) || 0,
      default_meals_count: mc,
      default_delivery_fee: Number(draft.default_delivery_fee) || 0,
      default_budget: Number(draft.default_budget) || 0,
      protein_target: parseOptNum(draft.protein_target),
      fat_target: parseOptNum(draft.fat_target),
      carbs_target: parseOptNum(draft.carbs_target),
      breakfast_share: Number(draft.breakfast_share) || 0,
      lunch_share: Number(draft.lunch_share) || 0,
      dinner_share: Number(draft.dinner_share) || 0,
      snack_share: Number(draft.snack_share) || 0,
    }

    try {
      await saveMut.mutateAsync(payload)
      setSavedMsg('Сохранено')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Ошибка сохранения')
    }
  }

  if (settingsQuery.isLoading) {
    return (
      <div className="page">
        <h1>Настройки</h1>
        <p className="muted">Загрузка…</p>
      </div>
    )
  }

  if (settingsQuery.error) {
    return (
      <div className="page">
        <h1>Настройки</h1>
        <p className="error">{(settingsQuery.error as Error).message}</p>
        <p className="muted small">
          Для нового профиля строка в <code>settings</code> появится после первого сохранения.
        </p>
      </div>
    )
  }

  return (
    <div className="page">
      <h1>Настройки</h1>
      <p className="muted">
        Значения по умолчанию для экрана «Генератор»: калории, бюджет, доставка и как делить день между
        приёмами пищи (доли от 0 до 1; для 3 приёмов обычно закуска 0, завтрак+обед+ужин = 1).
      </p>

      <form className="stack settings-form" onSubmit={onSubmit}>
        <fieldset className="settings-fieldset">
          <legend>Цели по умолчанию</legend>
          <div className="grid-2">
            <label className="field">
              <span>Калории в день</span>
              <input
                inputMode="decimal"
                value={draft.default_calories}
                onChange={(e) => setDraft({ ...draft, default_calories: e.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>Приёмов пищи (1–6)</span>
              <select
                value={draft.default_meals_count}
                onChange={(e) => setDraft({ ...draft, default_meals_count: e.target.value })}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid-2">
            <label className="field">
              <span>Доставка по умолчанию</span>
              <input
                inputMode="decimal"
                value={draft.default_delivery_fee}
                onChange={(e) => setDraft({ ...draft, default_delivery_fee: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Бюджет на день</span>
              <input
                inputMode="decimal"
                value={draft.default_budget}
                onChange={(e) => setDraft({ ...draft, default_budget: e.target.value })}
              />
            </label>
          </div>
          <div className="grid-3">
            <label className="field">
              <span>Цель белка (г), опц.</span>
              <input
                inputMode="decimal"
                value={draft.protein_target}
                onChange={(e) => setDraft({ ...draft, protein_target: e.target.value })}
                placeholder="пусто"
              />
            </label>
            <label className="field">
              <span>Цель жиров (г)</span>
              <input
                inputMode="decimal"
                value={draft.fat_target}
                onChange={(e) => setDraft({ ...draft, fat_target: e.target.value })}
                placeholder="пусто"
              />
            </label>
            <label className="field">
              <span>Цель углеводов (г)</span>
              <input
                inputMode="decimal"
                value={draft.carbs_target}
                onChange={(e) => setDraft({ ...draft, carbs_target: e.target.value })}
                placeholder="пусто"
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="settings-fieldset">
          <legend>Доли приёмов пищи (0–1)</legend>
          <p className="muted small">
            Сумма четырёх долей сейчас: <strong>{shareSum.toFixed(2)}</strong>
            {shareSum > 0 && Math.abs(shareSum - 1) > 0.02 ? (
              <span className="error"> — обычно стремятся к 1.0 для активных слотов</span>
            ) : null}
          </p>
          <div className="grid-2">
            <label className="field">
              <span>Завтрак</span>
              <input
                inputMode="decimal"
                value={draft.breakfast_share}
                onChange={(e) => setDraft({ ...draft, breakfast_share: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Обед</span>
              <input
                inputMode="decimal"
                value={draft.lunch_share}
                onChange={(e) => setDraft({ ...draft, lunch_share: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Ужин</span>
              <input
                inputMode="decimal"
                value={draft.dinner_share}
                onChange={(e) => setDraft({ ...draft, dinner_share: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Перекус</span>
              <input
                inputMode="decimal"
                value={draft.snack_share}
                onChange={(e) => setDraft({ ...draft, snack_share: e.target.value })}
              />
            </label>
          </div>
        </fieldset>

        {formError ? <p className="error">{formError}</p> : null}
        {savedMsg ? <p className="muted">{savedMsg}</p> : null}

        <div className="row">
          <button type="submit" className="btn primary" disabled={saveMut.isPending}>
            Сохранить
          </button>
        </div>
      </form>
    </div>
  )
}
