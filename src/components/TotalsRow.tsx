import { ROW_STYLES, SCORE_ROWS, type ScoreTotals } from '../scorecard'

function ScoreBox({ value, className }: Readonly<{ value: number; className: string }>) {
  return (
    <span
      className={`inline-flex h-9 min-w-11 items-center justify-center rounded-lg px-2 text-base font-bold tabular-nums ring-2 ring-inset ${className}`}
    >
      {value}
    </span>
  )
}

// The score breakdown as boxes — red + yellow + green + blue − penalties = total
// — shared by the scorecard's own Totals line and each other player's board row,
// so they read identically.
export function TotalsRow({ totals }: Readonly<{ totals: ScoreTotals }>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {SCORE_ROWS.map(({ color }, i) => (
        <span key={color} className="flex items-center gap-2">
          {i > 0 && <span className="text-zinc-400">+</span>}
          <ScoreBox value={totals.rows[i]} className={ROW_STYLES[color].total} />
        </span>
      ))}
      <span className="text-zinc-400">−</span>
      <ScoreBox value={totals.penaltyTotal} className="bg-zinc-100 text-zinc-600 ring-zinc-300" />
      <span className="text-zinc-400">=</span>
      <ScoreBox value={totals.total} className="bg-zinc-900 text-white ring-zinc-900" />
    </div>
  )
}
