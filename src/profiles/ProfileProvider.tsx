import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import type { ProfileRow } from '../lib/types'

const STORAGE_KEY = 'food-adviser-active-profile'

type Ctx = {
  profiles: ProfileRow[]
  activeProfile: ProfileRow | null
  ready: boolean
  error: string | null
  setActiveProfileId: (id: string) => void
  createProfile: (label: string) => Promise<ProfileRow | null>
}

const ProfileContext = createContext<Ctx | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [activeId, setActiveId] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY))

  const profilesQuery = useQuery({
    queryKey: ['profiles'],
    enabled: isSupabaseConfigured(),
    queryFn: async () => {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error

      const list = (data ?? []) as ProfileRow[]
      if (list.length === 0) {
        throw new Error(
          'В базе нет профилей. Выполните в Supabase SQL Editor файл migrations/20260403120000_profiles_open_rls.sql',
        )
      }
      return list
    },
  })

  const profiles = profilesQuery.data ?? []

  useEffect(() => {
    if (!profiles.length || profilesQuery.isPending) return
    const valid = activeId && profiles.some((p) => p.id === activeId)
    if (!valid) {
      const next = profiles[0].id
      localStorage.setItem(STORAGE_KEY, next)
      setActiveId(next)
    }
  }, [profiles, activeId, profilesQuery.isPending])

  const setActiveProfileId = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id)
    setActiveId(id)
  }, [])

  const createProfile = useCallback(
    async (label: string) => {
      const trimmed = label.trim()
      if (!trimmed) return null
      const sb = getSupabase()
      const { data, error } = await sb.from('profiles').insert({ label: trimmed }).select().single()
      if (error) throw error
      const row = data as ProfileRow
      await qc.invalidateQueries({ queryKey: ['profiles'] })
      setActiveProfileId(row.id)
      return row
    },
    [qc, setActiveProfileId],
  )

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeId) ?? null,
    [profiles, activeId],
  )

  const value: Ctx = {
    profiles,
    activeProfile,
    ready: isSupabaseConfigured() ? profilesQuery.isSuccess && Boolean(activeProfile) : true,
    error: profilesQuery.error ? (profilesQuery.error as Error).message : null,
    setActiveProfileId,
    createProfile,
  }

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
