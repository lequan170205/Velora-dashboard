import { cn } from '../../lib/cn'
import { Skeleton } from './skeleton'

/* Shared loading primitives. Every page composes these for its initial load so
   skeletons share the same shapes, pulse, and card chrome across the app.
   Geometry mirrors the real components (StatCard, HistoryChart, CountTile,
   alert rows) so the skeleton → content swap does not shift the layout. */

export function PageHeaderSkeleton({ actions = true }: { actions?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <Skeleton className="h-3 w-44" />
        <Skeleton className="mt-2 h-4 w-64 sm:w-[520px]" />
      </div>
      {actions && <Skeleton className="h-8 w-32 shrink-0" />}
    </div>
  )
}

/** Segmented range control + refresh button, mirroring InfraToolbar. */
export function ToolbarControlsSkeleton() {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-8 w-[92px]" />
    </div>
  )
}

export function StatCardSkeleton() {
  return (
    <div className="flex flex-col gap-1.5 rounded-card border border-line bg-panel px-4 pb-4 pt-[18px]">
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
      <Skeleton className="h-[26px] w-16" />
      <Skeleton className="h-3 w-32" />
    </div>
  )
}

export function StatCardsSkeleton({
  count = 6,
  gridClassName,
}: {
  count?: number
  gridClassName?: string
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3', gridClassName)}>
      {Array.from({ length: count }, (_, index) => (
        <StatCardSkeleton key={index} />
      ))}
    </div>
  )
}

/** Plot area + low/latest/high summary row, mirroring a rendered HistoryChart body. */
export function ChartPlotSkeleton() {
  return (
    <>
      <Skeleton className="h-44 w-full rounded-control" />
      <div className="flex items-center justify-between gap-3 border-t border-line pt-2.5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
      </div>
    </>
  )
}

export function ChartCardSkeleton() {
  return (
    <article className="flex flex-col gap-3 rounded-card border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-1.5 h-3 w-20" />
        </div>
        <Skeleton className="h-7 w-14 shrink-0" />
      </div>
      <ChartPlotSkeleton />
    </article>
  )
}

export function ChartsSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {Array.from({ length: count }, (_, index) => (
        <ChartCardSkeleton key={index} />
      ))}
    </div>
  )
}

/** Mirrors the small count tiles used on the Alerts page. */
export function CountTileSkeleton() {
  return (
    <article className="flex flex-col gap-1 rounded-card border border-line bg-panel px-4 pb-3.5 pt-[18px]">
      <Skeleton className="h-3.5 w-20" />
      <Skeleton className="h-[26px] w-10" />
      <Skeleton className="h-3 w-24" />
    </article>
  )
}

/** Stacked row cards, mirroring alert cards / mobile card stacks. */
export function RowCardsSkeleton({
  cards = 3,
  className,
}: {
  cards?: number
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      {Array.from({ length: cards }, (_, index) => (
        <div
          key={index}
          className="flex flex-col gap-2 rounded-card border border-line bg-panel px-4 pb-3.5 pt-[18px]"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-11 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full max-w-md" />
        </div>
      ))}
    </div>
  )
}

/** Divided rows for tables and log panels. No outer chrome — wrap in a panel. */
export function SkeletonRows({
  rows = 6,
  className,
  rowClassName,
}: {
  rows?: number
  className?: string
  rowClassName?: string
}) {
  return (
    <div className={cn('flex flex-col divide-y divide-line', className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={cn('flex items-center gap-3 px-4 py-3', rowClassName)}>
          <Skeleton className='h-3 w-24 shrink-0' />
          <Skeleton className='hidden h-3 w-28 sm:block' />
          <Skeleton className='h-3 min-w-0 flex-1' />
          <Skeleton className='h-5 w-14 shrink-0 rounded-full' />
        </div>
      ))}
    </div>
  )
}
