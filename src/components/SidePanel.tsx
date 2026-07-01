import { useEffect, useState, type ReactNode } from 'react'
import { displayName } from '../format'

function IdentityFields({
  name,
  color,
  onNameChange,
  onColorChange,
}: Readonly<{
  name: string
  color: string
  onNameChange: (value: string) => void
  onColorChange: (value: string) => void
}>) {
  return (
    <div className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
        Your name &amp; color
      </span>
      <div className="flex gap-2">
        <input
          aria-label="Your name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Enter your name"
          maxLength={20}
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
        />
        <input
          type="color"
          aria-label="Your color"
          title="Pick your color"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-zinc-300 bg-white p-1"
        />
      </div>
    </div>
  )
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

// A left-hand slide-out drawer holding the player's identity (name + color) and
// the multiplayer "Play together" panel, so the main view stays focused on the
// dice and history. The toggle button lives in the top-left corner; opening it
// slides the panel in over a dimming backdrop, and Escape or a backdrop click
// closes it. `connected` drives a status dot on the toggle so players can tell
// they're in a room without opening the drawer. `children` render below the
// identity fields (the connection panel).
export function SidePanel({
  name,
  color,
  connected,
  onNameChange,
  onColorChange,
  children,
}: Readonly<{
  name: string
  color: string
  connected: boolean
  onNameChange: (value: string) => void
  onColorChange: (value: string) => void
  children?: ReactNode
}>) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  // Close on Escape while the drawer is open.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="fixed left-4 top-4 z-30 flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50"
      >
        <span className="relative">
          <GearIcon />
          {connected && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-green-500 ring-2 ring-white" />
          )}
        </span>
        <span
          className="h-3 w-3 rounded-full border border-zinc-300"
          style={{ backgroundColor: color }}
        />
        <span className="max-w-[8rem] truncate">{displayName(name, 'Player')}</span>
      </button>

      {/* Backdrop — fades in and captures clicks to close while open. */}
      <div
        onClick={close}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`fixed inset-y-0 left-0 z-50 flex w-80 max-w-[85vw] transform flex-col bg-white shadow-xl transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">Menu</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
          <IdentityFields
            name={name}
            color={color}
            onNameChange={onNameChange}
            onColorChange={onColorChange}
          />
          {children}
        </div>
      </aside>
    </>
  )
}
