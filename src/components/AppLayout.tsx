import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

const nav: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: 'Таймлайн', end: true },
  { to: '/generator', label: 'Генератор' },
  { to: '/products', label: 'Продукты' },
  { to: '/history', label: 'История' },
  { to: '/settings', label: 'Настройки' },
]

export function AppLayout() {
  const { user, signOut } = useAuth()

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
        <div className="header-aside">
          {user?.email ? <span className="muted small">{user.email}</span> : null}
          <button type="button" className="btn ghost small" onClick={() => signOut()}>
            Выйти
          </button>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
