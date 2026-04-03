import { createClient } from '@supabase/supabase-js'
import type { ProductRow } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anon)
}

export const supabase = createClient(
  url ?? '',
  anon ?? '',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)

export type Database = {
  public: {
    Tables: {
      products: {
        Row: ProductRow
        Insert: Omit<ProductRow, 'id' | 'user_id' | 'created_at' | 'updated_at'> & {
          id?: string
          user_id?: string
        }
        Update: Partial<ProductRow>
      }
    }
  }
}
