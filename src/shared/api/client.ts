const apiBaseUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? ''

const REFRESH_LOCK_NAME = 'velora-auth-refresh'
const REFRESH_REQUEST_ID_KEY = 'velora.auth.refresh-request-id'

const fetchWithCredentials = (path: string, options?: RequestInit) =>
  fetch(`${apiBaseUrl}${path}`, {
    credentials: 'include',
    ...options,
  })

type RefreshSessionResult = 'refreshed' | 'expired' | 'unavailable'
type SessionExpiredListener = () => void

type LockManagerLike = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>
}

const sessionExpiredListeners = new Set<SessionExpiredListener>()
let refreshPromise: Promise<RefreshSessionResult> | null = null
let fallbackRefreshRequestId: string | null = null

const createRequestId = () => crypto.randomUUID()

const readStoredRefreshRequestId = () => {
  try {
    return localStorage.getItem(REFRESH_REQUEST_ID_KEY)
  } catch {
    return fallbackRefreshRequestId
  }
}

const writeStoredRefreshRequestId = (requestId: string) => {
  fallbackRefreshRequestId = requestId
  try {
    localStorage.setItem(REFRESH_REQUEST_ID_KEY, requestId)
  } catch {
    // Storage can be unavailable. Same-tab refreshes remain protected by refreshPromise.
  }
}

const getOrCreateRefreshRequestId = () => {
  const existing = readStoredRefreshRequestId()
  if (existing) return existing

  const requestId = createRequestId()
  writeStoredRefreshRequestId(requestId)

  // Re-read so tabs that initialize concurrently converge on the stored winner.
  return readStoredRefreshRequestId() ?? requestId
}

const rotateRefreshRequestId = () => {
  writeStoredRefreshRequestId(createRequestId())
}

const withCrossTabRefreshLock = async (
  callback: () => Promise<RefreshSessionResult>,
) => {
  if (typeof navigator === 'undefined') return callback()

  const locks = (navigator as Navigator & { locks?: LockManagerLike }).locks
  return locks?.request ? locks.request(REFRESH_LOCK_NAME, callback) : callback()
}

const notifySessionExpired = () => {
  for (const listener of sessionExpiredListeners) {
    try {
      listener()
    } catch {
      // One listener must not prevent other session-expiry consumers from running.
    }
  }
}

export const subscribeToSessionExpired = (listener: SessionExpiredListener) => {
  sessionExpiredListeners.add(listener)
  return () => {
    sessionExpiredListeners.delete(listener)
  }
}

const performRefresh = async (): Promise<RefreshSessionResult> => {
  // Another tab may have refreshed while this request waited for the browser lock.
  // Checking the cookie-authenticated session first avoids replaying its old token.
  try {
    const session = await fetchWithCredentials('/auth/me')
    if (session.ok) return 'refreshed'
    if (session.status !== 401) return 'unavailable'
  } catch {
    return 'unavailable'
  }

  const requestId = getOrCreateRefreshRequestId()

  try {
    const response = await fetchWithCredentials('/auth/refresh', {
      method: 'POST',
      headers: {
        'x-refresh-request-id': requestId,
      },
    })

    if (response.ok) {
      rotateRefreshRequestId()
      return 'refreshed'
    }

    if (response.status === 401) {
      notifySessionExpired()
      return 'expired'
    }

    return 'unavailable'
  } catch {
    return 'unavailable'
  }
}

const refreshSession = () => {
  if (!refreshPromise) {
    refreshPromise = withCrossTabRefreshLock(performRefresh)
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

const shouldSkipRefresh = (path: string) =>
  path === '/auth/login' || path === '/auth/refresh' || path === '/auth/logout'

export const fetchApi = async (path: string, options?: RequestInit) => {
  const response = await fetchWithCredentials(path, options)

  if (response.status !== 401 || shouldSkipRefresh(path)) {
    return response
  }

  const refreshResult = await refreshSession()
  if (refreshResult === 'expired') {
    return response
  }

  if (refreshResult === 'unavailable') {
    throw new Error('Session refresh is temporarily unavailable')
  }

  return fetchWithCredentials(path, options)
}
