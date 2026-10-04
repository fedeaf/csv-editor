// Column widths. Columns can be dragged to any width between the limits; this file holds the
// arithmetic so the grid can find a column from a position without assuming they are all alike.

export const DEFAULT_COLUMN_WIDTH = 200
/** Wide enough for the header's controls (duplicates, sort and filter) plus a few letters of the name. */
export const MIN_COLUMN_WIDTH = 120
export const MAX_COLUMN_WIDTH = 1200

export function clampWidth(width: number): number {
  return Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(width)))
}

/** Left edge of every column, counted from the first one, with the total width as the last entry. */
export function columnOffsets(widths: number[]): number[] {
  const offsets = [0]
  for (const width of widths) offsets.push(offsets[offsets.length - 1]! + width)
  return offsets
}

/** The column at `x`, counted from the left edge of the first one; clamped to the first and last. */
export function columnAt(offsets: number[], x: number): number {
  const last = offsets.length - 2
  if (last < 0) return 0
  let low = 0
  let high = last
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (offsets[mid]! <= x) low = mid
    else high = mid - 1
  }
  return low
}

/** The `count` longest strings, so that only those need to be measured to fit a column to its content. */
export function longestStrings(strings: Iterable<string>, count: number): string[] {
  const best: string[] = []
  for (const s of strings) {
    if (best.length === count && s.length <= best[best.length - 1]!.length) continue
    let at = best.length
    while (at > 0 && best[at - 1]!.length < s.length) at--
    best.splice(at, 0, s)
    if (best.length > count) best.pop()
  }
  return best
}

/**
 * The width that fits a column: its longest cells and its header, each with the room around it.
 * `measure` gives the width of a string in pixels.
 */
export function fitWidth(
  longestCells: string[],
  header: string,
  measure: (text: string, bold: boolean) => number,
  cellPadding = 18,
  headerControls = 100, // padding, the duplicates tag, the sort control and the filter, and the gaps between them
): number {
  const cells = longestCells.reduce((w, s) => Math.max(w, measure(s, false)), 0) + cellPadding
  const head = measure(header, true) + headerControls
  return clampWidth(Math.max(cells, head))
}
