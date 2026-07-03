import type { CardSummary, LoggedMove, MoveEvent } from './scorecard'

export type DiceColor = 'white' | 'red' | 'yellow' | 'green' | 'blue'

export type Die = {
  id: string
  color: DiceColor
  value: number
}

export type RollEntry = {
  id: number
  dice: Die[]
  // Who rolled. `roller.id` keys the live color lookup (the border follows that
  // player's current color); `name`/`color` snapshot the roll and are the
  // fallback once the player has left the room.
  roller: Player
}

export type Player = { id: string; name: string; color: string }

// A scorecard move by a player, for the shared activity feed. `actor` is the
// self-reported player (its id keys the live name/color lookup, exactly like
// RollEntry.roller); `id` is the actor's peer id namespaced with the card's own
// move id — globally unique and stable, so an undo can strike the exact entry.
// `undone` marks an entry the actor later reverted — it's struck, not removed.
export type ActionEntry = {
  id: string
  actor: Player
  move: LoggedMove
  undone?: boolean
}

// Messages exchanged between peers over the data channel.
export type Message =
  | { type: 'roll'; roller: Player } // client -> host: roll on my behalf, attributed to `roller`
  | { type: 'clear' } // client -> host: please clear history
  | { type: 'rolling' } // host -> clients: a roll started (animate)
  | { type: 'state'; dice: Die[]; history: RollEntry[] } // host -> clients: authoritative dice/history
  | { type: 'hello'; id: string; name: string; color: string } // client -> host: my identity + name + color
  | { type: 'roster'; players: Player[] } // host -> clients: who's in the room
  | { type: 'action'; actor: Player; event: MoveEvent } // client -> host: a scorecard move or undo
  | { type: 'actions'; actions: ActionEntry[] } // host -> clients: the shared activity log
  | { type: 'score'; id: string; summary: CardSummary } // client -> host: my card summary (breakdown + locks)
  | { type: 'scores'; scores: Record<string, CardSummary> } // host -> clients: every player's summary, by id
