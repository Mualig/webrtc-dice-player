import { useEffect, useState } from 'react'
import {
  LAST,
  LOCK_THRESHOLD,
  MAX_PENALTIES,
  PENALTY_VALUE,
  ROW_LENGTH,
  ROW_STYLES,
  SCORE_ROWS,
  canToggle,
  countMarks,
  emptyMarks,
  isLocked,
  rowScore,
  type RowColor,
  type ScoreMarks,
} from '../scorecard'

const STORAGE_KEY = 'webrtc-dice-player-scorecard'

type CardState = { marks: ScoreMarks; penalties: number }

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
    return { marks, penalties }
  } catch {
    return { marks: emptyMarks(), penalties: 0 }
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
  onToggle,
}: Readonly<{
  color: RowColor
  numbers: number[]
  row: boolean[]
  onToggle: (color: RowColor, index: number) => void
}>) {
  const style = ROW_STYLES[color]
  const locked = isLocked(row)
  const lockActive = canToggle(row, LAST)

  return (
    <div className={`flex items-center gap-1.5 rounded-xl p-1.5 ${style.bar}`}>
      <DirectionArrow />
      {numbers.map((n, i) => {
        const marked = row[i]
        const interactive = canToggle(row, i)
        return (
          <button
            key={i}
            type="button"
            onClick={() => onToggle(color, i)}
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
        onClick={() => onToggle(color, LAST)}
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
export function Scorecard() {
  const [card, setCard] = useState<CardState>(loadState)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(card))
  }, [card])

  function toggle(color: RowColor, index: number) {
    setCard((prev) => {
      const row = prev.marks[color]
      if (!canToggle(row, index)) return prev
      const nextRow = row.slice()
      nextRow[index] = !nextRow[index]
      return { ...prev, marks: { ...prev.marks, [color]: nextRow } }
    })
  }

  function togglePenalty(index: number) {
    // Clicking a box fills up to it, or clears it and everything after.
    setCard((prev) => ({ ...prev, penalties: index < prev.penalties ? index : index + 1 }))
  }

  function reset() {
    setCard({ marks: emptyMarks(), penalties: 0 })
  }

  const scores = SCORE_ROWS.map((r) => rowScore(card.marks[r.color]))
  const penaltyTotal = card.penalties * PENALTY_VALUE
  const grandTotal = scores.reduce((a, b) => a + b, 0) - penaltyTotal
  const anyMarks = SCORE_ROWS.some((r) => countMarks(card.marks[r.color]) > 0) || card.penalties > 0

  return (
    <section className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-lg">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-zinc-900">Qwixx scorecard</h2>
          <p className="text-xs text-zinc-400">{`Cross off numbers left to right · lock a row after ${LOCK_THRESHOLD} X’s`}</p>
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={!anyMarks}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-40"
        >
          Reset card
        </button>
      </header>

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max flex-col gap-2">
          {SCORE_ROWS.map(({ color, numbers }) => (
            <Row key={color} color={color} numbers={numbers} row={card.marks[color]} onToggle={toggle} />
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
