import { Moon, Sun } from 'lucide-react'

import { cn } from '../lib/cn'
import { useTheme } from './ThemeProvider'

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-control border border-line bg-transparent text-ink-2',
        'transition-colors duration-150 hover:border-line-strong hover:bg-raised hover:text-ink',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        className,
      )}
      onClick={toggleTheme}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  )
}
