import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(
  new URL('../src/features/monitoring/alertRouting.ts', import.meta.url),
  'utf8',
)
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const {
  alertServiceForRouting,
  logServiceForAlert,
  metricViewForAlert,
  normalizePublicOrigin,
} = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)

const alert = (service, name, summary, labels = {}) => ({ service, name, summary, labels })

test('AI alerts stay on AI logs and never target the removed RAG route', () => {
  const ai = alert('ai-service', 'VeloraRagHighFailureRate', 'RAG failure rate is high')
  assert.equal(metricViewForAlert(ai), null)
  assert.equal(logServiceForAlert(ai), 'ai-service')

  const unknown = alert('unknown', 'VeloraRagHighP95Latency', 'RAG latency is high')
  assert.equal(alertServiceForRouting(unknown), 'ai-service')
  assert.equal(metricViewForAlert(unknown), null)
})

test('Reel worker and pipeline alerts retain useful log owners and Reel metrics', () => {
  for (const service of [
    'media-processing-service',
    'media-processing-long-service',
    'reel-indexing-service',
    'reel-indexing-long-service',
  ]) {
    const worker = alert(service, `Alert-${service}`, 'Reel worker is unhealthy')
    assert.equal(logServiceForAlert(worker), service)
    assert.equal(metricViewForAlert(worker), 'reels')
  }

  const longMedia = alert('reel-pipeline', 'VeloraReelWorkerHighFailureRate', 'Reel worker failure rate is elevated', { pipeline: 'MEDIA', lane: 'LONG' })
  assert.equal(logServiceForAlert(longMedia), 'media-processing-long-service')
  assert.equal(metricViewForAlert(longMedia), 'reels')

  const index = alert('reel-pipeline', 'VeloraReelWorkerHighQueueWait', 'Reel queue wait is elevated', { pipeline: 'INDEX' })
  assert.equal(logServiceForAlert(index), 'all')
  const indexShort = alert('reel-pipeline', 'VeloraReelWorkerHighQueueWait', 'Reel queue wait is elevated', { pipeline: 'INDEX', queue: 'reel_index_short_jobs' })
  assert.equal(logServiceForAlert(indexShort), 'reel-indexing-service')
  const indexLong = alert('reel-pipeline', 'VeloraReelWorkerHighQueueWait', 'Reel queue wait is elevated', { pipeline: 'INDEX', queue: 'reel_index_long_jobs' })
  assert.equal(logServiceForAlert(indexLong), 'reel-indexing-long-service')
  assert.equal(metricViewForAlert(index), 'reels')

  const rabbit = alert('rabbitmq', 'VeloraReelRabbitMqUnavailable', 'Reel RabbitMQ metrics are unavailable')
  assert.equal(logServiceForAlert(rabbit), 'rabbitmq')
  assert.equal(metricViewForAlert(rabbit), 'reels')
})

test('base worker services honor LONG queue labels while preserving exact LONG services', () => {
  assert.equal(
    logServiceForAlert(alert('media-processing-service', 'MediaWorker', 'Media worker', { queue: 'reel_media_long_jobs' })),
    'media-processing-long-service',
  )
  assert.equal(
    logServiceForAlert(alert('reel-indexing-service', 'IndexWorker', 'Index worker', { queue: 'reel_index_long_jobs' })),
    'reel-indexing-long-service',
  )
  assert.equal(
    logServiceForAlert(alert('reel-indexing-long-service', 'IndexWorker', 'Index worker', { queue: 'reel_index_short_jobs' })),
    'reel-indexing-long-service',
  )
})

test('every returned internal metric action has a registered route', () => {
  const routerSource = readFile(new URL('../src/app/router.tsx', import.meta.url), 'utf8')
  const alerts = [
    alert('conversation-service', 'ConversationDown', 'Conversation down'),
    alert('call-service', 'CallDown', 'Call down'),
    alert('notification-service', 'NotificationDown', 'Notification down'),
    alert('auth-service', 'AuthDown', 'Auth down'),
    alert('user-service', 'UserDown', 'User down'),
    alert('content-service', 'VeloraReelPipelineStalled', 'Reel pipeline stalled'),
    alert('monitoring-service', 'MonitoringDown', 'Monitoring down'),
    alert('node-exporter', 'HostDown', 'Host down'),
  ]

  return routerSource.then((source) => {
    const registered = new Set([...source.matchAll(/path:\s*["']([^"']+)["']/g)].map((match) => match[1]))
    for (const item of alerts) assert.ok(registered.has(metricViewForAlert(item)))
  })
})

test('public Langfuse links accept only credential-free HTTP(S) origins', () => {
  assert.equal(normalizePublicOrigin('https://langfuse.example///'), 'https://langfuse.example')
  assert.equal(normalizePublicOrigin('https://user:secret@langfuse.example'), null)
  assert.equal(normalizePublicOrigin('https://langfuse.example/?token=secret'), null)
  assert.equal(normalizePublicOrigin('javascript:alert(1)'), null)
  assert.equal(normalizePublicOrigin(''), null)
})
