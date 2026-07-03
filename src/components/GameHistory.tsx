import { memo, useEffect } from 'react'
import type { GameRecord } from '../gameHistory'
import { EmptyHint } from './EmptyHint'
import { XIcon } from './XIcon'

const REASON_LABEL = { locks: 'two rows locked', penalties: 'fourth penalty' } as const

// Full-screen view of the games finished on this device, newest first — each with
// when and why it ended and the final standings (winner first, you marked).
// Opened from the menu; the Close button (or Escape) returns to the game, which
// stays mounted underneath the overlay. Memoized: it can hold up to MAX_GAMES
// formatted rows, and `games` only changes when a game is recorded or dropped.
export const GameHistory = memo(function GameHistory({
  games,
  onClose,
  onRemove,
}: Readonly<{
  games: GameRecord[]
  onClose: () => void
  // Remove one recorded game (each row's X button).
  onRemove: (game: GameRecord) => void
}>) {
  // Close on Escape, mirroring the menu drawer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Game history"
      className="fixed inset-0 z-50 overflow-y-auto bg-zinc-100"
    >
      <div className="mx-auto w-full max-w-2xl px-6 py-8">
        <header className="mb-6 flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">
            Game history
            {games.length > 0 && <span className="font-normal text-zinc-400"> · {games.length}</span>}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
          >
            Close
          </button>
        </header>
        {games.length === 0 ? (
          <EmptyHint>No finished games yet.</EmptyHint>
        ) : (
          <ol className="flex flex-col gap-3">
            {games.map((game) => {
              const when = new Date(game.endedAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })
              return (
                <li
                  key={game.endedAt}
                  className="flex items-start justify-between gap-3 rounded-xl bg-white p-4 shadow-sm"
                >
                  <div>
                    <p className="text-xs text-zinc-400">
                      {when}
                      {' · '}
                      {REASON_LABEL[game.reason]}
                    </p>
                    <p className="mt-1 text-sm text-zinc-700">
                      {game.players.map((p, i) => (
                        <span key={i}>
                          {i > 0 && <span className="text-zinc-300"> · </span>}
                          <span className={i === 0 ? 'font-semibold text-zinc-900' : ''}>
                            {i === 0 && '🏆 '}
                            {p.name}
                            {p.you && <span className="text-zinc-400"> (you)</span>}
                            {' '}
                            {p.total}
                          </span>
                        </span>
                      ))}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(game)}
                    aria-label={`Remove the game from ${when}`}
                    title="Remove this game from the history"
                    className="shrink-0 rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
})
