import type { Delimiter, ParsedCsv } from '../csv/parse'
import type { Detected } from '../csv/encoding'

export interface Row {
  /** Stable identifier, never written to the file. */
  id: number
  cells: string[]
}

export interface FileFormat extends Detected, Pick<ParsedCsv, 'lineEnding' | 'trailingNewline'> {
  delimiter: Delimiter
}

/** A row and the position it occupies in the table order. */
export interface PlacedRow {
  index: number
  row: Row
}

export type SortDirection = 'asc' | 'desc'

/**
 * Rows live in a map by id; `order` is the table order as a list of ids.
 * Operations such as sorting reorder `order`, never the values of a column.
 * `order` is never mutated in place, only replaced, so a saved reference is a safe snapshot.
 *
 * Columns have stable ids too (`colIds`, parallel to `headers`), so filters and the sort
 * indicator keep pointing at the same column when others are inserted or deleted.
 */
export class Table {
  headers: string[]
  colIds: number[]
  /** The column the table was last sorted by, for the header indicator. */
  sort: { colId: number; dir: SortDirection } | undefined
  private byId = new Map<number, Row>()
  order: number[] = []
  private nextId = 1
  private nextColId = 1

  constructor(headers: string[], rows: string[][]) {
    this.headers = headers
    this.colIds = headers.map(() => this.nextColId++)
    for (const cells of rows) {
      const row = { id: this.nextId++, cells }
      this.byId.set(row.id, row)
      this.order.push(row.id)
    }
  }

  get rowCount(): number {
    return this.order.length
  }

  get columnCount(): number {
    return this.headers.length
  }

  rowAt(index: number): Row | undefined {
    const id = this.order[index]
    return id === undefined ? undefined : this.byId.get(id)
  }

  rowById(id: number): Row | undefined {
    return this.byId.get(id)
  }

  indexOfRow(id: number): number {
    return this.order.indexOf(id)
  }

  newColumnId(): number {
    return this.nextColId++
  }

  /** Index of the column with this id, or -1 if it was deleted. */
  columnIndex(colId: number): number {
    return this.colIds.indexOf(colId)
  }

  /** Rows in table order, as arrays of cells. */
  *orderedCells(): Generator<string[]> {
    for (const id of this.order) yield this.byId.get(id)!.cells
  }

  /** A blank row with a fresh id, not yet part of the table. */
  createRow(): Row {
    return { id: this.nextId++, cells: new Array<string>(this.columnCount).fill('') }
  }

  /** Inserts rows; `index` is each row's final position, so `items` must be ascending. */
  insertRows(items: PlacedRow[]): void {
    const out = new Array<number>(this.order.length + items.length)
    let from = 0
    let next = 0
    for (let i = 0; i < out.length; i++) {
      const item = items[next]
      if (item && item.index === i) {
        out[i] = item.row.id
        this.byId.set(item.row.id, item.row)
        next++
      } else {
        out[i] = this.order[from++]!
      }
    }
    this.order = out
  }

  /** Removes rows and returns them ascending, ready for `insertRows` to undo. */
  removeRows(ids: Set<number>): PlacedRow[] {
    const removed: PlacedRow[] = []
    const kept: number[] = []
    this.order.forEach((id, index) => {
      if (ids.has(id)) removed.push({ index, row: this.byId.get(id)! })
      else kept.push(id)
    })
    for (const { row } of removed) this.byId.delete(row.id)
    this.order = kept
    return removed
  }

  /**
   * Inserts columns at `index`: blank unless `values` gives each row's cells by row id.
   * `ids` are the column ids, new ones unless restoring deleted columns.
   */
  insertColumns(index: number, headers: string[], values?: Map<number, string[]>, ids?: number[]): void {
    this.headers.splice(index, 0, ...headers)
    this.colIds.splice(index, 0, ...(ids ?? headers.map(() => this.newColumnId())))
    for (const row of this.byId.values()) {
      row.cells.splice(index, 0, ...(values?.get(row.id) ?? headers.map(() => '')))
    }
  }

  removeColumns(index: number, count: number) {
    const headers = this.headers.splice(index, count)
    const ids = this.colIds.splice(index, count)
    const values = new Map<number, string[]>()
    for (const row of this.byId.values()) values.set(row.id, row.cells.splice(index, count))
    return { headers, ids, values }
  }
}
