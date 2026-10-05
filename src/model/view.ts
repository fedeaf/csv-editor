import { isFlagged } from './errors'
import type { Table } from './table'

/** Value filter and duplicates filter for one column; both must match (FIL-03). */
export interface ColumnFilter {
  /** Values allowed to show; '' stands for blank cells. null allows every value. */
  selected: Set<string> | null
  duplicatesOnly: boolean
}

export interface ColumnStat {
  /** How many rows hold each value, over the whole table. */
  counts: Map<string, number>
  /** Distinct non-blank values that appear more than once. */
  duplicateValues: number
  /** Rows holding one of those values. */
  duplicateRows: number
  /** Cells holding a spreadsheet error such as #N/A or #DIV/0!. */
  errorCells: number
  /** A few of those errors, each once, to show in the tooltip. */
  errorExamples: string[]
}

/**
 * Duplicate statistics per column, computed lazily and cached by column id.
 * Duplicates follow D-05: exact equality, case and whitespace sensitive, blanks never count.
 * They are always measured over every row, whatever other filters are active.
 */
const MAX_ERROR_EXAMPLES = 3

export class ColumnStats {
  private cache = new Map<number, ColumnStat>()
  /**
   * Whether each column holds nothing at all, by column id. A column with no text has the same statistics
   * whatever its length, so it is told apart first, in one pass over the rows for every column together,
   * instead of counting its values one by one (a new document has 255 of them).
   */
  private blank = new Map<number, boolean>()
  private swept = false

  constructor(private table: Table) {}

  get(colId: number): ColumnStat {
    let stat = this.cache.get(colId)
    if (!stat) {
      const col = this.table.columnIndex(colId)
      stat = this.isBlank(colId, col) ? this.blankStat() : this.compute(col)
      this.cache.set(colId, stat)
    }
    return stat
  }

  invalidate(which: number[] | 'all' | 'none'): void {
    if (which === 'all') {
      this.cache.clear()
      this.blank.clear()
      this.swept = false
    } else if (which !== 'none') {
      for (const id of which) {
        this.cache.delete(id)
        this.blank.delete(id)
      }
    }
  }

  private isBlank(colId: number, col: number): boolean {
    if (col < 0) return false
    if (!this.swept) this.sweep()
    let blank = this.blank.get(colId)
    if (blank === undefined) {
      // Only this column's text changed since the sweep: look at it alone, stopping at the first value.
      blank = true
      for (const id of this.table.order) {
        if (this.table.rowById(id)!.cells[col] !== '') {
          blank = false
          break
        }
      }
      this.blank.set(colId, blank)
    }
    return blank
  }

  /** One pass over the rows that finds which columns have text anywhere; it stops once every column has some. */
  private sweep(): void {
    const { colIds, columnCount } = this.table
    const blank = new Array<boolean>(columnCount).fill(true)
    let remaining = columnCount
    for (const id of this.table.order) {
      const cells = this.table.rowById(id)!.cells
      for (let c = 0; c < columnCount; c++) {
        if (blank[c] && cells[c] !== '') {
          blank[c] = false
          if (--remaining === 0) break
        }
      }
      if (remaining === 0) break
    }
    colIds.forEach((colId, c) => {
      if (!this.blank.has(colId)) this.blank.set(colId, blank[c]!)
    })
    this.swept = true
  }

  /** The statistics of a column whose every cell is empty. */
  private blankStat(): ColumnStat {
    const rows = this.table.rowCount
    return { counts: rows > 0 ? new Map([['', rows]]) : new Map(), duplicateValues: 0, duplicateRows: 0, errorCells: 0, errorExamples: [] }
  }

  private compute(col: number): ColumnStat {
    const counts = new Map<string, number>()
    if (col >= 0) {
      for (const id of this.table.order) {
        const value = this.table.rowById(id)!.cells[col]!
        counts.set(value, (counts.get(value) ?? 0) + 1)
      }
    }
    let duplicateValues = 0
    let duplicateRows = 0
    for (const [value, n] of counts) {
      if (value !== '' && n > 1) {
        duplicateValues++
        duplicateRows += n
      }
    }
    // Flagged cells (spreadsheet errors, scientific notation) are found among the distinct values, so this costs nothing on the rows themselves.
    let errorCells = 0
    const seen = new Set<string>()
    const errorExamples: string[] = []
    for (const [value, n] of counts) {
      if (!isFlagged(value)) continue
      errorCells += n
      const key = value.trim().toUpperCase()
      if (!seen.has(key) && errorExamples.length < MAX_ERROR_EXAMPLES) errorExamples.push(value.trim())
      seen.add(key)
    }
    return { counts, duplicateValues, duplicateRows, errorCells, errorExamples }
  }
}

/**
 * What the grid shows: the table order narrowed by filters. Filters are view-only (HIS-03) and
 * hide rows without deleting them (FIL-05). Row positions in the grid are indexes into `visible`.
 */
export class TableView {
  readonly stats: ColumnStats
  readonly filters = new Map<number, ColumnFilter>()
  /** Column widths the user set, by column id. Part of the view: not saved and not in the history. */
  readonly widths = new Map<number, number>()
  /** Row ids in display order. */
  visible: number[]
  /** Position in the whole table (1-based) of each visible row; undefined when nothing is filtered. */
  private numbers: number[] | undefined

  constructor(readonly table: Table) {
    this.stats = new ColumnStats(table)
    this.visible = table.order
  }

  get rowCount(): number {
    return this.visible.length
  }

  get filtered(): boolean {
    return this.filters.size > 0
  }

  idAt(index: number): number | undefined {
    return this.visible[index]
  }

  indexOfId(id: number): number {
    return this.visible.indexOf(id)
  }

  rowNumber(index: number): number {
    return this.numbers ? this.numbers[index]! : index + 1
  }

  /** Sets or clears one column's filter and re-applies all filters from scratch. */
  setFilter(colId: number, filter: ColumnFilter | undefined): void {
    if (filter && (filter.selected || filter.duplicatesOnly)) this.filters.set(colId, filter)
    else this.filters.delete(colId)
    this.apply()
  }

  clearFilters(): void {
    this.filters.clear()
    this.apply()
  }

  /**
   * After the data changed. Rows that were visible stay visible even if an edit made them stop
   * matching, as in Excel, until the filters are applied again; `reveal` adds new or restored rows.
   */
  afterChange(reveal: number[] = []): void {
    let dropped = false
    for (const colId of [...this.filters.keys()]) {
      if (this.table.columnIndex(colId) < 0) {
        this.filters.delete(colId)
        dropped = true
      }
    }
    if (dropped || !this.filtered) return this.apply()
    const keep = new Set(this.visible)
    for (const id of reveal) keep.add(id)
    this.apply(keep)
  }

  private apply(keep?: Set<number>): void {
    const { table } = this
    if (!this.filtered) {
      this.visible = table.order
      this.numbers = undefined
      return
    }
    const active = [...this.filters].map(([colId, filter]) => ({
      col: table.columnIndex(colId),
      selected: filter.selected,
      counts: filter.duplicatesOnly ? this.stats.get(colId).counts : undefined,
    }))
    const visible: number[] = []
    const numbers: number[] = []
    table.order.forEach((id, position) => {
      const cells = table.rowById(id)!.cells
      const matches = active.every(({ col, selected, counts }) => {
        const value = cells[col]!
        if (selected && !selected.has(value)) return false
        return !counts || (value !== '' && counts.get(value)! > 1)
      })
      if (matches || keep?.has(id)) {
        visible.push(id)
        numbers.push(position + 1)
      }
    })
    this.visible = visible
    this.numbers = numbers
  }
}

/** Unique values of a column for the filter dropdown, alphabetical, blanks reported separately. */
export function uniqueValues(stat: ColumnStat): { values: { value: string; count: number }[]; blanks: number } {
  const collator = new Intl.Collator('en', { sensitivity: 'accent' })
  const values = [...stat.counts]
    .filter(([value]) => value !== '')
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => collator.compare(a.value, b.value) || (a.value < b.value ? -1 : 1))
  return { values, blanks: stat.counts.get('') ?? 0 }
}
