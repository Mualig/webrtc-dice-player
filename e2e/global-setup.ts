import { PeerServer } from 'peer'
import type { Server } from 'node:http'

// Spin up a local PeerJS signaling broker so the WebRTC E2E tests never depend
// on the public cloud broker. The app is pointed at it via the VITE_PEER_* env
// vars in playwright.config.ts. Returns a teardown that closes it after the run.
export default async function globalSetup() {
  const broker = await new Promise<Server>((resolve) => {
    PeerServer({ port: 9000, path: '/' }, (server) => resolve(server as Server))
  })
  console.log('[e2e] PeerJS broker listening on :9000')

  return async () => {
    await new Promise<void>((resolve) => {
      broker.close(() => resolve())
    })
  }
}
