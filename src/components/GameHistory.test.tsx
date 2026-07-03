import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GameHistory } from './GameHistory'
import type { GameRecord } from '../gameHistory'

const games: GameRecord[] = [
  {
    endedAt: new Date(2026, 6, 3, 14, 30).getTime(),
    reason: 'locks',
    players: [
      { name: 'Bob', total: 56 },
      { name: 'Alice', total: 10, you: true },
    ],
  },
  {
    endedAt: new Date(2026, 6, 2, 20, 0).getTime(),
    reason: 'penalties',
    players: [
      { name: 'Alice', total: 22, you: true },
      { name: 'Bob', total: -20 },
    ],
  },
]

const noop = () => {}

describe('<GameHistory />', () => {
  it('hints when no game has finished yet', () => {
    render(<GameHistory games={[]} onClose={noop} onRemove={noop} />)
    expect(screen.getByRole('dialog', { name: 'Game history' })).toBeInTheDocument()
    expect(screen.getByText('No finished games yet.')).toBeInTheDocument()
  })

  it('lists each game with its standings, winner first, and the game count', () => {
    render(<GameHistory games={games} onClose={noop} onRemove={noop} />)

    expect(screen.getByText('· 2')).toBeInTheDocument() // count next to the title
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)

    // Newest game first: Bob won it; Alice is marked as this device's player.
    expect(rows[0]).toHaveTextContent('two rows locked')
    expect(rows[0]).toHaveTextContent('🏆 Bob 56')
    expect(rows[0]).toHaveTextContent('Alice (you) 10')

    expect(rows[1]).toHaveTextContent('fourth penalty')
    expect(rows[1]).toHaveTextContent('🏆 Alice (you) 22')
    expect(rows[1]).toHaveTextContent('Bob -20')
  })

  it('closes via the Close button and via Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<GameHistory games={[]} onClose={onClose} onRemove={noop} />)

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('asks to remove the clicked game via its X button', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(<GameHistory games={games} onClose={noop} onRemove={onRemove} />)

    // One X per game, each naming its game by date.
    const removes = screen.getAllByRole('button', { name: /Remove the game/ })
    expect(removes).toHaveLength(2)

    await user.click(removes[1])
    expect(onRemove).toHaveBeenCalledExactlyOnceWith(games[1])
  })
})
