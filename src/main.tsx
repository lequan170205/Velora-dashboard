import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import { App } from './app/App'
import { AppProviders } from './app/providers'
import './styles/index.css'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Dashboard root element was not found')
}

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
)
