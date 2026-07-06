import { isGameOverReason, SCORE_ROWS } from './scorecard'
import type {
  CardSummary,
  Ending,
  LoggedMove,
  MoveEvent,
  RowColor,
  ScoreTotals,
} from './scorecard'

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
  | { type: 'newgame' } // client -> host: start a new game; host -> clients: reset for a new game
  | { type: 'rolling' } // host -> clients: a roll started (animate)
  | { type: 'state'; dice: Die[]; history: RollEntry[]; locked: RowColor[] } // host -> clients: authoritative dice/history + the locks in effect (snapshotted at each roll)
  | { type: 'hello'; id: string; name: string; color: string } // client -> host: my identity + name + color
  | { type: 'roster'; players: Player[] } // host -> clients: who's in the room
  | { type: 'action'; actor: Player; event: MoveEvent } // client -> host: a scorecard move or undo
  | { type: 'actions'; actions: ActionEntry[] } // host -> clients: the shared activity log
  | { type: 'score'; id: string; summary: CardSummary } // client -> host: my card summary (breakdown + locks)
  | { type: 'scores'; scores: Record<string, CardSummary> } // host -> clients: every player's summary, by id
  | { type: 'done'; id: string } // client -> host: I've made my final-turn marks — ready to end the game
  | ({ type: 'ending' } & Ending) // host -> clients: who confirmed the final turn, and the end once everyone has

// --- Runtime validation of incoming messages ------------------------------
// Wire data is untrusted — a buggy (or hostile) peer can send anything — so
// nothing gets cast blindly: every incoming payload goes through parseMessage,
// whose per-type parsers rebuild the message from type-guarded fields. The
// compiler checks the rebuilt literal against the variant, so a parser that
// skips a field won't compile, and unknown top-level fields are dropped rather
// than smuggled through. Checks are structural only; semantic nonsense (say,
// an out-of-range mark index) is tolerated the same way an off-rules mark from
// an honest client is.

const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isArrayOf = <T,>(v: unknown, item: (x: unknown) => x is T): v is T[] =>
  Array.isArray(v) && v.every(item)
const isRecordOf = <T,>(v: unknown, item: (x: unknown) => x is T): v is Record<string, T> =>
  isObj(v) && Object.values(v).every(item)

const isRowColor = (v: unknown): v is RowColor => SCORE_ROWS.some((r) => r.color === v)
const isDie = (v: unknown): v is Die =>
  isObj(v) && isStr(v.id) && (v.color === 'white' || isRowColor(v.color)) && isNum(v.value)
const isPlayer = (v: unknown): v is Player =>
  isObj(v) && isStr(v.id) && isStr(v.name) && isStr(v.color)
const isRollEntry = (v: unknown): v is RollEntry =>
  isObj(v) && isNum(v.id) && isArrayOf(v.dice, isDie) && isPlayer(v.roller)
const isLoggedMove = (v: unknown): v is LoggedMove =>
  isObj(v) && (v.type === 'penalty' || (v.type === 'mark' && isRowColor(v.color) && isNum(v.index)))
const isMoveEvent = (v: unknown): v is MoveEvent =>
  isObj(v) && isNum(v.id) && (v.type === 'undo' || (v.type === 'move' && isLoggedMove(v.move)))
const isActionEntry = (v: unknown): v is ActionEntry =>
  isObj(v) &&
  isStr(v.id) &&
  isPlayer(v.actor) &&
  isLoggedMove(v.move) &&
  (v.undone === undefined || typeof v.undone === 'boolean')
const isTotals = (v: unknown): v is ScoreTotals =>
  isObj(v) && isArrayOf(v.rows, isNum) && isNum(v.penaltyTotal) && isNum(v.total)
const isCardSummary = (v: unknown): v is CardSummary =>
  isObj(v) && isTotals(v.totals) && isArrayOf(v.locked, isRowColor)

// One parser per message type, run against the already-object payload. Each
// rebuilds its variant from guard-narrowed fields — no cast anywhere, so the
// compiler verifies every field was actually checked. Keyed by the
// discriminant, and the mapped type demands exactly one entry per Message
// variant — extending the union above without a parser won't compile.
const MESSAGE_PARSERS: {
  [T in Message['type']]: (m: Record<string, unknown>) => Extract<Message, { type: T }> | null
} = {
  roll: (m) => (isPlayer(m.roller) ? { type: 'roll', roller: m.roller } : null),
  clear: () => ({ type: 'clear' }),
  newgame: () => ({ type: 'newgame' }),
  rolling: () => ({ type: 'rolling' }),
  state: (m) =>
    isArrayOf(m.dice, isDie) && isArrayOf(m.history, isRollEntry) && isArrayOf(m.locked, isRowColor)
      ? { type: 'state', dice: m.dice, history: m.history, locked: m.locked }
      : null,
  hello: (m) =>
    isStr(m.id) && isStr(m.name) && isStr(m.color)
      ? { type: 'hello', id: m.id, name: m.name, color: m.color }
      : null,
  roster: (m) => (isArrayOf(m.players, isPlayer) ? { type: 'roster', players: m.players } : null),
  action: (m) =>
    isPlayer(m.actor) && isMoveEvent(m.event)
      ? { type: 'action', actor: m.actor, event: m.event }
      : null,
  actions: (m) => (isArrayOf(m.actions, isActionEntry) ? { type: 'actions', actions: m.actions } : null),
  score: (m) =>
    isStr(m.id) && isCardSummary(m.summary) ? { type: 'score', id: m.id, summary: m.summary } : null,
  scores: (m) => (isRecordOf(m.scores, isCardSummary) ? { type: 'scores', scores: m.scores } : null),
  done: (m) => (isStr(m.id) ? { type: 'done', id: m.id } : null),
  ending: (m) =>
    isArrayOf(m.ready, isStr) && (m.over === null || isGameOverReason(m.over))
      ? { type: 'ending', ready: m.ready, over: m.over }
      : null,
}

// Sound by construction: the table's keys are exactly Message['type'] (the
// mapped type allows no more, no less), and Object.hasOwn skips inherited
// members (`type: 'constructor'` must not match).
const isMessageType = (t: string): t is Message['type'] => Object.hasOwn(MESSAGE_PARSERS, t)

// Validate an incoming wire payload into a typed Message — or null for
// anything malformed, which the caller should drop.
export function parseMessage(msg: unknown): Message | null {
  if (!isObj(msg) || !isStr(msg.type) || !isMessageType(msg.type)) return null
  return MESSAGE_PARSERS[msg.type](msg)
}
