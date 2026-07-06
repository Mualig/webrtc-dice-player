# WebRTC Dice Player

A peer-to-peer **Qwixx** dice game that runs entirely in the browser. Create a room, share a
4-letter code, and play with friends over a direct WebRTC connection — no account, no game
server, no data leaving your table.

**Play it here → <https://mualig.github.io/webrtc-dice-player/>**

## Features

- 🎲 **Dice roller** — the six Qwixx dice (2 white + red, yellow, green, blue) with a synced
  roll history showing who rolled what.
- 📋 **Full Qwixx scorecard** — cross off numbers left to right, lock a row after five crosses,
  take penalties one at a time. The card enforces the marking rules; mistakes are reverted with
  **Undo**, never by un-clicking (just like the paper card, but forgiving).
- 🌐 **Peer-to-peer multiplayer** — create a room and share the code or invite link. Peers
  connect directly over WebRTC data channels ([PeerJS](https://peerjs.com)); the host relays
  and is authoritative for shared state. The roster tags the host and yourself.
- 👀 **Shared game state** — a live activity feed of every player's moves (undos strike the
  original entry), each player's score breakdown on an "Other players" board, and shared row
  locks: when anyone locks a color, its die stops rolling and that row closes for the whole
  room — starting from the *next* roll, so everyone may finish the current one first (even
  locking the same row too, like the paper game).
- 🏁 **Game over, by the rules** — two locked rows or a fourth penalty starts a *final turn*:
  everyone finishes marking the current roll and confirms with **I'm done**, then the game ends
  for the whole room with a ranked leaderboard and a **New game** button that resets it.
  Ending on a misclick? Undo it and play resumes.
- 📜 **Game history** — finished games are saved on your device (last 100), browsable from the
  menu, each entry removable.
- 🧍 **Solo mode** — everything works without a room, too.

Your name, color, scorecard, and history persist in `localStorage` — refreshing never loses
your card.

> Which number you may cross off for a given roll is left to the table, exactly like the paper
> game — the app enforces the card's rules, not the dice reading.

## Getting started

Requires **Node ≥ 24**.

```bash
npm ci
npm run dev       # dev server on http://localhost:5173
```

Other scripts:

```bash
npm run build     # type-check + production build (dist/)
npm run preview   # serve the production build locally
npm run lint      # eslint
```

## Testing

Two layers, both run in CI before every deploy:

```bash
npm test              # unit + component tests (Vitest, jsdom, Testing Library)

npx playwright install chromium   # once
npm run test:e2e      # end-to-end multiplayer tests (Playwright)
```

The E2E suite is fully self-contained: it boots a **local PeerJS signaling broker** (port 9000)
and the Vite dev server, then drives two real browser contexts through the WebRTC handshake —
rolling, marking, locking, ending, and restarting games across peers. The public PeerJS cloud
broker is never touched.

To point the app at a self-hosted broker yourself, set `VITE_PEER_HOST` (and optionally
`VITE_PEER_PORT`, `VITE_PEER_PATH`, `VITE_PEER_SECURE`, `VITE_PEER_KEY`); unset, the app uses
the public PeerJS cloud broker for signaling. Either way, game traffic itself flows directly
between peers.

## How it works

- **Stack** — React 19, TypeScript, Vite, Tailwind CSS v4, PeerJS.
- **Host-authoritative protocol** — clients send intents (`roll`, `action`, `score`,
  `newgame`, `done`); the host applies them and broadcasts the resulting state (`state`,
  `actions`, `scores`, `roster`, `ending`) to everyone. Joining mid-game gets you the full
  current state. Incoming payloads are never trusted: every message is shape-validated
  (`parseMessage`) on receipt, and malformed data is dropped.
- **Rooms** — the host registers on the signaling broker under an id derived from the room
  code, so clients can dial it directly (and anyone can tell who hosts). The broker is only
  used to establish the connection.
- **Derived game-over, turn-boundary effects** — each card reports a summary (score breakdown
  + locked rows); every peer derives standings and the end condition from the same shared
  summaries, so the whole room always agrees. Reported locks only take effect at the next roll
  (the host snapshots them onto the `state` message), and the end condition opens a final turn
  that the host closes once every player has confirmed — so two players acting at once never
  lock each other out. Undoing the trigger move resumes play everywhere.
- **Layout** — game rules live in `src/scorecard.ts`, networking in `src/usePeerSync.ts`, the
  wire protocol in `src/types.ts`, history persistence in `src/gameHistory.ts`, and the UI in
  `src/components/`.

## Deployment

Pushes to `main` run the GitHub Actions pipeline: lint + type-check → unit & E2E tests → build
→ deploy to GitHub Pages.
