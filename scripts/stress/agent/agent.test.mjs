import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHandler, parseArgs } from './agent.mjs'
import { executeJob, saveResult } from './execute.mjs'
import { StressJobs } from './jobs.mjs'
import { adminAuthorizer } from './auth.mjs'

const tick = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms))
const id1 = '11111111-1111-4111-8111-111111111111'
const id2 = '22222222-2222-4222-8222-222222222222'
const body = (requestId = id1, params = { rps: 5, seconds: 10 }) => ({ scenario: 'chat', params, requestId })

test('a run is idempotent per request id and only one runs at a time', async () => {
  let release
  const jobs = new StressJobs(() => new Promise(resolve => { release = () => resolve({ passed: true, reason: null, metrics: [], failures: [] }) }))
  const first = jobs.start('admin', body())
  await tick()
  assert.equal(jobs.start('admin', body()), first)
  assert.throws(() => jobs.start('admin', body(id2)), /khác/)
  assert.throws(() => jobs.start('admin', { ...body(id1), scenario: 'sockets' }), /khác|không hợp lệ/)
  release(); await tick()
  assert.equal(first.status, 'passed'); assert.equal(jobs.state().busy, false)
  assert.equal(jobs.start('admin', body()), first)
  assert.equal(jobs.state().recent.length, 1)
})

test('invalid requests are rejected before anything starts', () => {
  const jobs = new StressJobs(async () => { throw new Error('must not run') })
  assert.throws(() => jobs.start('admin', { scenario: 'chat', params: { rps: 0, seconds: 10 }, requestId: id1 }), /Tin mỗi giây/)
  assert.throws(() => jobs.start('admin', { scenario: 'chat', params: { rps: 5, seconds: 10 }, requestId: 'x' }), /không hợp lệ/)
  assert.throws(() => jobs.start('admin', { scenario: 'chat', params: { rps: 5, seconds: 10 } }), /không hợp lệ/)
  assert.equal(jobs.state().busy, false)
})

test('stop aborts the run and the result is cancelled, not failed', async () => {
  const jobs = new StressJobs((job, signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('stopped')))))
  const job = jobs.start('admin', body())
  await tick()
  assert.equal(jobs.stop(job.id).status, 'stopping')
  await tick()
  assert.equal(job.status, 'cancelled'); assert.equal(job.reason, 'Đã dừng theo yêu cầu')
  assert.throws(() => jobs.stop(job.id), /Không có/)
})

test('private exceptions and storage failures never reach the dashboard', async () => {
  const jobs = new StressJobs(async () => { throw new Error('password hunter2 /Users/x/manifest.json') }, { onFinished: async () => { throw new Error('/private/path') } })
  const job = jobs.start('admin', body())
  await tick()
  assert.equal(job.status, 'failed')
  assert.ok(!JSON.stringify(jobs.state()).includes('hunter2')); assert.ok(!JSON.stringify(jobs.state()).includes('/private'))
})

async function serve(jobs) {
  const authorize = async token => { if (token !== 'admin-token') throw new Error('Unauthorized'); return { id: 'admin' } }
  const server = createServer(createHandler({ jobs, authorize }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const call = (path, { token = 'admin-token', method = 'GET', json, headers = {} } = {}) => fetch(base + path, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(json ? { 'content-type': 'application/json' } : {}), ...headers }, body: json ? JSON.stringify(json) : undefined })
  return { call, close: () => new Promise(resolve => server.close(resolve)) }
}

test('HTTP: admin-only, no browser origins, scenarios are described, start/stop work', async () => {
  const jobs = new StressJobs((job, signal) => new Promise((resolve) => signal.addEventListener('abort', () => resolve({ passed: false, reason: null, metrics: [], failures: [] }))), { capabilities: { media: false } })
  const { call, close } = await serve(jobs)
  try {
    assert.equal((await call('/runs', { token: '' })).status, 401)
    assert.equal((await call('/runs', { token: 'other' })).status, 401)
    assert.equal((await call('/runs', { headers: { origin: 'https://evil.example' } })).status, 403)
    assert.equal((await call('/health', { token: '' })).status, 200)
    const state = await (await call('/runs')).json()
    assert.deepEqual(state.scenarios.map(s => s.id), ['chat', 'sockets', 'calls', 'mixed']); assert.equal(state.busy, false)
    assert.equal((await call('/runs', { method: 'POST', json: { scenario: 'chat', params: { rps: 0, seconds: 1 }, requestId: id1 } })).status, 400)
    const started = await call('/runs', { method: 'POST', json: body() })
    assert.equal(started.status, 202)
    const job = await started.json()
    assert.equal((await call('/runs', { method: 'POST', json: body(id2) })).status, 409)
    assert.equal((await call(`/runs/${job.id}/stop`, { method: 'POST' })).status, 200)
    assert.equal((await call(`/runs/${job.id}/stop`, { method: 'POST', token: '' })).status, 401)
    await tick()
    assert.equal((await (await call('/runs')).json()).recent[0].status, 'cancelled')
    assert.equal((await call('/nope')).status, 404)
  } finally { await close() }
})

test('options: unknown flags are refused', () => {
  assert.deepEqual(parseArgs(['--manifest', '/m', '--port', '1']), { manifest: '/m', port: '1' })
  assert.throws(() => parseArgs(['--password', 'x']), /unknown option/)
  assert.throws(() => parseArgs(['--manifest']), /needs a value/)
})

// A stand-in for a bundled tool: reads --output, writes a report, prints progress on stderr.
async function fakeBins(script) {
  const dir = await mkdtemp(join(tmpdir(), 'velora-fake-bins-'))
  for (const name of ['chat.mjs', 'connections.mjs', 'churn.mjs', 'media.mjs', 'mixed.mjs']) await writeFile(join(dir, name), script)
  return dir
}
const configFor = () => ({ baseUrl: 'https://velora-app.me', accounts: Array.from({ length: 50 }, (_, i) => ({ id: `u${i}`, email: `e${i}`, password: 'x'.repeat(24) })) })
const job = (params = { rps: 5, seconds: 10 }) => ({ scenario: 'chat', params, startedAt: '2026-10-28T10:00:00.000Z' })

test('execute: launches the tool on a private temp config, reads the report and removes the credentials', async () => {
  const before = (await readdir(tmpdir())).filter(n => n.startsWith('velora-stress-')).length
  const binsDir = await fakeBins(`
    import { readFileSync, writeFileSync, statSync } from 'node:fs'
    const arg = name => process.argv[process.argv.indexOf(name) + 1]
    const config = JSON.parse(readFileSync(arg('--config'), 'utf8'))
    if (statSync(arg('--config')).mode & 0o077) process.exit(3)
    console.error(JSON.stringify({ phase: 'load' }))
    writeFileSync(arg('--output'), JSON.stringify({ passed: config.baseUrl === 'http://127.0.0.1' && config.stages[0].rps === 5 && config.stages[0].users === 50,
      stages: [{ planned: 50, skipped: 0, achievedRps: 5 }], totals: { emitted: 50, failedMessages: 0, ack: { p95: 10 }, delivery: { p95: 20 }, deliveries: { missing: 0 } } }))
  `)
  const phases = []
  const target = job()
  try {
    const result = await executeJob(target, new AbortController().signal, patch => phases.push(patch.phase), { config: configFor(), options: { binsDir, baseUrl: 'http://127.0.0.1' } })
    assert.equal(result.passed, true, JSON.stringify(result))
    assert.ok(phases.includes('Đang gửi tin'))
    assert.equal(JSON.stringify(target), JSON.stringify({ scenario: 'chat', params: { rps: 5, seconds: 10 }, startedAt: target.startedAt }), 'raw report must not be enumerable')
    assert.ok(target.rawReport)
    assert.equal((await readdir(tmpdir())).filter(n => n.startsWith('velora-stress-')).length, before)
  } finally { await rm(binsDir, { recursive: true, force: true }) }
})

test('execute: a tool that dies without a report is a failure with a safe reason', async () => {
  const binsDir = await fakeBins('process.exit(7)')
  try {
    const result = await executeJob(job(), new AbortController().signal, () => {}, { config: configFor(), options: { binsDir, baseUrl: 'http://127.0.0.1' } })
    assert.equal(result.passed, false); assert.match(result.reason, /mã 7/)
  } finally { await rm(binsDir, { recursive: true, force: true }) }
})

test('execute: stop sends SIGINT and still reports a stop', async () => {
  const binsDir = await fakeBins(`process.on('SIGINT', () => process.exit(0)); setTimeout(() => {}, 60000)`)
  try {
    const abort = new AbortController()
    const running = executeJob(job(), abort.signal, () => {}, { config: configFor(), options: { binsDir, baseUrl: 'http://127.0.0.1' } })
    await tick(300); abort.abort()
    const result = await running
    assert.equal(result.passed, false); assert.equal(result.reason, 'Đã dừng theo yêu cầu')
  } finally { await rm(binsDir, { recursive: true, force: true }) }
})

test('execute: real-audio runs need Chrome on the agent', async () => {
  await assert.rejects(executeJob({ scenario: 'calls', params: { calls: 2, seconds: 30, media: true }, startedAt: 'x' }, new AbortController().signal, () => {}, { config: configFor(), options: { binsDir: '/none', baseUrl: 'http://127.0.0.1' } }), /Chrome/)
})

test('results are saved privately with the raw report, which stays out of the dashboard payload', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'velora-results-'))
  try {
    const target = { ...job(), status: 'passed' }
    Object.defineProperty(target, 'rawReport', { value: { passed: true, counts: 1 }, enumerable: false })
    await saveResult(dir, target)
    const [name] = await readdir(dir)
    assert.match(name, /^chat-2026-10-28T10-00-00-000Z\.json$/)
    assert.deepEqual(JSON.parse(await readFile(join(dir, name), 'utf8')).report, { passed: true, counts: 1 })
  } finally { await rm(dir, { recursive: true, force: true }) }
})

const token = (sub, exp) => `header.${Buffer.from(JSON.stringify({ sub, exp })).toString('base64url')}.signature`
test('the agent accepts only an ADMIN bound to the token and not expired', async () => {
  for (const user of [{ id: 'a', roles: ['USER'] }, { id: 'b', roles: ['ADMIN'] }]) {
    const authorize = adminAuthorizer('https://velora-app.me', { now: () => 1000, fetchImpl: async () => ({ ok: true, json: async () => user }) })
    await assert.rejects(authorize(token('a', 60)))
  }
  let calls = 0
  const authorize = adminAuthorizer('https://velora-app.me', { now: () => 1000, fetchImpl: async () => { calls++; return { ok: true, json: async () => ({ id: 'a', roles: ['ADMIN'] }) } } })
  assert.deepEqual(await authorize(token('a', 60)), { id: 'a' })
  await authorize(token('a', 60)); assert.equal(calls, 1)
  await assert.rejects(authorize(token('a', 0)))
})
