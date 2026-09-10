import type { MonitoringMetric, MonitoringPoint } from '../api'
import type {
  MonitoringCurrentValue,
  MonitoringSeriesDefinition,
  MonitoringTooltipSnapshot,
} from '../model'
import { MonitoringChart } from './MonitoringChart'

type MonitoringChartsProps = {
  series: readonly MonitoringSeriesDefinition[]
  history: Partial<Record<MonitoringMetric, MonitoringPoint[]>>
  historyErrors?: Partial<Record<MonitoringMetric, string>>
  currentValues?: Partial<Record<MonitoringMetric, MonitoringCurrentValue>>
  snapshots?: Partial<Record<MonitoringMetric, MonitoringTooltipSnapshot>>
  className?: string
  initialLoading?: boolean
}

export function MonitoringCharts({
  series,
  history,
  historyErrors,
  currentValues,
  snapshots,
  className = '',
  initialLoading = false,
}: MonitoringChartsProps) {
  const now = Date.now()

  return (
    <div className={`monitoring-grid ${className}`.trim()}>
      {series.map((item) => (
        <MonitoringChart
          key={item.metric}
          points={history[item.metric] ?? []}
          title={item.title}
          question={item.question}
          description={item.description}
          valueFormatter={item.formatter}
          axisFormatter={item.axisFormatter}
          accent={item.accent}
          fill={item.fill}
          emptyTitle={item.emptyTitle}
          emptyDescription={item.emptyDescription}
          yAxis={item.yAxis}
          currentValue={currentValues?.[item.metric]}
          currentSnapshot={snapshots?.[item.metric]}
          historyError={historyErrors?.[item.metric] ?? null}
          now={now}
          loading={initialLoading}
        />
      ))}
    </div>
  )
}
