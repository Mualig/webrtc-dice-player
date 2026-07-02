import type { ReactNode } from 'react'
import type { ActionEntry, Player } from '../types'
import { LAST, PENALTY_VALUE, ROW_STYLES, cellNumber, type LoggedMove } from '../scorecard'
import { displayName } from '../format'

// Human-readable description of a logged move, e.g. "crossed off green 10", with
// the colored part (the row color + its number) rendered in that row's own color
// — reusing the same text-color class the scorecard uses for its numbers. Undo
// is not described here: it strikes an existing entry rather than adding one.
function describeMove(move: LoggedMove): ReactNode {
  switch (move.type) {
    case 'mark': {
      const isLock = move.index === LAST
      const label = isLock ? `${move.color} row` : `${move.color} ${cellNumber(move.color, move.index)}`
      return (
        <>
          {isLock ? 'locked the ' : 'crossed off '}
          <span className={`font-semibold ${ROW_STYLES[move.color].number}`}>{label}</span>
        </>
      )
    }
    case 'penalty':
      return move.filled ? `took a −${PENALTY_VALUE} penalty` : 'cleared a penalty'
  }
}

// A shared, live feed of every player's scorecard moves. Each entry is
// attributed to its actor's *current* roster identity (name + color) — resolved
// by the parent, falling back to the move-time snapshot once they leave the room
// — exactly like the roll history's roller attribution.
export function ActivityFeed({
  actions,
  resolveActor,
}: Readonly<{ actions: ActionEntry[]; resolveActor: (actor: Player) => Player }>) {
  return (
    <section className="flex w-full max-w-md flex-col">
      <h2 className="mb-3 text-lg font-semibold text-zinc-900">Scorecard activity</h2>
      {actions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-400">
          No scorecard moves yet — players’ crosses and penalties show up here.
        </p>
      ) : (
        // On wide screens the row stretches this column to the scorecard's
        // height. The list is taken out of normal flow (absolute) so its own
        // length can't drive that height; it then fills the column and scrolls.
        <div className="min-h-0 xl:relative xl:flex-1">
          <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1 xl:absolute xl:inset-0 xl:max-h-none">
            {actions.map((entry) => {
              const actor = resolveActor(entry.actor)
              return (
                <li
                  key={entry.id}
                  style={{ borderColor: actor.color || 'transparent' }}
                  className={`flex items-center gap-2 rounded-lg border-2 bg-zinc-50 px-3 py-2 text-sm ${
                    entry.undone ? 'opacity-60 line-through' : ''
                  }`}
                >
                  <span className="font-medium text-zinc-700">{displayName(actor.name)}</span>
                  <span className="text-zinc-500">{describeMove(entry.move)}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
