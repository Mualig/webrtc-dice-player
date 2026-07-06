import type { GameOverReason } from '../scorecard'

// How each end condition is described in the two stages of the game's end:
// `pending` while the final turn plays out, `final` once the game is over.
// FinalTurnBanner and GameOverBanner both read from this one map, so the
// wording of the two stages can't drift apart.
export const END_REASON_TEXT: Record<GameOverReason, { pending: string; final: string }> = {
  locks: { pending: 'Two rows are locked.', final: 'Two rows were locked.' },
  penalties: {
    pending: 'A player took their fourth penalty.',
    final: 'A player took their fourth penalty.',
  },
}
