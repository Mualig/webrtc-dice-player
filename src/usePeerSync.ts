import { useCallback, useEffect, useRef, useState } from 'react'
import { Peer } from 'peerjs'
import type { DataConnection, PeerError } from 'peerjs'

export type PeerRole = 'solo' | 'host' | 'client'
export type PeerStatus = 'idle' | 'connecting' | 'connected' | 'error'

type Options = {
  // Called for every message received from another peer.
  onMessage: (msg: unknown) => void
  // Host-only: a new client just finished connecting (good time to push state).
  onClientJoin: () => void
  // Host-only: a client disconnected; receives that peer's id so presence can
  // be reconciled.
  onClientLeave: (peerId: string) => void
}

// Prefix keeps our room ids from colliding with other apps on the public broker.
const ROOM_PREFIX = 'webrtc-dice-player-room-'

// The host registers under a deterministic id derived from the room code — it's
// how clients dial the room, and how any peer can tell which player is the host.
export function roomHostId(code: string) {
  return ROOM_PREFIX + code
}
// Unambiguous charset (no 0/O, 1/I) so codes are easy to read out loud.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
// How long to wait for the broker / peer handshake before giving up.
const CONNECT_TIMEOUT_MS = 12000

const LOG = '[peer]'

// Optionally point PeerJS at a self-hosted signaling broker (used by the E2E
// tests, which run a local peerjs-server). When VITE_PEER_HOST is unset we pass
// `undefined`, so PeerJS falls back to its public cloud broker exactly as before.
const PEER_OPTIONS = import.meta.env.VITE_PEER_HOST
  ? {
      host: import.meta.env.VITE_PEER_HOST,
      port: Number(import.meta.env.VITE_PEER_PORT ?? 443),
      path: import.meta.env.VITE_PEER_PATH ?? '/',
      secure: import.meta.env.VITE_PEER_SECURE !== 'false',
      key: import.meta.env.VITE_PEER_KEY ?? 'peerjs',
    }
  : undefined

function randomCode() {
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
}

export function usePeerSync({ onMessage, onClientJoin, onClientLeave }: Options) {
  const [role, setRole] = useState<PeerRole>('solo')
  const [status, setStatus] = useState<PeerStatus>('idle')
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [peerCount, setPeerCount] = useState(0)
  const [peerId, setPeerId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const peerRef = useRef<Peer | null>(null)
  // Host: every connected client. Client: a single entry for the host.
  const connectionsRef = useRef<DataConnection[]>([])

  // Keep the latest callbacks in refs so the long-lived PeerJS event handlers
  // (registered once) always call the current closure instead of a stale one.
  const onMessageRef = useRef(onMessage)
  const onClientJoinRef = useRef(onClientJoin)
  const onClientLeaveRef = useRef(onClientLeave)
  useEffect(() => {
    onMessageRef.current = onMessage
    onClientJoinRef.current = onClientJoin
    onClientLeaveRef.current = onClientLeave
  })

  const teardown = useCallback(() => {
    connectionsRef.current.forEach((conn) => conn.close())
    connectionsRef.current = []
    peerRef.current?.destroy()
    peerRef.current = null
    setPeerCount(0)
  }, [])

  const leave = useCallback(() => {
    console.log(LOG, 'leaving')
    teardown()
    setRole('solo')
    setStatus('idle')
    setRoomCode(null)
    setPeerId(null)
    setError(null)
  }, [teardown])

  const dropConnection = useCallback((conn: DataConnection) => {
    connectionsRef.current = connectionsRef.current.filter((c) => c !== conn)
    setPeerCount(connectionsRef.current.length)
  }, [])

  // Host side: wire up a freshly accepted client connection.
  const registerHostConnection = useCallback(
    (conn: DataConnection) => {
      conn.on('open', () => {
        console.log(LOG, 'host: client connected', conn.peer)
        setPeerCount(connectionsRef.current.length)
        onClientJoinRef.current()
      })
      conn.on('data', (data) => onMessageRef.current(data))
      conn.on('close', () => {
        console.log(LOG, 'host: client left', conn.peer)
        onClientLeaveRef.current(conn.peer)
        dropConnection(conn)
      })
      conn.on('error', (err) => {
        console.warn(LOG, 'host: connection error', err)
        onClientLeaveRef.current(conn.peer)
        dropConnection(conn)
      })
    },
    [dropConnection],
  )

  const createRoom = useCallback(() => {
    teardown()
    setRole('host')
    setStatus('connecting')
    setError(null)

    const attempt = (triesLeft: number) => {
      const code = randomCode()
      const id = roomHostId(code)
      console.log(LOG, 'host: registering id', id)
      const peer = new Peer(id, PEER_OPTIONS)
      peerRef.current = peer
      let opened = false

      // Watchdog: surface an error if the broker handshake never completes;
      // cleared the moment the peer opens.
      const connectTimeout = setTimeout(() => {
        if (!opened && peerRef.current === peer) {
          console.error(LOG, 'host: broker timed out')
          setError('Could not reach the connection server. Check your network and try again.')
          setStatus('error')
        }
      }, CONNECT_TIMEOUT_MS)

      peer.on('open', () => {
        opened = true
        clearTimeout(connectTimeout)
        console.log(LOG, 'host: broker open, room code', code)
        setRoomCode(code)
        setPeerId(peer.id)
        setStatus('connected')
      })

      peer.on('connection', (conn) => {
        console.log(LOG, 'host: client connecting', conn.peer)
        connectionsRef.current.push(conn)
        registerHostConnection(conn)
      })

      // The broker socket can drop without the peer being dead — reconnect.
      peer.on('disconnected', () => {
        if (peerRef.current === peer && !peer.destroyed) {
          console.warn(LOG, 'host: broker disconnected, reconnecting')
          peer.reconnect()
        }
      })

      peer.on('error', (err: PeerError<string>) => {
        // The (extremely unlikely) chance our random code is taken: try again.
        if (err.type === 'unavailable-id' && triesLeft > 0) {
          console.warn(LOG, 'host: id taken, retrying with a new code')
          peer.destroy()
          attempt(triesLeft - 1)
          return
        }
        console.error(LOG, 'host: error', err.type, err.message)
        if (!opened) {
          setError(`Connection failed (${err.type}).`)
          setStatus('error')
        }
      })
    }

    attempt(5)
  }, [teardown, registerHostConnection])

  const joinRoom = useCallback(
    (rawCode: string) => {
      teardown()
      const code = rawCode.trim().toUpperCase()
      if (!code) {
        setError('Enter a room code to join.')
        setStatus('error')
        setRole('solo')
        return
      }
      setRole('client')
      setStatus('connecting')
      setError(null)

      console.log(LOG, 'client: creating peer to join', code)
      // No fixed id (the broker assigns one). Pass broker options only when set,
      // otherwise let PeerJS use its cloud defaults.
      const peer = PEER_OPTIONS ? new Peer(PEER_OPTIONS) : new Peer()
      peerRef.current = peer
      let connected = false

      // Watchdog: surface an error if the connection never completes; cleared
      // the moment the data channel opens.
      const connectTimeout = setTimeout(() => {
        if (!connected && peerRef.current === peer) {
          console.error(LOG, 'client: connection timed out')
          setError(`Couldn't reach room "${code}". Check the code and your network.`)
          setStatus('error')
        }
      }, CONNECT_TIMEOUT_MS)

      peer.on('open', (id) => {
        console.log(LOG, 'client: broker open as', id, '- dialing host')
        setPeerId(id)
        // Reliable + ordered delivery so full-state messages always arrive.
        const conn = peer.connect(roomHostId(code), { reliable: true })
        connectionsRef.current = [conn]
        conn.on('open', () => {
          connected = true
          clearTimeout(connectTimeout)
          console.log(LOG, 'client: connected to host')
          setRoomCode(code)
          setStatus('connected')
          setPeerCount(1)
        })
        conn.on('data', (data) => onMessageRef.current(data))
        conn.on('close', () => {
          console.warn(LOG, 'client: connection closed')
          if (peerRef.current === peer) {
            setStatus('error')
            setError('Disconnected from the room.')
          }
        })
        conn.on('error', (err) => {
          console.error(LOG, 'client: connection error', err)
          if (peerRef.current === peer) {
            setStatus('error')
            setError('Lost connection to the room.')
          }
        })
      })

      peer.on('error', (err: PeerError<string>) => {
        console.error(LOG, 'client: error', err.type, err.message)
        if (!connected) {
          setError(
            err.type === 'peer-unavailable'
              ? `No room found for code "${code}".`
              : `Connection failed (${err.type}).`,
          )
          setStatus('error')
        }
      })
    },
    [teardown],
  )

  // Host: broadcast to all clients. Client: send to the host. Solo: no-op.
  const send = useCallback((msg: unknown) => {
    connectionsRef.current.forEach((conn) => {
      if (conn.open) conn.send(msg)
    })
  }, [])

  // NOTE: intentionally no "destroy on unmount" effect. This hook lives at the
  // app root (which never really unmounts), and such an effect's cleanup fires
  // during React StrictMode's dev mount→unmount→remount cycle, destroying a
  // peer that an auto-join just created. Cleanup is handled explicitly by leave().

  return {
    role,
    status,
    roomCode,
    peerCount,
    peerId,
    error,
    createRoom,
    joinRoom,
    leave,
    send,
  }
}
