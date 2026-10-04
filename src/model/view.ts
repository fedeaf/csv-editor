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
}

/**
 * Duplicate statistics per column, computed lazily and cached by column id.
 * Duplicates follow D-05: exact equality, case and whitespace sensitive, blanks never count.
 * They are always measured over every row, whatever other filters are active.
 */
export class ColumnStats {
  private cache = new Map<number, ColumnStat>()

  constructor(private table: Table) {}

  get(colId: number): ColumnStat {
    let stat = this.cache.get(colId)
    if (!stat) {
      stat = this.compute(this.table.columnIndex(colId))
      this.cache.set(colId, stat)
    }
    return stat
  }

  invalidate(which: number[] | 'all' | 'none'): void {
    if (which === 'all') this.cache.clear()
    else if (which !== 'none') for (const id of which) this.cache.delete(id)
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
    return { counts, duplicateValues, duplicateRows }
  }
}

/**
 * What the grid shows: the table order narrowed by filters. Filters are view-only (HIS-03) and
 * hide rows without deleting them (FIL-05). Row positions in the grid are indexes into `visible`.
 */
export class TableView {
  readonly stats: ColumnStats
  readonly filters = new Map<number, ColumnFilter>()
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
