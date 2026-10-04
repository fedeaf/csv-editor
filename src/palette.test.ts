// Guards the colour palette in style.css: whatever the values are, the text must stay readable in
// both themes. Ratios are WCAG contrast ratios; text needs 4.5, decorations and outlines less.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8')
const paletteBlock = css.match(/:root \{([\s\S]*?)\n\}/)![1]!
const raw = Object.fromEntries(
  [...paletteBlock.matchAll(/--([\w-]+):\s*([^;]+?);/g)].map((m) => [m[1]!, m[2]!.replace(/\/\*.*\*\//, '').trim()]),
)

/** Splits the two arguments of light-dark(a, b) at the comma that is not inside brackets. */
function splitLightDark(value: string): [string, string] | undefined {
  if (!value.startsWith('light-dark(')) return undefined
  const inner = value.slice('light-dark('.length, -1)
  let depth = 0
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '(') depth++
    else if (inner[i] === ')') depth--
    else if (inner[i] === ',' && depth === 0) return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()]
  }
  return undefined
}

type Theme = Record<string, string>
const theme = (side: 0 | 1): Theme =>
  Object.fromEntries(Object.entries(raw).map(([name, value]) => [name, splitLightDark(value)?.[side] ?? value]))
const light = theme(0)
const dark = theme(1)

function resolve(t: Theme, value: string): string {
  while (value.startsWith('var(')) value = t[value.slice(6, -1)]!
  return value
}
const channels = (hex: string) =>
  (hex.replace('#', '').length === 3 ? [...hex.replace('#', '')].map((c) => c + c) : hex.replace('#', '').match(/../g)!).map((x) => parseInt(x, 16))
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(t: Theme, a: string, b: string): number {
  const [hi, lo] = [luminance(resolve(t, t[a]!)), luminance(resolve(t, t[b]!))].sort((x, y) => y - x) as [number, number]
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
])('the %s palette', (_name, t) => {
  it.each(pairs)('%s on %s is at least %d:1', (text, background, minimum) => {
    expect(contrast(t, text, background)).toBeGreaterThanOrEqual(minimum)
  })
})

describe('the palette', () => {
  it('writes every colour once, with both of its values', () => {
    const plain = Object.entries(raw).filter(([, v]) => /^#|^rgb\(/.test(v)).map(([k]) => k)
    expect(plain).toEqual([])
  })
  it('gives the dark theme different text and surfaces', () => {
    for (const name of ['ink', 'ink-muted', 'surface', 'chrome', 'line', 'accent']) expect(dark[name]).not.toBe(light[name])
  })
  it('uses no colour outside the palette', () => {
    const outside = css.replace(/:root \{[\s\S]*?\n\}/, '')
    expect([...outside.matchAll(/#[0-9a-fA-F]{3,8}\b|rgb\([^)]*\)/g)].map((m) => m[0]).filter((c) => c !== '#0000')).toEqual([])
  })
  it('lets the page force either theme, and follows the system otherwise', () => {
    expect(css).toMatch(/color-scheme: light dark/)
    expect(css).toMatch(/:root\[data-theme='light'\] \{ color-scheme: light; \}/)
    expect(css).toMatch(/:root\[data-theme='dark'\] \{ color-scheme: dark; \}/)
  })
})
