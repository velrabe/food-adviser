export type ProductCategory =
  | 'protein'
  | 'carbs'
  | 'fats'
  | 'dairy'
  | 'veg'
  | 'sauce'
  | 'mixed'

export type PlanStatus = 'draft' | 'accepted' | 'archived'

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export type GenerationStatus = 'generated' | 'saved' | 'accepted' | 'rejected'

export type ProfileRow = {
  id: string
  label: string
  created_at: string
}

export type ProductRow = {
  id: string
  profile_id: string
  internal_code: string | null
  name: string
  category: ProductCategory
  portion_label: string
  price: number
  /** Частота 0–100 внутри категории; 70/50/30 у соседей ≈ доли 70:50:30 после нормализации. */
  pick_score: number
  pick_breakfast: number | null
  pick_lunch: number | null
  pick_dinner: number | null
  pick_snack: number | null
  calories: number
  protein: number
  fat: number
  carbs: number
  fiber: number
  sugar: number
  storage_hours: number | null
  comment: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type ProductInsert = {
  profile_id: string
  internal_code?: string | null
  name: string
  category: ProductCategory
  portion_label?: string
  price?: number
  pick_score?: number
  pick_breakfast?: number | null
  pick_lunch?: number | null
  pick_dinner?: number | null
  pick_snack?: number | null
  calories?: number
  protein?: number
  fat?: number
  carbs?: number
  fiber?: number
  sugar?: number
  storage_hours?: number | null
  comment?: string | null
  is_active?: boolean
}

export type ProductUpdate = Partial<
  Omit<ProductRow, 'id' | 'profile_id' | 'created_at' | 'updated_at'>
>

export type SettingsRow = {
  id: string
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
  created_at: string
  updated_at: string
}
