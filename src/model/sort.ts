import type { SortDirection, Table } from './table'

// English collation, case-insensitive (D-04). Digits are plain text, so "10" sorts before "9".
const collator = new Intl.Collator('en', { sensitivity: 'accent' })

/**
 * The table order sorted by one column. Whole rows move: only the list of ids is reordered.
 * Stable, and blank cells go last in both directions.
 */
export function sortedOrder(table: Table, col: number, dir: SortDirection): number[] {
  const ids = table.order
  const keys = ids.map((id) => table.rowById(id)!.cells[col]!)
  const sign = dir === 'asc' ? 1 : -1
  const perm = ids.map((_, i) => i)
  perm.sort((a, b) => {
    const x = keys[a]!
    const y = keys[b]!
    if (x === '' || y === '') return x === y ? 0 : x === '' ? 1 : -1
    return sign * collator.compare(x, y)
  })
  return perm.map((i) => ids[i]!)
}
