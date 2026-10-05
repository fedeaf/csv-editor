import { describe, expect, it } from 'vitest'
import { MIN_PANE, splitRatio } from './splitDivider'

describe('splitRatio', () => {
  // A container from x=100, 1005 wide, with a 5 px divider: 1000 px of room for the panes.
  const ratio = (pos: number) => splitRatio(pos, 100, 1005, 5)
  it('puts the first pane up to the centre of the divider', () => {
    expect(ratio(100 + 2.5 + 500)).toBeCloseTo(0.5)
    expect(ratio(100 + 2.5 + 250)).toBeCloseTo(0.25)
  })
  it('keeps both panes at their minimum size', () => {
    expect(ratio(0)).toBeCloseTo(MIN_PANE / 1000)
    expect(ratio(5000)).toBeCloseTo(1 - MIN_PANE / 1000)
  })
  it('splits evenly when there is no room for two minimum panes', () => {
    expect(splitRatio(150, 100, 205, 5)).toBe(0.5)
    expect(splitRatio(150, 100, 0, 5)).toBe(0.5)
  })
})
