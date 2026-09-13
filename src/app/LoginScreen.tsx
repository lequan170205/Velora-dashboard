import { Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { Button, Input, Label } from '@/shared/components/ui'
import { useAuth } from './providers/auth'

export function LoginScreen() {
  const { login, loginError, loginPending } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!loginPending) void login(email, password)
  }

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-canvas px-4 font-sans text-ink">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(56% 44% at 18% 0%, rgba(129, 140, 248, 0.14), transparent 70%), radial-gradient(48% 40% at 85% 100%, rgba(167, 139, 250, 0.12), transparent 70%)',
        }}
      />

      <section className="relative w-full max-w-sm">
        <div className="rounded-dialog border border-line bg-panel shadow-modal">
          <form
            className="flex flex-col gap-4 p-6"
            onSubmit={onSubmit}
            aria-busy={loginPending}
            aria-labelledby="login-title"
          >
            <div className="flex flex-col items-center gap-2.5 text-center">
              <div
                aria-hidden="true"
                className="grid size-11 place-items-center rounded-[12px] bg-gradient-to-br from-brand to-violet text-lg font-semibold text-white shadow-pop"
              >
                V
              </div>
              <div>
                <h1 id="login-title" className="text-xl font-semibold text-ink">Velora</h1>
                <p className="text-[13px] text-ink-3">Operations</p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-email">Email address</Label>
              <Input
                id="login-email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@velora.app"
                autoComplete="email"
                disabled={loginPending}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                name="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={loginPending}
                required
              />
            </div>

            <Button type="submit" className="mt-1 w-full" disabled={loginPending}>
              {loginPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  <span>Signing in…</span>
                </>
              ) : (
                'Sign in'
              )}
            </Button>

            {loginError && (
              <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-[13px] text-bad">
                {loginError}
              </p>
            )}
          </form>
        </div>
      </section>
    </main>
  )
}
