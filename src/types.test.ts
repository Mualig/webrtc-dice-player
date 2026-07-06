import { describe, it, expect } from 'vitest'
import { parseMessage } from './types'
import type { Message } from './types'

const player = { id: 'p1', name: 'Alice', color: '#f00' }
const summary = { totals: { rows: [1, 0, 0, 0], penaltyTotal: 5, total: -4 }, locked: ['red' as const] }
const die = { id: 'w1', color: 'white' as const, value: 3 }

describe('parseMessage', () => {
  it('accepts every well-formed message type, returning an equal message', () => {
    const messages: Message[] = [
      { type: 'roll', roller: player },
      { type: 'clear' },
      { type: 'newgame' },
      { type: 'rolling' },
      { type: 'state', dice: [die], history: [{ id: 1, dice: [die], roller: player }], locked: ['red'] },
      { type: 'hello', id: 'p1', name: 'Alice', color: '#f00' },
      { type: 'roster', players: [player] },
      { type: 'action', actor: player, event: { type: 'move', id: 0, move: { type: 'mark', color: 'red', index: 2 } } },
      { type: 'action', actor: player, event: { type: 'undo', id: 0 } },
      { type: 'actions', actions: [{ id: 'p1-0', actor: player, move: { type: 'penalty' }, undone: true }] },
      { type: 'score', id: 'p1', summary },
      { type: 'scores', scores: { p1: summary } },
      { type: 'done', id: 'p1' },
      { type: 'ending', ready: ['p1'], over: null },
      { type: 'ending', ready: [], over: 'locks' },
    ]
    for (const m of messages) expect(parseMessage(m), JSON.stringify(m)).toEqual(m)
  })

  it('rejects non-objects and unknown or missing types', () => {
    for (const junk of [null, undefined, 42, 'state', [], {}, { type: 42 }, { type: 'nope' }]) {
      expect(parseMessage(junk), JSON.stringify(junk ?? 'undefined')).toBeNull()
    }
  })

  it('rejects a known type carrying a malformed payload', () => {
    const bad = [
      { type: 'roll' }, // no roller at all
      { type: 'roll', roller: { id: 'p1' } }, // partial player
      { type: 'state', dice: 'lol', history: [], locked: [] },
      { type: 'state', dice: [{ id: 'w1', color: 'purple', value: 3 }], history: [], locked: [] },
      { type: 'state', dice: [die], history: [{ id: 1, dice: [die] }], locked: [] }, // entry missing roller
      { type: 'state', dice: [die], history: [], locked: ['mauve'] },
      { type: 'hello', id: 'p1', name: 'Alice' }, // missing color
      { type: 'roster', players: [player, 'ghost'] },
      { type: 'action', actor: player, event: { type: 'move', id: 0, move: { type: 'mark', color: 'red' } } }, // mark without index
      { type: 'actions', actions: [{ id: 'p1-0', actor: player, move: { type: 'penalty' }, undone: 'yes' }] },
      { type: 'score', id: 'p1', summary: { totals: { rows: 'x', penaltyTotal: 0, total: 0 }, locked: [] } },
      { type: 'scores', scores: { p1: { locked: [] } } }, // summary without totals
      { type: 'done', id: 7 },
      { type: 'ending', ready: [7], over: null },
      { type: 'ending', ready: [], over: 'boredom' },
    ]
    for (const m of bad) expect(parseMessage(m), JSON.stringify(m)).toBeNull()
  })

  it('is not fooled by inherited object members posing as a type', () => {
    expect(parseMessage({ type: 'constructor' })).toBeNull()
    expect(parseMessage({ type: 'toString' })).toBeNull()
  })

  it('drops unknown top-level fields instead of smuggling them through', () => {
    expect(parseMessage({ type: 'done', id: 'p1', extra: 'payload' })).toEqual({ type: 'done', id: 'p1' })
  })
})
