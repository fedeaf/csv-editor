import { describe, expect, it } from 'vitest'
import { editorSpan } from './editorSpan'

// A table 1000 wide in view, from 80 (after the row numbers) to 992 (before the scroll bar).
const view = { viewLeft: 80, viewRight: 992 }

describe('editorSpan', () => {
  it('is as wide as the column and starts at the cell when the text fits', () => {
    expect(editorSpan({ cellLeft: 280, colWidth: 200, needed: 120, ...view })).toEqual({ left: 280, width: 200 })
    expect(editorSpan({ cellLeft: 280, colWidth: 200, needed: 200, ...view })).toEqual({ left: 280, width: 200 })
  })

  it('grows to the right just enough for a line that is a little too long', () => {
    expect(editorSpan({ cellLeft: 280, colWidth: 200, needed: 243.2, ...view })).toEqual({ left: 280, width: 244 })
  })

  it('grows up to the edge of what is in view, and no further, for a text that cannot fit', () => {
    const s = editorSpan({ cellLeft: 72, colWidth: 200, needed: 6000, ...view })
    expect(s.left).toBe(80)
    expect(s.width).toBe(912)
    expect(s.left + s.width).toBe(992)
  })

  it('keeps its left edge on the cell while there is room to the right', () => {
    expect(editorSpan({ cellLeft: 272, colWidth: 200, needed: 600, ...view })).toEqual({ left: 272, width: 600 })
  })

  it('slides left when the text would run past the right edge, so it still gets the room', () => {
    // the last column starts at 792: a 600 wide editor does not fit to its right
    const s = editorSpan({ cellLeft: 792, colWidth: 200, needed: 600, ...view })
    expect(s).toEqual({ left: 392, width: 600 })
    expect(s.left + s.width).toBe(992)
  })

  it('still covers the cell it belongs to after sliding left', () => {
    const s = editorSpan({ cellLeft: 792, colWidth: 200, needed: 600, ...view })
    expect(s.left).toBeLessThanOrEqual(792)
    expect(s.left + s.width).toBeGreaterThanOrEqual(792 + 200)
  })

  it('never starts under the row numbers', () => {
    expect(editorSpan({ cellLeft: 72, colWidth: 200, needed: 6000, ...view }).left).toBeGreaterThanOrEqual(80)
    expect(editorSpan({ cellLeft: 40, colWidth: 200, needed: 100, ...view }).left).toBe(80)
  })

  it('keeps the width of the column when the column is wider than the view', () => {
    expect(editorSpan({ cellLeft: 80, colWidth: 1200, needed: 300, ...view })).toEqual({ left: 80, width: 1200 })
  })

  it('copes with a window too small to hold even the column', () => {
    expect(editorSpan({ cellLeft: 100, colWidth: 200, needed: 50, viewLeft: 80, viewRight: 200 })).toEqual({ left: 80, width: 200 })
    expect(editorSpan({ cellLeft: 100, colWidth: 200, needed: 50, viewLeft: 80, viewRight: 80 })).toEqual({ left: 80, width: 200 })
  })
})
