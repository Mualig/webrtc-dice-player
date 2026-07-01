import { useCallback, useEffect, useRef, useState } from 'react'
import { usePeerSync } from './usePeerSync'
import type { Die, Message, Player, RollEntry } from './types'
import { DICE, PLAYER_COLOR_PALETTE, rollValue } from './dice'
import { Dice } from './components/Dice'
import { HistoryEntry } from './components/History'
import { ConnectionPanel } from './components/ConnectionPanel'
import { SidePanel } from './components/SidePanel'

const NAME_KEY = 'webrtc-dice-player-player-name'
const COLOR_KEY = 'webrtc-dice-player-player-color'

// Players are assigned one of the dice colors by default; the picker still lets
// them choose any color afterwards.
function randomColor() {
  return PLAYER_COLOR_PALETTE[Math.floor(Math.random() * PLAYER_COLOR_PALETTE.length)]
}

function upsertPlayer(list: Player[], id: string, name: string, color: string): Player[] {
  return list.some((p) => p.id === id)
    ? list.map((p) => (p.id === id ? { id, name, color } : p))
    : [...list, { id, name, color }]
}

function App() {
  const [dice, setDice] = useState<Die[]>(() =>
    DICE.map((d) => ({ ...d, value: rollValue() })),
  )
  const [history, setHistory] = useState<RollEntry[]>([])
  const [rolling, setRolling] = useState(false)
  const [copied, setCopied] = useState(false)
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '')
  const [color, setColor] = useState(() => localStorage.getItem(COLOR_KEY) ?? randomColor())
  const [players, setPlayers] = useState<Player[]>([])
  const nextId = useRef(1)

  // Refs mirror the latest dice/history/roster so PeerJS event handlers and the
  // delayed roll callback read current values instead of stale closures.
  const diceRef = useRef(dice)
  const historyRef = useRef(history)
  const playersRef = useRef(players)

  // `handleMessage`/`handleClientJoin`/`handleClientLeave` are hoisted and only
  // ever invoked after render (on a peer event), so passing them straight through
  // is safe — and usePeerSync already keeps its own latest-callback refs, so
  // PeerJS always calls the freshest closure (with current `role`/`send`).
  const { role, status, roomCode, peerCount, peerId, error, createRoom, joinRoom, leave, send } =
    usePeerSync({
      onMessage: handleMessage,
      onClientJoin: handleClientJoin,
      onClientLeave: handleClientLeave,
    })

  const myName = name.trim()
  // Our identity for roll attribution: the peer id in a room, or a local 'me'
  // sentinel when solo. Only ever used to resolve our own color, never matched
  // as a roster key, so solo rolls that later ride into a room degrade cleanly.
  const selfId = peerId ?? 'me'
  // Our own roster entry: attributes our rolls and resolves our live name/color
  // in the history instantly, before the roster round-trips.
  const me: Player = { id: selfId, name: myName, color }

  // Commit new dice/history locally. The host is authoritative, so every state
  // change is broadcast to clients from this single point.
  function applyState(nextDice: Die[], nextHistory: RollEntry[]) {
    diceRef.current = nextDice
    historyRef.current = nextHistory
    setDice(nextDice)
    setHistory(nextHistory)
    if (role === 'host') {
      send({ type: 'state', dice: nextDice, history: nextHistory } satisfies Message)
    }
  }

  // Commit the roster locally; the host (authoritative for presence) broadcasts
  // it. Memoized so the host self-entry effect can depend on it without churn.
  const updateRoster = useCallback(
    (nextPlayers: Player[]) => {
      playersRef.current = nextPlayers
      setPlayers(nextPlayers)
      if (role === 'host') {
        send({ type: 'roster', players: nextPlayers } satisfies Message)
      }
    },
    [role, send],
  )

  // Generate a roll locally and (if hosting) broadcast it. Only ever runs on
  // the authoritative peer — solo or host. `roller` attributes it to a player.
  function performRoll(roller: Player) {
    setRolling(true)
    if (role === 'host') send({ type: 'rolling' } satisfies Message)
    setTimeout(() => {
      const rolled = DICE.map((d) => ({ ...d, value: rollValue() }))
      const nextHistory: RollEntry[] = [
        { id: nextId.current++, dice: rolled, roller },
        ...historyRef.current,
      ]
      applyState(rolled, nextHistory)
      setRolling(false)
    }, 500)
  }

  function roll() {
    if (status === 'connecting') return
    if (role === 'client') {
      send({ type: 'roll', roller: me } satisfies Message)
      return
    }
    performRoll(me)
  }

  function clearHistory() {
    if (role === 'client') {
      send({ type: 'clear' } satisfies Message)
      return
    }
    applyState(diceRef.current, [])
  }

  function handleMessage(msg: unknown) {
    const m = msg as Message
    if (role === 'host') {
      if (m.type === 'roll') performRoll(m.roller)
      else if (m.type === 'clear') clearHistory()
      else if (m.type === 'hello') {
        // We key the roster on the client's self-reported id, which PeerJS
        // guarantees equals the transport's `conn.peer` — so handleClientLeave
        // (which only has `conn.peer`) can later remove this same entry.
        updateRoster(upsertPlayer(playersRef.current, m.id, m.name, m.color))
      }
    } else if (role === 'client') {
      if (m.type === 'rolling') setRolling(true)
      else if (m.type === 'state') {
        setRolling(false)
        applyState(m.dice, m.history)
      } else if (m.type === 'roster') {
        updateRoster(m.players)
      }
    }
  }

  // Host: bring a newly-connected client up to date with current state + roster.
  function handleClientJoin() {
    send({ type: 'state', dice: diceRef.current, history: historyRef.current } satisfies Message)
    send({ type: 'roster', players: playersRef.current } satisfies Message)
  }

  // Host: drop a disconnected client from the roster.
  function handleClientLeave(id: string) {
    updateRoster(playersRef.current.filter((player) => player.id !== id))
  }

  // Auto-join when opened via a shared ?room=CODE link.
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    const code = new URLSearchParams(window.location.search).get('room')
    if (code) joinRoom(code)
  }, [joinRoom])

  // Persist the player's name and color across sessions.
  useEffect(() => {
    localStorage.setItem(NAME_KEY, name)
  }, [name])
  useEffect(() => {
    localStorage.setItem(COLOR_KEY, color)
  }, [color])

  // Host: keep our own roster entry (keyed by our peer id) in sync with our name/color.
  useEffect(() => {
    if (role !== 'host' || status !== 'connected' || !peerId) return
    updateRoster(upsertPlayer(playersRef.current, peerId, myName, color))
  }, [role, status, peerId, myName, color, updateRoster])

  // Client: announce our identity + name + color on connect and whenever it changes.
  useEffect(() => {
    if (role === 'client' && status === 'connected' && peerId) {
      send({ type: 'hello', id: peerId, name: myName, color } satisfies Message)
    }
  }, [role, status, peerId, myName, color, send])

  const shareLink = roomCode
    ? `${window.location.origin}${window.location.pathname}?room=${roomCode}`
    : ''

  function copyLink() {
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  // Reset presence when (re)starting or leaving a session, so stale players from
  // a previous room never linger into the next one.
  function resetRoster() {
    playersRef.current = []
    setPlayers([])
  }
  function startHosting() {
    resetRoster()
    createRoom()
  }
  function startJoining(code: string) {
    resetRoster()
    joinRoom(code)
  }
  function leaveRoom() {
    resetRoster()
    leave()
  }

  // History rows follow each roller's *current* name + color: resolve the roller
  // by id from the live roster (plus our own entry, applied instantly before the
  // roster round-trips), falling back to the snapshot taken at roll time once a
  // player has left the room.
  const playerById = new Map(players.map((p) => [p.id, p]))
  playerById.set(selfId, me)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-zinc-100 px-6 py-12">
      <SidePanel
        name={name}
        color={color}
        connected={status === 'connected'}
        onNameChange={setName}
        onColorChange={setColor}
      >
        <ConnectionPanel
          role={role}
          status={status}
          roomCode={roomCode}
          peerCount={peerCount}
          players={players}
          selfId={selfId}
          error={error}
          shareLink={shareLink}
          copied={copied}
          onCreate={startHosting}
          onJoin={startJoining}
          onLeave={leaveRoom}
          onCopy={copyLink}
        />
      </SidePanel>

      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900">
          WebRTC Dice Roller
        </h1>
      </header>

      <section className="grid grid-cols-3 gap-6 sm:grid-cols-6">
        {dice.map((die) => (
          <Dice key={die.id} die={die} rolling={rolling} />
        ))}
      </section>

      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={roll}
          disabled={rolling || status === 'connecting'}
          className="rounded-full bg-zinc-900 px-8 py-3 text-lg font-semibold text-white shadow-md transition hover:bg-zinc-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {rolling ? 'Rolling…' : 'Roll dice'}
        </button>
      </div>

      <section className="w-full max-w-md">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">History</h2>
          {history.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              className="text-sm font-medium text-zinc-500 transition hover:text-zinc-900"
            >
              Clear
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-400">
            No rolls yet — hit “Roll dice” to get started.
          </p>
        ) : (
          <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
            {history.map((entry, index) => (
              <HistoryEntry
                key={entry.id}
                entry={entry}
                label={history.length - index}
                roller={playerById.get(entry.roller.id) ?? entry.roller}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

export default App
