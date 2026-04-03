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

export type ProductRow = {
  id: string
  user_id: string
  internal_code: string | null
  name: string
  category: ProductCategory
  portion_label: string
  price: number
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
  internal_code?: string | null
  name: string
  category: ProductCategory
  portion_label?: string
  price?: number
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

export type ProductUpdate = Partial<Omit<ProductRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
