import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NewGameButton } from './NewGameButton'

describe('<NewGameButton />', () => {
  it('confirms before starting a new game', async () => {
    const user = userEvent.setup()
    const onNewGame = vi.fn()
    render(<NewGameButton onNewGame={onNewGame} />)

    // The first click asks to confirm — nothing happens yet.
    await user.click(screen.getByRole('button', { name: 'New game' }))
    expect(screen.getByText(/Start a new game\?/)).toBeInTheDocument()
    expect(onNewGame).not.toHaveBeenCalled()

    // Confirming triggers it.
    await user.click(screen.getByRole('button', { name: 'New game' }))
    expect(onNewGame).toHaveBeenCalledOnce()
  })

  it('can be cancelled without starting a new game', async () => {
    const user = userEvent.setup()
    const onNewGame = vi.fn()
    render(<NewGameButton onNewGame={onNewGame} />)

    await user.click(screen.getByRole('button', { name: 'New game' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onNewGame).not.toHaveBeenCalled()
    expect(screen.queryByText(/Start a new game\?/)).toBeNull() // back to the plain button
    expect(screen.getByRole('button', { name: 'New game' })).toBeInTheDocument()
  })
})
