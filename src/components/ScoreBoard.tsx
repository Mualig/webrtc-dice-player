import type { Player } from '../types'
import { EMPTY_SUMMARY, type CardSummary } from '../scorecard'
import { displayName } from '../format'
import { TotalsRow } from './TotalsRow'

// A card showing the other players in the room and their live score breakdowns
// (highest total first), each rendered like the scorecard's own Totals line. Your
// own score lives on your scorecard, so it's excluded here. `summaries` maps player
// id → card summary; a player with nothing reported yet reads as a blank card.
export function ScoreBoard({
  players,
  summaries,
  selfId,
  className = '',
}: Readonly<{
  players: Player[]
  summaries: Record<string, CardSummary>
  selfId: string
  className?: string
}>) {
  const others = players
    .filter((p) => p.id !== selfId)
    .map((p) => ({ player: p, totals: (summaries[p.id] ?? EMPTY_SUMMARY).totals }))
    .sort((a, b) => b.totals.total - a.totals.total)

  return (
    <section className={`w-full max-w-3xl rounded-2xl bg-white p-5 shadow-lg ${className}`}>
      <h2 className="mb-4 text-lg font-bold tracking-tight text-zinc-900">Other players</h2>
      {others.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-400">
          Waiting for other players to join…
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {others.map(({ player, totals }) => (
            <li
              key={player.id}
              style={{ borderColor: player.color || 'transparent' }}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border-2 bg-zinc-50 px-3 py-2"
            >
              <span className="font-medium text-zinc-700">{displayName(player.name)}</span>
              <TotalsRow totals={totals} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
