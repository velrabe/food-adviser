import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

/** Строка таблицы: все числовые поля — строки для удобного ввода как в Excel. */
type ProductGridRow = {
  id: string
  isNew: boolean
  internal_code: string
  name: string
  category: ProductCategory
  portion_label: string
  price: string
  /** 0–100, пусто = 50 */
  pick_score: string
  pick_breakfast: string
  pick_lunch: string
  pick_dinner: string
  pick_snack: string
  calories: string
  protein: string
  fat: string
  carbs: string
  fiber: string
  sugar: string
  storage_hours: string
  comment: string
  is_active: boolean
}

function newRowId() {
  return `new-${crypto.randomUUID()}`
}

function emptyGridRow(): ProductGridRow {
  return {
    id: newRowId(),
    isNew: true,
    internal_code: '',
    name: '',
    category: 'protein',
    portion_label: '100 g',
    price: '0',
    pick_score: '50',
    pick_breakfast: '',
    pick_lunch: '',
    pick_dinner: '',
    pick_snack: '',
    calories: '0',
    protein: '0',
    fat: '0',
    carbs: '0',
    fiber: '0',
    sugar: '0',
    storage_hours: '',
    comment: '',
    is_active: true,
  }
}

function serverRowToGrid(r: ProductRow): ProductGridRow {
  return {
    id: r.id,
    isNew: false,
    internal_code: r.internal_code ?? '',
    name: r.name,
    category: r.category,
    portion_label: r.portion_label,
    price: String(r.price),
    pick_score: String(r.pick_score ?? 50),
    pick_breakfast: r.pick_breakfast != null ? String(r.pick_breakfast) : '',
    pick_lunch: r.pick_lunch != null ? String(r.pick_lunch) : '',
    pick_dinner: r.pick_dinner != null ? String(r.pick_dinner) : '',
    pick_snack: r.pick_snack != null ? String(r.pick_snack) : '',
    calories: String(r.calories),
    protein: String(r.protein),
    fat: String(r.fat),
    carbs: String(r.carbs),
    fiber: String(r.fiber),
    sugar: String(r.sugar),
    storage_hours: r.storage_hours != null ? String(r.storage_hours) : '',
    comment: r.comment ?? '',
    is_active: r.is_active,
  }
}

function parsePickScore(s: string): number {
  const t = s.trim().replace(',', '.')
  if (t === '') return 50
  const n = Math.round(Number(t))
  if (!Number.isFinite(n)) return 50
  return Math.max(0, Math.min(100, n))
}

function parseMealPick(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (t === '') return null
  const n = Math.round(Number(t))
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, n))
}

function gridRowToInsert(r: ProductGridRow, profileId: string): ProductInsert {
  return {
    profile_id: profileId,
    internal_code: r.internal_code.trim() || null,
    name: r.name.trim(),
    category: r.category,
    portion_label: r.portion_label.trim() || '100 g',
    price: Number(r.price) || 0,
    pick_score: parsePickScore(r.pick_score),
    pick_breakfast: parseMealPick(r.pick_breakfast),
    pick_lunch: parseMealPick(r.pick_lunch),
    pick_dinner: parseMealPick(r.pick_dinner),
    pick_snack: parseMealPick(r.pick_snack),
    calories: Number(r.calories) || 0,
    protein: Number(r.protein) || 0,
    fat: Number(r.fat) || 0,
    carbs: Number(r.carbs) || 0,
    fiber: Number(r.fiber) || 0,
    sugar: Number(r.sugar) || 0,
    storage_hours: r.storage_hours.trim() === '' ? null : Number(r.storage_hours),
    comment: r.comment.trim() || null,
    is_active: r.is_active,
  }
}

function gridRowToUpdate(r: ProductGridRow): ProductUpdate {
  return {
    internal_code: r.internal_code.trim() || null,
    name: r.name.trim(),
    category: r.category,
    portion_label: r.portion_label.trim() || '100 g',
    price: Number(r.price) || 0,
    pick_score: parsePickScore(r.pick_score),
    pick_breakfast: parseMealPick(r.pick_breakfast),
    pick_lunch: parseMealPick(r.pick_lunch),
    pick_dinner: parseMealPick(r.pick_dinner),
    pick_snack: parseMealPick(r.pick_snack),
    calories: Number(r.calories) || 0,
    protein: Number(r.protein) || 0,
    fat: Number(r.fat) || 0,
    carbs: Number(r.carbs) || 0,
    fiber: Number(r.fiber) || 0,
    sugar: Number(r.sugar) || 0,
    storage_hours: r.storage_hours.trim() === '' ? null : Number(r.storage_hours),
    comment: r.comment.trim() || null,
    is_active: r.is_active,
  }
}

function gridRowsEqual(a: ProductGridRow, b: ProductGridRow): boolean {
  return (
    a.internal_code === b.internal_code &&
    a.name === b.name &&
    a.category === b.category &&
    a.portion_label === b.portion_label &&
    a.price === b.price &&
    a.pick_score === b.pick_score &&
    a.pick_breakfast === b.pick_breakfast &&
    a.pick_lunch === b.pick_lunch &&
    a.pick_dinner === b.pick_dinner &&
    a.pick_snack === b.pick_snack &&
    a.calories === b.calories &&
    a.protein === b.protein &&
    a.fat === b.fat &&
    a.carbs === b.carbs &&
    a.fiber === b.fiber &&
    a.sugar === b.sugar &&
    a.storage_hours === b.storage_hours &&
    a.comment === b.comment &&
    a.is_active === b.is_active
  )
}

function ProductRowMenu({
  row,
  disabled,
  onToggleArchive,
  onDuplicate,
  onRemoveNew,
  duplicatePending,
}: {
  row: ProductGridRow
  disabled: boolean
  onToggleArchive: () => void
  onDuplicate: () => void
  onRemoveNew: () => void
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
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open ? (
        <div className="row-menu-dropdown" role="menu">
          {row.isNew ? (
            <button
              type="button"
              role="menuitem"
              className="row-menu-item"
              onClick={() => {
                setOpen(false)
                onRemoveNew()
              }}
            >
              Удалить строку
            </button>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                className="row-menu-item"
                onClick={() => {
                  setOpen(false)
                  onToggleArchive()
                }}
              >
                {row.is_active ? 'В архив' : 'Вернуть'}
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
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

export function ProductsPage() {
  const { activeProfile } = useProfile()
  const qc = useQueryClient()
  const [showArchived, setShowArchived] = useState(false)
  const [gridRows, setGridRows] = useState<ProductGridRow[]>([])
  const [dirty, setDirty] = useState(false)
  const baselineRef = useRef<ProductGridRow[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const gridRowsRef = useRef(gridRows)
  gridRowsRef.current = gridRows

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

  useEffect(() => {
    if (dirty) return
    const raw = productsQuery.data
    if (raw === undefined) return
    const g = raw.map(serverRowToGrid)
    setGridRows(g)
    baselineRef.current = structuredClone(g)
  }, [productsQuery.data, dirty, showArchived, profileId])

  const updateCell = useCallback(
    (id: string, partial: Partial<ProductGridRow>) => {
      setGridRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...partial } : r)))
      setDirty(true)
      setSaveError(null)
    },
    [],
  )

  const addRow = useCallback(() => {
    setGridRows((prev) => [...prev, emptyGridRow()])
    setDirty(true)
    setSaveError(null)
  }, [])

  const removeNewRow = useCallback((id: string) => {
    setGridRows((prev) => prev.filter((r) => r.id !== id))
    setDirty(true)
    setSaveError(null)
  }, [])

  const duplicateRow = useCallback((id: string) => {
    setGridRows((prev) => {
      const src = prev.find((r) => r.id === id)
      if (!src) return prev
      const copy: ProductGridRow = {
        ...src,
        id: newRowId(),
        isNew: true,
        internal_code: '',
        name: `${src.name.trim()} (копия)`,
        is_active: true,
      }
      return [...prev, copy]
    })
    setDirty(true)
    setSaveError(null)
  }, [])

  const toggleArchive = useCallback((id: string) => {
    setGridRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, is_active: !r.is_active } : r)),
    )
    setDirty(true)
    setSaveError(null)
  }, [])

  const revertChanges = useCallback(() => {
    setGridRows(structuredClone(baselineRef.current))
    setDirty(false)
    setSaveError(null)
  }, [])

  const saveMut = useMutation({
    mutationFn: async () => {
      const rows = gridRowsRef.current
      const baselineMap = new Map(baselineRef.current.map((r) => [r.id, r]))
      const checkScore = (raw: string, label: string, rowLabel: string) => {
        const t = raw.trim().replace(',', '.')
        if (t === '') return
        const n = Math.round(Number(t))
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          throw new Error(`«${rowLabel}»: ${label} — целое 0–100 или пусто.`)
        }
      }
      for (const r of rows) {
        if (!r.name.trim()) throw new Error('У каждой строки должно быть название.')
        const rowLabel = r.name.trim() || r.id
        checkScore(r.pick_score, 'База', rowLabel)
        checkScore(r.pick_breakfast, 'Завтрак', rowLabel)
        checkScore(r.pick_lunch, 'Обед', rowLabel)
        checkScore(r.pick_dinner, 'Ужин', rowLabel)
        checkScore(r.pick_snack, 'Перекус', rowLabel)
      }

      const sb = getSupabase()
      const toInsert = rows.filter((r) => r.isNew).map((r) => gridRowToInsert(r, profileId))

      const updates: { id: string; patch: ProductUpdate }[] = []
      for (const r of rows) {
        if (r.isNew) continue
        const b = baselineMap.get(r.id)
        if (!b || !gridRowsEqual(r, b)) {
          updates.push({ id: r.id, patch: gridRowToUpdate(r) })
        }
      }

      if (toInsert.length) {
        const { error } = await sb.from('products').insert(toInsert)
        if (error) throw error
      }

      await Promise.all(
        updates.map(({ id, patch }) => sb.from('products').update(patch).eq('id', id).then(({ error }) => {
          if (error) throw error
        })),
      )
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['products'] })
      await qc.refetchQueries({ queryKey: ['products', showArchived, profileId] })
      setDirty(false)
      setSaveError(null)
    },
    onError: (e) => {
      setSaveError(e instanceof Error ? e.message : 'Ошибка сохранения')
    },
  })

  const busy = productsQuery.isLoading || productsQuery.isFetching

  const columns = useMemo<ColumnDef<ProductGridRow>[]>(
    () => [
      {
        header: 'Код',
        accessorKey: 'internal_code',
        meta: { tdClass: 'td-tight' },
        cell: ({ row }) => (
          <input
            className="cell-input"
            value={row.original.internal_code}
            aria-label="Внутренний код"
            onChange={(e) => updateCell(row.original.id, { internal_code: e.target.value })}
          />
        ),
      },
      {
        header: 'Название',
        accessorKey: 'name',
        cell: ({ row }) => (
          <input
            className="cell-input cell-input--wide"
            value={row.original.name}
            aria-label="Название"
            onChange={(e) => updateCell(row.original.id, { name: e.target.value })}
          />
        ),
      },
      {
        header: 'Категория',
        accessorKey: 'category',
        cell: ({ row }) => (
          <select
            className="cell-input cell-select"
            value={row.original.category}
            aria-label="Категория"
            onChange={(e) =>
              updateCell(row.original.id, { category: e.target.value as ProductCategory })
            }
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        ),
      },
      {
        header: 'Част.',
        accessorKey: 'pick_score',
        meta: {
          tdClass: 'td-num',
          thTitle:
            'Частота 0–100 внутри категории (70/50/30 ≈ относительные доли). Пусто в базе = 50.',
        },
        cell: ({ row }) => (
          <input
            className="cell-input cell-input-num"
            inputMode="numeric"
            value={row.original.pick_score}
            aria-label="Базовая частота 0–100"
            title="База для всех приёмов, если нет переопределения в З/О/У/П"
            onChange={(e) => updateCell(row.original.id, { pick_score: e.target.value })}
          />
        ),
      },
      {
        id: 'pick_breakfast',
        header: 'З',
        meta: {
          tdClass: 'td-num',
          thTitle: 'Только завтрак; пусто = база. Напр. яйца: 100 здесь, остальные приёмы пусто.',
        },
        cell: ({ row }) => (
          <input
            className="cell-input cell-input-num"
            inputMode="numeric"
            value={row.original.pick_breakfast}
            aria-label="Частота на завтрак"
            onChange={(e) => updateCell(row.original.id, { pick_breakfast: e.target.value })}
          />
        ),
      },
      {
        id: 'pick_lunch',
        header: 'О',
        meta: { tdClass: 'td-num', thTitle: 'Только обед; пусто = база' },
        cell: ({ row }) => (
          <input
            className="cell-input cell-input-num"
            inputMode="numeric"
            value={row.original.pick_lunch}
            aria-label="Частота на обед"
            onChange={(e) => updateCell(row.original.id, { pick_lunch: e.target.value })}
          />
        ),
      },
      {
        id: 'pick_dinner',
        header: 'У',
        meta: { tdClass: 'td-num', thTitle: 'Только ужин; пусто = база' },
        cell: ({ row }) => (
          <input
            className="cell-input cell-input-num"
            inputMode="numeric"
            value={row.original.pick_dinner}
            aria-label="Частота на ужин"
            onChange={(e) => updateCell(row.original.id, { pick_dinner: e.target.value })}
          />
        ),
      },
      {
        id: 'pick_snack',
        header: 'П',
        meta: { tdClass: 'td-num', thTitle: 'Только перекус; пусто = база' },
        cell: ({ row }) => (
          <input
            className="cell-input cell-input-num"
            inputMode="numeric"
            value={row.original.pick_snack}
            aria-label="Частота на перекус"
            onChange={(e) => updateCell(row.original.id, { pick_snack: e.target.value })}
          />
        ),
      },
      {
        header: 'Порция',
        accessorKey: 'portion_label',
        cell: ({ row }) => (
          <input
            className="cell-input"
            value={row.original.portion_label}
            aria-label="Порция"
            onChange={(e) => updateCell(row.original.id, { portion_label: e.target.value })}
          />
        ),
      },
      {
        header: 'Цена',
        accessorKey: 'price',
        meta: { tdClass: 'td-num' },
        cell: ({ row }) => (
          <input
            className="cell-input cell-input-num"
            inputMode="decimal"
            value={row.original.price}
            aria-label="Цена"
            onChange={(e) => updateCell(row.original.id, { price: e.target.value })}
          />
        ),
      },
      { header: 'ккал', accessorKey: 'calories', meta: { tdClass: 'td-num' }, cell: numCell('calories', updateCell) },
      { header: 'Б', accessorKey: 'protein', meta: { tdClass: 'td-num' }, cell: numCell('protein', updateCell) },
      { header: 'Ж', accessorKey: 'fat', meta: { tdClass: 'td-num' }, cell: numCell('fat', updateCell) },
      { header: 'У', accessorKey: 'carbs', meta: { tdClass: 'td-num' }, cell: numCell('carbs', updateCell) },
      { header: 'Кл', accessorKey: 'fiber', meta: { tdClass: 'td-num' }, cell: numCell('fiber', updateCell) },
      { header: 'Сах', accessorKey: 'sugar', meta: { tdClass: 'td-num' }, cell: numCell('sugar', updateCell) },
      {
        header: 'Ч хран',
        accessorKey: 'storage_hours',
        meta: { tdClass: 'td-num' },
        cell: ({ row }) => (
          <input
            className="cell-input cell-input-num"
            inputMode="numeric"
            value={row.original.storage_hours}
            aria-label="Часы хранения"
            onChange={(e) => updateCell(row.original.id, { storage_hours: e.target.value })}
          />
        ),
      },
      {
        header: 'Комм.',
        accessorKey: 'comment',
        cell: ({ row }) => (
          <input
            className="cell-input"
            value={row.original.comment}
            aria-label="Комментарий"
            onChange={(e) => updateCell(row.original.id, { comment: e.target.value })}
          />
        ),
      },
      {
        header: '✓',
        id: 'active',
        meta: { tdClass: 'td-center' },
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.original.is_active}
            aria-label="Активен"
            title="Активен"
            onChange={(e) => updateCell(row.original.id, { is_active: e.target.checked })}
          />
        ),
      },
      {
        header: '',
        id: 'actions',
        meta: { tdClass: 'td-actions' },
        cell: ({ row }) => (
          <ProductRowMenu
            row={row.original}
            disabled={saveMut.isPending}
            duplicatePending={saveMut.isPending}
            onToggleArchive={() => toggleArchive(row.original.id)}
            onDuplicate={() => duplicateRow(row.original.id)}
            onRemoveNew={() => removeNewRow(row.original.id)}
          />
        ),
      },
    ],
    [updateCell, duplicateRow, removeNewRow, toggleArchive, saveMut.isPending],
  )

  const table = useReactTable({
    data: gridRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="page products-sheet-page">
      <div className="page-head">
        <h1>Продукты</h1>
        <div className="row">
          <label className="inline-check" title={dirty ? 'Сначала сохраните или отмените изменения' : ''}>
            <input
              type="checkbox"
              checked={showArchived}
              disabled={dirty}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Показать архив
          </label>
          <button type="button" className="btn primary" disabled={busy || saveMut.isPending} onClick={addRow}>
            Добавить строку
          </button>
        </div>
      </div>
      <p className="muted small">
        Редактирование в таблице — локально до «Сохранить». <strong>Част.</strong> и колонки <strong>З/О/У/П</strong> —
        целые 0–100: внутри одной категории числа ведут себя как «проценты к соседям» (70+50+30 → доли ~41%/29%/18%).
        Пустая З/О/У/П — использовать базовую <strong>Част.</strong>
      </p>

      {productsQuery.error ? (
        <p className="error">{(productsQuery.error as Error).message}</p>
      ) : null}

      <div className="table-wrap products-sheet-wrap">
        {busy ? <p className="muted">Загрузка…</p> : null}
        <table className="table products-sheet">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const thTitle = (h.column.columnDef.meta as { thTitle?: string } | undefined)?.thTitle
                  return (
                    <th key={h.id} title={thTitle}>
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={row.original.isNew ? 'products-sheet-row--new' : undefined}
              >
                {row.getVisibleCells().map((cell) => {
                  const tdClass = (cell.column.columnDef.meta as { tdClass?: string } | undefined)?.tdClass
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
        {!busy && !gridRows.length ? (
          <p className="muted">Нет продуктов. Нажмите «Добавить строку».</p>
        ) : null}
      </div>

      {dirty ? (
        <div className="save-snackbar" role="status" aria-live="polite">
          <span className="save-snackbar-text">Есть несохранённые изменения</span>
          {saveError ? <span className="error save-snackbar-error">{saveError}</span> : null}
          <div className="save-snackbar-actions">
            <button type="button" className="btn ghost" disabled={saveMut.isPending} onClick={revertChanges}>
              Отменить
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={saveMut.isPending}
              onClick={() => {
                setSaveError(null)
                saveMut.mutate()
              }}
            >
              {saveMut.isPending ? 'Сохранение…' : 'Сохранить изменения'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function numCell(
  key: keyof Pick<
    ProductGridRow,
    'calories' | 'protein' | 'fat' | 'carbs' | 'fiber' | 'sugar'
  >,
  updateCell: (id: string, partial: Partial<ProductGridRow>) => void,
) {
  return function Cell({ row }: { row: { original: ProductGridRow } }) {
    return (
      <input
        className="cell-input cell-input-num"
        inputMode="decimal"
        value={row.original[key]}
        aria-label={String(key)}
        onChange={(e) => updateCell(row.original.id, { [key]: e.target.value } as Partial<ProductGridRow>)}
      />
    )
  }
}
