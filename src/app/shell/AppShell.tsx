import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'

import { titleForPath } from '../navigation'
import { useAuth } from '../providers/auth'
import { useMonitoringConnection } from '@/features/monitoring/hooks/useMonitoringConnection'
import { AppSidebar, MobileNavDrawer } from './AppSidebar'
import { AppTopbar } from './AppTopbar'

const skipLinkClass = [
  'sr-only',
  'focus-visible:not-sr-only focus-visible:fixed focus-visible:left-3 focus-visible:top-3 focus-visible:z-[60]',
  'focus-visible:rounded-control focus-visible:border focus-visible:border-line focus-visible:bg-panel',
  'focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm focus-visible:text-ink focus-visible:shadow-modal',
].join(' ')

export function AppShell() {
  const location = useLocation()
  const { logout } = useAuth()
  const connectionState = useMonitoringConnection()
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    setNavOpen(false)
    window.scrollTo({ top: 0, behavior: 'auto' })
    document.getElementById('dashboard-main')?.focus({ preventScroll: true })
  }, [location.pathname])

  return (
    <div className="flex min-h-dvh bg-canvas font-sans text-ink">
      <a className={skipLinkClass} href="#dashboard-main">
        Skip to dashboard content
      </a>

      <AppSidebar connectionState={connectionState} />
      <MobileNavDrawer
        open={navOpen}
        onOpenChange={setNavOpen}
        connectionState={connectionState}
      />

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[248px]">
        <AppTopbar
          title={titleForPath(location.pathname)}
          connectionState={connectionState}
          onOpenNav={() => setNavOpen(true)}
          onLogout={() => void logout()}
        />

        <main id="dashboard-main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
