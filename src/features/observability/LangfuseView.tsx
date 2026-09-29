import { ExternalLink, LockKeyhole, TriangleAlert } from 'lucide-react'

import { EmptyState, buttonVariants } from '@/shared/components/ui'

const configuredUrl = import.meta.env.VITE_LANGFUSE_URL?.trim() ?? ''
const embedEnabled = import.meta.env.VITE_LANGFUSE_EMBED?.trim().toLowerCase() !== 'false'

const safeLangfuseUrl = (value: string) => {
  if (!value) return null
  try {
    const url = new URL(value)
    const localDevHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localDevHost)) return null
    return url.toString()
  } catch {
    return null
  }
}

const langfuseUrl = safeLangfuseUrl(configuredUrl)

export function LangfuseView() {
  if (!langfuseUrl) {
    return (
      <section className="flex flex-col gap-4" aria-labelledby="langfuse-view-title">
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Observability</p>
          <h2 id="langfuse-view-title" className="mt-1 text-xl font-semibold text-ink">Langfuse traces</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-2">
            Langfuse is self-hosted with Velora. Configure its public HTTPS origin in Vercel to open the trace UI here.
          </p>
        </header>
        <EmptyState
          icon={TriangleAlert}
          title="Langfuse URL is not configured"
          description="Set VITE_LANGFUSE_URL to an authenticated HTTPS reverse-proxy or tunnel URL. Never expose Langfuse keys in the Vercel app."
        />
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="langfuse-view-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Observability</p>
          <h2 id="langfuse-view-title" className="mt-1 text-xl font-semibold text-ink">Langfuse traces</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-2">
            Trace and evaluate RAG workflows in the self-hosted Langfuse UI. Credentials stay at the Langfuse origin.
          </p>
        </div>
        <a
          href={langfuseUrl}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: 'secondary', size: 'sm' })}
        >
            <ExternalLink size={14} aria-hidden="true" />
            Open in new tab
        </a>
      </header>

      <div className="flex items-center gap-2 rounded-card border border-line bg-panel px-4 py-3 text-xs text-ink-2">
        <LockKeyhole size={14} aria-hidden="true" className="shrink-0 text-ok" />
        <span>Only the configured Langfuse URL is exposed to the browser; API and secret keys are not.</span>
      </div>

      {embedEnabled ? (
        <div className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
          <iframe
            title="Langfuse observability"
            src={langfuseUrl}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-[min(78dvh,900px)] min-h-[560px] w-full border-0 bg-canvas"
          />
        </div>
      ) : (
        <EmptyState
          icon={ExternalLink}
          title="Open Langfuse in a separate tab"
          description="Embedding is disabled by VITE_LANGFUSE_EMBED=false."
          action={(
            <a
              href={langfuseUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
                <ExternalLink size={14} aria-hidden="true" />
                Open Langfuse
            </a>
          )}
        />
      )}
    </section>
  )
}
