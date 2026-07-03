import type { CardSummary, GameOverReason } from '../scorecard'

// The end-of-game banner: why the game ended, plus a leaderboard of every player
// ranked by final total (winner first, with a trophy; the local player marked).
// `summaries` is the full set (self folded in by App); `resolveName` maps a peer
// id to a display name — the same resolve-function seam ActivityFeed uses.
export function GameOverBanner({
  summaries,
  selfId,
  reason,
  resolveName,
}: Readonly<{
  summaries: Record<string, CardSummary>
  selfId: string
  reason: GameOverReason
  resolveName: (id: string) => string
}>) {
  const standings = Object.entries(summaries)
    .map(([id, s]) => ({ id, name: resolveName(id), total: s.totals.total }))
    .sort((a, b) => b.total - a.total)

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
        {standings.map((p, i) => (
          <li
            key={p.id}
            className={`flex items-center justify-between gap-4 rounded-lg px-3 py-2 text-sm text-amber-900 ${
              i === 0 ? 'bg-amber-200/70 font-bold' : 'bg-white/60'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-center tabular-nums">{i === 0 ? '🏆' : i + 1}</span>
              <span>
                {p.name}
                {p.id === selfId && <span className="font-normal text-amber-700"> (you)</span>}
              </span>
            </span>
            <span className="shrink-0 tabular-nums font-semibold">{p.total}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
