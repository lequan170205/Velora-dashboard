import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { CircleUser, LogOut, Menu } from 'lucide-react'

import { ThemeToggle } from '@/shared/theme/ThemeToggle'
import { LiveIndicator } from './LiveIndicator'
import type { MonitoringConnectionState } from '@/features/monitoring/fresshness'

type AppTopbarProps = {
  title: string
  connectionState: MonitoringConnectionState
  onOpenNav: () => void
  onLogout: () => void
}

const iconButtonClass =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-control text-ink-2 transition-colors duration-150 hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

export function AppTopbar({ title, connectionState, onOpenNav, onLogout }: AppTopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-canvas/85 px-3 backdrop-blur-md sm:px-4 lg:px-6">
      <button
        type="button"
        className={`${iconButtonClass} lg:hidden`}
        aria-label="Open navigation"
        onClick={onOpenNav}
      >
        <Menu size={18} aria-hidden="true" />
      </button>

      <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{title}</h1>

      <div className="flex shrink-0 items-center gap-2">
        <LiveIndicator state={connectionState} />
        <ThemeToggle />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" className={iconButtonClass} aria-label="Account menu">
              <CircleUser size={18} aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className="z-50 min-w-44 rounded-control border border-line bg-panel p-1 shadow-modal"
            >
              <DropdownMenu.Item
                onSelect={onLogout}
                className="flex cursor-pointer select-none items-center gap-2 rounded-[6px] px-2.5 py-2 text-sm text-bad outline-none data-[highlighted]:bg-bad-soft"
              >
                <LogOut size={15} aria-hidden="true" />
                Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  )
}
