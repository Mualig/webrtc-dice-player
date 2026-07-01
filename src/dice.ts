import type { DiceColor } from './types'

export const DICE: { id: string; color: DiceColor }[] = [
  { id: 'white-1', color: 'white' },
  { id: 'white-2', color: 'white' },
  { id: 'red', color: 'red' },
  { id: 'yellow', color: 'yellow' },
  { id: 'green', color: 'green' },
  { id: 'blue', color: 'blue' },
]

export const COLOR_STYLES: Record<
  DiceColor,
  { face: string; pip: string; text: string }
> = {
  white: { face: 'bg-white border border-zinc-300', pip: 'bg-zinc-800', text: 'text-zinc-800' },
  red: { face: 'bg-red-500', pip: 'bg-white', text: 'text-white' },
  yellow: { face: 'bg-yellow-400', pip: 'bg-white', text: 'text-white' },
  green: { face: 'bg-green-600', pip: 'bg-white', text: 'text-white' },
  blue: { face: 'bg-blue-600', pip: 'bg-white', text: 'text-white' },
}

// The colored dice as sRGB hex — matching the Tailwind shades in COLOR_STYLES
// (red-500, yellow-400, green-600, blue-600). Used as the default palette a
// player's color is picked from; white is omitted (invisible as a border).
export const PLAYER_COLOR_PALETTE = ['#fb2c36', '#fdc700', '#00a63e', '#155dfc']

// Which of the 9 grid cells are filled for each die value (1-6).
export const PIP_LAYOUT: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

export function rollValue() {
  return Math.floor(Math.random() * 6) + 1
}
