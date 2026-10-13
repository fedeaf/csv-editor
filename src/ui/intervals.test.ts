import { describe, expect, it } from 'vitest'
import { containsIndex, countIndexes, mergeIntervals } from './intervals'

describe('mergeIntervals', () => {
  it('keeps separate runs apart and sorts them', () => {
    expect(mergeIntervals([[5, 6], [1, 1], [3, 3]])).toEqual([[1, 1], [3, 3], [5, 6]])
  })
  it('joins runs that overlap or touch', () => {
    expect(mergeIntervals([[1, 3], [4, 6]])).toEqual([[1, 6]])
    expect(mergeIntervals([[1, 5], [3, 4]])).toEqual([[1, 5]])
    expect(mergeIntervals([[2, 8], [1, 3], [10, 12]])).toEqual([[1, 8], [10, 12]])
  })
  it('puts the ends of a run the right way round', () => {
    expect(mergeIntervals([[9, 7]])).toEqual([[7, 9]])
  })
  it('does not change what it is given', () => {
    const given: [number, number][] = [[4, 5], [1, 2]]
    mergeIntervals(given)
    expect(given).toEqual([[4, 5], [1, 2]])
  })
  it('is empty for nothing', () => {
    expect(mergeIntervals([])).toEqual([])
  })
})

describe('containsIndex and countIndexes', () => {
  const list: [number, number][] = [[1, 2], [5, 5], [8, 10]]
  it('knows whether an index is in one of the runs', () => {
    expect([0, 1, 2, 3, 5, 6, 9, 11].map((i) => containsIndex(list, i))).toEqual([false, true, true, false, true, false, true, false])
  })
  it('counts every index once, even where runs overlap', () => {
    expect(countIndexes(list)).toBe(6)
    expect(countIndexes([[1, 4], [3, 6]])).toBe(6)
  })
})
