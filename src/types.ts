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

// Messages exchanged between peers over the data channel.
export type Message =
  | { type: 'roll'; roller: Player } // client -> host: roll on my behalf, attributed to `roller`
  | { type: 'clear' } // client -> host: please clear history
  | { type: 'rolling' } // host -> clients: a roll started (animate)
  | { type: 'state'; dice: Die[]; history: RollEntry[] } // host -> clients: authoritative dice/history
  | { type: 'hello'; id: string; name: string; color: string } // client -> host: my identity + name + color
  | { type: 'roster'; players: Player[] } // host -> clients: who's in the room
