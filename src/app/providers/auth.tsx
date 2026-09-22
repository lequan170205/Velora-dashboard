import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { fetchApi, subscribeToSessionExpired } from '../../shared/api/client'

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated'

type AuthContextValue = {
  status: AuthStatus
  loginError: string | null
  loginPending: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)
const SESSION_RETRY_DELAY_MS = 3_000

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginPending, setLoginPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleRetry = () => {
      if (cancelled || retryTimer) return
      retryTimer = setTimeout(() => {
        retryTimer = null
        void verifySession()
      }, SESSION_RETRY_DELAY_MS)
    }

    const verifySession = async () => {
      try {
        const response = await fetchApi('/auth/me')
        if (cancelled) return

        if (response.status === 401 || response.status === 403) {
          setStatus('unauthenticated')
          return
        }

        if (!response.ok) {
          scheduleRetry()
          return
        }

        const user = (await response.json()) as { roles?: string[] }
        if (cancelled) return
        setStatus(user.roles?.includes('ADMIN') === true ? 'authenticated' : 'unauthenticated')
      } catch {
        scheduleRetry()
      }
    }

    void verifySession()

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [])

  useEffect(() => {
    if (status !== 'authenticated') return

    return subscribeToSessionExpired(() => {
      setStatus('unauthenticated')
      setLoginError('Your admin session expired. Please sign in again.')
    })
  }, [status])

  const login = useCallback(async (email: string, password: string) => {
    setLoginError(null)
    setLoginPending(true)

    try {
      const response = await fetchApi('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!response.ok) {
        setLoginError('Sign-in failed')
        return
      }

      const profile = await fetchApi('/auth/me')
      if (!profile.ok) {
        setLoginError('Unable to verify the dashboard session')
        return
      }

      const user = (await profile.json()) as { roles?: string[] }
      if (!user.roles?.includes('ADMIN')) {
        setLoginError('This account is not an administrator')
        return
      }

      setStatus('authenticated')
    } catch {
      setLoginError('Unable to reach the Velora API. Please try again.')
    } finally {
      setLoginPending(false)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetchApi('/auth/logout', { method: 'POST' })
    } finally {
      setStatus('unauthenticated')
      setLoginError(null)
    }
  }, [])

  const value = useMemo(
    () => ({ status, loginError, loginPending, login, logout }),
    [status, loginError, loginPending, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
