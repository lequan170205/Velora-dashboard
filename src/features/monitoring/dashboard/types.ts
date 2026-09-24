import type { MonitoringMetric, MonitoringOverview } from '../api'
import type { Tone } from '../formatters'
import type { MonitoringCurrentValue, MonitoringEmptyStateKind, MonitoringTooltipDetail, MonitoringTooltipSnapshot, MonitoringYAxisDefinition, RangeHours } from '../model'
import type { ChartSeriesToken } from '../../../shared/lib/chartTheme'

export type ServerMetric = 'cpu' | 'memory' | 'disk'

/* A fully computed card — config files produce these from the overview snapshot,
   the template only renders them. */
export type StatCardVm = {
  label: string
  value: string
  detail?: string
  helper: string
  badge: string
  tone: Tone
  /** Optional capacity gauge (0..1) rendered as a fill bar with threshold notches. */
  meter?: { ratio: number; warnAt?: number; badAt?: number } | null
  /** Server-only: opens the metric breakdown dialog. */
  dialog?: ServerMetric
}

export type StatCardGroupVm = {
  id: string
  heading?: string
  hint?: string
  /** Tailwind grid columns for this group, e.g. 'sm:grid-cols-2'. */
  gridClassName?: string
  cards: readonly StatCardVm[]
}

export type FactVm = { label: string; value: string }

export type TechnicalDetailsVm = {
  summary: string
  rows: readonly { label: string; value: string }[]
  note?: string
}

export type HealthVm = {
  tone: Tone
  label: string
  title: string
  detail: string
}

export type SeriesConfig = {
  metric: MonitoringMetric
  title: string
  question: string
  description: string
  formatter: (value: number) => string
  axisFormatter: (value: number) => string
  accentToken: ChartSeriesToken
  emptyTitle: string
  emptyDescription: string
  emptyStateKind?: MonitoringEmptyStateKind
  yAxis?: MonitoringYAxisDefinition
  tooltipDetails?: (overview: MonitoringOverview | null, value: number) => readonly MonitoringTooltipDetail[]
  /** Renders full-width with a taller plot — the page's lead metric. */
  variant?: 'hero'
}

export type CardContext = {
  overview: MonitoringOverview | null
  hasData: boolean
}

export type InfraViewConfig = {
  id: string
  /** Error headline when the overview request fails. */
  errorTitle: string
  /** Error sentence used for the overview query (matches the previous copy). */
  errorMessage: string
  toolbar: {
    eyebrow: string
    title: string
    titleId: string
    description?: string
    rangeLabel: string
    /** 'top' renders the toolbar above everything; 'history' keeps it with the charts. */
    placement: 'top' | 'history'
  }
  health: (overview: MonitoringOverview | null, hasData: boolean) => HealthVm
  cards?: (ctx: CardContext) => readonly StatCardVm[]
  cardGroups?: (ctx: CardContext) => readonly StatCardGroupVm[]
  /** Extra grid columns for the single-card-group layout (e.g. 'sm:grid-cols-2 xl:grid-cols-5'). */
  cardsGridClassName?: string
  facts?: (overview: MonitoringOverview | null) => readonly FactVm[]
  series: readonly SeriesConfig[]
  /**
   * Optional compatibility gate for dashboards whose metrics were introduced
   * after the base monitoring API. When false, history queries stay disabled
   * until the overview proves that the backend supports this view.
   */
  historyEnabled?: (overview: MonitoringOverview | null) => boolean
  currentValues: (overview: MonitoringOverview | null) => Partial<Record<MonitoringMetric, MonitoringCurrentValue>>
  snapshots?: (overview: MonitoringOverview | null) => Partial<Record<MonitoringMetric, MonitoringTooltipSnapshot>>
  technicalDetails?: (overview: MonitoringOverview | null) => TechnicalDetailsVm | null
  historyHeading?: { title: string; hint: string }
  /** Server-style layout: one host panel (status + metric blocks + facts) instead
      of a separate health banner, card grid and facts row. */
  hostStrip?: { sparkMetric: MonitoringMetric }
  /** Server only: cards open the container breakdown dialog. */
  breakdown?: boolean
}

export type { RangeHours }
