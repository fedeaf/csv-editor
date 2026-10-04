// The light and dark looks. By default the page follows the system. Menu > Dark Mode forces the other
// one for as long as the page stays open: it is deliberately kept nowhere, so the next visit starts
// from the system's choice again.

export type Theme = 'light' | 'dark'

const system = window.matchMedia('(prefers-color-scheme: dark)')
const root = document.documentElement

/** The theme in use: the one forced for this visit, else the system's. */
export function currentTheme(): Theme {
  const forced = root.dataset.theme
  if (forced === 'light' || forced === 'dark') return forced
  return system.matches ? 'dark' : 'light'
}

/** Switches to the other theme and keeps it, whatever the system does from now on. */
export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark'
  root.dataset.theme = next
  return next
}

/** Calls back now and whenever the theme in use changes without the user choosing it (the system changed). */
export function watchTheme(onChange: (theme: Theme) => void): void {
  onChange(currentTheme())
  system.addEventListener('change', () => {
    if (!root.dataset.theme) onChange(currentTheme())
  })
}
