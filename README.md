# WebRTC Dice Roller

A real-time, peer-to-peer dice roller for the board game Qwixx. Roll the six dice (two white plus red, yellow, green &
blue) on your own, or start a room and share live rolls with friends over a direct WebRTC connection — no server, no
accounts.

## Features

- **Roll the six Qwixx dice** with a quick roll animation.
- **Play together in a room.** Create a room to get a short 4-character code and an invitation link, or join an existing
  room by code (or by opening a shared `?room=CODE` link).
- **Direct peer-to-peer sync.** Rolls, history, and presence are synced over WebRTC via [PeerJS](https://peerjs.com/);
  the room host is authoritative and broadcasts state to everyone.
- **Side menu for your identity.** A lateral drawer lets you set your **name** and pick a **color**; a status dot shows
  when you're connected. Name and color are remembered across sessions (`localStorage`).
- **Shared, attributed history.** Every roll is recorded with who rolled it. Each entry's border and label follow that
  player's *current* name and color, falling back to a snapshot once they leave the room.
- **Live roster.** See who's currently in the room, each shown in their chosen color.

## Getting started

Requires **Node.js 24+**.

```bash
npm install     # install dependencies
npm run dev     # start the dev server (http://localhost:5173)
```

Other scripts:

```bash
npm run build   # type-check and build for production (outputs to dist/)
npm run preview # preview the production build locally
npm run lint    # run ESLint
```

## Multiplayer & networking

Peers connect directly to each other; only PeerJS's public broker is used to exchange connection info during setup.

## Deployment

Pushing to `main` builds and deploys to **GitHub Pages** via the workflow in [
`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). The workflow sets `VITE_BASE` to `/<repo>/` so assets
resolve under the project's Pages path. A local `npm run build` falls back to relative (`./`) asset paths, so the
`dist/` output works from any subpath.

## Tech stack

- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/) for dev/build
- [Tailwind CSS v4](https://tailwindcss.com/)
- [PeerJS](https://peerjs.com/) (WebRTC data channels)
