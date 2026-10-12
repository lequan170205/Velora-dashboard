export type DependencyHealth = 'healthy' | 'degraded' | 'unknown'

export const getDependencyHealth = (
  values: readonly (boolean | null | undefined)[],
): DependencyHealth => {
  if (values.some((value) => value === false)) return 'degraded'
  if (values.some((value) => value !== true)) return 'unknown'
  return 'healthy'
}
