import type { Player } from '../types'
import { displayName } from '../format'

// A card showing the other players in the room and their live scorecard totals
// (highest first). Your own score lives on your scorecard, so it's excluded here.
// `scores` maps player id → total; a player with no reported score yet reads 0.
export function ScoreBoard({
  players,
  scores,
  selfId,
  className = '',
}: Readonly<{ players: Player[]; scores: Record<string, number>; selfId: string; className?: string }>) {
  const others = players
    .filter((p) => p.id !== selfId)
    .map((p) => ({ player: p, score: scores[p.id] ?? 0 }))
    .sort((a, b) => b.score - a.score)

  return (
    <section className={`w-full max-w-3xl rounded-2xl bg-white p-5 shadow-lg ${className}`}>
      <h2 className="mb-4 text-lg font-bold tracking-tight text-zinc-900">Other players</h2>
      {others.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-400">
          Waiting for other players to join…
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {others.map(({ player, score }) => (
            <li
              key={player.id}
              style={{ borderColor: player.color || 'transparent' }}
              className="flex items-center justify-between gap-3 rounded-lg border-2 bg-zinc-50 px-3 py-2"
            >
              <span className="font-medium text-zinc-700">{displayName(player.name)}</span>
              <span className="text-lg font-bold tabular-nums text-zinc-900">{score}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
