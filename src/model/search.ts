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

/** What counts as a match, shared by Find and Replace so that they always agree. */
export interface Matcher {
  test(value: string): boolean
  /**
   * The value with every match replaced by `replacement`. In a plain search the replacement is used
   * literally; in a regular expression `$1`, `$&` and `$<name>` insert what the pattern matched.
   */
  replace(value: string, replacement: string): string
}

/**
 * How a query is read. `true` and `false` stand for `{ exact, regex: false }`. With `regex` the query
 * is a regular expression (JavaScript's) instead of plain text.
 */
export type MatchMode = boolean | { exact: boolean; regex: boolean }

const optionsOf = (mode: MatchMode) => (typeof mode === 'boolean' ? { exact: mode, regex: false } : mode)

const escapeRegExp = (text: string) => text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')

/** `.` also matches a line break, since a cell may hold several lines. The unicode flag is dropped if the pattern is not valid with it. */
function compile(source: string, global: boolean): RegExp {
  const flags = (global ? 'g' : '') + 'is'
  try {
    return new RegExp(source, flags + 'u')
  } catch {
    return new RegExp(source, flags)
  }
}

/** Why `query` is not a valid regular expression, or undefined if it is one (or is not read as one). */
export function patternError(query: string, regex: boolean): string | undefined {
  if (!regex || query === '') return undefined
  try {
    compile(query, false)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return message.slice(message.lastIndexOf(': ') + 2)
  }
}

/**
 * Case-insensitive. Partial by default: the query may appear anywhere in the cell. With `exact` the
 * whole cell must equal the query (or, for a regular expression, match it from end to end), and
 * replacing swaps the whole cell. Throws for a regular expression that is not valid; see `patternError`.
 */
export function createMatcher(query: string, mode: MatchMode): Matcher {
  const { exact, regex } = optionsOf(mode)
  if (regex) {
    compile(query, false) // the pattern on its own must be valid, whatever it is wrapped in below
    const source = exact ? `^(?:${query})$` : query
    const one = compile(source, false)
    const every = compile(source, true)
    return { test: (value) => one.test(value), replace: (value, replacement) => value.replace(every, replacement) }
  }
  if (exact) {
    const needle = query.toLowerCase()
    const test = (value: string) => value.toLowerCase() === needle
    return { test, replace: (value, replacement) => (test(value) ? replacement : value) }
  }
  const source = escapeRegExp(query)
  const one = new RegExp(source, 'iu')
  const every = new RegExp(source, 'giu')
  // A function as the replacement keeps "$&" and friends from meaning anything.
  return { test: (value) => one.test(value), replace: (value, replacement) => value.replace(every, () => replacement) }
}

/**
 * Next cell matching `query`, row by row and left to right (BUS-07), wrapping around (BUS-03).
 * Case-insensitive; partial match unless `exact`, which needs the whole cell to equal the query.
 * Starts at the first cell, or just after `from`; direction -1 goes backwards.
 */
export function findMatch(
  grid: SearchGrid,
  query: string,
  exact: MatchMode,
  from?: Position,
  direction: 1 | -1 = 1,
): Position | undefined {
  const { rowCount, colCount } = grid
  const total = rowCount * colCount
  if (total === 0 || query === '') return
  const matcher = createMatcher(query, exact)
  const valid = from && from.row < rowCount && from.col < colCount
  const start = valid ? from.row * colCount + from.col + direction : direction === 1 ? 0 : total - 1
  for (let step = 0; step < total; step++) {
    const index = (((start + step * direction) % total) + total) % total
    const row = Math.floor(index / colCount)
    const col = index % colCount
    if (matcher.test(grid.cell(row, col))) return { row, col }
  }
}

/** Every cell that Replace All would change, with its new value. Cells that would stay the same are left out. */
export function findReplacements(
  grid: SearchGrid,
  query: string,
  exact: MatchMode,
  replacement: string,
): { row: number; col: number; value: string }[] {
  if (query === '') return []
  const matcher = createMatcher(query, exact)
  const changes: { row: number; col: number; value: string }[] = []
  for (let row = 0; row < grid.rowCount; row++) {
    for (let col = 0; col < grid.colCount; col++) {
      const value = grid.cell(row, col)
      if (!matcher.test(value)) continue
      const next = matcher.replace(value, replacement)
      if (next !== value) changes.push({ row, col, value: next })
    }
  }
  return changes
}

/**
 * Every cell that matches, as its place in reading order (row by row, left to right): row * columns + column.
 * The list is in ascending order, so a match's number is found by binary search.
 */
export function findAllMatches(grid: SearchGrid, query: string, exact: MatchMode): number[] {
  if (query === '' || grid.rowCount === 0 || grid.colCount === 0) return []
  const matcher = createMatcher(query, exact)
  const matches: number[] = []
  for (let row = 0; row < grid.rowCount; row++) {
    for (let col = 0; col < grid.colCount; col++) {
      if (matcher.test(grid.cell(row, col))) matches.push(row * grid.colCount + col)
    }
  }
  return matches
}

/** The number, counting from 1, of the match at `position` in the list from `findAllMatches`; 0 if it is not there. */
export function matchNumber(matches: number[], position: Position, colCount: number): number {
  const target = position.row * colCount + position.col
  let low = 0
  let high = matches.length - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (matches[mid]! === target) return mid + 1
    if (matches[mid]! < target) low = mid + 1
    else high = mid - 1
  }
  return 0
}
