import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

export type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  role?: 'status' | 'alert'
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  role = 'status',
  className,
}: EmptyStateProps) {
  return (
    <div
      role={role}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line px-6 py-10 text-center',
        className,
      )}
    >
      <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-raised text-ink-3">
        <Icon size={18} aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-[13px] text-ink-2">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
