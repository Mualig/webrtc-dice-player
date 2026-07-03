import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GameOverBanner } from './GameOverBanner'
import type { CardSummary } from '../scorecard'

const summary = (total: number): CardSummary => ({ totals: { rows: [], penaltyTotal: 0, total }, locked: [] })
const names: Record<string, string> = { me: 'Alice', b: 'Bob', c: 'Carol' }
const resolveName = (id: string) => names[id] ?? 'Anonymous'

describe('<GameOverBanner />', () => {
  it('states why the game ended', () => {
    const props = { summaries: { me: summary(0) }, selfId: 'me', resolveName, onNewGame: () => {} }
    const { rerender } = render(<GameOverBanner {...props} reason="locks" />)
    expect(screen.getByText('Two rows were locked.')).toBeInTheDocument()

    rerender(<GameOverBanner {...props} reason="penalties" />)
    expect(screen.getByText('A player took their fourth penalty.')).toBeInTheDocument()
  })

  it('ranks every player by final total, highest first, marking the winner and yourself', () => {
    render(
      <GameOverBanner
        summaries={{ me: summary(10), b: summary(56), c: summary(21) }}
        selfId="me"
        reason="locks"
        resolveName={resolveName}
        onNewGame={() => {}}
      />,
    )

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(3)

    // Bob (56) leads, then Carol (21), then Alice (10) — who is the local player.
    expect(within(rows[0]).getByText('Bob')).toBeInTheDocument()
    expect(within(rows[0]).getByText('56')).toBeInTheDocument()
    expect(within(rows[0]).getByText('🏆')).toBeInTheDocument() // winner gets the trophy
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
    render(
      <GameOverBanner
        summaries={{ me: summary(0) }}
        selfId="me"
        reason="locks"
        resolveName={resolveName}
        onNewGame={onNewGame}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'New game' }))
    expect(onNewGame).toHaveBeenCalledOnce()
  })
})
