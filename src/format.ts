// Present a possibly-empty player name, trimming whitespace and falling back to
// a placeholder. The roster uses 'Anonymous'; the menu toggle uses 'Player'.
export function displayName(raw: string, fallback = 'Anonymous') {
  return raw.trim() || fallback
}
