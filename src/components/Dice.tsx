import type { Die } from '../types'
import { COLOR_STYLES, PIP_LAYOUT } from '../dice'

// `disabled` marks a die whose color has been locked out of the game: it's greyed
// out, doesn't spin, and no longer rolls (see performRoll).
export function Dice({ die, rolling, disabled = false }: Readonly<{ die: Die; rolling: boolean; disabled?: boolean }>) {
  const styles = COLOR_STYLES[die.color]
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`grid h-20 w-20 grid-cols-3 grid-rows-3 gap-1 rounded-2xl p-2.5 shadow-lg transition-transform ${
          styles.face
        } ${rolling && !disabled ? 'animate-spin' : ''} ${disabled ? 'opacity-40 grayscale' : ''}`}
      >
        {Array.from({ length: 9 }, (_, cell) => (
          <div key={cell} className="flex items-center justify-center">
            {PIP_LAYOUT[die.value].includes(cell) && (
              <span className={`h-3 w-3 rounded-full ${styles.pip}`} />
            )}
          </div>
        ))}
      </div>
      <span className={`text-sm font-medium capitalize ${disabled ? 'text-zinc-400' : 'text-zinc-500'}`}>
        {disabled ? `${die.color} · locked` : die.color}
      </span>
    </div>
  )
}
