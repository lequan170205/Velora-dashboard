import { CheckCircle2, X } from 'lucide-react'
import { NavLink } from 'react-router'

import { NAV_GROUPS } from '../navigation'
import { BrandMark } from '../BrandMark'
import type { MonitoringConnectionState } from '@/features/monitoring/freshness'
import { cn } from '@/shared/lib/cn'

const navLinkClassName = (isActive: boolean) =>
  cn(
    'au-nav-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
    isActive && 'font-medium',
  )

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Dashboard navigation" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            {group.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) => navLinkClassName(isActive)}
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      size={17}
                      aria-hidden="true"
                      className={cn('shrink-0', isActive ? 'text-brand' : 'text-ink-3')}
                    />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

function SidebarContent({
  onNavigate,
}: {
  connectionState: MonitoringConnectionState
  onNavigate?: () => void
}) {
  return (
    <div className="flex h-full flex-col border-r border-line bg-sidebar">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-4">
        <BrandMark className="size-8" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-ink">Velora</p>
          <p className="text-xs text-ink-3">Operations</p>
        </div>
      </div>

      <SidebarNav onNavigate={onNavigate} />

      <div className="flex items-center gap-1.5 border-t border-line px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
          <CheckCircle2 size={13} aria-hidden="true" className="text-ok" />
          Production
        </span>
      </div>
    </div>
  )
}

export function AppSidebar({ connectionState }: { connectionState: MonitoringConnectionState }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] lg:block">
      <SidebarContent connectionState={connectionState} />
    </aside>
  )
}

export function MobileNavDrawer({
  open,
  onOpenChange,
  connectionState,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectionState: MonitoringConnectionState
}) {
  return (
    <DrawerRoot open={open} onOpenChange={onOpenChange}>
      <DrawerPortal>
        <DrawerOverlay />
        <DrawerContent
          className="fixed inset-y-0 left-0 z-50 w-[272px] focus:outline-none"
          aria-describedby={undefined}
        >
          <DrawerTitle className="sr-only">Dashboard navigation</DrawerTitle>
          <SidebarContent
            connectionState={connectionState}
            onNavigate={() => onOpenChange(false)}
          />
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => onOpenChange(false)}
            className="absolute right-3 top-4 inline-flex size-8 items-center justify-center rounded-control text-ink-2 hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </DrawerContent>
      </DrawerPortal>
    </DrawerRoot>
  )
}

/* Local aliases keep the Radix dialog surface swappable. */
import * as DrawerPrimitive from '@radix-ui/react-dialog'
const DrawerRoot = DrawerPrimitive.Root
const DrawerPortal = DrawerPrimitive.Portal
const DrawerOverlay = () => (
  <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--au-overlay)] backdrop-blur-[2px]" />
)
const DrawerContent = DrawerPrimitive.Content
const DrawerTitle = DrawerPrimitive.Title
