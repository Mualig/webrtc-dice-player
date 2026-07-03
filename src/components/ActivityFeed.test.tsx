import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActivityFeed } from './ActivityFeed'
import type { ActionEntry, Player } from '../types'

const alice: Player = { id: 'a', name: 'Alice', color: '#fb2c36' }
const bob: Player = { id: 'b', name: 'Bob', color: '#155dfc' }

// A resolver like the app's: look the actor up in the live roster, else fall
// back to the move-time snapshot carried on the entry.
function resolverFor(...roster: Player[]) {
  const byId = new Map(roster.map((p) => [p.id, p]))
  return (actor: Player) => byId.get(actor.id) ?? actor
}

describe('<ActivityFeed />', () => {
  it('shows a placeholder when there are no moves', () => {
    render(<ActivityFeed actions={[]} resolveActor={(a) => a} />)
    expect(screen.getByText(/No scorecard moves yet/)).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  it('describes each kind of move, attributed to its actor', () => {
    const actions: ActionEntry[] = [
      { id: '1', actor: alice, move: { type: 'mark', color: 'red', index: 5 } }, // red 7
      { id: '2', actor: bob, move: { type: 'mark', color: 'green', index: 10 } }, // LAST → lock
      { id: '3', actor: alice, move: { type: 'penalty' } },
    ]
    render(<ActivityFeed actions={actions} resolveActor={resolverFor(alice, bob)} />)

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Alice')
    expect(items[0]).toHaveTextContent('crossed off red 7')
    expect(items[1]).toHaveTextContent('Bob')
    expect(items[1]).toHaveTextContent('locked the green row')
    expect(items[2]).toHaveTextContent(/took a .*penalty/)
  })

  it('strikes through an undone move rather than adding a row', () => {
    const actions: ActionEntry[] = [
      { id: '1', actor: alice, move: { type: 'mark', color: 'red', index: 5 }, undone: true },
      { id: '2', actor: bob, move: { type: 'penalty' } },
    ]
    render(<ActivityFeed actions={actions} resolveActor={resolverFor(alice, bob)} />)

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2) // no separate "undid" row
    expect(items[0]).toHaveClass('line-through') // the reverted move is struck
    expect(items[0]).toHaveTextContent('crossed off red 7')
    expect(items[1]).not.toHaveClass('line-through')
  })

  it('colors the crossed-off number and locked row by the row color', () => {
    const actions: ActionEntry[] = [
      { id: '1', actor: alice, move: { type: 'mark', color: 'red', index: 5 } }, // red 7
      { id: '2', actor: bob, move: { type: 'mark', color: 'green', index: 10 } }, // green row (lock)
    ]
    render(<ActivityFeed actions={actions} resolveActor={resolverFor(alice, bob)} />)

    expect(screen.getByText('red 7')).toHaveClass('text-red-600')
    expect(screen.getByText('green row')).toHaveClass('text-green-700')
  })

  it("follows the actor's current identity, falling back to the snapshot", () => {
    const entry: ActionEntry = {
      id: '1',
      actor: { id: 'a', name: 'Old', color: '#000000' }, // stale snapshot on the entry
      move: { type: 'mark', color: 'blue', index: 0 }, // blue 12
    }

    // Alice (id 'a') is still in the room under a fresher name → resolves to it.
    const { rerender } = render(
      <ActivityFeed actions={[entry]} resolveActor={resolverFor({ id: 'a', name: 'Alice', color: '#fb2c36' })} />,
    )
    expect(screen.getByRole('listitem')).toHaveTextContent('Alice')
    expect(screen.getByRole('listitem')).toHaveTextContent('crossed off blue 12')

    // Once she leaves the roster, it falls back to the snapshot name on the entry.
    rerender(<ActivityFeed actions={[entry]} resolveActor={(a) => a} />)
    expect(screen.getByRole('listitem')).toHaveTextContent('Old')
  })
})
