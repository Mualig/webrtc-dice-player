// Qwixx scorecard model + styling, kept separate from the component the way
// dice.ts keeps the dice config out of Dice.tsx.

export type RowColor = 'red' | 'yellow' | 'green' | 'blue'

// The four colored rows. Red/yellow ascend 2→12; green/blue descend 12→2. Every
// row is 11 numbers wide, and its *last* number is the one that locks the row.
export const SCORE_ROWS: { color: RowColor; numbers: number[] }[] = [
  { color: 'red', numbers: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  { color: 'yellow', numbers: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  { color: 'green', numbers: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2] },
  { color: 'blue', numbers: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2] },
]

// Every row is the same width; derive it — and the locking index — from the row
// definition so this invariant lives in exactly one place.
export const ROW_LENGTH = SCORE_ROWS[0].numbers.length
export const LAST = ROW_LENGTH - 1 // index of each row's final (locking) number

// Points by number of crosses in a row (the lock counts as one extra cross).
// These are the triangular numbers printed on the card: 1→1, 2→3, 3→6, …, 12→78.
// Exported for reuse by a future in-menu rules cheat sheet, not just rowScore().
export const ROW_POINTS = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66, 78]

export const PENALTY_VALUE = 5
export const MAX_PENALTIES = 4
// A row's final number may only be crossed off — locking the row — once at least
// this many of the row's other numbers are already crossed ("At least 5 X's").
export const LOCK_THRESHOLD = 5

// Full, literal Tailwind class strings per row so Tailwind's scanner keeps them
// (dynamically-built class names would be purged from the build).
export const ROW_STYLES: Record<
  RowColor,
  { bar: string; cell: string; number: string; mark: string; lock: string; total: string }
> = {
  red: {
    bar: 'bg-red-500',
    cell: 'bg-red-50',
    number: 'text-red-600',
    mark: 'text-red-800',
    lock: 'bg-red-500 text-white ring-white',
    total: 'bg-red-50 text-red-700 ring-red-300',
  },
  yellow: {
    bar: 'bg-yellow-400',
    cell: 'bg-yellow-50',
    number: 'text-yellow-600',
    mark: 'text-yellow-800',
    lock: 'bg-yellow-400 text-white ring-white',
    total: 'bg-yellow-50 text-yellow-700 ring-yellow-300',
  },
  green: {
    bar: 'bg-green-600',
    cell: 'bg-green-50',
    number: 'text-green-700',
    mark: 'text-green-900',
    lock: 'bg-green-600 text-white ring-white',
    total: 'bg-green-50 text-green-800 ring-green-300',
  },
  blue: {
    bar: 'bg-blue-600',
    cell: 'bg-blue-50',
    number: 'text-blue-700',
    mark: 'text-blue-900',
    lock: 'bg-blue-600 text-white ring-white',
    total: 'bg-blue-50 text-blue-800 ring-blue-300',
  },
}

// A player's marks: for each row, which of its 11 positions are crossed off.
export type ScoreMarks = Record<RowColor, boolean[]>

export function emptyMarks(): ScoreMarks {
  return {
    red: Array(ROW_LENGTH).fill(false),
    yellow: Array(ROW_LENGTH).fill(false),
    green: Array(ROW_LENGTH).fill(false),
    blue: Array(ROW_LENGTH).fill(false),
  }
}

// One scoring move a player made. Kept as an ordered log so the latest move can
// be undone (crosses are otherwise permanent — see canMark) and, later, so each
// player's moves can be tracked and synced. A `mark` crosses off a cell; a
// `penalty` records the penalty count *before* the change so Undo can restore it.
export type CardAction =
  | { type: 'mark'; color: RowColor; index: number }
  | { type: 'penalty'; previous: number }

// A scorecard move as broadcast to the other players for the shared activity
// feed. Distinct from CardAction (the local undo log) in payload, not shape: a
// `penalty` records whether it was added or cleared (rather than the previous
// count Undo needs), and there is a first-class `undo` describing a reversal.
// A move that appears as its own feed entry: crossing off a cell, or a penalty
// (recording whether it was added or cleared, for display).
export type LoggedMove =
  | { type: 'mark'; color: RowColor; index: number }
  | { type: 'penalty'; filled: boolean }

// What the scorecard reports for each player action (via <Scorecard onMove>).
// A `move` carries a stable per-card id; an `undo` names the id of the move it
// reverts, so the shared feed strikes that exact entry rather than guessing by
// recency. The app namespaces the id with the actor's peer id for global uniqueness.
export type MoveEvent =
  | { type: 'move'; id: number; move: LoggedMove }
  | { type: 'undo'; id: number }

// Whether the given position may be crossed off right now, per Qwixx rules:
// only to the right of the last existing cross, and the locking number needs
// LOCK_THRESHOLD earlier crosses first. Crossing off is permanent — a mistake is
// reversed with Undo, not by clicking the cell again.
export function canMark(row: boolean[], index: number): boolean {
  if (row[index]) return false
  const rightmost = row.lastIndexOf(true)
  if (index <= rightmost) return false
  if (index === LAST && countMarks(row) < LOCK_THRESHOLD) return false
  return true
}

export function isLocked(row: boolean[]): boolean {
  return row[LAST]
}

export function countMarks(row: boolean[]): number {
  return row.filter(Boolean).length
}

// Row score: crosses plus one for the lock (only earned once the row is locked),
// looked up in the triangular-number table.
export function rowScore(row: boolean[]): number {
  const crosses = countMarks(row) + (isLocked(row) ? 1 : 0)
  return ROW_POINTS[crosses]
}

// The score breakdown shown on the Totals line: each row's score (in SCORE_ROWS
// order), the penalty deduction, and the grand total. Broadcast over the wire so
// other players' boards can show the same breakdown, not just the final number.
export type ScoreTotals = {
  rows: number[]
  penaltyTotal: number
  total: number
}

export function cardTotals(marks: ScoreMarks, penalties: number): ScoreTotals {
  const rows = SCORE_ROWS.map((r) => rowScore(marks[r.color]))
  const penaltyTotal = penalties * PENALTY_VALUE
  return { rows, penaltyTotal, total: rows.reduce((a, b) => a + b, 0) - penaltyTotal }
}

// A blank card's totals — the default for a player who hasn't reported yet.
export const EMPTY_TOTALS: ScoreTotals = cardTotals(emptyMarks(), 0)

// The number printed at a given position of a colored row (red/yellow ascend
// 2→12, green/blue descend 12→2) — used to describe a move in the activity feed.
export function cellNumber(color: RowColor, index: number): number {
  return SCORE_ROWS.find((r) => r.color === color)!.numbers[index]
}
