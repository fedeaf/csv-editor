import { describe, expect, it } from 'vitest'
import type { Rect } from './grid'
import { joinParts, rectCells, rectContains, subtractRect } from './rects'

const R = (r0: number, r1: number, c0: number, c1: number): Rect => ({ r0, r1, c0, c1 })
const cellsOf = (rects: Rect[]) => new Set(rects.flatMap((r) => Array.from({ length: rectCells(r) }, (_, i) => `${r.r0 + Math.floor(i / (r.c1 - r.c0 + 1))},${r.c0 + (i % (r.c1 - r.c0 + 1))}`)))

describe('subtractRect', () => {
  it('leaves a rectangle that does not touch the other as it is', () => {
    expect(subtractRect(R(0, 2, 0, 2), R(5, 6, 5, 6))).toEqual([R(0, 2, 0, 2)])
  })
  it('takes a whole rectangle out and leaves nothing', () => {
    expect(subtractRect(R(1, 2, 1, 2), R(0, 5, 0, 5))).toEqual([])
  })
  it('takes a cell out of the middle of a block, leaving the four pieces around it', () => {
    const left = subtractRect(R(0, 4, 0, 4), R(2, 2, 2, 2))
    expect(left).toHaveLength(4)
    const expected = cellsOf([R(0, 4, 0, 4)])
    expected.delete('2,2')
    expect(cellsOf(left)).toEqual(expected)
    expect(left.reduce((n, r) => n + rectCells(r), 0)).toBe(24) // no overlap among the pieces
  })
  it('takes a row out of a block of rows, and a column out of a block of columns', () => {
    expect(subtractRect(R(0, 4, 0, 3), R(2, 2, 0, 3))).toEqual([R(0, 1, 0, 3), R(3, 4, 0, 3)])
    expect(subtractRect(R(0, 3, 0, 4), R(0, 3, 1, 1))).toEqual([R(0, 3, 0, 0), R(0, 3, 2, 4)])
  })
})

describe('joinParts', () => {
  it('joins whole rows that touch, and keeps the ones that do not apart', () => {
    const rows = [R(0, 0, 0, 3), R(1, 1, 0, 3), R(4, 4, 0, 3)]
    expect(joinParts(rows, 9, 3)).toEqual([R(0, 1, 0, 3), R(4, 4, 0, 3)])
  })
  it('joins whole columns that touch', () => {
    expect(joinParts([R(0, 9, 1, 1), R(0, 9, 2, 2), R(0, 9, 5, 5)], 9, 5)).toEqual([R(0, 9, 1, 2), R(0, 9, 5, 5)])
  })
  it('leaves the other blocks alone', () => {
    expect(joinParts([R(2, 3, 1, 2), R(5, 5, 0, 3)], 9, 3)).toEqual([R(5, 5, 0, 3), R(2, 3, 1, 2)])
  })
  it('joins cells chosen one under another, or one beside another, into one block', () => {
    expect(joinParts([R(0, 0, 3, 3), R(1, 1, 3, 3), R(2, 2, 3, 3)], 9, 9)).toEqual([R(0, 2, 3, 3)])
    expect(joinParts([R(4, 4, 1, 1), R(4, 4, 2, 2)], 9, 9)).toEqual([R(4, 4, 1, 2)])
  })
  it('joins blocks that share a whole edge only', () => {
    expect(joinParts([R(0, 1, 0, 1), R(2, 3, 0, 2)], 9, 9)).toHaveLength(2) // the edges are not the same size
    expect(joinParts([R(0, 0, 0, 0), R(1, 1, 1, 1)], 9, 9)).toHaveLength(2) // they only touch at a corner
  })
})

describe('rectContains', () => {
  it('is true on the edges and false just outside', () => {
    expect(rectContains(R(1, 3, 1, 3), 1, 3)).toBe(true)
    expect(rectContains(R(1, 3, 1, 3), 4, 2)).toBe(false)
  })
})
