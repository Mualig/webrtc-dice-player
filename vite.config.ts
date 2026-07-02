// Importing defineConfig from 'vitest/config' (a superset of Vite's) types the
// `test` block below; it stays inert for `vite build`/`dev`.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves project sites under /<repo>/, so built asset URLs need
// that base. The deploy workflow sets VITE_BASE to "/<repo>/" automatically;
// for a local `build` we fall back to "./" (relative paths, work from any
// subpath), and the dev server stays at "/".
// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? (process.env.VITE_BASE ?? './') : '/',
  plugins: [react(), tailwindcss()],
  test: {
    // jsdom gives component tests a DOM; pure-logic tests run fine under it too.
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Only Vitest specs under src/; the Playwright E2E specs live in e2e/ and
    // must not be collected here (they use @playwright/test, not Vitest).
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
}))
