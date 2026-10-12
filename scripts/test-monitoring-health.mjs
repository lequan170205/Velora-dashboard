import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const toDataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const transpile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const loadTranspiled = async (url) => import(toDataUrl(transpile(await readFile(url, 'utf8'))))

const { getDependencyHealth } = await loadTranspiled(
  new URL('../src/features/monitoring/dashboard/dependencyHealth.ts', import.meta.url),
)

globalThis.__monitoringFormatters = await loadTranspiled(
  new URL('../src/features/monitoring/formatters.ts', import.meta.url),
)
globalThis.__monitoringDependencyHealth = { getDependencyHealth }

const loadHealthConfig = async (name) => {
  let source = transpile(await readFile(
    new URL(`../src/features/monitoring/dashboard/configs/${name}.ts`, import.meta.url),
    'utf8',
  ))
  source = source
    .replace(/import \{[\s\S]*?\} from ['"]\.\.\/\.\.\/formatters['"];\n/, 'const { badgeForThreshold, formatBytes, formatBytesAxis, formatCpu, formatCount, formatPercent, formatRate, formatSeconds, toneForThreshold } = globalThis.__monitoringFormatters;\n')
    .replace(/import \{ getDependencyHealth \} from ['"]\.\.\/dependencyHealth['"];\n/, 'const { getDependencyHealth } = globalThis.__monitoringDependencyHealth;\n')
  return import(toDataUrl(source))
}

const { authServiceConfig } = await loadHealthConfig('authService')
const { userServiceConfig } = await loadHealthConfig('userService')
const { notificationServiceConfig } = await loadHealthConfig('notificationService')

test('critical dependency summaries never call null or missing targets healthy', () => {
  assert.equal(getDependencyHealth([true, true, true]), 'healthy')
  assert.equal(getDependencyHealth([true, false, true]), 'degraded')
  assert.equal(getDependencyHealth([true, null, true]), 'unknown')
  assert.equal(getDependencyHealth([true, undefined]), 'unknown')
})

test('known service warnings remain visible when dependencies are unknown', () => {
  const auth = (overrides = {}) => authServiceConfig.health({ auth: {
    up: true,
    databaseUp: true,
    redisUp: true,
    errorRate: 0,
    replayDetectionsPerSecond: 0,
    ...overrides,
  } })
  const user = (overrides = {}) => userServiceConfig.health({ user: {
    up: true,
    databaseUp: true,
    errorRate: 0,
    storageFailureRate: 0,
    ...overrides,
  } })
  const notification = (overrides = {}) => notificationServiceConfig.health({ notification: {
    up: true,
    databaseUp: true,
    retrySchedulerCompletionAgeSeconds: 1,
    apnsTransportFailuresPerSecond: 0,
    ...overrides,
  } })

  assert.equal(auth({ errorRate: 0.05 }).tone, 'warn')
  assert.equal(auth({ errorRate: 0.05 }).title, 'Authentication errors need attention')
  assert.equal(auth({ up: null, errorRate: 0.05 }).tone, 'warn')
  assert.equal(auth({ up: null, errorRate: 0.05 }).title, 'Authentication errors need attention')
  assert.equal(user({ databaseUp: null, storageFailureRate: 0.1 }).tone, 'warn')
  assert.equal(user({ databaseUp: null, storageFailureRate: 0.1 }).title, 'Avatar storage checks need attention')
  assert.equal(user({ up: null, errorRate: 0.05 }).tone, 'warn')
  assert.equal(user({ up: null, errorRate: 0.05 }).title, 'User errors need attention')
  assert.equal(notification({ up: null, databaseUp: false }).tone, 'bad')
  assert.equal(notification({ up: null, databaseUp: false }).title, 'Notification database connection is unavailable')
  assert.equal(notification({ up: null, apnsTransportFailuresPerSecond: 1 }).tone, 'warn')
  assert.equal(notification({ up: null, apnsTransportFailuresPerSecond: 1 }).title, 'APNs transport failures need attention')
  assert.equal(notification({ up: null, retrySchedulerCompletionAgeSeconds: 61 }).tone, 'bad')
  assert.equal(notification({ up: null, retrySchedulerCompletionAgeSeconds: 61 }).title, 'Notification retry scheduler is stalled')
})
