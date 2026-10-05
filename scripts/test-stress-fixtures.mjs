import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile(new URL('../src/features/stress-test/fixtures.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { prepareRooms } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const original = { id: 'source', name: 'Test source', participantIds: ['test-admin', 'test-peer'], isGroup: true }
function fixture() {
  const rooms = [], calls = []
  return { rooms, calls, options: { source: original, load: async () => rooms,
    create: async (name, participantIds) => { const id = `group-${rooms.length}`; rooms.push({ id, name, participantIds, isGroup: true }); calls.push(name); return id },
    signal: new AbortController().signal, onProgress: () => {} } }
}
test('provisions exactly 20 dedicated groups, preserves source members, and reuses them on a later run', async () => {
  const f = fixture()
  const progress = []
  const first = await prepareRooms({ ...f.options, onProgress: (done, created) => progress.push([done, created]) })
  assert.equal(first.length, 20)
  assert.equal(f.calls.length, 20)
  assert.deepEqual(first[0].participantIds, original.participantIds)
  assert.deepEqual(progress.at(-1), [20, 20])
  const second = await prepareRooms(f.options)
  assert.deepEqual(second, first)
  assert.equal(f.calls.length, 20)
  assert.equal(original.name, 'Test source')
})
test('ambiguous POST failure stops; rerun discovers and reuses the group that was committed', async () => {
  const f = fixture()
  const create = f.options.create
  await assert.rejects(prepareRooms({ ...f.options, create: async (...args) => { await create(...args); throw new Error('Network disconnected after commit') } }))
  assert.equal(f.calls.length, 1)
  await prepareRooms(f.options)
  assert.equal(f.calls.length, 20)
})
test('conflicting name or changed members stops without adding extra groups', async () => {
  const f = fixture()
  f.rooms.push({ id: 'collision', name: 'Velora stress source 01', isGroup: true, participantIds: ['test-admin', 'real-user'] })
  await assert.rejects(prepareRooms(f.options))
  assert.equal(f.calls.length, 0)
})
test('bot and single-member sources are rejected before any write', async () => {
  const f = fixture()
  for (const source of [{ ...original, participantIds: ['test-admin'] }, { ...original, participants: [{ email: 'bot@system.local' }] }]) await assert.rejects(prepareRooms({ ...f.options, source }))
  assert.equal(f.calls.length, 0)
})
test('operator stop keeps completed fixtures and does not continue creation', async () => {
  const f = fixture(), controller = new AbortController()
  await assert.rejects(prepareRooms({ ...f.options, signal: controller.signal, onProgress: (done) => { if (done === 3) controller.abort() } }))
  assert.equal(f.calls.length, 3)
})
