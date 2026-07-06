import { isGameOverReason } from './scorecard'
import type { GameOverReason } from './scorecard'

// One player's final result inside a recorded game — also what the game-over
// banner renders. `you` marks this device's player (histories are per-device,
// so each peer records the game from its own perspective).
export type PlayerResult = { name: string; total: number; you?: boolean }

// A finished game as saved to this device's history: when it ended, why, and
// the final standings (highest total first).
export type GameRecord = { endedAt: number; reason: GameOverReason; players: PlayerResult[] }

const STORAGE_KEY = 'webrtc-dice-player-game-history'

// Cap the saved history. A worst-case 4-player record is ~250 bytes of JSON
// (names are capped at 20 chars), so 100 games ≈ 25 KB — about 0.5% of the
// ~5 MB localStorage quota.
export const MAX_GAMES = 100

// Restore the saved history, tolerating anything malformed in storage.
export function loadGameHistory(): GameRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (g) =>
          typeof g?.endedAt === 'number' &&
          isGameOverReason(g?.reason) &&
          Array.isArray(g?.players) &&
          g.players.every((p: PlayerResult | null) => typeof p?.name === 'string' && typeof p?.total === 'number'),
      )
      .slice(0, MAX_GAMES)
  } catch {
    return []
  }
}

export function saveGameHistory(games: GameRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(games))
}

// Prepend a newly finished game, keeping only the newest MAX_GAMES.
export function addGame(games: GameRecord[], record: GameRecord): GameRecord[] {
  return [record, ...games].slice(0, MAX_GAMES)
}

// Whether `candidate` re-detects the outcome already recorded as `saved`: the
// same end condition, with every candidate result already in the saved record.
// Used to avoid re-recording a game-over that is detected again after a page
// reload — where remote players may have dropped out of view, so the candidate
// can be a subset of the saved standings (never more).
export function sameOutcome(saved: GameRecord, candidate: GameRecord): boolean {
  return (
    saved.reason === candidate.reason &&
    candidate.players.every((p) =>
      saved.players.some((q) => q.name === p.name && q.total === p.total && !!q.you === !!p.you),
    )
  )
}
