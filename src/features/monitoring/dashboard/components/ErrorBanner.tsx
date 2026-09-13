import { TriangleAlert } from 'lucide-react'

type ErrorBannerProps = {
  error: string | null
  title: string
  hasData: boolean
}

export function ErrorBanner({ error, title, hasData }: ErrorBannerProps) {
  if (!error) return null

  const message = hasData
    ? `${error} Showing the last successful metrics while the dashboard retries.`
    : error

  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-card border border-warn-soft bg-warn-soft/50 px-4 py-3"
    >
      <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
      <p className="text-[13px] leading-relaxed text-ink">
        <strong className="font-semibold">{title}</strong> {message}
      </p>
    </div>
  )
}
