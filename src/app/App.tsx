import { RouterProvider } from 'react-router'

import { AuthProvider } from './providers/auth'
import { router } from './router'

export function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
