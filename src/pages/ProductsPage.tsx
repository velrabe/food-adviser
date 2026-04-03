import { useEffect, useMemo, useRef, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../lib/supabase'
import { useProfile } from '../profiles/ProfileProvider'
import type { ProductCategory, ProductInsert, ProductRow, ProductUpdate } from '../lib/types'

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  protein: 'Белок',
  carbs: 'Углеводы',
  fats: 'Жиры',
  dairy: 'Молочное',
  veg: 'Овощи',
  sauce: 'Соус',
  mixed: 'Микс',
}

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ProductCategory[]

function formatMoney(n: number) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
  }).format(n)
}

type Draft = {
  internal_code: string
  name: string
  category: ProductCategory
  portion_label: string
  price: string
  calories: string
  protein: string
  fat: string
  carbs: string
  fiber: string
  sugar: string
  storage_hours: string
  comment: string
  /** Относительный вес в генераторе (≥0) */
  pick_weight: string
  is_active: boolean
}

function emptyDraft(): Draft {
  return {
    internal_code: '',
    name: '',
    category: 'protein',
    portion_label: '100 g',
    price: '0',
    calories: '0',
    protein: '0',
    fat: '0',
    carbs: '0',
    fiber: '0',
    sugar: '0',
    storage_hours: '',
    comment: '',
    pick_weight: '1',
    is_active: true,
  }
}

function rowToDraft(row: ProductRow): Draft {
  return {
    internal_code: row.internal_code ?? '',
    name: row.name,
    category: row.category,
    portion_label: row.portion_label,
    price: String(row.price),
    calories: String(row.calories),
    protein: String(row.protein),
    fat: String(row.fat),
    carbs: String(row.carbs),
    fiber: String(row.fiber),
    sugar: String(row.sugar),
    storage_hours: row.storage_hours != null ? String(row.storage_hours) : '',
    comment: row.comment ?? '',
    pick_weight: String(row.pick_weight ?? 1),
    is_active: row.is_active,
  }
}

function draftToInsert(d: Draft): Omit<ProductInsert, 'profile_id'> {
  return {
    internal_code: d.internal_code.trim() || null,
    name: d.name.trim(),
    category: d.category,
    portion_label: d.portion_label.trim() || '100 g',
    price: Number(d.price) || 0,
    pick_weight: parsePickWeightDraft(d.pick_weight),
    calories: Number(d.calories) || 0,
    protein: Number(d.protein) || 0,
    fat: Number(d.fat) || 0,
    carbs: Number(d.carbs) || 0,
    fiber: Number(d.fiber) || 0,
    sugar: Number(d.sugar) || 0,
    storage_hours: d.storage_hours.trim() === '' ? null : Number(d.storage_hours),
    comment: d.comment.trim() || null,
    is_active: d.is_active,
  }
}

function draftToUpdate(d: Draft): ProductUpdate {
  return draftToInsert(d)
}

function parsePickWeightDraft(s: string): number {
  const t = s.trim().replace(',', '.')
  if (t === '') return 1
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return 1
  return n
}

const COMMENT_MAX_CH = 36

function ProductRowMenu({
  product,
  onEdit,
  onToggleArchive,
  onDuplicate,
  duplicatePending,
}: {
  product: ProductRow
  onEdit: () => void
  onToggleArchive: () => void
  onDuplicate: () => void
  duplicatePending: boolean
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="row-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="row-menu-trigger"
        aria-label="Действия с продуктом"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open ? (
        <div className="row-menu-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            className="row-menu-item"
            onClick={() => {
              setOpen(false)
              onEdit()
            }}
          >
            Изменить
          </button>
          <button
            type="button"
            role="menuitem"
            className="row-menu-item"
            onClick={() => {
              setOpen(false)
              onToggleArchive()
            }}
          >
            {product.is_active ? 'В архив' : 'Вернуть'}
          </button>
          <button
            type="button"
            role="menuitem"
            className="row-menu-item"
            disabled={duplicatePending}
            onClick={() => {
              setOpen(false)
              onDuplicate()
            }}
          >
            Дублировать
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function ProductsPage() {
  const { activeProfile } = useProfile()
  const qc = useQueryClient()
  const [showArchived, setShowArchived] = useState(false)
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [formError, setFormError] = useState<string | null>(null)

  const profileId = activeProfile!.id

  const productsQuery = useQuery({
    queryKey: ['products', showArchived, profileId],
    queryFn: async () => {
      const sb = getSupabase()
      let q = sb
        .from('products')
        .select('*')
        .eq('profile_id', profileId)
        .order('name', { ascending: true })
      if (!showArchived) q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) throw error
      return data as ProductRow[]
    },
  })

  const insertMut = useMutation({
    mutationFn: async (payload: ProductInsert) => {
      const { error } = await getSupabase().from('products').insert(payload)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })

  const updateMut = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ProductUpdate }) => {
      const { error } = await getSupabase().from('products').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })

  const duplicateMut = useMutation({
    mutationFn: async (p: ProductRow) => {
      const insert: ProductInsert = {
        profile_id: profileId,
        internal_code: null,
        name: `${p.name} (копия)`,
        category: p.category,
        portion_label: p.portion_label,
        price: Number(p.price),
        calories: Number(p.calories),
        protein: Number(p.protein),
        fat: Number(p.fat),
        carbs: Number(p.carbs),
        fiber: Number(p.fiber),
        sugar: Number(p.sugar),
        storage_hours: p.storage_hours,
        comment: p.comment,
        pick_weight: Number.isFinite(Number(p.pick_weight)) ? Number(p.pick_weight) : 1,
        is_active: true,
      }
      const { error } = await getSupabase().from('products').insert(insert)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })

  const columns = useMemo<ColumnDef<ProductRow>[]>(
    () => [
      {
        header: 'Название',
        accessorKey: 'name',
        cell: ({ row }) => (
          <span className={row.original.is_active ? '' : 'muted'}>{row.original.name}</span>
        ),
      },
      {
        header: 'Категория',
        accessorKey: 'category',
        cell: ({ getValue }) => CATEGORY_LABELS[getValue() as ProductCategory],
      },
      {
        header: 'Вес',
        accessorKey: 'pick_weight',
        meta: { tdClass: 'td-num' },
        cell: ({ getValue }) => {
          const v = Number(getValue())
          if (!Number.isFinite(v)) return '—'
          return v === 0 ? '0' : v >= 0.0001 ? String(v) : v.toExponential(1)
        },
      },
      {
        header: 'Цена',
        accessorKey: 'price',
        cell: ({ getValue }) => formatMoney(Number(getValue())),
      },
      { header: 'ккал', accessorKey: 'calories' },
      { header: 'Б', accessorKey: 'protein' },
      { header: 'Ж', accessorKey: 'fat' },
      { header: 'У', accessorKey: 'carbs' },
      {
        header: 'Хранение, ч',
        accessorKey: 'storage_hours',
        cell: ({ getValue }) => {
          const v = getValue() as number | null
          return v ?? '—'
        },
      },
      {
        header: 'Комментарий',
        accessorKey: 'comment',
        cell: ({ getValue }) => {
          const t = (getValue() as string | null) ?? ''
          if (!t.trim()) {
            return (
              <span className="comment-truncate comment-truncate--empty" title="">
                —
              </span>
            )
          }
          const short =
            t.length > COMMENT_MAX_CH ? `${t.slice(0, COMMENT_MAX_CH)}…` : t
          return (
            <span className="comment-truncate" title={t}>
              {short}
            </span>
          )
        },
      },
      {
        header: '',
        id: 'actions',
        meta: { tdClass: 'td-actions' },
        cell: ({ row }) => {
          const p = row.original
          return (
            <ProductRowMenu
              product={p}
              duplicatePending={duplicateMut.isPending}
              onEdit={() => {
                setEditingId(p.id)
                setDraft(rowToDraft(p))
                setFormError(null)
                setModal('edit')
              }}
              onToggleArchive={() =>
                updateMut.mutate({ id: p.id, patch: { is_active: !p.is_active } })
              }
              onDuplicate={() => duplicateMut.mutate(p)}
            />
          )
        },
      },
    ],
    [updateMut.isPending, duplicateMut.isPending, profileId],
  )

  const table = useReactTable({
    data: productsQuery.data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  function closeModal() {
    setModal(null)
    setEditingId(null)
    setDraft(emptyDraft())
    setFormError(null)
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    try {
      if (!draft.name.trim()) {
        setFormError('Укажите название')
        return
      }
      const pwRaw = draft.pick_weight.trim().replace(',', '.')
      if (pwRaw !== '') {
        const n = Number(pwRaw)
        if (!Number.isFinite(n) || n < 0) {
          setFormError('Вес подбора: число ≥ 0 или пусто (= 1).')
          return
        }
      }
      if (modal === 'create') {
        await insertMut.mutateAsync({ ...draftToInsert(draft), profile_id: profileId })
      } else if (modal === 'edit' && editingId) {
        await updateMut.mutateAsync({ id: editingId, patch: draftToUpdate(draft) })
      }
      closeModal()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Ошибка сохранения')
    }
  }

  const busy = productsQuery.isLoading || productsQuery.isFetching

  return (
    <div className="page">
      <div className="page-head">
        <h1>Продукты</h1>
        <div className="row">
          <label className="inline-check">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Показать архив
          </label>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setEditingId(null)
              setDraft(emptyDraft())
              setFormError(null)
              setModal('create')
            }}
          >
            Добавить
          </button>
        </div>
      </div>

      {productsQuery.error ? (
        <p className="error">{(productsQuery.error as Error).message}</p>
      ) : null}

      <div className="table-wrap">
        {busy ? <p className="muted">Загрузка…</p> : null}
        <table className="table">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  const tdClass = (cell.column.columnDef.meta as { tdClass?: string } | undefined)
                    ?.tdClass
                  return (
                    <td key={cell.id} className={tdClass}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!busy && table.getRowModel().rows.length === 0 ? (
          <p className="muted">Нет продуктов. Добавьте первую позицию.</p>
        ) : null}
      </div>

      {modal ? (
        <div className="modal-backdrop" role="presentation" onClick={closeModal}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{modal === 'create' ? 'Новый продукт' : 'Редактирование'}</h2>
            <form className="stack product-form" onSubmit={submitForm}>
              <label className="field">
                <span>Внутренний код</span>
                <input
                  value={draft.internal_code}
                  onChange={(e) => setDraft({ ...draft, internal_code: e.target.value })}
                  placeholder="опционально"
                />
              </label>
              <label className="field">
                <span>Название</span>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  required
                />
              </label>
              <label className="field">
                <span>Категория</span>
                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value as ProductCategory })
                  }
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Порция</span>
                <input
                  value={draft.portion_label}
                  onChange={(e) => setDraft({ ...draft, portion_label: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Вес в подборе (генератор)</span>
                <input
                  inputMode="decimal"
                  value={draft.pick_weight}
                  onChange={(e) => setDraft({ ...draft, pick_weight: e.target.value })}
                  placeholder="1"
                />
                <span className="muted small">
                  Относительная частота: 1 — как обычно; выше — чаще (напр. 80); ниже — реже (0.001); 0 —
                  не предлагать.
                </span>
              </label>
              <div className="grid-3">
                <label className="field">
                  <span>Цена</span>
                  <input
                    inputMode="decimal"
                    value={draft.price}
                    onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>ккал</span>
                  <input
                    inputMode="decimal"
                    value={draft.calories}
                    onChange={(e) => setDraft({ ...draft, calories: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Хранение (ч)</span>
                  <input
                    inputMode="numeric"
                    value={draft.storage_hours}
                    onChange={(e) => setDraft({ ...draft, storage_hours: e.target.value })}
                    placeholder="пусто"
                  />
                </label>
              </div>
              <div className="grid-3">
                <label className="field">
                  <span>Белок</span>
                  <input
                    inputMode="decimal"
                    value={draft.protein}
                    onChange={(e) => setDraft({ ...draft, protein: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Жиры</span>
                  <input
                    inputMode="decimal"
                    value={draft.fat}
                    onChange={(e) => setDraft({ ...draft, fat: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Углеводы</span>
                  <input
                    inputMode="decimal"
                    value={draft.carbs}
                    onChange={(e) => setDraft({ ...draft, carbs: e.target.value })}
                  />
                </label>
              </div>
              <div className="grid-2">
                <label className="field">
                  <span>Клетчатка</span>
                  <input
                    inputMode="decimal"
                    value={draft.fiber}
                    onChange={(e) => setDraft({ ...draft, fiber: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Сахар</span>
                  <input
                    inputMode="decimal"
                    value={draft.sugar}
                    onChange={(e) => setDraft({ ...draft, sugar: e.target.value })}
                  />
                </label>
              </div>
              <label className="field">
                <span>Комментарий</span>
                <textarea
                  rows={2}
                  value={draft.comment}
                  onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
                />
              </label>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={draft.is_active}
                  onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                />
                Активен
              </label>
              {formError ? <p className="error">{formError}</p> : null}
              <div className="row end">
                <button type="button" className="btn ghost" onClick={closeModal}>
                  Отмена
                </button>
                <button type="submit" className="btn primary" disabled={insertMut.isPending || updateMut.isPending}>
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
