import type { GameOverReason } from '../scorecard'
import { END_REASON_TEXT } from './endReasonText'

// The final-turn banner: the end condition has been met, but instead of cutting
// everyone off instantly the game pauses rolling and lets every player finish
// marking off the current roll (per the paper rules, a lock — or the end — takes
// effect only when the turn is over). Each player confirms with the Done button;
// the game truly ends (see App) once the whole room has confirmed. Styled as the
// calm counterpart of GameOverBanner — the two are stages of the same moment.
export function FinalTurnBanner({
  reason,
  confirmed,
  waitingOn,
  onDone,
}: Readonly<{
  reason: GameOverReason
  // Whether the local player has already confirmed they're done.
  confirmed: boolean
  // Names of the players the room is still waiting on.
  waitingOn: string[]
  onDone: () => void
}>) {
  return (
    <div
      role="status"
      className="w-full max-w-md rounded-2xl border border-sky-300 bg-sky-50 px-6 py-5 text-center shadow-sm"
    >
      <p className="text-xl font-bold text-sky-900">🏁 Final turn</p>
      <p className="mt-1 text-sm text-sky-800">
        {END_REASON_TEXT[reason].pending}
        {' '}Finish your marks for this roll — the game ends when everyone is done.
      </p>
      {confirmed ? (
        <p className="mt-4 text-sm font-medium text-sky-700">Waiting for {waitingOn.join(', ')}…</p>
      ) : (
        <button
          type="button"
          onClick={onDone}
          className="mt-4 rounded-full bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 active:scale-95"
        >
          I’m done
        </button>
      )}
    </div>
  )
}
