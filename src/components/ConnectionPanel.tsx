import { useState } from 'react'
import type { Player } from '../types'
import type { PeerRole, PeerStatus } from '../usePeerSync'
import { displayName } from '../format'

function Roster({ players, selfId }: Readonly<{ players: Player[]; selfId: string | null }>) {
  if (players.length === 0) return null
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {players.map((player) => (
        <li
          key={player.id}
          style={{ borderColor: player.color || 'transparent' }}
          className="flex items-center gap-1.5 rounded-full border-2 bg-zinc-100 px-3 py-1 text-sm text-zinc-700"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          {displayName(player.name)}
          {player.id === selfId && <span className="text-zinc-400">(you)</span>}
        </li>
      ))}
    </ul>
  )
}

function LeaveButton({ onLeave }: Readonly<{ onLeave: () => void }>) {
  return (
    <button
      type="button"
      onClick={onLeave}
      className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100"
    >
      Leave
    </button>
  )
}

export function ConnectionPanel({
  role,
  status,
  roomCode,
  peerCount,
  players,
  selfId,
  error,
  shareLink,
  copied,
  onCreate,
  onJoin,
  onLeave,
  onCopy,
}: Readonly<{
  role: PeerRole
  status: PeerStatus
  roomCode: string | null
  peerCount: number
  players: Player[]
  selfId: string | null
  error: string | null
  shareLink: string
  copied: boolean
  onCreate: () => void
  onJoin: (code: string) => void
  onLeave: () => void
  onCopy: () => void
}>) {
  const [codeInput, setCodeInput] = useState('')

  if (status === 'connecting') {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 text-center">
        <p className="text-sm text-zinc-600">
          {role === 'host' ? 'Creating room…' : 'Connecting to room…'}
        </p>
        <button
          type="button"
          onClick={onLeave}
          className="mt-2 text-sm font-medium text-zinc-500 transition hover:text-zinc-900"
        >
          Cancel
        </button>
      </div>
    )
  }

  if (status === 'connected' && role === 'host') {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Room code
            </p>
            <p className="font-mono text-2xl font-bold tracking-widest text-zinc-900">
              {roomCode}
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-sm text-zinc-500">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            {peerCount === 0
              ? 'Waiting for players'
              : `${peerCount} ${peerCount === 1 ? 'player' : 'players'} joined`}
          </span>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="flex-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700"
          >
            {copied ? 'Link copied!' : 'Copy invite link'}
          </button>
          <LeaveButton onLeave={onLeave} />
        </div>
        <p className="mt-2 truncate text-xs text-zinc-400">{shareLink}</p>
        <Roster players={players} selfId={selfId} />
      </div>
    )
  }

  if (status === 'connected' && role === 'client') {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm text-zinc-600">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Connected to room{' '}
            <span className="font-mono font-bold tracking-widest text-zinc-900">
              {roomCode}
            </span>
          </span>
          <LeaveButton onLeave={onLeave} />
        </div>
        <Roster players={players} selfId={selfId} />
      </div>
    )
  }

  // Solo / idle / error: the lobby.
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-sm font-semibold text-zinc-900">Play together</p>
      <p className="mt-0.5 text-sm text-zinc-500">
        Share live rolls with friends over a direct peer-to-peer connection.
      </p>
      {/* Always stacked: this panel lives in a narrow (~320px) drawer, so a
          side-by-side layout would be cramped on any viewport. */}
      <div className="mt-3 flex flex-col gap-3">
        <button
          type="button"
          onClick={onCreate}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700"
        >
          Create room
        </button>
        <span className="text-center text-xs uppercase text-zinc-400">or</span>
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            onJoin(codeInput)
          }}
        >
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            placeholder="Room code"
            maxLength={4}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm tracking-widest uppercase outline-none focus:border-zinc-900"
          />
          <button
            type="submit"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
          >
            Join
          </button>
        </form>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
