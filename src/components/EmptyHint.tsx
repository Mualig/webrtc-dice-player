import type { ReactNode } from 'react'

// The dashed placeholder shown by a section with nothing to list yet — shared so
// every empty state reads the same.
export function EmptyHint({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-400">
      {children}
    </p>
  )
}
