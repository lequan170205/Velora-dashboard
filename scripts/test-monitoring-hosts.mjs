import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const toDataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const transpile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const read = (path) => readFile(new URL(`../src/features/monitoring/${path}`, import.meta.url), 'utf8')

globalThis.__formatters = await import(toDataUrl(transpile(await read('formatters.ts'))))

const fromFormatters = (names) => `const { ${names} } = globalThis.__formatters;\n`
const modelSource = transpile(await read('hosts/model.ts'))
  .replace(/import \{[\s\S]*?\} from ['"]\.\.\/formatters['"];\n/, fromFormatters('toneForThreshold'))
globalThis.__hostModel = await import(toDataUrl(modelSource))
const {
  HOST_THRESHOLDS,
  hostHealth,
  hostPlace,
  hostState,
  hostSubtitle,
  hostTone,
  resolveSelectedHostId,
  serverPathForHost,
  summarizeFleet,
} = globalThis.__hostModel

const viewSource = transpile(await read('hosts/hostView.ts'))
  .replace(
    /import \{[\s\S]*?\} from ['"]\.\.\/formatters['"];\n/,
    fromFormatters('badgeForThreshold, formatBytes, formatBytesPerSecond, formatLoad, formatPercent, formatUptime, toneForThreshold'),
  )
  .replace(/import \{ HOST_THRESHOLDS \} from ['"]\.\/model['"];\n/, 'const { HOST_THRESHOLDS } = globalThis.__hostModel;\n')
const { HOST_SERIES, hasNetworkFigures, hostCards, hostCurrentValues, hostFacts, hostSnapshots, seriesForHost } = await import(toDataUrl(viewSource))

const GiB = 1024 ** 3
const host = (overrides = {}) => ({
  id: 'home',
  name: 'Homelab',
  role: 'primary',
  region: 'Vietnam',
  provider: null,
  instance: 'node-exporter:9100',
  containers: 'local',
  up: true,
  cpuUsageRatio: 0.2,
  cpuCount: 8,
  memoryTotalBytes: 16 * GiB,
  memoryAvailableBytes: 12 * GiB,
  memoryUsedBytes: 4 * GiB,
  memoryUsageRatio: 0.25,
  swapTotalBytes: 0,
  swapFreeBytes: 0,
  swapUsedBytes: 0,
  swapUsageRatio: 0,
  diskTotalBytes: 500 * GiB,
  diskAvailableBytes: 400 * GiB,
  diskUsedBytes: 100 * GiB,
  diskUsageRatio: 0.2,
  load1: 0.5,
  uptimeSeconds: 90_000,
  networkReceiveBytesPerSecond: 2048,
  networkTransmitBytesPerSecond: 512,
  ...overrides,
})

test('the selected host follows the URL, then the primary host, then the first host', () => {
  const hosts = [{ id: 'home' }, { id: 'node-2' }]

  assert.equal(resolveSelectedHostId(hosts, 'node-2', 'home'), 'node-2')
  assert.equal(resolveSelectedHostId(hosts, null, 'home'), 'home')
  assert.equal(resolveSelectedHostId(hosts, '', 'node-2'), 'node-2')
  // A link to a host that was removed must fall back, not show an empty page.
  assert.equal(resolveSelectedHostId(hosts, 'gone', 'home'), 'home')
  assert.equal(resolveSelectedHostId(hosts, 'gone', 'also-gone'), 'home')
  assert.equal(resolveSelectedHostId(hosts, undefined, undefined), 'home')
  assert.equal(resolveSelectedHostId([], 'home', 'home'), null)
})

test('host state never guesses: no scrape sample is unknown, not offline', () => {
  assert.equal(hostState({ up: true }), 'online')
  assert.equal(hostState({ up: false }), 'offline')
  assert.equal(hostState({ up: null }), 'unknown')
})

test('host tone is offline-bad, otherwise the most loaded resource', () => {
  assert.equal(hostTone(host()), 'good')
  assert.equal(hostTone(host({ cpuUsageRatio: HOST_THRESHOLDS.cpu.warn })), 'warn')
  assert.equal(hostTone(host({ memoryUsageRatio: 0.95 })), 'bad')
  assert.equal(hostTone(host({ diskUsageRatio: 0.93, cpuUsageRatio: 0.75 })), 'bad')
  assert.equal(hostTone(host({ up: false })), 'bad')
  assert.equal(hostTone(host({ up: null })), 'neutral')
  // Online with no readings yet is not "healthy".
  assert.equal(
    hostTone(host({ cpuUsageRatio: null, memoryUsageRatio: null, diskUsageRatio: null })),
    'neutral',
  )
})

test('host health states the condition and explains an outage', () => {
  assert.deepEqual(
    (({ tone, title }) => ({ tone, title }))(hostHealth(host())),
    { tone: 'good', title: 'Online' },
  )
  assert.deepEqual(
    (({ tone, title }) => ({ tone, title }))(hostHealth(host({ up: false }))),
    { tone: 'bad', title: 'Offline' },
  )
  assert.match(hostHealth(host({ up: false })).detail, /node-exporter/)
  assert.deepEqual(
    (({ tone, title }) => ({ tone, title }))(hostHealth(host({ up: null }))),
    { tone: 'neutral', title: 'Status unavailable' },
  )
  assert.equal(hostHealth(host({ cpuUsageRatio: 0.8 })).title, 'Needs attention')
  assert.equal(hostHealth(host({ cpuUsageRatio: 0.95 })).title, 'Under pressure')
})

test('fleet summary counts online, offline, unknown and hosts needing attention', () => {
  assert.deepEqual(
    summarizeFleet([
      host(),
      host({ id: 'b', cpuUsageRatio: 0.8 }),
      host({ id: 'c', up: false }),
      host({ id: 'd', up: null }),
    ]),
    { total: 4, online: 2, offline: 1, unknown: 1, attention: 1 },
  )
  assert.deepEqual(summarizeFleet([]), { total: 0, online: 0, offline: 0, unknown: 0, attention: 0 })
})

test('host labels read as a quiet subtitle', () => {
  assert.equal(hostSubtitle(host()), 'Primary · Vietnam')
  assert.equal(hostSubtitle(host({ role: 'worker', region: 'France', provider: 'Contabo' })), 'Worker · France · Contabo')
  assert.equal(hostSubtitle(host({ role: 'worker', region: null })), 'Worker')
  assert.equal(hostPlace(host({ region: null, provider: null })), '')
})

test('a link to a host puts the id in the query string safely', () => {
  assert.equal(serverPathForHost('velora-node-2'), '/server?host=velora-node-2')
  assert.equal(serverPathForHost('a b&c'), '/server?host=a+b%26c')
  assert.equal(serverPathForHost(null), '/server')
  assert.equal(serverPathForHost(undefined), '/server')
})

test('host cards read the selected host, not the fleet', () => {
  const [cpu, ram, disk] = hostCards(host({ cpuUsageRatio: 0.91, memoryUsageRatio: 0.5, diskUsageRatio: 0.85 }))

  assert.equal(cpu.value, '91.0%')
  assert.equal(cpu.tone, 'bad')
  assert.equal(cpu.detail, '8 cores')
  assert.equal(ram.value, '50.0%')
  assert.equal(ram.tone, 'good')
  assert.equal(disk.value, '85.0%')
  assert.equal(disk.tone, 'warn')
  assert.deepEqual([cpu.dialog, ram.dialog, disk.dialog], ['cpu', 'memory', 'disk'])
})

test('host cards render placeholders for a host without readings', () => {
  const cards = hostCards(null)

  assert.equal(cards.length, 3)
  assert.ok(cards.every((card) => card.value === '—' && card.tone === 'neutral' && card.badge === 'Waiting'))
})

test('an offline host says Offline on its gauges instead of Waiting', () => {
  const cards = hostCards(host({ up: false, cpuUsageRatio: null, memoryUsageRatio: null, diskUsageRatio: null }))

  assert.ok(cards.every((card) => card.badge === 'Offline' && card.value === '—'))
})

test('host facts include traffic', () => {
  const facts = Object.fromEntries(hostFacts(host()).map((fact) => [fact.label, fact.value]))

  assert.equal(facts.load, '0.50')
  assert.equal(facts.uptime, '1d 1h')
  assert.equal(facts['net in'], '2.0 KiB/s')
  assert.equal(facts['net out'], '512 B/s')
})

test('every history chart of a host has current values and a host-aware tooltip', () => {
  const current = hostCurrentValues(host())

  assert.deepEqual(
    HOST_SERIES.map((series) => series.metric),
    ['host_cpu', 'host_memory', 'host_disk', 'host_load1', 'host_network_receive', 'host_network_transmit'],
  )
  for (const series of HOST_SERIES) assert.ok(series.metric in current, series.metric)

  const ram = HOST_SERIES.find((series) => series.metric === 'host_memory')
  assert.deepEqual(ram.tooltipDetails(host(), 0.5), [
    { label: 'Approx. used', value: '8.00 GiB' },
    { label: 'Capacity', value: '16.00 GiB' },
  ])
  assert.deepEqual(ram.tooltipDetails(null, 0.5), [])
  assert.deepEqual(Object.keys(hostSnapshots(host())).sort(), ['host_disk', 'host_memory'])
  assert.deepEqual(hostSnapshots(null), {})
})

test('a host whose exporter cannot see the machine network shows no traffic figures or charts', () => {
  const bridged = host({ network: 'unavailable', networkReceiveBytesPerSecond: null, networkTransmitBytesPerSecond: null })

  assert.equal(hasNetworkFigures(bridged), false)
  assert.equal(hasNetworkFigures(host({ network: 'host' })), true)
  // An older backend does not say: keep showing what it reports.
  assert.equal(hasNetworkFigures(host()), true)
  assert.equal(hasNetworkFigures(null), true)

  const labels = hostFacts(bridged).map((fact) => fact.label)
  assert.deepEqual(labels, ['swap', 'load', 'uptime'])
  assert.ok(hostFacts(host({ network: 'host' })).map((fact) => fact.label).includes('net in'))

  assert.deepEqual(
    seriesForHost(bridged).map((item) => item.metric),
    ['host_cpu', 'host_memory', 'host_disk', 'host_load1'],
  )
  assert.equal(seriesForHost(host({ network: 'host' })).length, HOST_SERIES.length)
})

test('a backend without multi-host support gets no traffic charts either', () => {
  assert.deepEqual(
    seriesForHost(host(), true).map((item) => item.metric),
    ['host_cpu', 'host_memory', 'host_disk', 'host_load1'],
  )
})

test('byte units are binary and labelled as such, like free -h and df -h', () => {
  const { formatBytes, formatBytesAxis, formatBytesPerSecond } = globalThis.__formatters
  const GiB = 1024 ** 3

  // node-2 as the OS reports it: 12 GiB of RAM leaves 11.68 GiB, the ext4 root is 192.69 GiB.
  assert.equal(formatBytes(12247536 * 1024), '11.68 GiB')
  assert.equal(formatBytes(206900281344), '192.69 GiB')
  assert.equal(formatBytes(995 * 1024 * 1024), '995 MiB')
  assert.equal(formatBytesAxis(2.5 * GiB), '2.5 GiB')
  assert.equal(formatBytesPerSecond(3.9 * 1024), '3.9 KiB/s')
  assert.equal(formatBytesPerSecond(5 * 1024 * 1024), '5.0 MiB/s')
  assert.ok(![formatBytes(GiB), formatBytesAxis(GiB), formatBytesPerSecond(GiB)].some((text) => /\b[KMG]B\b/.test(text)))
})
