import type { MonitoringPoint } from '../../api'
import { cn } from '@/shared/lib/cn'

/* Minimal trend line: no axes, no tooltip. Scales to its own min/max so the
   shape stays readable; the number next to it carries the actual value. */
export function Sparkline({
  points,
  className,
}: {
  points: readonly MonitoringPoint[]
  className?: string
}) {
  if (points.length < 2) return null

  const width = 220
  const height = 40
  const pad = 3
  const values = points.map((point) => point.value).filter(Number.isFinite)
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = (width - pad * 2) / (points.length - 1)

  const path = points
    .map((point, index) => {
      const x = pad + index * step
      const y = height - pad - ((point.value - min) / span) * (height - pad * 2)
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn('h-10 w-full', className)}
    >
      <path
        d={path}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className="stroke-brand"
      />
    </svg>
  )
}
