import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = (await readFile(new URL('../src/features/stress-test/api.ts', import.meta.url), 'utf8')).replace("import { fetchApi } from '../../shared/api/client'", 'const fetchApi = (...args) => globalThis.stressFetch(...args)')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { getConversations, fixtureMembersByEmail, createTestGroup, getSocketToken } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
afterEach(() => { delete globalThis.stressFetch })
const response = (payload) => ({ ok: true, json: async () => payload })

test('room pagination completes before provisioning and excludes known bot conversations', async () => {
  const calls = []
  const first = Array.from({ length: 100 }, (_, n) => ({ id: `r${n}`, participantIds: ['admin', 'peer'] }))
  globalThis.stressFetch = async (path) => { calls.push(path); return response(calls.length === 1 ? first : [{ id: 'bot-room', participantIds: ['admin', 'bot'], participants: [{ email: 'bot@system.local' }] }, { id: 'last', participantIds: ['admin', 'peer'] }]) }
  const rooms = await getConversations()
  assert.equal(rooms.length, 101)
  assert.ok(calls[1].includes('cursor=r99'))
})
test('incomplete or repeated pagination rejects instead of returning a list that could hide existing fixtures', async () => {
  globalThis.stressFetch = async () => response(Array.from({ length: 100 }, (_, n) => ({ id: `r${n}`, participantIds: ['admin', 'peer'] })))
  await assert.rejects(getConversations())
})
test('exact peer email creates a stable two-member namespace without writing or exposing credentials', async () => {
  const calls = []
  globalThis.stressFetch = async (path) => { calls.push(path); return response(path === '/auth/me' ? { id: 'admin-id', roles: ['ADMIN'] } : { data: [{ id: 'peer-id', email: 'test@example.com' }, { id: 'wrong-id', email: 'other-test@example.com' }] }) }
  const a = await fixtureMembersByEmail(' Test@example.com ', new AbortController().signal)
  const b = await fixtureMembersByEmail('test@example.com', new AbortController().signal)
  assert.equal(a.id, b.id)
  assert.equal(a.id.length, 24)
  assert.deepEqual(a.participantIds, ['admin-id', 'peer-id'])
  assert.ok(calls.every((path) => path.startsWith('/auth/me') || path.startsWith('/users?')))
})
test('unknown, ambiguous, self and bot fixture recipients are rejected', async () => {
  for (const peers of [[], [{ id: 'admin-id', email: 'test@example.com' }], [{ id: 'a', email: 'test@example.com' }, { id: 'b', email: 'test@example.com' }]]) {
    globalThis.stressFetch = async (path) => response(path === '/auth/me' ? { id: 'admin-id' } : { data: peers })
    await assert.rejects(fixtureMembersByEmail('test@example.com', new AbortController().signal))
  }
  await assert.rejects(fixtureMembersByEmail('bot@system.local', new AbortController().signal))
})
test('group creation submits the standard group contract once and never retries network failures', async () => {
  const calls = []
  globalThis.stressFetch = async (path, options) => { calls.push([path, options]); return response({ id: 'new-group' }) }
  assert.equal(await createTestGroup('Fixture', ['admin', 'peer'], new AbortController().signal), 'new-group')
  assert.deepEqual(JSON.parse(calls[0][1].body), { type: 'GROUP', name: 'Fixture', participantIds: ['admin', 'peer'] })
  globalThis.stressFetch = async () => { calls.push('failed'); throw new Error('network') }
  await assert.rejects(createTestGroup('Fixture', ['admin', 'peer'], new AbortController().signal))
  assert.equal(calls.length, 2)
})

test('accounts with more than 1000 conversations remain usable', async () => {
  let page = 0
  globalThis.stressFetch = async () => response(Array.from({ length: page < 19 ? 100 : 24 }, (_, n) => ({ id: `room-${page}-${n}`, participantIds: ['admin', 'peer'] })).map((room, index, rows) => { if (index === rows.length - 1) page++; return room }))
  assert.equal((await getConversations()).length, 1924)
  assert.equal(page, 20)
})

test('socket token distinguishes expired credentials from upstream outage without response-body leaks', async () => {
  for (const [status, name] of [[401, 'StressSessionExpired'], [503, 'StressSessionUnavailable']]) {
    globalThis.stressFetch = async () => ({ ok: false, status, json: async () => ({ token: 'private token' }) })
    await assert.rejects(getSocketToken(), (error) => error.name === name && !error.message.includes('private token'))
  }
})
