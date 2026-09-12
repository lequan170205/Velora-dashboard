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
  kicker: string
  icon: UiIconName
}> = [
  {
    id: 'server',
    group: 'Infrastructure',
    label: 'Server',
    title: 'Server resources',
    kicker: 'Infrastructure / Host',
    icon: 'server',
  },
  {
    id: 'service',
    group: 'Infrastructure',
    label: 'Monitoring service',
    title: 'Monitoring service',
    kicker: 'Infrastructure / Service',
    icon: 'activity',
  },
  {
    id: 'conversation',
    group: 'Infrastructure',
    label: 'Conversation service',
    title: 'Conversation service',
    kicker: 'Infrastructure / Realtime chat',
    icon: 'message',
  },
  {
    id: 'call-service',
    group: 'Infrastructure',
    label: 'Call service',
    title: 'Call service',
    kicker: 'Infrastructure / Call signaling',
    icon: 'phone',
  },
  {
    id: 'alerts',
    group: 'Observability',
    label: 'Active alerts',
    title: 'Active alerts',
    kicker: 'Observability / Prometheus rules',
    icon: 'bell',
  },
  {
    id: 'logs',
    group: 'Observability',
    label: 'Service logs',
    title: 'Service logs',
    kicker: 'Observability / Loki',
    icon: 'terminal',
  },
  {
    id: 'call-quality',
    group: 'Calls',
    label: 'Call quality',
    title: 'Call quality',
    kicker: 'Calls / Quality',
    icon: 'gauge',
  },
  {
    id: 'recent-calls',
    group: 'Calls',
    label: 'Recent calls',
    title: 'Recent calls',
    kicker: 'Calls / Explorer',
    icon: 'list',
  },
  {
    id: 'timeline',
    group: 'Calls',
    label: 'Call timeline',
    title: 'Call timeline',
    kicker: 'Calls / Timeline',
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
      <span>Checking admin session…</span>
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
      <section className="login-brand-panel">
        <div className="brand-lockup">
          <div className="brand-mark">V</div>
          <div>
            <strong>Velora</strong>
            <span>Operations Console</span>
          </div>
        </div>
        <div className="login-brand-copy">
          <span className="status-chip">
            <UiIcon name="activity" size={15} /> Internal operations
          </span>
          <h1>Observe infrastructure and call quality from one focused console.</h1>
          <p>
            Host resources, service health, call QoE, failures, and per-call timelines for Velora
            administrators.
          </p>
          <div className="login-proof-grid" aria-label="Console capabilities">
            <span><UiIcon name="activity" size={15} /> Live telemetry</span>
            <span><UiIcon name="server" size={15} /> Container resources</span>
            <span><UiIcon name="bell" size={15} /> Alert-aware views</span>
          </div>
        </div>
        <p className="login-footnote">Restricted access · Administrator accounts only</p>
      </section>

      <section className="login-form-panel">
        <form className="login-card" onSubmit={onSubmit} aria-busy={loading} aria-labelledby="login-title">
          <div className="login-heading">
            <span>Admin sign in</span>
            <h2 id="login-title">Welcome back</h2>
            <p>Use your Velora administrator account to continue.</p>
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
              'Sign in to dashboard'
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
    live: 'Live data',
    refreshing: 'Refreshing',
    stale: 'Stale data',
    disconnected: 'Disconnected',
  }[connectionState]

  const connectionShortLabel = {
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
            <strong>{connectionShortLabel}</strong>
          </div>
          <p>
            Prometheus metrics and alerts plus Loki logs refresh automatically. Admin authentication
            refreshes in the background.
          </p>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div>
            <span className="topbar-kicker">{currentView.kicker}</span>
            <h1>{currentView.title}</h1>
          </div>
          <div className="topbar-actions">
            <span className={`live-indicator state-${connectionState}`} role="status" aria-live="polite">
              <span className="live-indicator-dot" aria-hidden="true" />
              {connectionLabel}
            </span>
            <div className="admin-user">
              <span>AD</span>
              <div>
                <strong>Administrator</strong>
                <small>Admin session</small>
              </div>
            </div>
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
