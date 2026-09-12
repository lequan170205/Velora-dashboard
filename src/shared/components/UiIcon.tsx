import type { ReactNode } from 'react'

export type UiIconName =
  | 'activity'
  | 'alert'
  | 'bell'
  | 'check'
  | 'clock'
  | 'gauge'
  | 'list'
  | 'loader'
  | 'message'
  | 'minus'
  | 'phone'
  | 'search'
  | 'server'
  | 'terminal'
  | 'timeline'
  | 'zero'

type UiIconProps = {
  name: UiIconName
  size?: number
  className?: string
  strokeWidth?: number
}

const iconPaths: Record<UiIconName, ReactNode> = {
  activity: <><path d="M3 12h4l2.2-7 4.2 14L16 12h5" /><path d="M3 5h3" /></>,
  alert: <><path d="M10.3 3.4 2.1 18a1.5 1.5 0 0 0 1.3 2.2h13.2a1.5 1.5 0 0 0 1.3-2.2L9.7 3.4a1.5 1.5 0 0 0-2.6 0Z" /><path d="M8 9v4" /><path d="M8 16h.01" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  check: <><path d="m5 12 4 4L19 6" /><circle cx="12" cy="12" r="9" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  gauge: <><path d="M4.9 19a9 9 0 1 1 14.2 0" /><path d="m12 13 3.5-3.5" /><path d="M5 19h14" /></>,
  list: <><path d="M8 6h12" /><path d="M8 12h12" /><path d="M8 18h12" /><path d="M3.5 6h.01" /><path d="M3.5 12h.01" /><path d="M3.5 18h.01" /></>,
  loader: <><path d="M12 3v3" /><path d="M12 18v3" /><path d="m4.2 4.2 2.1 2.1" /><path d="m17.7 17.7 2.1 2.1" /><path d="M3 12h3" /><path d="M18 12h3" /><path d="m4.2 19.8 2.1-2.1" /><path d="m17.7 6.3 2.1-2.1" /></>,
  message: <><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.7 8.7 0 0 1-3.8-.9L4 20l1.4-3.7A7.1 7.1 0 0 1 4 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z" /><path d="M8 11h.01" /><path d="M12 11h.01" /><path d="M16 11h.01" /></>,
  minus: <path d="M5 12h14" />,
  phone: <><path d="M7.2 4.5 9 4l2 5-2 1.3a13.7 13.7 0 0 0 4.7 4.7L15 13l5 2 .5 1.8A2.5 2.5 0 0 1 18 20C10.3 20 4 13.7 4 6a2.5 2.5 0 0 1 3.2-1.5Z" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4.2 4.2" /></>,
  server: <><rect x="3" y="4" width="18" height="6" rx="1.5" /><rect x="3" y="14" width="18" height="6" rx="1.5" /><path d="M7 7h.01M7 17h.01" /><path d="M11 7h6M11 17h6" /></>,
  terminal: <><path d="m5 7 5 5-5 5" /><path d="M12 17h7" /></>,
  timeline: <><path d="M6 4v6a3 3 0 0 0 3 3h6a3 3 0 0 1 3 3v4" /><circle cx="6" cy="4" r="1.5" /><circle cx="18" cy="20" r="1.5" /><circle cx="18" cy="16" r="1.5" /></>,
  zero: <><circle cx="12" cy="12" r="8.5" /><path d="m8.5 8.5 7 7" /></>,
}

export function UiIcon({ name, size = 18, className, strokeWidth = 1.8 }: UiIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {iconPaths[name]}
    </svg>
  )
}
