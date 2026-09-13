import type { NoteVm } from '../types'

export function NoteCard({ note }: { note: NoteVm }) {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-card border border-line bg-raised/60 px-4 py-3"
    >
      {note.mark && (
        <span
          aria-hidden="true"
          className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand"
        >
          {note.mark}
        </span>
      )}
      <div className="min-w-0">
        {note.title && <p className="text-[13px] font-semibold text-ink">{note.title}</p>}
        {note.lines.map((line) => (
          <p key={line} className="text-[13px] leading-relaxed text-ink-2">
            {line}
          </p>
        ))}
      </div>
      {note.badge && (
        <span className="ml-auto shrink-0 self-center whitespace-nowrap rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-3">
          {note.badge}
        </span>
      )}
    </div>
  )
}
