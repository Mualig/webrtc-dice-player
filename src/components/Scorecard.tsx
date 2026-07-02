import { useEffect, useRef, useState } from 'react'
import {
  LAST,
  LOCK_THRESHOLD,
  MAX_PENALTIES,
  PENALTY_VALUE,
  ROW_LENGTH,
  ROW_STYLES,
  SCORE_ROWS,
  canMark,
  countMarks,
  emptyMarks,
  isLocked,
  rowScore,
  type CardAction,
  type MoveEvent,
  type RowColor,
  type ScoreMarks,
} from '../scorecard'

const STORAGE_KEY = 'webrtc-dice-player-scorecard'

// A move in the local undo log: its stable `id` (so undo can name the exact feed
// entry it reverts) plus the `action` describing how to revert it.
type LoggedAction = { id: number; action: CardAction }

// `history` is the ordered log of moves this session, newest last; Undo pops it.
// It is deliberately not persisted — only the resulting marks/penalties are (see
// the effect below) — so Undo is scoped to the current session.
type CardState = { marks: ScoreMarks; penalties: number; history: LoggedAction[] }

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
    return { marks: emptyMarks(), penalties: 0, history: [] }
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
}: Readonly<{
  color: RowColor
  numbers: number[]
  row: boolean[]
  onMark: (color: RowColor, index: number) => void
}>) {
  const style = ROW_STYLES[color]
  const locked = isLocked(row)
  const lockActive = canMark(row, LAST)

  return (
    <div className={`flex items-center gap-1.5 rounded-xl p-1.5 ${style.bar}`}>
      <DirectionArrow />
      {numbers.map((n, i) => {
        const marked = row[i]
        const interactive = canMark(row, i)
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
        {locked && <Cross className="text-white" />}
      </button>
    </div>
  )
}

function ScoreBox({ value, className }: Readonly<{ value: number; className: string }>) {
  return (
    <span
      className={`inline-flex h-9 min-w-11 items-center justify-center rounded-lg px-2 text-base font-bold tabular-nums ring-2 ring-inset ${className}`}
    >
      {value}
    </span>
  )
}

// The player's own Qwixx scorecard: click numbers to cross them off (left to
// right only), cross the lock once a row has at least 5 X's, and tally penalties.
// Scores update live. State is local to this player and saved to localStorage.
// Each move is also reported via `onMove` so the app can broadcast it to the
// other players' activity feeds — the card itself stays room-agnostic.
export function Scorecard({
  onMove,
  onScore,
}: Readonly<{ onMove?: (event: MoveEvent) => void; onScore?: (total: number) => void }>) {
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
    if (!canMark(card.marks[color], index)) return
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

  function togglePenalty(index: number) {
    // Clicking a box fills up to it, or clears it and everything after. Decide
    // the new count once (each click is its own event, so `card` is current).
    const next = index < card.penalties ? index : index + 1
    const id = nextMoveId.current++
    setCard((prev) => ({
      ...prev,
      penalties: next,
      history: [...prev.history, { id, action: { type: 'penalty', previous: prev.penalties } }],
    }))
    onMove?.({ type: 'move', id, move: { type: 'penalty', filled: next > card.penalties } })
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
    setCard({ marks: emptyMarks(), penalties: 0, history: [] })
    setConfirmingReset(false)
  }

  const scores = SCORE_ROWS.map((r) => rowScore(card.marks[r.color]))
  const penaltyTotal = card.penalties * PENALTY_VALUE
  const grandTotal = scores.reduce((a, b) => a + b, 0) - penaltyTotal
  const anyMarks = SCORE_ROWS.some((r) => countMarks(card.marks[r.color]) > 0) || card.penalties > 0
  const canUndo = card.history.length > 0

  // Report our running total so the app can share it in the other-players board.
  useEffect(() => {
    onScore?.(grandTotal)
  }, [grandTotal, onScore])

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
            <Row key={color} color={color} numbers={numbers} row={card.marks[color]} onMark={mark} />
          ))}
        </div>
      </div>

      {/* Penalties: −5 each, up to four. */}
      <div className="mt-4 flex items-center gap-2">
        <span className="text-sm font-semibold text-zinc-600">Penalties</span>
        {Array.from({ length: MAX_PENALTIES }, (_, i) => {
          const active = i < card.penalties
          return (
            <button
              key={i}
              type="button"
              onClick={() => togglePenalty(i)}
              aria-pressed={active}
              aria-label={`Penalty ${i + 1}`}
              className={`relative flex h-8 w-8 items-center justify-center rounded-md border-2 transition ${
                active ? 'border-zinc-800 text-zinc-800' : 'border-zinc-300 text-transparent hover:border-zinc-500'
              }`}
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
        {SCORE_ROWS.map(({ color }, i) => (
          <span key={color} className="flex items-center gap-2">
            {i > 0 && <span className="text-zinc-400">+</span>}
            <ScoreBox value={scores[i]} className={ROW_STYLES[color].total} />
          </span>
        ))}
        <span className="text-zinc-400">−</span>
        <ScoreBox value={penaltyTotal} className="bg-zinc-100 text-zinc-600 ring-zinc-300" />
        <span className="text-zinc-400">=</span>
        <ScoreBox value={grandTotal} className="bg-zinc-900 text-white ring-zinc-900" />
      </div>
    </section>
  )
}
