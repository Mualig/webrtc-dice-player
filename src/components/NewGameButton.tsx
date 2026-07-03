import { useState } from 'react'

// The menu action that starts a fresh game for the whole room. Because it wipes
// every player's card mid-game, it asks to confirm first (the game-over banner's
// New game button skips this — there, restarting is the expected next step).
export function NewGameButton({ onNewGame }: Readonly<{ onNewGame: () => void }>) {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 text-left">
        <p className="text-sm text-zinc-600">
          Start a new game? This clears every player’s card and can’t be undone.
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onNewGame()
              setConfirming(false)
            }}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-700"
          >
            New game
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
    >
      New game
    </button>
  )
}
