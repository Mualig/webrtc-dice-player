import { describe, it, expect, beforeEach } from 'vitest'
import {
  MAX_GAMES,
  addGame,
  loadGameHistory,
  sameOutcome,
  saveGameHistory,
  type GameRecord,
} from './gameHistory'

const game = (endedAt: number, total = 10): GameRecord => ({
  endedAt,
  reason: 'locks',
  players: [
    { name: 'Alice', total, you: true },
    { name: 'Bob', total: total - 5 },
  ],
})

describe('addGame', () => {
  it('prepends the newest game', () => {
    const next = addGame([game(1)], game(2))
    expect(next.map((g) => g.endedAt)).toEqual([2, 1])
  })

  it('caps the history at MAX_GAMES, dropping the oldest', () => {
    const full = Array.from({ length: MAX_GAMES }, (_, i) => game(MAX_GAMES - i)) // newest first
    const next = addGame(full, game(MAX_GAMES + 1))
    expect(next).toHaveLength(MAX_GAMES)
    expect(next[0].endedAt).toBe(MAX_GAMES + 1) // newest kept
    expect(next[next.length - 1].endedAt).toBe(2) // oldest (endedAt 1) dropped
  })
})

describe('sameOutcome', () => {
  it('matches records with the same standings regardless of when they ended', () => {
    expect(sameOutcome(game(1), game(2))).toBe(true)
  })

  it('matches a candidate whose players are a subset of the saved record', () => {
    // After a reload, remote players drop out of view — the re-detected game-over
    // only carries our own result, which is already part of the saved record.
    const soloView = game(2)
    soloView.players = [{ name: 'Alice', total: 10, you: true }]
    expect(sameOutcome(game(1), soloView)).toBe(true)
    // The reverse is not the same outcome: the candidate has players the saved
    // record doesn't know about.
    expect(sameOutcome(soloView, game(1))).toBe(false)
  })

  it('differs on totals, names, reason, or the you-flag', () => {
    expect(sameOutcome(game(1), game(1, 20))).toBe(false)
    expect(sameOutcome(game(1), { ...game(1), reason: 'penalties' })).toBe(false)
    const renamed = game(1)
    renamed.players = [{ ...renamed.players[0], name: 'Zoe' }, renamed.players[1]]
    expect(sameOutcome(game(1), renamed)).toBe(false)
    const notYou = game(1)
    notYou.players = [{ name: 'Alice', total: 10 }, notYou.players[1]]
    expect(sameOutcome(game(1), notYou)).toBe(false)
  })
})

describe('load/saveGameHistory', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips a saved history', () => {
    const games = [game(2), game(1)]
    saveGameHistory(games)
    expect(loadGameHistory()).toEqual(games)
  })

  it('returns an empty history when nothing is saved or storage is garbage', () => {
    expect(loadGameHistory()).toEqual([])
    localStorage.setItem('webrtc-dice-player-game-history', 'not json')
    expect(loadGameHistory()).toEqual([])
    localStorage.setItem('webrtc-dice-player-game-history', '{"nope":true}')
    expect(loadGameHistory()).toEqual([])
  })

  it('filters out malformed records but keeps valid ones', () => {
    localStorage.setItem(
      'webrtc-dice-player-game-history',
      JSON.stringify([game(1), { endedAt: 'nope' }, { endedAt: 2, reason: 'locks', players: [{ name: 3 }] }]),
    )
    expect(loadGameHistory()).toEqual([game(1)])
  })
})
