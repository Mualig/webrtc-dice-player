import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePeerSync } from './usePeerSync';
import type { ActionEntry, Die, Message, Player, RollEntry } from './types';
import { type CardSummary, EMPTY_SUMMARY, gameOverReason, lockedAcross, type MoveEvent } from './scorecard';
import {
  addGame,
  type GameRecord,
  loadGameHistory,
  type PlayerResult,
  sameOutcome,
  saveGameHistory,
} from './gameHistory';
import { DICE, PLAYER_COLOR_PALETTE, rollValue } from './dice';
import { displayName } from './format';
import { Dice } from './components/Dice';
import { HistoryEntry } from './components/History';
import { ConnectionPanel } from './components/ConnectionPanel';
import { SidePanel } from './components/SidePanel';
import { Scorecard } from './components/Scorecard';
import { ActivityFeed } from './components/ActivityFeed';
import { ScoreBoard } from './components/ScoreBoard';
import { GameOverBanner } from './components/GameOverBanner';
import { NewGameButton } from './components/NewGameButton';
import { GameHistory } from './components/GameHistory';
import { EmptyHint } from './components/EmptyHint';

// The activity feed keeps only the most recent moves so the log — and the
// message that broadcasts it — stays bounded over a long game.
const MAX_ACTIVITY = 50;

const NAME_KEY = 'webrtc-dice-player-player-name';
const COLOR_KEY = 'webrtc-dice-player-player-color';

// Stable empty standings while the game is running, so the memo below doesn't
// hand the recording effect a fresh [] on every score update.
const NO_STANDINGS: PlayerResult[] = [];

// Players are assigned one of the dice colors by default; the picker still lets
// them choose any color afterwards.
function randomColor() {
  return PLAYER_COLOR_PALETTE[Math.floor(Math.random() * PLAYER_COLOR_PALETTE.length)];
}

function upsertPlayer(list: Player[], id: string, name: string, color: string): Player[] {
  return list.some((p) => p.id === id)
    ? list.map((p) => (p.id === id ? {id, name, color} : p))
    : [...list, {id, name, color}];
}

// Mark the entry with the given id as undone (struck, not removed). No-op if it
// isn't in the log — e.g. it already scrolled past MAX_ACTIVITY — so an undo can
// never strike the wrong row.
function strikeById(actions: ActionEntry[], id: string): ActionEntry[] {
  const i = actions.findIndex((a) => a.id === id);
  return i === -1 ? actions : actions.map((a, idx) => (idx === i ? {...a, undone: true} : a));
}

function App() {
  const [dice, setDice] = useState<Die[]>(() =>
    DICE.map((d) => ({...d, value: rollValue()})),
  );
  const [history, setHistory] = useState<RollEntry[]>([]);
  const [rolling, setRolling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [color, setColor] = useState(() => localStorage.getItem(COLOR_KEY) ?? randomColor());
  const [players, setPlayers] = useState<Player[]>([]);
  const [actions, setActions] = useState<ActionEntry[]>([]);
  // Our own card summary (reported by <Scorecard onReport> — score breakdown plus
  // the colors we've locked), and every player's summary keyed by peer id (the
  // host aggregates and broadcasts these).
  const [mySummary, setMySummary] = useState(EMPTY_SUMMARY);
  const [summaries, setSummaries] = useState<Record<string, CardSummary>>({});
  // Bumped to tell our own <Scorecard> to clear itself for a new game (see below).
  const [newGameSignal, setNewGameSignal] = useState(0);
  // Finished games recorded on this device (newest first), browsable in a
  // full-screen view opened from the menu.
  const [gameHistory, setGameHistory] = useState<GameRecord[]>(loadGameHistory);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Memoized so the memoized history view can skip re-renders while open.
  const closeHistory = useCallback(() => setHistoryOpen(false), []);
  // Host-assigned id for the roll history (the host is its sole writer). Activity
  // entries instead key off the mover's own stable move id (see applyMove).
  const nextId = useRef(1);

  // Refs mirror the latest dice/history/roster/activity/scores so PeerJS event
  // handlers and the delayed roll callback read current values, not stale closures.
  const diceRef = useRef(dice);
  const historyRef = useRef(history);
  const playersRef = useRef(players);
  const actionsRef = useRef(actions);
  const summariesRef = useRef(summaries);
  const gameHistoryRef = useRef(gameHistory);

  // `handleMessage`/`handleClientJoin`/`handleClientLeave` are hoisted and only
  // ever invoked after render (on a peer event), so passing them straight through
  // is safe — and usePeerSync already keeps its own latest-callback refs, so
  // PeerJS always calls the freshest closure (with current `role`/`send`).
  const {role, status, roomCode, peerCount, peerId, error, createRoom, joinRoom, leave, send} =
    usePeerSync({
      onMessage: handleMessage,
      onClientJoin: handleClientJoin,
      onClientLeave: handleClientLeave,
    });

  const myName = name.trim();
  // Our identity for roll attribution: the peer id in a room, or a local 'me'
  // sentinel when solo. Only ever used to resolve our own color, never matched
  // as a roster key, so solo rolls that later ride into a room degrade cleanly.
  const selfId = peerId ?? 'me';
  // Our own roster entry: attributes our rolls and resolves our live name/color
  // in the history instantly, before the roster round-trips. Memoized so the
  // lookup map below (and everything derived from it) stays stable.
  const me: Player = useMemo(() => ({id: selfId, name: myName, color}), [selfId, myName, color]);

  // Commit new dice/history locally. The host is authoritative, so every state
  // change is broadcast to clients from this single point.
  function applyState(nextDice: Die[], nextHistory: RollEntry[]) {
    diceRef.current = nextDice;
    historyRef.current = nextHistory;
    setDice(nextDice);
    setHistory(nextHistory);
    if (role === 'host') {
      send({type: 'state', dice: nextDice, history: nextHistory} satisfies Message);
    }
  }

  // Commit the roster locally; the host (authoritative for presence) broadcasts
  // it. Memoized so the host self-entry effect can depend on it without churn.
  const updateRoster = useCallback(
    (nextPlayers: Player[]) => {
      playersRef.current = nextPlayers;
      setPlayers(nextPlayers);
      if (role === 'host') {
        send({type: 'roster', players: nextPlayers} satisfies Message);
      }
    },
    [role, send],
  );

  // Commit the per-player summaries locally; the host (authoritative) broadcasts
  // them. Memoized so the reporting effect can depend on it without churn.
  const updateSummaries = useCallback(
    (next: Record<string, CardSummary>) => {
      summariesRef.current = next;
      setSummaries(next);
      if (role === 'host') {
        send({type: 'scores', scores: next} satisfies Message);
      }
    },
    [role, send],
  );

  // Commit the recorded-games list locally and persist it — localStorage is its
  // storage of record. Memoized so the recording effect can depend on it.
  const applyGameHistory = useCallback((next: GameRecord[]) => {
    gameHistoryRef.current = next;
    setGameHistory(next);
    saveGameHistory(next);
  }, []);

  // Remove one recorded game — a row's X button, or the recording effect
  // dropping an un-ended game. Deliberately leaves savedGameRef alone: for a
  // still-displayed game-over it keeps marking that game as already handled, so
  // the recording effect can't re-record the game the user just deleted.
  const removeGame = useCallback(
    (game: GameRecord) => applyGameHistory(gameHistoryRef.current.filter((g) => g !== game)),
    [applyGameHistory],
  );

  // Commit the shared activity log locally; the host — authoritative for it,
  // since clients only reach one another through the host — broadcasts it.
  function applyActions(next: ActionEntry[]) {
    actionsRef.current = next;
    setActions(next);
    if (role === 'host') {
      send({type: 'actions', actions: next} satisfies Message);
    }
  }

  // Host-only: apply a move event by `actor` to the shared log. Its entry id is
  // the actor's peer id namespaced with the card's own move id — globally unique
  // and stable — so an undo strikes that exact entry (no new row). Any other move
  // is prepended, bounded to the most recent MAX_ACTIVITY.
  function applyMove(actor: Player, event: MoveEvent) {
    const id = `${actor.id}-${event.id}`;
    if (event.type === 'undo') {
      applyActions(strikeById(actionsRef.current, id));
      return;
    }
    const entry: ActionEntry = {id, actor, move: event.move};
    applyActions([entry, ...actionsRef.current].slice(0, MAX_ACTIVITY));
  }

  // A scorecard move we just made (from <Scorecard onMove>). The host applies it
  // directly; a client forwards it for the host to apply and relay. Solo has no
  // shared feed, so there is nothing to track.
  function recordMove(event: MoveEvent) {
    if (role === 'host') applyMove(me, event);
    else if (role === 'client') send({type: 'action', actor: me, event} satisfies Message);
  }

  // Generate a roll locally and (if hosting) broadcast it. Only ever runs on
  // the authoritative peer — solo or host. `roller` attributes it to a player.
  function performRoll(roller: Player) {
    setRolling(true);
    if (role === 'host') send({type: 'rolling'} satisfies Message);
    setTimeout(() => {
      // A locked color's die is out of play: keep its current face, roll the rest.
      const locked = lockedAcross(summariesRef.current);
      const rolled = diceRef.current.map((d) =>
        d.color !== 'white' && locked.includes(d.color) ? d : {...d, value: rollValue()},
      );
      const nextHistory: RollEntry[] = [
        {id: nextId.current++, dice: rolled, roller},
        ...historyRef.current,
      ];
      applyState(rolled, nextHistory);
      setRolling(false);
    }, 500);
  }

  function roll() {
    if (status === 'connecting') return;
    if (role === 'client') {
      send({type: 'roll', roller: me} satisfies Message);
      return;
    }
    performRoll(me);
  }

  function clearHistory() {
    if (role === 'client') {
      send({type: 'clear'} satisfies Message);
      return;
    }
    applyState(diceRef.current, []);
  }

  // Start a fresh game for the whole room. A client asks the host; the host (or a
  // solo player) clears the shared logs/scores/history and tells every peer to
  // reset its scorecard. Each player's board then re-reports a blank summary, so
  // the derived game-over state clears itself.
  function newGame() {
    if (role === 'client') {
      send({type: 'newgame'} satisfies Message);
      return;
    }
    performNewGame();
  }

  function performNewGame() {
    commitSavedGame(); // the recorded result stands — this reset is not an Undo
    // Tell clients first: they must commit their own record of the ended game
    // before the clearing broadcasts below make their game-over state vanish.
    if (role === 'host') send({type: 'newgame'} satisfies Message);
    applyActions([]);
    updateSummaries({});
    applyState(diceRef.current, []);
    setNewGameSignal((n) => n + 1); // reset our own scorecard
  }

  // The record of the game that ended most recently, while its game-over is still
  // showing: it is dropped again if the end is taken back with Undo. `committed`
  // marks it final — the game-over is clearing for another reason (a new game
  // started, or the session was left), so the record must stay.
  const savedGameRef = useRef<GameRecord | 'committed' | null>(null);

  function commitSavedGame() {
    if (savedGameRef.current) savedGameRef.current = 'committed';
  }

  function handleMessage(msg: unknown) {
    const m = msg as Message;
    if (role === 'host') {
      if (m.type === 'roll') performRoll(m.roller);
      else if (m.type === 'clear') clearHistory();
      else if (m.type === 'newgame') performNewGame();
      else if (m.type === 'action') applyMove(m.actor, m.event);
      else if (m.type === 'score') updateSummaries({...summariesRef.current, [m.id]: m.summary});
      else if (m.type === 'hello') {
        // We key the roster on the client's self-reported id, which PeerJS
        // guarantees equals the transport's `conn.peer` — so handleClientLeave
        // (which only has `conn.peer`) can later remove this same entry.
        updateRoster(upsertPlayer(playersRef.current, m.id, m.name, m.color));
      }
    } else if (role === 'client') {
      if (m.type === 'rolling') setRolling(true);
      else if (m.type === 'state') {
        setRolling(false);
        applyState(m.dice, m.history);
      } else if (m.type === 'roster') {
        updateRoster(m.players);
      } else if (m.type === 'actions') {
        applyActions(m.actions);
      } else if (m.type === 'scores') {
        updateSummaries(m.scores);
      } else if (m.type === 'newgame') {
        commitSavedGame(); // the recorded result stands — this reset is not an Undo
        setNewGameSignal((n) => n + 1); // reset our scorecard for the new game
      }
    }
  }

  // Host: bring a newly-connected client up to date with current state, roster,
  // the shared activity log and every player's score.
  function handleClientJoin() {
    send({type: 'state', dice: diceRef.current, history: historyRef.current} satisfies Message);
    send({type: 'roster', players: playersRef.current} satisfies Message);
    send({type: 'actions', actions: actionsRef.current} satisfies Message);
    send({type: 'scores', scores: summariesRef.current} satisfies Message);
  }

  // Host: drop a disconnected client from the roster and the scoreboard.
  function handleClientLeave(id: string) {
    updateRoster(playersRef.current.filter((player) => player.id !== id));
    const rest = {...summariesRef.current};
    delete rest[id];
    updateSummaries(rest);
  }

  // Auto-join when opened via a shared ?room=CODE link.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const code = new URLSearchParams(window.location.search).get('room');
    if (code) joinRoom(code);
  }, [joinRoom]);

  // Persist the player's name and color across sessions.
  useEffect(() => {
    localStorage.setItem(NAME_KEY, name);
  }, [name]);
  useEffect(() => {
    localStorage.setItem(COLOR_KEY, color);
  }, [color]);

  // Host: keep our own roster entry (keyed by our peer id) in sync with our name/color.
  useEffect(() => {
    if (role !== 'host' || status !== 'connected' || !peerId) return;
    updateRoster(upsertPlayer(playersRef.current, peerId, myName, color));
  }, [role, status, peerId, myName, color, updateRoster]);

  // Client: announce our identity + name + color on connect and whenever it changes.
  useEffect(() => {
    if (role === 'client' && status === 'connected' && peerId) {
      send({type: 'hello', id: peerId, name: myName, color} satisfies Message);
    }
  }, [role, status, peerId, myName, color, send]);

  // Host: keep our own summary in the shared board; client: report it to the host.
  // Runs on connect and whenever our card changes.
  useEffect(() => {
    if (status !== 'connected' || !peerId) return;
    if (role === 'host') updateSummaries({...summariesRef.current, [peerId]: mySummary});
    else if (role === 'client') send({type: 'score', id: peerId, summary: mySummary} satisfies Message);
  }, [role, status, peerId, mySummary, updateSummaries, send]);

  const shareLink = roomCode
    ? `${window.location.origin}${window.location.pathname}?room=${roomCode}`
    : '';

  function copyLink() {
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  // Reset presence and activity when (re)starting or leaving a session, so stale
  // players or moves from a previous room never linger into the next one.
  function resetSession() {
    commitSavedGame(); // leaving a shown game-over keeps its recorded result
    playersRef.current = [];
    setPlayers([]);
    actionsRef.current = [];
    setActions([]);
    summariesRef.current = {};
    setSummaries({});
  }

  function startHosting() {
    resetSession();
    createRoom();
  }

  function startJoining(code: string) {
    resetSession();
    joinRoom(code);
  }

  function leaveRoom() {
    resetSession();
    leave();
  }

  // Attributed entries (rolls and activity) follow the player's *current* name +
  // color: resolve by id from the live roster (plus our own entry, applied
  // instantly before the roster round-trips), falling back to the snapshot taken
  // at the time of the entry once that player has left the room. Memoized so the
  // standings memo below can depend on it without churn.
  const playerById = useMemo(() => {
    const map = new Map(players.map((p) => [p.id, p]));
    map.set(me.id, me);
    return map;
  }, [players, me]);
  const resolvePlayer = (snapshot: Player): Player => playerById.get(snapshot.id) ?? snapshot;

  // Colors any player has locked are out of play for everyone: their die stops
  // rolling and no one may mark that row. Union across every reported summary.
  const lockedColors = lockedAcross(summaries);

  // End of game (Qwixx): two rows locked anywhere, or any player took all four
  // penalties. Fold our own latest summary in so it triggers instantly — and so
  // solo works, since solo never populates `summaries`. Every peer evaluates the
  // same shared state, so the game ends for all of them at once.
  const gameSummaries = useMemo(
    () => ({...summaries, [selfId]: mySummary}),
    [summaries, selfId, mySummary],
  );
  const endReason = gameOverReason(gameSummaries);
  const gameOver = endReason !== null;

  // Final standings (highest total first) once the game has ended — rendered in
  // the game-over banner and recorded to this device's history. Memoized so the
  // recording effect below fires only on real changes.
  const standings = useMemo<PlayerResult[]>(() => {
    if (!gameOver) return NO_STANDINGS;
    return Object.entries(gameSummaries)
      .map(([id, s]) => ({
        name: displayName(playerById.get(id)?.name ?? ''),
        total: s.totals.total,
        ...(id === selfId && {you: true}),
      }))
      .sort((a, b) => b.total - a.total);
  }, [gameOver, gameSummaries, playerById, selfId]);

  // Record the game the moment it ends; drop the record again if the end is taken
  // back with Undo (a misclicked fourth penalty), unless it was committed by a
  // new game / leaving the room. A game-over re-detected after a page reload
  // matches the newest saved record (sameOutcome) and is not recorded twice.
  useEffect(() => {
    if (endReason && !savedGameRef.current) {
      const record: GameRecord = {endedAt: Date.now(), reason: endReason, players: standings};
      const newest = gameHistoryRef.current[0];
      if (newest && sameOutcome(newest, record)) {
        savedGameRef.current = newest;
      } else {
        savedGameRef.current = record;
        applyGameHistory(addGame(gameHistoryRef.current, record));
      }
    } else if (!endReason && savedGameRef.current) {
      const saved = savedGameRef.current;
      savedGameRef.current = null;
      if (saved !== 'committed') removeGame(saved);
    }
  }, [endReason, standings, applyGameHistory, removeGame]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-zinc-100 px-6 py-12">
      <SidePanel
        name={name}
        color={color}
        connected={status === 'connected'}
        onNameChange={setName}
        onColorChange={setColor}
      >
        {(closeMenu) => (
          <>
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
            {/* Starting a new game dismisses the menu so the fresh board is visible. */}
            <NewGameButton
              onNewGame={() => {
                newGame();
                closeMenu();
              }}
            />
            {/* Opens the full-screen history view; the drawer closes so the view's
                Close button returns straight to the game. */}
            <button
              type="button"
              onClick={() => {
                setHistoryOpen(true);
                closeMenu();
              }}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              Game history{gameHistory.length > 0 && ` · ${gameHistory.length}`}
            </button>
          </>
        )}
      </SidePanel>

      {historyOpen && <GameHistory games={gameHistory} onClose={closeHistory} onRemove={removeGame}/>}

      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900">
          WebRTC Dice Player
        </h1>
      </header>

      {endReason && <GameOverBanner players={standings} reason={endReason} onNewGame={newGame}/>}

      <section className="grid grid-cols-3 gap-6 sm:grid-cols-6">
        {dice.map((die) => (
          <Dice
            key={die.id}
            die={die}
            rolling={rolling}
            disabled={die.color !== 'white' && lockedColors.includes(die.color)}
          />
        ))}
      </section>

      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={roll}
          disabled={rolling || status === 'connecting' || gameOver}
          className="rounded-full bg-zinc-900 px-8 py-3 text-lg font-semibold text-white shadow-md transition hover:bg-zinc-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {rolling ? 'Rolling…' : 'Roll dice'}
        </button>
      </div>

      {/* 2×2 grid on wide screens: the scorecard and the activity feed share the
          top row (so the feed is exactly the scorecard's height), with the other-
          players scoreboard and the dice history — the least important part — on
          the row beneath them. Everything stacks into one column on narrow screens. */}
      <div
        className="grid w-full max-w-7xl grid-cols-1 gap-6 xl:grid-cols-[minmax(0,48rem)_minmax(0,28rem)] xl:justify-center">
        {/* Always report our summary: the room needs it for the scoreboard and
            shared locks, and every mode needs it to detect game over.
            `lockedColors` closes rows locked by anyone in the room (empty solo);
            `gameOver` freezes the card once the game ends. */}
        <Scorecard
          onMove={recordMove}
          onReport={setMySummary}
          lockedColors={lockedColors}
          gameOver={gameOver}
          newGameSignal={newGameSignal}
        />
        {/* Shared feed + other players' scores — only meaningful in a room. */}
        {role !== 'solo' && (
          <>
            <ActivityFeed actions={actions} resolveActor={resolvePlayer}/>
            <ScoreBoard className="xl:self-start" players={players} summaries={summaries} selfId={selfId}/>
          </>
        )}
        <section className="w-full xl:self-start">
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
            <EmptyHint>No rolls yet — hit “Roll dice” to get started.</EmptyHint>
          ) : (
            <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
              {history.map((entry, index) => (
                <HistoryEntry
                  key={entry.id}
                  entry={entry}
                  label={history.length - index}
                  roller={resolvePlayer(entry.roller)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

export default App;
