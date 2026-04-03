import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { isSupabaseConfigured } from '../lib/supabase'
import { useProfile } from '../profiles/ProfileProvider'

const nav: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: 'Таймлайн', end: true },
  { to: '/generator', label: 'Генератор' },
  { to: '/products', label: 'Продукты' },
  { to: '/history', label: 'История' },
  { to: '/settings', label: 'Настройки' },
]

export function AppLayout() {
  const loc = useLocation()
  const mainFullWidth =
    loc.pathname === '/products' || loc.pathname.endsWith('/products')
  const { profiles, activeProfile, ready, error, setActiveProfileId, createProfile } = useProfile()

  if (!isSupabaseConfigured()) {
    return (
      <div className="shell">
        <main className="main">
          <div className="page narrow">
            <h1>Настройте Supabase</h1>
            <p className="muted">
              В <code>.env</code> или в GitHub Secrets укажите <code>VITE_SUPABASE_URL</code> и{' '}
              <code>VITE_SUPABASE_ANON_KEY</code>.
            </p>
          </div>
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div className="shell">
        <main className="main">
          <div className="page narrow">
            <h1>Ошибка базы</h1>
            <p className="error">{error}</p>
            <p className="muted small">
              Если вы ещё не применяли миграцию с профилями, выполните в SQL Editor файл{' '}
              <code>supabase/migrations/20260403120000_profiles_open_rls.sql</code>.
            </p>
          </div>
        </main>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="shell">
        <main className="main">
          <p className="muted">Загрузка профилей…</p>
        </main>
      </div>
    )
  }

  return (
    <div className="shell">
      <header className="header">
        <div className="brand">Food Adviser</div>
        <nav className="nav">
          {nav.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={Boolean(end)}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="header-aside profile-bar">
          <label className="profile-select-wrap">
            <span className="muted small">Профиль</span>
            <select
              className="profile-select"
              value={activeProfile?.id ?? ''}
              onChange={(e) => setActiveProfileId(e.target.value)}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn ghost small"
            onClick={async () => {
              const name = window.prompt('Название профиля', 'Новый')
              if (name == null) return
              try {
                await createProfile(name)
              } catch (e) {
                window.alert(e instanceof Error ? e.message : 'Не удалось создать профиль')
              }
            }}
          >
            + Профиль
          </button>
        </div>
      </header>
      <main className={mainFullWidth ? 'main main--wide' : 'main'}>
        <Outlet />
      </main>
    </div>
  )
}
