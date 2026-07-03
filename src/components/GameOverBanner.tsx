import type { GameOverReason } from '../scorecard'
import type { PlayerResult } from '../gameHistory'

// The end-of-game banner: why the game ended, plus a leaderboard of every player
// ranked by final total (winner first, with a trophy; the local player marked).
// `players` is the ready-ranked standings computed by App — the same list that
// gets recorded to the local game history.
export function GameOverBanner({
  players,
  reason,
  onNewGame,
}: Readonly<{
  players: PlayerResult[]
  reason: GameOverReason
  // Start a fresh game for the whole room.
  onNewGame: () => void
}>) {
  return (
    <div
      role="status"
      className="w-full max-w-md rounded-2xl border border-amber-300 bg-amber-50 px-6 py-5 text-center shadow-sm"
    >
      <p className="text-xl font-bold text-amber-900">🎲 Game over</p>
      <p className="mt-1 text-sm text-amber-800">
        {reason === 'locks' ? 'Two rows were locked.' : 'A player took their fourth penalty.'}
      </p>
      <ol className="mt-4 flex flex-col gap-1.5 text-left">
        {players.map((p, i) => (
          <li
            key={i}
            className={`flex items-center justify-between gap-4 rounded-lg px-3 py-2 text-sm text-amber-900 ${
              i === 0 ? 'bg-amber-200/70 font-bold' : 'bg-white/60'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-center tabular-nums">{i === 0 ? '🏆' : i + 1}</span>
              <span>
                {p.name}
                {p.you && <span className="font-normal text-amber-700"> (you)</span>}
              </span>
            </span>
            <span className="shrink-0 tabular-nums font-semibold">{p.total}</span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onNewGame}
        className="mt-4 rounded-full bg-amber-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 active:scale-95"
      >
        New game
      </button>
    </div>
  )
}
