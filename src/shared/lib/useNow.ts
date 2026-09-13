import { useEffect, useState } from 'react'

/* Shared wall-clock ticker so relative ages ("Updated 1m ago") keep ticking. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])

  return now
}
