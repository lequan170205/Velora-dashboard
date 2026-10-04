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
  const response = await fetchApi('/conversations?limit=100', { signal })
  if (!response.ok) throw new Error('Unable to load your conversations.')
  const payload: unknown = await response.json()
  if (!Array.isArray(payload)) throw new Error('Unexpected conversation list response.')
  return payload.filter((c): c is ConversationOption => c && typeof c.id === 'string' && Array.isArray(c.participantIds))
    .filter((c) => !c.participants?.some((p) => p.email === 'bot@system.local'))
}
