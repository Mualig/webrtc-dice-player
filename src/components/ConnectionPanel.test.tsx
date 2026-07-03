import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConnectionPanel } from './ConnectionPanel'
import { roomHostId } from '../usePeerSync'
import type { Player } from '../types'

const noop = () => {}
const base = {
  peerCount: 1,
  error: null,
  shareLink: 'http://localhost/?room=ABCD',
  copied: false,
  onCreate: noop,
  onJoin: noop,
  onLeave: noop,
  onCopy: noop,
}

// The host's roster entry is keyed by its deterministic room-derived peer id.
const alice: Player = { id: roomHostId('ABCD'), name: 'Alice', color: '#fb2c36' }
const bob: Player = { id: 'peer-bob', name: 'Bob', color: '#155dfc' }

describe('<ConnectionPanel /> roster', () => {
  it('tags the host, and yourself, in the room roster', () => {
    render(
      <ConnectionPanel
        {...base}
        role="client"
        status="connected"
        roomCode="ABCD"
        players={[alice, bob]}
        selfId={bob.id}
      />,
    )

    const [aliceChip, bobChip] = screen.getAllByRole('listitem')
    expect(aliceChip).toHaveTextContent('Alice')
    expect(aliceChip).toHaveTextContent('(host)')
    expect(bobChip).toHaveTextContent('Bob')
    expect(bobChip).toHaveTextContent('(you)')
    expect(bobChip).not.toHaveTextContent('(host)')
  })

  it('merges the tags into "(you, host)" on the host’s own view', () => {
    render(
      <ConnectionPanel
        {...base}
        role="host"
        status="connected"
        roomCode="ABCD"
        players={[alice, bob]}
        selfId={alice.id}
      />,
    )

    const [aliceChip] = screen.getAllByRole('listitem')
    expect(aliceChip).toHaveTextContent('(you, host)')
  })
})
