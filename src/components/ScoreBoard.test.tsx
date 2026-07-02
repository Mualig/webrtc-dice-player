import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ScoreBoard } from './ScoreBoard'
import type { Player } from '../types'

const me: Player = { id: 'me', name: 'Me', color: '#000' }
const alice: Player = { id: 'a', name: 'Alice', color: '#fb2c36' }
const bob: Player = { id: 'b', name: 'Bob', color: '#155dfc' }

describe('<ScoreBoard />', () => {
  it('prompts when there are no other players', () => {
    render(<ScoreBoard players={[me]} scores={{}} selfId="me" />)
    expect(screen.getByText(/Waiting for other players/)).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  it('lists the other players highest score first, excluding yourself', () => {
    render(
      <ScoreBoard players={[me, alice, bob]} scores={{ me: 99, a: 12, b: 28 }} selfId="me" />,
    )

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2) // self excluded
    // Bob (28) ranks above Alice (12).
    expect(within(rows[0]).getByText('Bob')).toBeInTheDocument()
    expect(within(rows[0]).getByText('28')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Alice')).toBeInTheDocument()
    expect(within(rows[1]).getByText('12')).toBeInTheDocument()
    // Our own score never appears here.
    expect(screen.queryByText('99')).toBeNull()
  })

  it('shows 0 for a player who has no reported score yet', () => {
    render(<ScoreBoard players={[me, alice]} scores={{}} selfId="me" />)
    const row = screen.getByRole('listitem')
    expect(within(row).getByText('Alice')).toBeInTheDocument()
    expect(within(row).getByText('0')).toBeInTheDocument()
  })
})
