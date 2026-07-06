import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FinalTurnBanner } from './FinalTurnBanner'

describe('<FinalTurnBanner />', () => {
  it('states why the game is ending', () => {
    const props = { confirmed: false, waitingOn: ['Alice'], onDone: () => {} }
    const { rerender } = render(<FinalTurnBanner {...props} reason="locks" />)
    expect(screen.getByText(/Two rows are locked\./)).toBeInTheDocument()

    rerender(<FinalTurnBanner {...props} reason="penalties" />)
    expect(screen.getByText(/A player took their fourth penalty\./)).toBeInTheDocument()
  })

  it('confirms with the Done button', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<FinalTurnBanner reason="locks" confirmed={false} waitingOn={['Alice', 'Bob']} onDone={onDone} />)

    await user.click(screen.getByRole('button', { name: 'I’m done' }))
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('shows who the room is waiting on once confirmed, instead of the button', () => {
    render(<FinalTurnBanner reason="locks" confirmed waitingOn={['Alice', 'Bob']} onDone={() => {}} />)

    expect(screen.getByText('Waiting for Alice, Bob…')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
