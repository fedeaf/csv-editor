import { describe, expect, it } from 'vitest'
import { dropBefore, placeTab, tabAfterClose } from './tabBar'

describe('tabAfterClose', () => {
  const ids = [10, 20, 30]
  it('keeps the active tab when another one is closed', () => {
    expect(tabAfterClose(ids, 10, 20)).toBe(20)
    expect(tabAfterClose(ids, 30, 20)).toBe(20)
  })
  it('moves to the right neighbour when the active tab is closed', () => {
    expect(tabAfterClose(ids, 10, 10)).toBe(20)
    expect(tabAfterClose(ids, 20, 20)).toBe(30)
  })
  it('falls back to the left neighbour for the last tab', () => {
    expect(tabAfterClose(ids, 30, 30)).toBe(20)
  })
  it('skips the tab the other pane shows', () => {
    expect(tabAfterClose(ids, 20, 20, 30)).toBe(10)
    expect(tabAfterClose(ids, 10, 10, 20)).toBe(30)
    expect(tabAfterClose([10, 20], 10, 10, 20)).toBeUndefined()
  })
  it('leaves no tab when the only one is closed', () => {
    expect(tabAfterClose([10], 10, 10)).toBeUndefined()
  })
})

describe('dropBefore', () => {
  const tabs = [
    { id: 1, left: 0, width: 100 },
    { id: 2, left: 102, width: 100 },
    { id: 3, left: 204, width: 100 },
  ]
  it('goes before the first tab whose middle is still ahead of the pointer', () => {
    expect(dropBefore(tabs, 10)).toBe(1)
    expect(dropBefore(tabs, 49)).toBe(1)
    expect(dropBefore(tabs, 60)).toBe(2)
    expect(dropBefore(tabs, 160)).toBe(3)
  })
  it('goes to the end past the middle of the last tab, and on an empty strip', () => {
    expect(dropBefore(tabs, 260)).toBeUndefined()
    expect(dropBefore([], 50)).toBeUndefined()
  })
})

describe('placeTab', () => {
  const all = () => true
  it('moves a tab before another one', () => {
    expect(placeTab([1, 2, 3, 4], 4, 2, all)).toEqual([1, 4, 2, 3])
    expect(placeTab([1, 2, 3, 4], 1, 3, all)).toEqual([2, 1, 3, 4])
  })
  it('moves a tab to the end', () => {
    expect(placeTab([1, 2, 3], 1, undefined, all)).toEqual([2, 3, 1])
  })
  it('leaves the order alone when the tab goes where it is', () => {
    expect(placeTab([1, 2, 3], 2, 3, all)).toEqual([1, 2, 3])
    expect(placeTab([1, 2, 3], 3, undefined, all)).toEqual([1, 2, 3])
  })
  it('puts a tab at the end of its own strip, among tabs that belong to another one', () => {
    const left = (id: number) => id === 1 || id === 3 // strips: [1, 3] and [2, 4]
    expect(placeTab([1, 2, 3, 4], 2, undefined, left)).toEqual([1, 3, 2, 4]) // after the last of the strip [1, 3]
  })
  it('puts a tab at the end of the order when its strip has no other tab', () => {
    expect(placeTab([1, 2], 1, undefined, () => false)).toEqual([2, 1])
  })
})
