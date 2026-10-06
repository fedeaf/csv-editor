import { sortedOrder } from './sort'
import type { FileFormat, SortDirection, Table } from './table'

/** Where the cursor should land after a command runs or is reverted; a missing part keeps its place. */
export interface Cursor {
  rowId?: number
  col?: number
  /** Rows that must be visible even if a filter would hide them (inserted or restored rows). */
  reveal?: number[]
}

/** Which columns' duplicate statistics a command can change. */
export type Invalidates = number[] | 'all' | 'none'

/** Every data-changing operation is a command, so history can undo and redo it. */
export interface Command {
  label: string
  invalidates: Invalidates
  run(table: Table): Cursor | void
  revert(table: Table): Cursor | void
}

const lastIndex = (count: number) => Math.max(0, count - 1)

export function setCell(table: Table, rowId: number, col: number, value: string): Command {
  const before = table.rowById(rowId)!.cells[col]!
  const colId = table.colIds[col]!
  const write = (t: Table, text: string): Cursor => {
    t.rowById(rowId)!.cells[col] = text
    return { rowId, col }
  }
  return { label: 'Edit cell', invalidates: [colId], run: (t) => write(t, value), revert: (t) => write(t, before) }
}

/** Changes how the document is written (encoding, delimiter, line endings); the cells stay as they are. */
export function changeFormat(doc: { format: FileFormat }, next: FileFormat): Command {
  const before = doc.format
  return {
    label: 'Change file format',
    invalidates: 'none',
    run: () => {
      doc.format = next
    },
    revert: () => {
      doc.format = before
    },
  }
}

export function renameHeader(table: Table, col: number, name: string): Command {
  const before = table.headers[col]!
  return {
    label: 'Rename header',
    invalidates: 'none',
    run: (t) => {
      t.headers[col] = name
      return { col }
    },
    revert: (t) => {
      t.headers[col] = before
      return { col }
    },
  }
}

/** Inserts `count` blank rows so the first lands at table position `index`. */
export function insertRows(table: Table, index: number, count: number): Command {
  const rows = Array.from({ length: count }, () => table.createRow())
  const ids = rows.map((r) => r.id)
  return {
    label: count === 1 ? 'Insert row' : 'Insert rows',
    invalidates: 'all',
    run: (t) => {
      t.insertRows(rows.map((row, i) => ({ index: index + i, row })))
      return { rowId: ids[0], reveal: ids }
    },
    revert: (t) => {
      t.removeRows(new Set(ids))
      return { rowId: t.order[Math.min(index, lastIndex(t.rowCount))] }
    },
  }
}

/** Deletes the rows with these ids. */
export function deleteRows(rowIds: number[]): Command {
  const ids = new Set(rowIds)
  let removed: ReturnType<Table['removeRows']> = []
  return {
    label: ids.size === 1 ? 'Delete row' : 'Delete rows',
    invalidates: 'all',
    run: (t) => {
      removed = t.removeRows(ids)
      return { rowId: t.order[Math.min(removed[0]?.index ?? 0, lastIndex(t.rowCount))] }
    },
    revert: (t) => {
      t.insertRows(removed)
      return { rowId: removed[0]?.row.id, reveal: removed.map((r) => r.row.id) }
    },
  }
}

export function insertColumn(table: Table, index: number): Command {
  const id = table.newColumnId()
  return {
    label: 'Insert column',
    invalidates: 'none',
    run: (t) => {
      t.insertColumns(index, [''], undefined, [id])
      return { col: index }
    },
    revert: (t) => {
      t.removeColumns(index, 1)
      return { col: Math.min(index, lastIndex(t.columnCount)) }
    },
  }
}

/**
 * Gives the headers of the columns from `col0` on the names in `names`. Names beyond the last column add
 * columns, blank apart from their header, so the whole header of another file fits. One undo step;
 * undefined if nothing would change.
 */
export function setHeaders(table: Table, col0: number, names: string[]): Command | undefined {
  const existing = Math.max(0, Math.min(names.length, table.columnCount - col0))
  const before = table.headers.slice(col0, col0 + existing)
  const added = names.slice(existing)
  const same = before.every((name, i) => name === names[i])
  if (same && added.length === 0) return undefined
  const ids = added.map(() => table.newColumnId())
  return {
    label: 'Paste headers',
    invalidates: 'none',
    run: (t) => {
      names.slice(0, existing).forEach((name, i) => (t.headers[col0 + i] = name))
      if (added.length > 0) t.insertColumns(t.columnCount, added, undefined, ids)
      return { col: col0 }
    },
    revert: (t) => {
      if (added.length > 0) t.removeColumns(t.columnCount - added.length, added.length)
      before.forEach((name, i) => (t.headers[col0 + i] = name))
      return { col: col0 }
    },
  }
}

/** Deletes columns `from` to `to`, both inclusive. */
export function deleteColumns(from: number, to: number): Command {
  const count = to - from + 1
  let removed: ReturnType<Table['removeColumns']> | undefined
  let sortBefore: Table['sort']
  return {
    label: count === 1 ? 'Delete column' : 'Delete columns',
    invalidates: 'none',
    run: (t) => {
      sortBefore = t.sort
      removed = t.removeColumns(from, count)
      if (t.sort && removed.ids.includes(t.sort.colId)) t.sort = undefined
      return { col: Math.min(from, lastIndex(t.columnCount)) }
    },
    revert: (t) => {
      t.insertColumns(from, removed!.headers, removed!.values, removed!.ids)
      t.sort = sortBefore
      return { col: from }
    },
  }
}

/**
 * Sorts all rows by a column (ORD-02: there is no single-column sort). Returns undefined when
 * the order would not change. The new order is stored so redo is exact.
 */
export function sortRows(table: Table, col: number, dir: SortDirection): Command | undefined {
  const order = sortedOrder(table, col, dir)
  const sort = { colId: table.colIds[col]!, dir }
  const unchanged = order.every((id, i) => id === table.order[i])
  if (unchanged && table.sort?.colId === sort.colId && table.sort.dir === dir) return undefined
  const before = { order: table.order, sort: table.sort }
  return {
    label: 'Sort',
    invalidates: 'none',
    run: (t) => {
      t.order = order
      t.sort = sort
    },
    revert: (t) => {
      t.order = before.order
      t.sort = before.sort
    },
  }
}

/**
 * Copies one value into many cells as a single step (REL-05). Cells already holding it are left
 * alone; returns undefined if nothing would change.
 */
export function fillCells(table: Table, targets: { rowId: number; col: number }[], value: string, label = 'Fill'): Command | undefined {
  const changes = targets
    .map((t) => ({ ...t, before: table.rowById(t.rowId)!.cells[t.col]! }))
    .filter((c) => c.before !== value)
  if (changes.length === 0) return undefined
  const columns = [...new Set(changes.map((c) => table.colIds[c.col]!))]
  return {
    label,
    invalidates: columns,
    run: (t) => {
      for (const c of changes) t.rowById(c.rowId)!.cells[c.col] = value
    },
    revert: (t) => {
      for (const c of changes) t.rowById(c.rowId)!.cells[c.col] = c.before
    },
  }
}

/**
 * Writes a block of text with its top-left cell at column `col0` of the given rows, going down:
 * `rowIds` are the existing rows to receive the first lines, and any lines beyond them become new
 * rows at the end of the table. A block wider than the table adds columns with blank headers.
 * Nothing is cut off, and the whole paste is one undo step.
 */
export function pasteCells(table: Table, rowIds: number[], col0: number, block: string[][]): Command | undefined {
  const height = block.length
  const width = block[0]?.length ?? 0
  if (height === 0 || width === 0) return undefined
  const extraRows = height - rowIds.length
  const extraCols = Math.max(0, col0 + width - table.columnCount)
  const changes = rowIds.some((id, i) => block[i]!.some((v, j) => (table.rowById(id)!.cells[col0 + j] ?? '') !== v))
  if (!changes && extraRows === 0 && extraCols === 0) return undefined

  const finalWidth = table.columnCount + extraCols
  const newRows = Array.from({ length: Math.max(0, extraRows) }, () => {
    const row = table.createRow()
    row.cells = new Array<string>(finalWidth).fill('')
    return row
  })
  const newColIds = Array.from({ length: extraCols }, () => table.newColumnId())
  const targetIds = [...rowIds, ...newRows.map((r) => r.id)]
  const touched = table.colIds.slice(col0, col0 + width)
  let before: string[][] = []

  return {
    label: 'Paste',
    invalidates: extraRows > 0 || extraCols > 0 ? 'all' : touched,
    run: (t) => {
      if (extraCols > 0) t.insertColumns(t.columnCount, new Array<string>(extraCols).fill(''), undefined, newColIds)
      before = rowIds.map((id, i) => block[i]!.map((_, j) => t.rowById(id)!.cells[col0 + j]!))
      rowIds.forEach((id, i) => block[i]!.forEach((v, j) => (t.rowById(id)!.cells[col0 + j] = v)))
      if (newRows.length > 0) {
        const start = t.rowCount
        t.insertRows(newRows.map((row, k) => ({ index: start + k, row })))
        newRows.forEach((row, k) => block[rowIds.length + k]!.forEach((v, j) => (row.cells[col0 + j] = v)))
      }
      return { rowId: targetIds[0], col: col0, reveal: targetIds }
    },
    revert: (t) => {
      rowIds.forEach((id, i) => before[i]!.forEach((v, j) => (t.rowById(id)!.cells[col0 + j] = v)))
      if (newRows.length > 0) t.removeRows(new Set(newRows.map((r) => r.id)))
      if (extraCols > 0) t.removeColumns(t.columnCount - extraCols, extraCols)
      return { rowId: rowIds[0], col: col0 }
    },
  }
}

/**
 * Gives each listed cell its own new value as a single step: what Replace All does. Cells that would
 * not change are skipped; returns undefined if nothing would.
 */
export function replaceCells(table: Table, cells: { rowId: number; col: number; value: string }[]): Command | undefined {
  const changes = cells
    .map((c) => ({ ...c, before: table.rowById(c.rowId)!.cells[c.col]! }))
    .filter((c) => c.before !== c.value)
  if (changes.length === 0) return undefined
  const columns = [...new Set(changes.map((c) => table.colIds[c.col]!))]
  return {
    label: 'Replace',
    invalidates: columns,
    run: (t) => {
      for (const c of changes) t.rowById(c.rowId)!.cells[c.col] = c.value
    },
    revert: (t) => {
      for (const c of changes) t.rowById(c.rowId)!.cells[c.col] = c.before
    },
  }
}
