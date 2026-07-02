import { describe, it, expect } from 'vitest'
import {
  LAST,
  LOCK_THRESHOLD,
  MAX_PENALTIES,
  PENALTY_VALUE,
  ROW_LENGTH,
  ROW_POINTS,
  SCORE_ROWS,
  canMark,
  cellNumber,
  countMarks,
  emptyMarks,
  isLocked,
  rowScore,
} from './scorecard'

// Build a row with the given positions crossed off.
function rowWith(...indices: number[]): boolean[] {
  const row = Array(ROW_LENGTH).fill(false)
  for (const i of indices) row[i] = true
  return row
}

describe('constants', () => {
  it('a row is 11 numbers wide and locks on its last index', () => {
    expect(ROW_LENGTH).toBe(11)
    expect(LAST).toBe(ROW_LENGTH - 1)
    expect(LAST).toBe(10)
  })

  it('the lock and penalty rules match the printed card', () => {
    expect(LOCK_THRESHOLD).toBe(5)
    expect(PENALTY_VALUE).toBe(5)
    expect(MAX_PENALTIES).toBe(4)
  })

  it('ROW_POINTS are the triangular numbers on the card (crosses → points)', () => {
    expect(ROW_POINTS).toEqual([0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66, 78])
  })
})

describe('SCORE_ROWS layout', () => {
  it('has the four colored rows', () => {
    expect(SCORE_ROWS.map((r) => r.color)).toEqual(['red', 'yellow', 'green', 'blue'])
  })

  it('red and yellow ascend 2→12; green and blue descend 12→2', () => {
    const ascending = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    const descending = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]
    expect(SCORE_ROWS[0].numbers).toEqual(ascending) // red
    expect(SCORE_ROWS[1].numbers).toEqual(ascending) // yellow
    expect(SCORE_ROWS[2].numbers).toEqual(descending) // green
    expect(SCORE_ROWS[3].numbers).toEqual(descending) // blue
  })

  it('every row is ROW_LENGTH numbers wide', () => {
    for (const { numbers } of SCORE_ROWS) expect(numbers).toHaveLength(ROW_LENGTH)
  })
})

describe('emptyMarks', () => {
  it('starts every row blank at full width', () => {
    const marks = emptyMarks()
    expect(Object.keys(marks)).toEqual(['red', 'yellow', 'green', 'blue'])
    for (const color of ['red', 'yellow', 'green', 'blue'] as const) {
      expect(marks[color]).toHaveLength(ROW_LENGTH)
      expect(marks[color].every((m) => m === false)).toBe(true)
    }
  })
})

describe('canMark', () => {
  it('lets a fresh row cross off any number except the locking one', () => {
    const fresh = emptyMarks().red
    for (let i = 0; i < LAST; i++) expect(canMark(fresh, i)).toBe(true)
    // The final number locks the row and needs LOCK_THRESHOLD crosses first.
    expect(canMark(fresh, LAST)).toBe(false)
  })

  it('will not cross an already-crossed cell', () => {
    expect(canMark(rowWith(5), 5)).toBe(false)
  })

  it('only allows crossing to the right of the rightmost cross', () => {
    const row = rowWith(5)
    expect(canMark(row, 3)).toBe(false) // to the left — a skipped cell, lost forever
    expect(canMark(row, 6)).toBe(true) // to the right
    expect(canMark(row, 8)).toBe(true) // skipping ahead is allowed
  })

  it('unlocks the final number at exactly LOCK_THRESHOLD crosses', () => {
    expect(canMark(rowWith(0, 1, 2, 3), LAST)).toBe(false) // 4 crosses — not yet
    expect(canMark(rowWith(0, 1, 2, 3, 4), LAST)).toBe(true) // 5 crosses — now allowed
  })

  it('counts crosses regardless of gaps for the lock rule', () => {
    // 5 non-contiguous crosses still satisfy the threshold.
    expect(canMark(rowWith(0, 2, 4, 6, 8), LAST)).toBe(true)
  })
})

describe('crossing off is permanent', () => {
  it('never re-opens an already-crossed cell (no take-back — Undo handles that)', () => {
    // Once a cell is crossed, canMark stays false for it regardless of position.
    expect(canMark(rowWith(3, 7), 7)).toBe(false) // the rightmost cross
    expect(canMark(rowWith(3, 7), 3)).toBe(false) // an earlier cross
  })
})

describe('isLocked and countMarks', () => {
  it('locks only when the final number is crossed', () => {
    expect(isLocked(rowWith(0, 1, 2))).toBe(false)
    expect(isLocked(rowWith(0, 1, 2, 3, 4, LAST))).toBe(true)
  })

  it('counts crossed cells', () => {
    expect(countMarks(emptyMarks().red)).toBe(0)
    expect(countMarks(rowWith(1, 2, 3))).toBe(3)
  })
})

describe('rowScore', () => {
  it('scores an empty row as 0', () => {
    expect(rowScore(emptyMarks().red)).toBe(0)
  })

  it('scores an unlocked row by its cross count', () => {
    expect(rowScore(rowWith(0, 1, 2))).toBe(6) // 3 crosses → 6
    expect(rowScore(rowWith(0, 1, 2, 3, 4, 5))).toBe(21) // 6 crosses → 21
  })

  it('counts the lock as one extra cross', () => {
    // Minimum lock: 5 others + the final number = 6 crosses, + the lock = 7 → 28.
    expect(rowScore(rowWith(0, 1, 2, 3, 4, LAST))).toBe(28)
  })

  it('scores a fully crossed, locked row as the maximum 78', () => {
    const full = Array(ROW_LENGTH).fill(true)
    expect(rowScore(full)).toBe(78) // 11 crosses + lock = 12 → 78
  })
})

describe('cellNumber', () => {
  it('maps a row position to its printed number', () => {
    expect(cellNumber('red', 0)).toBe(2) // red/yellow ascend 2→12
    expect(cellNumber('yellow', LAST)).toBe(12)
    expect(cellNumber('blue', 0)).toBe(12) // green/blue descend 12→2
    expect(cellNumber('green', LAST)).toBe(2)
  })
})
