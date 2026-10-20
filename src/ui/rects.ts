// Blocks of cells as rectangles of display rows and columns, for a selection made of several parts: cells and runs of
// rows or columns chosen apart with Ctrl.
import { mergeIntervals } from './intervals'
import type { Rect } from './grid'

export const rectContains = (r: Rect, row: number, col: number): boolean => row >= r.r0 && row <= r.r1 && col >= r.c0 && col <= r.c1

export const sameRect = (a: Rect, b: Rect): boolean => a.r0 === b.r0 && a.r1 === b.r1 && a.c0 === b.c0 && a.c1 === b.c1

export const rectCells = (r: Rect): number => (r.r1 - r.r0 + 1) * (r.c1 - r.c0 + 1)

/** What is left of `a` once `b` is taken out of it: up to four rectangles that do not overlap, or `a` itself. */
export function subtractRect(a: Rect, b: Rect): Rect[] {
  if (b.r0 > a.r1 || b.r1 < a.r0 || b.c0 > a.c1 || b.c1 < a.c0) return [a]
  const out: Rect[] = []
  if (b.r0 > a.r0) out.push({ r0: a.r0, r1: b.r0 - 1, c0: a.c0, c1: a.c1 }) // above
  if (b.r1 < a.r1) out.push({ r0: b.r1 + 1, r1: a.r1, c0: a.c0, c1: a.c1 }) // below
  const r0 = Math.max(a.r0, b.r0)
  const r1 = Math.min(a.r1, b.r1)
  if (b.c0 > a.c0) out.push({ r0, r1, c0: a.c0, c1: b.c0 - 1 }) // left
  if (b.c1 < a.c1) out.push({ r0, r1, c0: b.c1 + 1, c1: a.c1 }) // right
  return out
}

/** Joins blocks that share a whole edge into one, over and over until none do: cells chosen one under another make one column. */
function joinTouching(rects: Rect[]): Rect[] {
  const parts = [...rects]
  for (let again = true; again; ) {
    again = false
    for (let i = 0; i < parts.length && !again; i++) {
      for (let j = i + 1; j < parts.length && !again; j++) {
        const a = parts[i]!
        const b = parts[j]!
        const sameCols = a.c0 === b.c0 && a.c1 === b.c1 && (a.r1 + 1 === b.r0 || b.r1 + 1 === a.r0)
        const sameRows = a.r0 === b.r0 && a.r1 === b.r1 && (a.c1 + 1 === b.c0 || b.c1 + 1 === a.c0)
        if (sameCols || sameRows) {
          parts.splice(j, 1)
          parts[i] = { r0: Math.min(a.r0, b.r0), r1: Math.max(a.r1, b.r1), c0: Math.min(a.c0, b.c0), c1: Math.max(a.c1, b.c1) }
          again = true
        }
      }
    }
  }
  return parts
}

/**
 * Joins the whole rows that touch each other into one block, and the whole columns likewise, so that rows 1 and 2
 * chosen one after the other are drawn as the one block they look like, and so are blocks of cells that share a whole
 * edge. Other blocks stay as they are.
 */
export function joinParts(rects: Rect[], lastRow: number, lastCol: number): Rect[] {
  const wholeRow = (r: Rect) => r.c0 === 0 && r.c1 === lastCol
  const wholeCol = (r: Rect) => r.r0 === 0 && r.r1 === lastRow && !wholeRow(r)
  const rows = mergeIntervals(rects.filter(wholeRow).map((r): [number, number] => [r.r0, r.r1]))
  const cols = mergeIntervals(rects.filter(wholeCol).map((r): [number, number] => [r.c0, r.c1]))
  return [
    ...rows.map(([r0, r1]): Rect => ({ r0, r1, c0: 0, c1: lastCol })),
    ...cols.map(([c0, c1]): Rect => ({ r0: 0, r1: lastRow, c0, c1 })),
    ...joinTouching(rects.filter((r) => !wholeRow(r) && !wholeCol(r))),
  ]
}

/** A cell to fill and the cell of the source block it copies. */
export interface FillCopy {
  row: number
  col: number
  fromRow: number
  fromCol: number
}

/**
 * Filling `target`, a block that holds `source` and runs past it on one side: every cell outside the source, with the
 * source cell it takes its value from. The source repeats as a pattern, so one row of cells copies each value down its
 * column, and two cells "a" and "b" give a, b, a, b. Going up or left, the cell next to the source copies its nearest
 * edge.
 */
export function fillCopies(source: Rect, target: Rect): FillCopy[] {
  const height = source.r1 - source.r0 + 1
  const width = source.c1 - source.c0 + 1
  const wrap = (n: number, size: number) => ((n % size) + size) % size
  const out: FillCopy[] = []
  for (let row = target.r0; row <= target.r1; row++) {
    for (let col = target.c0; col <= target.c1; col++) {
      if (rectContains(source, row, col)) continue
      out.push({ row, col, fromRow: source.r0 + wrap(row - source.r0, height), fromCol: source.c0 + wrap(col - source.c0, width) })
    }
  }
  return out
}
