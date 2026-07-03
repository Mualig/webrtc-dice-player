import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ScoreBoard } from './ScoreBoard'
import type { Player } from '../types'
import type { CardSummary } from '../scorecard'

const me: Player = { id: 'me', name: 'Me', color: '#000' }
const alice: Player = { id: 'a', name: 'Alice', color: '#fb2c36' }
const bob: Player = { id: 'b', name: 'Bob', color: '#155dfc' }

// Distinct numbers so each box is queryable without collisions.
const aliceSummary: CardSummary = { totals: { rows: [3, 4, 0, 0], penaltyTotal: 0, total: 7 }, locked: [] }
const bobSummary: CardSummary = { totals: { rows: [21, 0, 6, 0], penaltyTotal: 5, total: 22 }, locked: ['red'] }

describe('<ScoreBoard />', () => {
  it('prompts when there are no other players', () => {
    render(<ScoreBoard players={[me]} summaries={{}} selfId="me" />)
    expect(screen.getByText(/Waiting for other players/)).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  it('lists other players highest total first, excluding yourself, with the full breakdown', () => {
    render(
      <ScoreBoard players={[me, alice, bob]} summaries={{ me: bobSummary, a: aliceSummary, b: bobSummary }} selfId="me" />,
    )

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2) // self excluded

    // Bob (22) ranks above Alice (7), and each row shows the per-row breakdown.
    expect(within(rows[0]).getByText('Bob')).toBeInTheDocument()
    expect(within(rows[0]).getByText('22')).toBeInTheDocument() // grand total
    expect(within(rows[0]).getByText('21')).toBeInTheDocument() // a row score
    expect(within(rows[0]).getByText('5')).toBeInTheDocument() // penalty deduction
    expect(within(rows[1]).getByText('Alice')).toBeInTheDocument()
    expect(within(rows[1]).getByText('7')).toBeInTheDocument()
    expect(within(rows[1]).getByText('3')).toBeInTheDocument()
  })

  it('shows a blank breakdown for a player who has not reported yet', () => {
    render(<ScoreBoard players={[me, alice]} summaries={{}} selfId="me" />)
    const row = screen.getByRole('listitem')
    expect(within(row).getByText('Alice')).toBeInTheDocument()
    // Four row scores + penalty + total, all zero.
    expect(within(row).getAllByText('0')).toHaveLength(6)
  })
})
