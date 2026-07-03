import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GameOverBanner } from './GameOverBanner'
import type { PlayerResult } from '../gameHistory'

// Ready-ranked standings, as App provides them (highest total first).
const standings: PlayerResult[] = [
  { name: 'Bob', total: 56 },
  { name: 'Carol', total: 21 },
  { name: 'Alice', total: 10, you: true },
]

describe('<GameOverBanner />', () => {
  it('states why the game ended', () => {
    const props = { players: standings, onNewGame: () => {} }
    const { rerender } = render(<GameOverBanner {...props} reason="locks" />)
    expect(screen.getByText('Two rows were locked.')).toBeInTheDocument()

    rerender(<GameOverBanner {...props} reason="penalties" />)
    expect(screen.getByText('A player took their fourth penalty.')).toBeInTheDocument()
  })

  it('lists the standings in order, marking the winner and yourself', () => {
    render(<GameOverBanner players={standings} reason="locks" onNewGame={() => {}} />)

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(3)

    // Bob (56) leads with the trophy, then Carol, then Alice — the local player.
    expect(within(rows[0]).getByText('Bob')).toBeInTheDocument()
    expect(within(rows[0]).getByText('56')).toBeInTheDocument()
    expect(within(rows[0]).getByText('🏆')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Carol')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Alice')).toBeInTheDocument()
    expect(within(rows[2]).getByText('(you)')).toBeInTheDocument() // self marked wherever it ranks
    // Only the winner has the trophy; the rest are numbered.
    expect(within(rows[1]).getByText('2')).toBeInTheDocument()
    expect(within(rows[2]).getByText('3')).toBeInTheDocument()
  })

  it('starts a new game when the button is clicked', async () => {
    const user = userEvent.setup()
    const onNewGame = vi.fn()
    render(<GameOverBanner players={standings} reason="locks" onNewGame={onNewGame} />)

    await user.click(screen.getByRole('button', { name: 'New game' }))
    expect(onNewGame).toHaveBeenCalledOnce()
  })
})
