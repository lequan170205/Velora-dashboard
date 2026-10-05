import { fetchApi } from '../../shared/api/client'

export type ConversationOption = { id: string; name: string | null; isGroup: boolean; participantIds: string[]; participants?: { email?: string }[] }
export function socketOrigin() {
  const base = import.meta.env.VITE_API_URL || window.location.origin
  const url = new URL(base, window.location.origin)
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('VITE_API_URL must be the backend origin without a path.')
  return url.origin
}
export async function getSocketToken(signal?: AbortSignal) {
  const response = await fetchApi('/auth/socket-token', { signal, cache: 'no-store' })
  if (!response.ok) throw new Error('Unable to refresh the Socket.IO session.')
  const payload = await response.json() as { accessToken?: string }
  if (!payload.accessToken) throw new Error('Socket token is unavailable.')
  return payload.accessToken
}
export async function getConversations(signal?: AbortSignal): Promise<ConversationOption[]> {
  const items = new Map<string, ConversationOption>()
  let cursor = ''
  for (let page = 0; page < 10; page++) {
    const response = await fetchApi(`/conversations?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal })
    if (!response.ok) throw new Error('Unable to load your conversations.')
    const payload: unknown = await response.json()
    if (!Array.isArray(payload) || payload.some((c) => !c || typeof c.id !== 'string' || !Array.isArray(c.participantIds))) throw new Error('Unexpected conversation list response.')
    for (const c of payload as ConversationOption[]) items.set(c.id, c)
    if (payload.length < 100) return [...items.values()].filter((c) => !c.participants?.some((p) => p.email === 'bot@system.local'))
    const next = payload.at(-1).id as string
    if (cursor === next) break
    cursor = next
  }
  // Never provision from an incomplete list: an older fixture could be hidden.
  throw new Error('Conversation list is too large or pagination did not complete.')
}
export async function createTestGroup(name: string, participantIds: string[], signal: AbortSignal): Promise<string> {
  const response = await fetchApi('/conversations', { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'GROUP', name, participantIds }) })
  if (!response.ok) throw new Error('Group creation failed. Reload before trying again.')
  const payload = await response.json() as { id?: string }
  if (!payload.id || typeof payload.id !== 'string') throw new Error('Group creation response was incomplete. Reload before trying again.')
  return payload.id
}

// A deterministic fixture namespace for the signed-in account + chosen peer;
// this template is not an existing conversation and is only used for creation.
export async function fixtureMembersByEmail(email: string, signal: AbortSignal): Promise<ConversationOption> {
  const normalized = email.trim().toLowerCase()
  if (!normalized.includes('@') || normalized === 'bot@system.local') throw new Error('Enter an existing test-account email.')
  const [session, users] = await Promise.all([
    fetchApi('/auth/me', { signal, cache: 'no-store' }),
    fetchApi(`/users?limit=100&search=${encodeURIComponent(normalized)}`, { signal, cache: 'no-store' }),
  ])
  if (!session.ok || !users.ok) throw new Error('Unable to resolve fixture members.')
  const me = await session.json() as { id?: string }
  const result = await users.json() as { data?: { id: string; email: string }[] }
  const matches = result.data?.filter((user) => user.email?.toLowerCase() === normalized) ?? []
  if (!me.id || matches.length !== 1 || !matches[0].id || matches[0].id === me.id) throw new Error('Choose one existing test account different from the dashboard account.')
  const participantIds = [me.id, matches[0].id].sort()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(participantIds.join('|')))
  const id = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 24)
  return { id, name: 'Test account fixture template', isGroup: true, participantIds, participants: [{ email: normalized }] }
}
