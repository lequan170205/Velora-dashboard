import type { ConversationOption } from './api'

export async function prepareRooms(options: {
  source: ConversationOption
  load: () => Promise<ConversationOption[]>
  create: (name: string, participants: string[]) => Promise<string>
  signal: AbortSignal
  onProgress: (done: number, created: number) => void
}): Promise<ConversationOption[]> {
  options.signal.throwIfAborted()
  const participants = [...new Set(options.source.participantIds)].sort()
  if (participants.length < 2 || participants.some((id) => !id.trim()) || options.source.participants?.some((p) => p.email === 'bot@system.local')) throw new Error('Choose a non-bot test conversation with at least two members.')
  const sameMembers = (room: ConversationOption) => [...new Set(room.participantIds)].sort().join('|') === participants.join('|')
  const rooms = await options.load()
  const selected: ConversationOption[] = []
  let created = 0
  for (let index = 1; index <= 20; index++) {
    options.signal.throwIfAborted()
    const name = `Velora stress ${options.source.id} ${String(index).padStart(2, '0')}`
    const existing = rooms.filter((room) => room.name === name)
    if (existing.some((room) => !room.isGroup || !sameMembers(room)) || existing.length > 1) throw new Error('A fixture name has conflicting groups or members. Check the conversation list.')
    let room = existing[0]
    if (!room) {
      // No automatic retry on ambiguous POST failures. A later run reloads
      // the list and reuses any group the server may already have created.
      const id = await options.create(name, participants)
      room = { id, name, isGroup: true, participantIds: participants }
      created++
    }
    selected.push(room)
    options.onProgress(index, created)
  }
  return selected
}
