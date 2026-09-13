import { useTheme, type Theme } from '../theme/ThemeProvider'

export type ChartTheme = {
  grid: string
  tick: string
  cursor: string
  tooltipBg: string
  tooltipBorder: string
  tooltipText: string
  tooltipMuted: string
  thresholdWarn: string
  thresholdBad: string
  series: {
    indigo: string
    violet: string
    teal: string
    blue: string
    amber: string
    rose: string
  }
}

export type ChartSeriesToken = keyof ChartTheme['series']

/* Recharts reads colors as plain values, so chart colors are resolved as hex/rgba
   per theme instead of CSS variables. */
const CHART_THEMES: Record<Theme, ChartTheme> = {
  dark: {
    grid: 'rgba(255, 255, 255, 0.07)',
    tick: '#8b94b1',
    cursor: 'rgba(255, 255, 255, 0.16)',
    tooltipBg: '#1a1f35',
    tooltipBorder: 'rgba(255, 255, 255, 0.14)',
    tooltipText: '#edeef7',
    tooltipMuted: '#a5acc8',
    thresholdWarn: '#fbbf24',
    thresholdBad: '#f87171',
    series: {
      indigo: '#818cf8',
      violet: '#a78bfa',
      teal: '#2dd4bf',
      blue: '#60a5fa',
      amber: '#fbbf24',
      rose: '#fb7185',
    },
  },
  light: {
    grid: '#e4e6f0',
    tick: '#616782',
    cursor: 'rgba(25, 27, 46, 0.12)',
    tooltipBg: '#ffffff',
    tooltipBorder: '#e4e6f0',
    tooltipText: '#191b2e',
    tooltipMuted: '#5a5f7a',
    thresholdWarn: '#92400e',
    thresholdBad: '#b91c1c',
    series: {
      indigo: '#4f46e5',
      violet: '#7c3aed',
      teal: '#0f766e',
      blue: '#2563eb',
      amber: '#b45309',
      rose: '#e11d48',
    },
  },
}

export function useChartTheme(): ChartTheme {
  const { theme } = useTheme()
  return CHART_THEMES[theme]
}
