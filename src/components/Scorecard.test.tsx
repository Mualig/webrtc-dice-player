import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Scorecard } from './Scorecard'

// The six score boxes in the totals row, in order: red, yellow, green, blue,
// penalty, grand total. Each box renders its number as a bare text node, so we
// scope to the "Totals" row and match the pure-integer spans (operators and
// labels are skipped; number cells elsewhere are out of scope).
function totals() {
  const row = screen.getByText('Totals').closest('div') as HTMLElement
  const [red, yellow, green, blue, penalty, grand] = within(row)
    .getAllByText(/^-?\d+$/)
    .map((el) => Number(el.textContent))
  return { red, yellow, green, blue, penalty, grand }
}

const cell = (name: string) => screen.getByRole('button', { name })

describe('<Scorecard />', () => {
  it('renders the four rows and starts blank with a zero total', () => {
    render(<Scorecard />)
    expect(screen.getByRole('heading', { name: 'Qwixx scorecard' })).toBeInTheDocument()
    // Red/yellow ascend (2 first), green/blue descend (12 first).
    expect(cell('red 2')).toBeInTheDocument()
    expect(cell('blue 12')).toBeInTheDocument()
    expect(totals()).toEqual({ red: 0, yellow: 0, green: 0, blue: 0, penalty: 0, grand: 0 })
    expect(cell('Undo')).toBeDisabled()
  })

  it('crosses off a number and updates its state and the total', async () => {
    const user = userEvent.setup()
    render(<Scorecard />)

    await user.click(cell('red 7'))

    expect(cell('red 7, crossed off')).toHaveAttribute('aria-pressed', 'true')
    // One cross scores 1 point, so red and the grand total both read 1.
    expect(totals().red).toBe(1)
    expect(totals().grand).toBe(1)
  })

  it('enforces left-to-right crossing', async () => {
    const user = userEvent.setup()
    render(<Scorecard />)

    await user.click(cell('red 7')) // index 5

    expect(cell('red 4')).toBeDisabled() // to the left — now locked out
    expect(cell('red 9')).toBeEnabled() // to the right — still open
  })

  it('does not take back a cross when the crossed cell is clicked again', async () => {
    const user = userEvent.setup()
    render(<Scorecard />)

    await user.click(cell('red 7'))
    const crossed = cell('red 7, crossed off')
    expect(crossed).toBeDisabled() // crossing off is permanent
    await user.click(crossed) // no-op

    expect(cell('red 7, crossed off')).toHaveAttribute('aria-pressed', 'true')
    expect(totals().grand).toBe(1)
  })

  it('undoes the most recent cross with the Undo button', async () => {
    const user = userEvent.setup()
    render(<Scorecard />)

    await user.click(cell('red 7'))
    expect(totals().grand).toBe(1)
    expect(cell('Undo')).toBeEnabled()

    await user.click(cell('Undo'))

    expect(cell('red 7')).toHaveAttribute('aria-pressed', 'false')
    expect(totals().grand).toBe(0)
    expect(cell('Undo')).toBeDisabled() // nothing left to undo
  })

  it('undoes moves newest-first, penalties included', async () => {
    const user = userEvent.setup()
    render(<Scorecard />)

    await user.click(cell('red 7')) // +1
    await user.click(cell('Penalty 1')) // −5
    expect(totals().grand).toBe(-4)

    await user.click(cell('Undo')) // reverts the penalty first
    expect(cell('Penalty 1')).toHaveAttribute('aria-pressed', 'false')
    expect(totals().grand).toBe(1)

    await user.click(cell('Undo')) // then the cross
    expect(cell('red 7')).toHaveAttribute('aria-pressed', 'false')
    expect(totals().grand).toBe(0)
    expect(cell('Undo')).toBeDisabled()
  })

  it('re-opens the cells to the right after undoing a cross', async () => {
    const user = userEvent.setup()
    render(<Scorecard />)

    await user.click(cell('red 7')) // index 5
    await user.click(cell('red 9')) // index 7
    expect(cell('red 8')).toBeDisabled() // skipped over — locked out between the two crosses

    await user.click(cell('Undo')) // undo red 9

    expect(cell('red 8')).toBeEnabled() // to the right of the rightmost cross again
    expect(cell('red 9')).toBeEnabled()
  })

  it('keeps the lock disabled until five crosses, then locks the row for 28', async () => {
    const user = userEvent.setup()
    render(<Scorecard />)

    expect(cell('Lock red row')).toBeDisabled()

    for (const n of [2, 3, 4, 5, 6]) await user.click(cell(`red ${n}`))
    expect(cell('Lock red row')).toBeEnabled()

    await user.click(cell('Lock red row'))

    // Crossing the final number locks the row; the lock counts as an extra
    // cross: 5 + the 12 + the lock = 7 X's = 28 points.
    expect(cell('red 12, crossed off')).toHaveAttribute('aria-pressed', 'true')
    expect(totals().red).toBe(28)
    expect(totals().grand).toBe(28)
  })

  it('takes penalties one at a time; clicking again cannot clear them (Undo does)', async () => {
    const user = userEvent.setup()
    render(<Scorecard />)

    // With no penalties, only the first box is active — a click on a later box
    // can't fill several at once.
    expect(cell('Penalty 1')).toBeEnabled()
    expect(cell('Penalty 3')).toBeDisabled()

    // Each click on the next box adds exactly one penalty.
    await user.click(cell('Penalty 1'))
    expect(totals()).toMatchObject({ penalty: 5, grand: -5 })
    await user.click(cell('Penalty 2'))
    expect(totals()).toMatchObject({ penalty: 10, grand: -10 })

    // A filled box is disabled — like a crossed-off number, a click can't take it
    // back; only Undo clears the most recent penalty.
    expect(cell('Penalty 1')).toBeDisabled()
    await user.click(cell('Undo'))
    expect(totals()).toMatchObject({ penalty: 5, grand: -5 })
  })

  it('persists marks to localStorage and restores them on remount', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Scorecard />)

    await user.click(cell('red 7'))
    unmount()
    render(<Scorecard />)

    expect(cell('red 7, crossed off')).toHaveAttribute('aria-pressed', 'true')
  })

  it('reports each move to onMove for broadcasting', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(<Scorecard onMove={onMove} />)

    // Each move carries a stable, incrementing id; undo names the id it reverts.
    await user.click(cell('red 7')) // red index 5 → id 0
    expect(onMove).toHaveBeenLastCalledWith({ type: 'move', id: 0, move: { type: 'mark', color: 'red', index: 5 } })

    await user.click(cell('Penalty 1')) // id 1
    expect(onMove).toHaveBeenLastCalledWith({ type: 'move', id: 1, move: { type: 'penalty' } })

    await user.click(cell('Undo')) // reverts the penalty (id 1)
    expect(onMove).toHaveBeenLastCalledWith({ type: 'undo', id: 1 })

    expect(onMove).toHaveBeenCalledTimes(3)
  })

  it('reports locking a row as a mark on the final number', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(<Scorecard onMove={onMove} />)

    for (const n of [2, 3, 4, 5, 6]) await user.click(cell(`red ${n}`))
    onMove.mockClear()
    await user.click(cell('Lock red row'))

    // The lock is a mark on the final index; the id is whatever the counter is at.
    expect(onMove).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'move', move: { type: 'mark', color: 'red', index: 10 } }), // LAST
    )
  })

  it('closes a row that another player has locked', () => {
    // `lockedColors` marks colors locked by anyone in the room: that row's cells
    // and its lock are disabled here, while other rows stay open.
    render(<Scorecard lockedColors={['red']} />)

    expect(cell('red 2')).toBeDisabled()
    expect(cell('red 12')).toBeDisabled()
    expect(cell('Lock red row')).toBeDisabled()
    expect(cell('yellow 2')).toBeEnabled() // an unlocked color is unaffected
  })

  it('freezes marking and penalties once the game is over, but keeps Undo', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Scorecard />)
    await user.click(cell('red 7')) // leaves red 9 open and a move to undo
    expect(cell('red 9')).toBeEnabled()

    rerender(<Scorecard gameOver />)

    expect(cell('red 9')).toBeDisabled() // the board is frozen
    expect(cell('Penalty 1')).toBeDisabled()
    expect(cell('Undo')).toBeEnabled() // the triggering misclick can still be taken back
  })

  it('does not report no-op interactions', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(<Scorecard onMove={onMove} />)

    await user.click(cell('red 7'))
    onMove.mockClear()

    // A crossed cell and the cells to its left are disabled — clicking either
    // dispatches nothing.
    await user.click(cell('red 7, crossed off'))
    await user.click(cell('red 4'))

    expect(onMove).not.toHaveBeenCalled()
  })
})
