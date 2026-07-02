import { defineConfig, devices } from '@playwright/test';

// Kept in sync with e2e/global-setup.ts, which starts the local PeerJS broker.
const PEER_PORT = 9000;
const APP_PORT = 5173;

export default defineConfig({
  testDir: './e2e',
  // WebRTC handshakes take a moment; keep tests serial with generous timeouts.
  workers: 1,
  timeout: 30_000,
  expect: {timeout: 10_000},
  reporter: 'list',
  forbidOnly: !!process.env.CI,
  // The WebRTC handshake occasionally times out on a cold connection, so retry
  // before failing (a real regression fails every attempt); CI retries more.
  retries: process.env.CI ? 2 : 1,
  // Boots a local signaling broker so tests never touch the public cloud broker.
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Expose raw 127.0.0.1 host candidates so two local peers can form a
          // data channel — Chrome otherwise hides them behind mDNS .local names,
          // which don't resolve between headless contexts.
          args: ['--disable-features=WebRtcHideLocalIpsWithMdns'],
        },
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${APP_PORT} --strictPort`,
    url: `http://localhost:${APP_PORT}`,
    reuseExistingServer: !process.env.CI,
    // Point the app at our local broker (see src/usePeerSync.ts PEER_OPTIONS).
    env: {
      VITE_PEER_HOST: '127.0.0.1',
      VITE_PEER_PORT: String(PEER_PORT),
      VITE_PEER_PATH: '/',
      VITE_PEER_SECURE: 'false',
    },
  },
});
