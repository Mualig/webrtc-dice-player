import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LAST,
  LOCK_THRESHOLD,
  MAX_PENALTIES,
  PENALTY_VALUE,
  ROW_LENGTH,
  ROW_STYLES,
  SCORE_ROWS,
  canMark,
  cardSummary,
  countMarks,
  emptyMarks,
  isLocked,
  type CardAction,
  type CardSummary,
  type MoveEvent,
  type RowColor,
  type ScoreMarks,
} from '../scorecard'
import { TotalsRow } from './TotalsRow'

const STORAGE_KEY = 'webrtc-dice-player-scorecard'

// A move in the local undo log: its stable `id` (so undo can name the exact feed
// entry it reverts) plus the `action` describing how to revert it.
type LoggedAction = { id: number; action: CardAction }

// `history` is the ordered log of moves this session, newest last; Undo pops it.
// It is deliberately not persisted — only the resulting marks/penalties are (see
// the effect below) — so Undo is scoped to the current session.
type CardState = { marks: ScoreMarks; penalties: number; history: LoggedAction[] }

// A fresh, empty card — the starting state and what Reset / a new game clear to.
function blankCard(): CardState {
  return { marks: emptyMarks(), penalties: 0, history: [] }
}

// Restore a saved card, tolerating anything malformed in storage.
function loadState(): CardState {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '')
    const marks = emptyMarks()
    for (const { color } of SCORE_ROWS) {
      const saved = parsed?.marks?.[color]
      if (Array.isArray(saved) && saved.length === ROW_LENGTH) marks[color] = saved.map(Boolean)
    }
    const penalties = Math.min(MAX_PENALTIES, Math.max(0, Math.floor(Number(parsed?.penalties)) || 0))
    return { marks, penalties, history: [] }
  } catch {
    return blankCard()
  }
}

// A hand-drawn-looking cross drawn over a crossed-off cell.
function Cross({ className }: Readonly<{ className: string }>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      className={`pointer-events-none absolute inset-1 ${className}`}
      aria-hidden="true"
    >
      <path d="M5 5 19 19M19 5 5 19" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

// A right-pointing marker echoing the direction arrows printed on the card.
function DirectionArrow() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0 text-white/80" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function Row({
  color,
  numbers,
  row,
  onMark,
  closed = false,
  frozen = false,
}: Readonly<{
  color: RowColor
  numbers: number[]
  row: boolean[]
  onMark: (color: RowColor, index: number) => void
  // True when this color is locked by *anyone* in the room — the row is out of
  // play for everyone, so every cell (and the lock) is disabled and shown locked.
  closed?: boolean
  // True once the game has ended: every cell is disabled, but rows that aren't
  // actually locked stay un-crossed (no misleading lock mark on the whole board).
  frozen?: boolean
}>) {
  const style = ROW_STYLES[color]
  const locked = isLocked(row)
  // The row takes no input when it's closed (locked room-wide) or frozen (game over).
  const blocked = closed || frozen
  const lockActive = !blocked && canMark(row, LAST)

  return (
    <div className={`flex items-center gap-1.5 rounded-xl p-1.5 ${style.bar}`}>
      <DirectionArrow />
      {numbers.map((n, i) => {
        const marked = row[i]
        const interactive = !blocked && canMark(row, i)
        return (
          <button
            key={i}
            type="button"
            onClick={() => onMark(color, i)}
            disabled={!interactive}
            aria-pressed={marked}
            aria-label={`${color} ${n}${marked ? ', crossed off' : ''}`}
            className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base font-bold sm:h-10 sm:w-10 ${style.cell} ${style.number} transition ${
              interactive ? 'cursor-pointer hover:brightness-95' : 'cursor-default'
            } ${!marked && !interactive ? 'opacity-45' : ''}`}
          >
            <span className={marked ? 'opacity-40' : ''}>{n}</span>
            {marked && <Cross className={style.mark} />}
          </button>
        )
      })}
      <button
        type="button"
        onClick={() => onMark(color, LAST)}
        disabled={!lockActive}
        aria-label={`Lock ${color} row`}
        title={`Lock this row (needs at least ${LOCK_THRESHOLD} crosses)`}
        className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-2 ring-inset sm:h-10 sm:w-10 ${style.lock} ${
          lockActive ? 'cursor-pointer hover:brightness-110' : 'cursor-default opacity-45'
        }`}
      >
        <LockIcon />
        {(locked || closed) && <Cross className="text-white" />}
      </button>
    </div>
  )
}

// The player's own Qwixx scorecard: click numbers to cross them off (left to
// right only), cross the lock once a row has at least 5 X's, and tally penalties.
// Scores update live. State is local to this player and saved to localStorage.
// Each move is also reported via `onMove` so the app can broadcast it to the
// other players' activity feeds — the card itself stays room-agnostic.
export function Scorecard({
  onMove,
  onReport,
  lockedColors = [],
  gameOver = false,
  newGameSignal = 0,
}: Readonly<{
  onMove?: (event: MoveEvent) => void
  onReport?: (summary: CardSummary) => void
  // Colors locked by anyone in the room — those rows are closed for this card too.
  lockedColors?: RowColor[]
  // True once the game has ended (see App): the board is frozen. Undo/Reset stay
  // available so a triggering misclick can be taken back (which resumes play).
  gameOver?: boolean
  // Bumped by the app to start a new game for the room — clears this card.
  newGameSignal?: number
}>) {
  const [card, setCard] = useState<CardState>(loadState)
  // Monotonic id stamped on each move so undo can name the exact move it reverts.
  const nextMoveId = useRef(0)
  // Reset clears the whole card irreversibly, so it asks to confirm first.
  const [confirmingReset, setConfirmingReset] = useState(false)

  useEffect(() => {
    // Persist the scored state only; the move log is session-scoped (see CardState).
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ marks: card.marks, penalties: card.penalties }))
  }, [card])

  // Dismiss the reset confirmation on Escape (a backdrop handles click-away).
  useEffect(() => {
    if (!confirmingReset) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setConfirmingReset(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmingReset])

  // Handlers guard against no-ops on the *current* state (each click is its own
  // event, so `card` is up to date) and report the move only when one happened.
  // onMove fires outside the setCard updater so the updater stays side-effect free.
  function mark(color: RowColor, index: number) {
    // Guard the same rules the buttons enforce: nothing is dispatched once the
    // game is over, or for a cell whose color is closed (locked by anyone), or
    // that isn't markable right now.
    if (gameOver || lockedColors.includes(color) || !canMark(card.marks[color], index)) return
    // One payload serves both the local revert (CardAction) and the broadcast
    // (LoggedMove) — the `mark` variant is identical in both.
    const move = { type: 'mark' as const, color, index }
    const id = nextMoveId.current++
    setCard((prev) => {
      const nextRow = prev.marks[color].slice()
      nextRow[index] = true
      return { ...prev, marks: { ...prev.marks, [color]: nextRow }, history: [...prev.history, { id, action: move }] }
    })
    onMove?.({ type: 'move', id, move })
  }

  function addPenalty() {
    // Take one penalty. Like crossing off a number, it can't be taken back by
    // clicking again — only Undo clears it. No-op once the game is over or the
    // fourth penalty is already taken (the button only enables the next box).
    if (gameOver || card.penalties >= MAX_PENALTIES) return
    const id = nextMoveId.current++
    setCard((prev) => ({
      ...prev,
      penalties: prev.penalties + 1,
      history: [...prev.history, { id, action: { type: 'penalty', previous: prev.penalties } }],
    }))
    onMove?.({ type: 'move', id, move: { type: 'penalty' } })
  }

  // Revert the most recent move, drop it from the log, and name its id so the
  // shared feed strikes that exact entry.
  function undo() {
    const last = card.history[card.history.length - 1]
    if (!last) return
    setCard((prev) => {
      const history = prev.history.slice()
      const { action } = history.pop()!
      if (action.type === 'penalty') return { ...prev, penalties: action.previous, history }
      const nextRow = prev.marks[action.color].slice()
      nextRow[action.index] = false
      return { ...prev, marks: { ...prev.marks, [action.color]: nextRow }, history }
    })
    onMove?.({ type: 'undo', id: last.id })
  }

  function reset() {
    setCard(blankCard())
    setConfirmingReset(false)
  }

  // Clear the card when the app starts a new game (bumps newGameSignal). Skip the
  // initial mount, which is just the loaded/persisted card.
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    setCard(blankCard())
  }, [newGameSignal])

  // Memoized so it's computed once per card change and has a stable identity the
  // report effect below can depend on (a fresh object would fire it every render).
  const summary = useMemo(() => cardSummary(card.marks, card.penalties), [card])
  const anyMarks = SCORE_ROWS.some((r) => countMarks(card.marks[r.color]) > 0) || card.penalties > 0
  const canUndo = card.history.length > 0

  // Report our summary (score breakdown + locked colors) so the app can share it
  // with the room — driving the other-players board and the shared row/dice locks.
  useEffect(() => {
    onReport?.(summary)
  }, [summary, onReport])

  return (
    <section className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-lg">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-zinc-900">Qwixx scorecard</h2>
          <p className="text-xs text-zinc-400">{`Cross off numbers left to right · lock a row after ${LOCK_THRESHOLD} X’s`}</p>
        </div>
        <div className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="Undo the last move"
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => setConfirmingReset(true)}
            disabled={!anyMarks}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-40"
          >
            Reset card
          </button>

          {confirmingReset && (
            <>
              {/* Transparent click-away backdrop — mirrors the SidePanel pattern. */}
              <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setConfirmingReset(false)} />
              <div
                role="dialog"
                aria-label="Reset card?"
                className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-zinc-200 bg-white p-3 text-left shadow-xl"
              >
                <p className="text-sm text-zinc-600">
                  Reset the card? This clears every cross and penalty and can’t be undone.
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingReset(false)}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="overflow-x-auto pb-1">
        {/* items-center keeps each colored row only as wide as its content (arrow
            → cells → lock) — not stretched to fill a wider card — and centers it. */}
        <div className="flex min-w-max flex-col items-center gap-2">
          {SCORE_ROWS.map(({ color, numbers }) => (
            <Row
              key={color}
              color={color}
              numbers={numbers}
              row={card.marks[color]}
              onMark={mark}
              closed={lockedColors.includes(color)}
              frozen={gameOver}
            />
          ))}
        </div>
      </div>

      {/* Penalties: −5 each, up to four. */}
      <div className="mt-4 flex items-center gap-2">
        <span className="text-sm font-semibold text-zinc-600">Penalties</span>
        {Array.from({ length: MAX_PENALTIES }, (_, i) => {
          const active = i < card.penalties
          // Only the next empty box is interactive: you take one penalty at a
          // time, and can't take one back by clicking it (Undo does that). Filled
          // boxes and later ones are disabled; the still-out-of-reach ones dim.
          const interactive = !gameOver && i === card.penalties
          return (
            <button
              key={i}
              type="button"
              onClick={addPenalty}
              disabled={!interactive}
              aria-pressed={active}
              aria-label={`Penalty ${i + 1}`}
              className={`relative flex h-8 w-8 items-center justify-center rounded-md border-2 transition ${
                active ? 'border-zinc-800 text-zinc-800' : 'border-zinc-300 text-transparent enabled:hover:border-zinc-500'
              } ${!active && !interactive ? 'opacity-45' : ''}`}
            >
              {active && <Cross className="text-zinc-800" />}
            </button>
          )
        })}
        <span className="text-sm text-zinc-400">−{PENALTY_VALUE} each</span>
      </div>

      {/* Totals: red + yellow + green + blue − penalties = grand total. */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
        <span className="mr-1 text-sm font-semibold text-zinc-600">Totals</span>
        <TotalsRow totals={summary.totals} />
      </div>
    </section>
  )
}
