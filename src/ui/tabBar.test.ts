import { describe, expect, it } from 'vitest'
import { tabAfterClose } from './tabBar'

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
  it('leaves no tab when the only one is closed', () => {
    expect(tabAfterClose([10], 10, 10)).toBeUndefined()
  })
})
