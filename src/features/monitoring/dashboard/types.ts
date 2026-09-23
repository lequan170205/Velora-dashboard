import type { MonitoringMetric, MonitoringOverview } from '../api'
import type { Tone } from '../formatters'
import type { MonitoringCurrentValue, MonitoringEmptyStateKind, MonitoringTooltipSnapshot, MonitoringYAxisDefinition, RangeHours } from '../model'
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

export type NoteVm = {
  mark?: string
  title?: string
  lines: readonly string[]
  badge?: string
}

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
    description: string
    rangeLabel: string
    /** 'top' renders the toolbar above everything; 'history' keeps it with the charts. */
    placement: 'top' | 'history'
  }
  health: (overview: MonitoringOverview | null, hasData: boolean) => HealthVm
  topNote?: NoteVm
  bottomNote?: NoteVm
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
  /** Server only: cards open the container breakdown dialog. */
  breakdown?: boolean
}

export type { RangeHours }
