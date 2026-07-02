import { describe, it, expect } from 'vitest'
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
    expect(screen.getByRole('button', { name: 'Reset card' })).toBeDisabled()
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

  it('takes back the most recent cross when clicked again', async () => {
    const user = userEvent.setup()
    render(<Scorecard />)

    await user.click(cell('red 7'))
    await user.click(cell('red 7, crossed off'))

    expect(cell('red 7')).toHaveAttribute('aria-pressed', 'false')
    expect(totals().grand).toBe(0)
  })

  it('keeps the lock disabled until five crosses, then locks the row for 28', async () => {
    const user = userEvent.setup()
    render(<Scorecard />)

    expect(screen.getByRole('button', { name: 'Lock red row' })).toBeDisabled()

    for (const n of [2, 3, 4, 5, 6]) await user.click(cell(`red ${n}`))
    expect(screen.getByRole('button', { name: 'Lock red row' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Lock red row' }))

    // Crossing the final number locks the row; the lock counts as an extra
    // cross: 5 + the 12 + the lock = 7 X's = 28 points.
    expect(cell('red 12, crossed off')).toHaveAttribute('aria-pressed', 'true')
    expect(totals().red).toBe(28)
    expect(totals().grand).toBe(28)
  })

  it('applies and clears penalties (−5 each)', async () => {
    const user = userEvent.setup()
    render(<Scorecard />)

    // Clicking the 3rd box fills up to three penalties = −15.
    await user.click(screen.getByRole('button', { name: 'Penalty 3' }))
    expect(totals()).toMatchObject({ penalty: 15, grand: -15 })

    // Clicking the 1st box clears it and everything after it.
    await user.click(screen.getByRole('button', { name: 'Penalty 1' }))
    expect(totals()).toMatchObject({ penalty: 0, grand: 0 })
  })

  it('persists marks to localStorage and restores them on remount', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Scorecard />)

    await user.click(cell('red 7'))
    unmount()
    render(<Scorecard />)

    expect(cell('red 7, crossed off')).toHaveAttribute('aria-pressed', 'true')
  })

  it('resets every mark and penalty', async () => {
    const user = userEvent.setup()
    render(<Scorecard />)

    await user.click(cell('red 7'))
    await user.click(screen.getByRole('button', { name: 'Penalty 1' }))
    await user.click(screen.getByRole('button', { name: 'Reset card' }))

    expect(cell('red 7')).toHaveAttribute('aria-pressed', 'false')
    expect(totals().grand).toBe(0)
    expect(screen.getByRole('button', { name: 'Reset card' })).toBeDisabled()
  })
})
