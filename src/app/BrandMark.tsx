import veloraMark from '@/assets/velora-mark.png'

import { cn } from '@/shared/lib/cn'

/* The real Velora mark (cropped from the official app icon). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={veloraMark}
      alt=""
      aria-hidden="true"
      className={cn('shrink-0 rounded-[10px] object-cover', className)}
    />
  )
}
