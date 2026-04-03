import { useState } from 'react'
import { useAuth } from './AuthProvider'
import { isSupabaseConfigured } from '../lib/supabase'

export function LoginPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (!isSupabaseConfigured()) {
    return (
      <div className="page narrow">
        <h1>Настройте Supabase</h1>
        <p className="muted">
          Скопируйте <code>.env.example</code> в <code>.env</code> и укажите{' '}
          <code>VITE_SUPABASE_URL</code> и <code>VITE_SUPABASE_ANON_KEY</code>.
        </p>
      </div>
    )
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      if (mode === 'in') await signIn(email, password)
      else await signUp(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="page narrow">
      <h1>Вход</h1>
      <p className="muted">Один аккаунт — ваши продукты и планы изолированы RLS.</p>
      <form className="stack" onSubmit={onSubmit}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Пароль</span>
          <input
            type="password"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <div className="row">
          <button type="submit" className="btn primary" disabled={pending}>
            {mode === 'in' ? 'Войти' : 'Зарегистрироваться'}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setMode(mode === 'in' ? 'up' : 'in')}
          >
            {mode === 'in' ? 'Создать аккаунт' : 'Уже есть аккаунт'}
          </button>
        </div>
      </form>
    </div>
  )
}
