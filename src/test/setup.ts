// Global test setup: registers jest-dom matchers with Vitest's `expect`, and
// after every test unmounts rendered components and clears localStorage so the
// Scorecard's persistence never leaks between tests.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  localStorage.clear()
})
