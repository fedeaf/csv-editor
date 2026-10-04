// Where the editor of a cell goes across the table. It starts as wide as the column; when the text
// does not fit on a line it grows to the right, over the columns beside it, up to the edge of what is
// in view, and only past that does the text wrap. When there is no room to the right (the last
// columns) it slides left instead, so it still gets the room.

export interface SpanInput {
  /** Left edge of the cell and width of its column, in the coordinates of the table's content. */
  cellLeft: number
  colWidth: number
  /** Width the editor needs for its longest line to fit on one line, padding and border included. */
  needed: number
  /** The part of the content in view that the editor may use: after the row numbers, before the scroll bar. */
  viewLeft: number
  viewRight: number
}

export function editorSpan({ cellLeft, colWidth, needed, viewLeft, viewRight }: SpanInput): { left: number; width: number } {
  const view = Math.max(0, viewRight - viewLeft)
  // Never narrower than the column, never wider than what is in view (unless the column itself is).
  const width = Math.max(colWidth, Math.min(Math.ceil(needed), view))
  if (width >= view) return { left: viewLeft, width }
  const left = cellLeft + width > viewRight ? viewRight - width : cellLeft
  return { left: Math.max(left, viewLeft), width }
}
