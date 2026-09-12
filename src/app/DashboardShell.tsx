import type { FormEvent, ReactNode } from 'react'
import type { MonitoringConnectionState } from '../features/monitoring/fresshness'
import { UiIcon, type UiIconName } from '../shared/components/UiIcon'

export type ViewId =
  | 'server'
  | 'service'
  | 'conversation'
  | 'call-service'
  | 'alerts'
  | 'logs'
  | 'call-quality'
  | 'recent-calls'
  | 'timeline'
type ViewGroup = 'Infrastructure' | 'Observability' | 'Calls'

export const VIEWS: Array<{
  id: ViewId
  group: ViewGroup
  label: string
  title: string
  icon: UiIconName
}> = [
  {
    id: 'server',
    group: 'Infrastructure',
    label: 'Server',
    title: 'Server resources',
    icon: 'server',
  },
  {
    id: 'service',
    group: 'Infrastructure',
    label: 'Monitoring',
    title: 'Monitoring service',
    icon: 'activity',
  },
  {
    id: 'conversation',
    group: 'Infrastructure',
    label: 'Conversation',
    title: 'Conversation service',
    icon: 'message',
  },
  {
    id: 'call-service',
    group: 'Infrastructure',
    label: 'Call service',
    title: 'Call service',
    icon: 'phone',
  },
  {
    id: 'alerts',
    group: 'Observability',
    label: 'Alerts',
    title: 'Active alerts',
    icon: 'bell',
  },
  {
    id: 'logs',
    group: 'Observability',
    label: 'Logs',
    title: 'Service logs',
    icon: 'terminal',
  },
  {
    id: 'call-quality',
    group: 'Calls',
    label: 'Quality',
    title: 'Call quality',
    icon: 'gauge',
  },
  {
    id: 'recent-calls',
    group: 'Calls',
    label: 'Recent',
    title: 'Recent calls',
    icon: 'list',
  },
  {
    id: 'timeline',
    group: 'Calls',
    label: 'Timeline',
    title: 'Call timeline',
    icon: 'timeline',
  },
]

const VIEW_GROUPS: readonly ViewGroup[] = ['Infrastructure', 'Observability', 'Calls']

export const viewFromHash = (): ViewId => {
  const hash = window.location.hash.replace(/^#/, '') as ViewId
  return VIEWS.some((view) => view.id === hash) ? hash : 'server'
}

export function SessionLoader() {
  return (
    <main className="session-loader">
      <div className="brand-mark">V</div>
      <span>Loading…</span>
    </main>
  )
}

type LoginProps = {
  email: string
  password: string
  error: string | null
  loading: boolean
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
}

export function LoginScreen({
  email,
  password,
  error,
  loading,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: LoginProps) {
  return (
    <main className="login-shell">
      <section className="login-form-panel">
        <form className="login-card" onSubmit={onSubmit} aria-busy={loading} aria-labelledby="login-title">
          <div className="login-heading">
            <div className="brand-mark" aria-hidden="true">V</div>
            <h1 id="login-title">Velora</h1>
            <p>Operations</p>
          </div>
          <label>
            Email address
            <input
              id="login-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="admin@velora.app"
              autoComplete="email"
              disabled={loading}
              required
            />
          </label>
          <label>
            Password
            <input
              id="login-password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              disabled={loading}
              required
            />
          </label>
          <button className="primary-button login-button" type="submit" disabled={loading}>
            {loading ? (
              <>
                <span className="login-spinner" aria-hidden="true" />
                <span>Signing in…</span>
              </>
            ) : (
              'Sign in'
            )}
          </button>
          {error && <p className="error login-error" role="alert">{error}</p>}
        </form>
      </section>
    </main>
  )
}

type DashboardShellProps = {
  activeView: ViewId
  onNavigate: (view: ViewId) => void
  onLogout: () => void
  connectionState: MonitoringConnectionState
  children: ReactNode
}

export function DashboardShell({
  activeView,
  onNavigate,
  onLogout,
  connectionState,
  children,
}: DashboardShellProps) {
  const connectionLabel = {
    live: 'Live',
    refreshing: 'Refreshing',
    stale: 'Stale',
    disconnected: 'Offline',
  }[connectionState]

  const currentView = VIEWS.find((view) => view.id === activeView) ?? VIEWS[0]

  return (
    <div className="admin-shell">
      <a className="skip-link" href="#dashboard-main">Skip to dashboard content</a>
      <aside className="admin-sidebar">
        <div className="brand-lockup sidebar-brand">
          <div className="brand-mark">V</div>
          <div>
            <strong>Velora</strong>
            <span>Operations</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Dashboard navigation">
          {VIEW_GROUPS.map((group) => (
            <div className="nav-group" key={group}>
              <span className="nav-label">{group}</span>
              {VIEWS.filter((view) => view.group === group).map((view) => (
                <button
                  className={activeView === view.id ? 'nav-tab-button active' : 'nav-tab-button'}
                  type="button"
                  key={view.id}
                  aria-current={activeView === view.id ? 'page' : undefined}
                  onClick={() => onNavigate(view.id)}
                >
                  <UiIcon name={view.icon} size={17} />
                  <span>{view.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-status">
          <div className="sidebar-status-line">
            <span>
              <UiIcon name="check" size={14} /> Production
            </span>
            <strong>{connectionLabel}</strong>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <h1>{currentView.title}</h1>
          <div className="topbar-actions">
            <span className={`live-indicator state-${connectionState}`} role="status" aria-live="polite">
              <span className="live-indicator-dot" aria-hidden="true" />
              {connectionLabel}
            </span>
            <button className="ghost-button" type="button" onClick={onLogout}>
              Sign out
            </button>
          </div>
        </header>

        <main id="dashboard-main" className="dashboard-content tabbed-dashboard-content" tabIndex={-1}>{children}</main>
      </div>
    </div>
  )
}
