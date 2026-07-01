import { defineConfig } from 'vite'
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
}))
