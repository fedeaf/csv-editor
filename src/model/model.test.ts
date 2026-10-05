import { describe, expect, it } from 'vitest'
import { changeFormat, deleteColumns, deleteRows, fillCells, insertColumn, insertRows, renameHeader, setCell } from './commands'
import { History } from './history'
import { Table, type FileFormat } from './table'

const make = () =>
  new Table(['a', 'b', 'c'], [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['10', '11', '12'],
  ])
const snapshot = (t: Table) => ({ headers: [...t.headers], rows: [...t.orderedCells()].map((r) => [...r]) })

describe('commands: do then undo restores the table exactly', () => {
  const cases: [string, (t: Table) => ReturnType<typeof setCell>][] = [
    ['setCell', (t) => setCell(t, t.order[1]!, 2, 'x')],
    ['renameHeader', (t) => renameHeader(t, 1, 'renamed')],
    ['insertRows above', (t) => insertRows(t, 1, 1)],
    ['insertRows at end', (t) => insertRows(t, 4, 2)],
    ['deleteRows middle', (t) => deleteRows(t.order.slice(1, 3))],
    ['deleteRows all', (t) => deleteRows(t.order)],
    ['insertColumn', (t) => insertColumn(t, 1)],
    ['deleteColumns', () => deleteColumns(0, 1)],
  ]
  for (const [name, build] of cases) {
    it(name, () => {
      const t = make()
      const before = snapshot(t)
      const cmd = build(t)
      cmd.run(t)
      const after = snapshot(t)
      expect(after).not.toEqual(before)
      cmd.revert(t)
      expect(snapshot(t)).toEqual(before)
      cmd.run(t) // redo
      expect(snapshot(t)).toEqual(after)
    })
  }

  it('keeps every row aligned across structure changes', () => {
    const t = make()
    const h = new History()
    h.execute(insertColumn(t, 1), t)
    h.execute(setCell(t, t.order[0]!, 1, 'new'), t)
    h.execute(deleteRows([t.order[1]!]), t)
    expect(snapshot(t).rows).toEqual([['1', 'new', '2', '3'], ['7', '', '8', '9'], ['10', '', '11', '12']])
    for (const row of t.orderedCells()) expect(row).toHaveLength(t.columnCount)
  })

  it('inserts blank rows with the table width and distinct ids', () => {
    const t = make()
    insertRows(t, 2, 3).run(t)
    expect(t.rowCount).toBe(7)
    expect(new Set(t.order).size).toBe(7)
    expect(t.rowAt(2)!.cells).toEqual(['', '', ''])
  })

  it('restores deleted rows to their original positions', () => {
    const t = make()
    const cmd = deleteRows(t.order.slice(1, 3))
    cmd.run(t)
    expect([...t.orderedCells()].map((r) => r[0])).toEqual(['1', '10'])
    cmd.revert(t)
    expect([...t.orderedCells()].map((r) => r[0])).toEqual(['1', '4', '7', '10'])
  })

  it('reports where the cursor should go, by row id', () => {
    const t = make()
    const third = t.order[2]!
    expect(setCell(t, third, 1, 'x').run(t)).toEqual({ rowId: third, col: 1 })
    const last = t.order[3]!
    expect(deleteRows([last]).run(t)).toEqual({ rowId: third })
    expect(insertColumn(t, 3).run(t)).toEqual({ col: 3 })
    const inserted = insertRows(t, 1, 1).run(t)!
    expect(inserted.reveal).toEqual([inserted.rowId])
  })
})

describe('history', () => {
  it('undoes and redoes in order, and a new command clears redo', () => {
    const t = make()
    const h = new History()
    h.execute(setCell(t, t.order[0]!, 0, 'x'), t)
    h.execute(setCell(t, t.order[0]!, 0, 'y'), t)
    h.undo(t)
    expect(t.rowAt(0)!.cells[0]).toBe('x')
    expect(h.canRedo).toBe(true)
    h.redo(t)
    expect(t.rowAt(0)!.cells[0]).toBe('y')
    h.undo(t)
    h.execute(setCell(t, t.order[0]!, 0, 'z'), t)
    expect(h.canRedo).toBe(false)
    h.undo(t)
    h.undo(t)
    expect(t.rowAt(0)!.cells[0]).toBe('1')
    expect(h.canUndo).toBe(false)
  })

  it('tracks the unsaved indicator', () => {
    const t = make()
    const h = new History()
    expect(h.dirty).toBe(false)
    h.execute(setCell(t, t.order[0]!, 0, 'x'), t)
    expect(h.dirty).toBe(true)
    h.markSaved()
    expect(h.dirty).toBe(false)
    h.undo(t)
    expect(h.dirty).toBe(true) // differs from the saved file
    h.redo(t)
    expect(h.dirty).toBe(false) // back to the saved state
  })

  it('stays dirty when the saved state is no longer reachable', () => {
    const t = make()
    const h = new History()
    h.execute(setCell(t, t.order[0]!, 0, 'x'), t)
    h.execute(setCell(t, t.order[0]!, 0, 'y'), t)
    h.markSaved() // depth 2
    h.undo(t)
    h.execute(setCell(t, t.order[0]!, 0, 'z'), t) // depth 2 again, different state
    expect(h.dirty).toBe(true)
    h.undo(t)
    h.undo(t)
    expect(h.dirty).toBe(true)
  })
})

describe('changeFormat', () => {
  it('changes how a document is written, and puts it back on undo', () => {
    const doc = { format: { encoding: 'utf-8', bom: false, delimiter: ',', lineEnding: '\n', trailingNewline: true } as FileFormat }
    const next = { ...doc.format, delimiter: ';' as const, lineEnding: '\r\n' as const }
    const table = new Table(['a'], [['1']])
    const history = new History()
    history.execute(changeFormat(doc, next), table)
    expect(doc.format).toBe(next)
    expect(history.dirty).toBe(true)
    history.undo(table)
    expect(doc.format.delimiter).toBe(',')
    expect(history.dirty).toBe(false)
  })
})

describe('the names that undo and redo report', () => {
  it('say what each operation is, so the status bar can name it', () => {
    const table = make()
    const labels = [
      setCell(table, table.order[0]!, 0, 'x').label,
      renameHeader(table, 0, 'z').label,
      insertRows(table, 0, 1).label,
      insertRows(table, 0, 3).label,
      deleteRows([table.order[0]!]).label,
      insertColumn(table, 0).label,
      deleteColumns(0, 0).label,
    ]
    expect(labels).toEqual(['Edit cell', 'Rename header', 'Insert row', 'Insert rows', 'Delete row', 'Insert column', 'Delete column'])
  })
  it('let a fill be called by what the user did', () => {
    const table = make()
    const targets = [{ rowId: table.order[0]!, col: 0 }]
    expect(fillCells(table, targets, 'q')!.label).toBe('Fill')
    expect(fillCells(table, targets, 'q', 'Clear contents')!.label).toBe('Clear contents')
  })
})
