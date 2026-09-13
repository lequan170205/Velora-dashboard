import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { ThemeProvider } from '../shared/theme/ThemeProvider'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Every view renders its own inline error/stale state and keeps polling;
      // in-flight retries would only delay those states.
      retry: false,
      refetchOnWindowFocus: true,
    },
  },
})

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  )
}
