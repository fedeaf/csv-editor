// Guards the colour palette in style.css: whatever the values are, the text must stay readable in
// both themes. Ratios are WCAG contrast ratios; text needs 4.5, decorations and outlines less.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8')
const tokens = (block: string) =>
  Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+?);/g)].map((m) => [m[1]!, m[2]!.replace(/\/\*.*\*\//, '').trim()]))

const light = tokens(css.match(/:root \{([\s\S]*?)\n\}/)![1]!)
const dark = { ...light, ...tokens(css.match(/prefers-color-scheme: dark\) \{\s*:root \{([\s\S]*?)\n  \}/)![1]!) }

function resolve(theme: Record<string, string>, value: string): string {
  while (value.startsWith('var(')) value = theme[value.slice(6, -1)]!
  return value
}
const channels = (hex: string) => (hex.replace('#', '').length === 3 ? [...hex.replace('#', '')].map((c) => c + c) : hex.replace('#', '').match(/../g)!).map((x) => parseInt(x, 16))
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(theme: Record<string, string>, a: string, b: string): number {
  const [hi, lo] = [luminance(resolve(theme, theme[a]!)), luminance(resolve(theme, theme[b]!))].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** [text colour, background, minimum ratio] */
const pairs: [string, string, number][] = [
  ['ink', 'surface', 4.5],
  ['ink', 'chrome', 4.5],
  ['ink', 'surface-alt', 4.5],
  ['ink-muted', 'surface', 4.5],
  ['ink-muted', 'chrome', 4.5],
  ['ink-subtle', 'surface', 4.5],
  ['ink-subtle', 'chrome', 4], // hints and icons on the toolbar
  ['accent', 'surface', 4.5],
  ['accent-ink', 'accent', 4.5], // the text of a primary button
  ['accent-ink', 'danger', 4.5], // the text of a button that discards
  ['ink', 'selection-fill', 4.5],
  ['ink', 'selection-header', 4.5],
  ['ink', 'selection-header-strong', 4.5],
  ['ink', 'accent-wash', 4.5],
  ['ink', 'accent-tint', 4.5],
  ['warn-ink', 'warn-bg', 4.5], // the DUP indicator
  ['ink', 'notice-bg', 4.5],
  ['danger', 'surface', 4.5], // "No matches"
  ['danger', 'chrome', 4.5],
  ['accent', 'selection-fill', 3], // the outline of a selected block against its fill
  ['ok', 'chrome', 2.5], // the check mark of a column without duplicates: decoration
]

describe.each([
  ['light', light],
  ['dark', dark],
])('the %s palette', (_name, theme) => {
  it.each(pairs)('%s on %s is at least %d:1', (text, background, minimum) => {
    expect(contrast(theme, text, background)).toBeGreaterThanOrEqual(minimum)
  })
})

describe('the palette', () => {
  it('gives the dark theme a value for every colour that differs in the light one', () => {
    const colours = Object.keys(light).filter((k) => /^#|^rgb/.test(light[k]!) && !k.startsWith('shadow'))
    const missing = colours.filter((k) => dark[k] === light[k] && !['ink-disabled'].includes(k) && !/^(selection-edge)$/.test(k))
    expect(missing).toEqual([])
  })
  it('uses no colour outside the palette', () => {
    const outside = css.replace(/:root \{[\s\S]*?\n\}/, '').replace(/@media \(prefers-color-scheme: dark\) \{[\s\S]*?\n\}\n/, '')
    expect([...outside.matchAll(/#[0-9a-fA-F]{3,8}\b|rgb\([^)]*\)/g)].map((m) => m[0]).filter((c) => c !== '#0000')).toEqual([])
  })
})
