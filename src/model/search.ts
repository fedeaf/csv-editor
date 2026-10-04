export interface Position {
  row: number
  col: number
}

/** The cells a search looks at: the rows currently shown, so rows hidden by a filter are skipped (BUS-06). */
export interface SearchGrid {
  rowCount: number
  colCount: number
  cell(row: number, col: number): string
}

/**
 * Next cell matching `query`, row by row and left to right (BUS-07), wrapping around (BUS-03).
 * Case-insensitive; partial match unless `exact`, which needs the whole cell to equal the query.
 * Starts at the first cell, or just after `from`; direction -1 goes backwards.
 */
export function findMatch(
  grid: SearchGrid,
  query: string,
  exact: boolean,
  from?: Position,
  direction: 1 | -1 = 1,
): Position | undefined {
  const { rowCount, colCount } = grid
  const total = rowCount * colCount
  if (total === 0 || query === '') return
  const needle = query.toLowerCase()
  const valid = from && from.row < rowCount && from.col < colCount
  const start = valid ? from.row * colCount + from.col + direction : direction === 1 ? 0 : total - 1
  for (let step = 0; step < total; step++) {
    const index = (((start + step * direction) % total) + total) % total
    const row = Math.floor(index / colCount)
    const col = index % colCount
    const value = grid.cell(row, col).toLowerCase()
    if (exact ? value === needle : value.includes(needle)) return { row, col }
  }
}
