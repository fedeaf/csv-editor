// What the status bar says about the cells selected: how many are blank, how many hold a null and
// how many different values there are and how many repeat. Everything is text; no cell is ever read as a number.

/** Text that stands for "no value", ignoring case and surrounding spaces. */
const NULL_LIKE = new Set(['null', 'nil', 'none', 'nan', 'n/a', 'na'])

export const isNullLike = (value: string): boolean => NULL_LIKE.has(value.trim().toLowerCase())

/** Past this many different values, repeats are no longer counted: the table of values would grow too large. */
export const MAX_DISTINCT = 2_000_000

export interface Summary {
  cells: number
  /** Empty, or only spaces. */
  blank: number
  /** Text such as `null`, `NaN` or `N/A`. */
  nullLike: number
  /** Different values among the cells selected (blanks left out). */
  uniqueValues: number
  /** Different values that appear more than once among the cells selected. */
  duplicateValues: number
  /** Cells holding one of those values, every occurrence counted. */
  duplicateCells: number
  /** True when there were too many different values to count them and their repeats. */
  duplicatesSkipped: boolean
}

export interface Accumulator {
  add(value: string): void
  result(): Summary
}

/**
 * Duplicates are exact matches, sensitive to case and spaces, and blank cells never count, as in the
 * duplicate indicator of a column header. All the cells selected are compared with each other.
 */
export function createAccumulator(): Accumulator {
  let cells = 0
  let blank = 0
  let nullLike = 0
  let skipped = false
  const seen = new Map<string, number>()
  return {
    add(value) {
      cells++
      if (value === '' || value.trim() === '') return void blank++
      if (isNullLike(value)) nullLike++
      if (skipped) return
      const n = seen.get(value)
      if (n !== undefined) return void seen.set(value, n + 1)
      if (seen.size >= MAX_DISTINCT) {
        skipped = true
        return void seen.clear()
      }
      seen.set(value, 1)
    },
    result() {
      let duplicateValues = 0
      let duplicateCells = 0
      for (const n of seen.values()) {
        if (n > 1) {
          duplicateValues++
          duplicateCells += n
        }
      }
      return { cells, blank, nullLike, uniqueValues: seen.size, duplicateValues, duplicateCells, duplicatesSkipped: skipped }
    },
  }
}
