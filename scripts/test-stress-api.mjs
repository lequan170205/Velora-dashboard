import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { describeScenarios } from './stress/agent/scenarios.mjs'

const source = (await readFile(new URL('../src/features/stress-test/api.ts', import.meta.url), 'utf8')).replace("import { fetchApi } from '../../shared/api/client'", 'const fetchApi = (...args) => globalThis.stressFetch(...args)')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { parseState, parseRun, getState, startRun, stopRun, presetValues, checkValues } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
afterEach(() => { delete globalThis.stressFetch })

const id = '11111111-1111-4111-8111-111111111111'
const run = (patch = {}) => ({ id, scenario: 'chat', params: { rps: 5, seconds: 10 }, status: 'passed', phase: 'Đã xong', startedAt: '2026-10-28T10:00:00.000Z',
  finishedAt: '2026-10-28T10:00:30.000Z', estimatedSeconds: 30, reason: null, metrics: [{ label: 'Tin lỗi', value: '0' }], failures: [], ...patch })
const state = (patch = {}) => ({ available: true, busy: false, capabilities: { media: false }, scenarios: describeScenarios({ media: false }), active: null, recent: [run()], ...patch })
const ok = (payload) => ({ ok: true, json: async () => payload })

test('the agent state the dashboard shows is exactly what the agent defines', () => {
  const parsed = parseState(state())
  assert.deepEqual(parsed.scenarios.map((s) => s.id), ['chat', 'sockets', 'calls', 'mixed'])
  assert.equal(parsed.recent[0].metrics[0].label, 'Tin lỗi')
})

test('malformed agent responses are rejected', () => {
  assert.throws(() => parseState({ ...state(), available: false }))
  assert.throws(() => parseState({ ...state(), recent: [run({ status: 'weird' })] }))
  assert.throws(() => parseRun(run({ id: 'not-a-uuid' })))
  assert.throws(() => parseRun(run({ params: { rps: 'five' } })))
  assert.throws(() => parseState({ ...state(), scenarios: [{ id: 'x', title: 't', description: 'd', fields: [{ key: 'k', label: 'l', type: 'text' }], presets: [] }] }))
})

test('presets are clamped to what the agent allows', () => {
  const calls = parseState(state()).scenarios.find((s) => s.id === 'calls')
  assert.equal(presetValues(calls, calls.presets[1]).media, false)
  const mixed = parseState(state()).scenarios.find((s) => s.id === 'mixed')
  assert.equal(presetValues(mixed, mixed.presets[2]).calls, 0)
})

test('the form is checked before anything is sent', () => {
  const [chat, , , mixed] = parseState(state({ capabilities: { media: true }, scenarios: describeScenarios({ media: true }) })).scenarios
  assert.equal(checkValues(chat, { rps: 10, seconds: 30 }), null)
  assert.match(checkValues(chat, { rps: NaN, seconds: 30 }), /Tin mỗi giây/)
  assert.match(checkValues(chat, { rps: 300, seconds: 300 }), /10\.000/)
  assert.match(checkValues(mixed, { sockets: 200, chat: 5, churn: 20, calls: 5, seconds: 30 }), /tối đa 20/)
})

test('requests go through the gateway proxy and failures map to readable errors', async () => {
  const calls = []
  globalThis.stressFetch = async (path, init) => { calls.push([path, init?.method ?? 'GET']); return ok(path.endsWith('/stop') ? run({ status: 'stopping' }) : path.endsWith('runs') && init?.method === 'POST' ? run({ status: 'running' }) : state()) }
  await getState(); await startRun('chat', { rps: 5, seconds: 10 }, id); await stopRun(id)
  assert.deepEqual(calls.map((c) => c[0]), ['/monitoring/stress/runs', '/monitoring/stress/runs', `/monitoring/stress/runs/${id}/stop`])
  const sent = JSON.parse((await (async () => { let body; globalThis.stressFetch = async (_p, init) => { body = init.body; return ok(run()) }; await startRun('chat', { rps: 5, seconds: 10 }, id); return { body } })()).body)
  assert.deepEqual(Object.keys(sent).sort(), ['params', 'requestId', 'scenario'])
  globalThis.stressFetch = async () => ({ ok: false, status: 409 })
  await assert.rejects(getState(), /Đang có một lần chạy khác/)
  globalThis.stressFetch = async () => ({ ok: false, status: 503 })
  await assert.rejects(getState(), /chưa chạy/)
  await assert.rejects(stopRun('x'), /không hợp lệ/)
})
