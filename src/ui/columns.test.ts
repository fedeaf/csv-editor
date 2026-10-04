import { describe, expect, it } from 'vitest'
import { clampWidth, columnAt, columnOffsets, fitWidth, longestStrings, MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from './columns'

describe('column positions', () => {
  const offsets = columnOffsets([200, 150, 300])

  it('gives the left edge of each column and the total', () => {
    expect(offsets).toEqual([0, 200, 350, 650])
  })
  it('finds the column under a position, also on the borders', () => {
    expect(columnAt(offsets, 0)).toBe(0)
    expect(columnAt(offsets, 199)).toBe(0)
    expect(columnAt(offsets, 200)).toBe(1)
    expect(columnAt(offsets, 349)).toBe(1)
    expect(columnAt(offsets, 350)).toBe(2)
    expect(columnAt(offsets, 649)).toBe(2)
  })
  it('clamps positions outside the table to the first and last column', () => {
    expect(columnAt(offsets, -50)).toBe(0)
    expect(columnAt(offsets, 10_000)).toBe(2)
  })
  it('copes with one column and with none', () => {
    expect(columnAt(columnOffsets([200]), 500)).toBe(0)
    expect(columnAt(columnOffsets([]), 5)).toBe(0)
  })
  it('agrees with a plain scan on many columns', () => {
    const widths = Array.from({ length: 500 }, (_, i) => 120 + ((i * 37) % 300))
    const o = columnOffsets(widths)
    for (const x of [0, 1, 119, 120, 5000, 77_777, o[500]! - 1]) {
      const scan = o.findIndex((edge, i) => i < 500 && edge <= x && x < o[i + 1]!)
      expect(columnAt(o, x)).toBe(scan)
    }
  })
})

describe('width limits', () => {
  it('keeps a width between the limits', () => {
    expect(clampWidth(10)).toBe(MIN_COLUMN_WIDTH)
    expect(clampWidth(99_999)).toBe(MAX_COLUMN_WIDTH)
    expect(clampWidth(250.6)).toBe(251)
  })
})

describe('fitting a column to its content', () => {
  it('picks the longest strings, longest first', () => {
    expect(longestStrings(['a', 'abcd', 'ab', 'abcdef', 'abc'], 3)).toEqual(['abcdef', 'abcd', 'abc'])
  })
  it('handles fewer strings than asked for, and none', () => {
    expect(longestStrings(['x', 'yy'], 5)).toEqual(['yy', 'x'])
    expect(longestStrings([], 5)).toEqual([])
  })
  const measure = (text: string, bold: boolean) => text.length * (bold ? 9 : 8)

  it('is as wide as the longest cell plus its padding', () => {
    expect(fitWidth(['x'.repeat(40), 'y'.repeat(10)], 'id', measure)).toBe(40 * 8 + 18)
  })
  it('leaves room for the header controls when the header is the widest', () => {
    expect(fitWidth(['a'], 'a long header name', measure)).toBe(18 * 9 + 110)
  })
  it('never goes below the minimum or above the maximum', () => {
    expect(fitWidth([], '', measure)).toBe(MIN_COLUMN_WIDTH)
    expect(fitWidth(['x'.repeat(5000)], 'h', measure)).toBe(MAX_COLUMN_WIDTH)
  })
})
