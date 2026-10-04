import { describe, expect, it } from 'vitest'
import { deleteColumns, deleteRows, insertColumn, insertRows, setCell, sortRows } from './commands'
import { History } from './history'
import { Table } from './table'
import { TableView, uniqueValues } from './view'

const col = (t: Table, c: number) => [...t.orderedCells()].map((r) => r[c])
const setup = (rows: string[][], headers = ['k', 'v']) => {
  const table = new Table(headers, rows.map((r) => [...r])) // the table owns its rows: never share arrays between tests
  return { table, view: new TableView(table), history: new History() }
}
const shown = (view: TableView, c = 0) => view.visible.map((id) => view.table.rowById(id)!.cells[c])

describe('sorting', () => {
  const rows = [['b', '1'], ['A', '2'], ['', '3'], ['a', '4'], ['c', '5'], ['', '6'], ['B', '7']]

  it('sorts whole rows, case-insensitive, stable, blanks last', () => {
    const { table, history } = setup(rows)
    history.execute(sortRows(table, 0, 'asc')!, table)
    expect(col(table, 0)).toEqual(['A', 'a', 'b', 'B', 'c', '', ''])
    // every row kept its own second value: ties keep their original relative order
    expect(col(table, 1)).toEqual(['2', '4', '1', '7', '5', '3', '6'])
  })

  it('sorts descending with blanks still last and ties stable', () => {
    const { table, history } = setup(rows)
    history.execute(sortRows(table, 0, 'desc')!, table)
    expect(col(table, 0)).toEqual(['c', 'b', 'B', 'A', 'a', '', ''])
    expect(col(table, 1)).toEqual(['5', '1', '7', '2', '4', '3', '6'])
  })

  it('treats numbers as text: "10" sorts before "9" (D-04)', () => {
    const { table, history } = setup([['9'], ['10'], ['2']], ['n'])
    history.execute(sortRows(table, 0, 'asc')!, table)
    expect(col(table, 0)).toEqual(['10', '2', '9'])
  })

  it('keeps a control row together', () => {
    const { table, history } = setup([['z', 'ctrl-z'], ['a', 'ctrl-a'], ['m', 'ctrl-m']])
    history.execute(sortRows(table, 0, 'asc')!, table)
    for (const [k, v] of table.orderedCells()) expect(v).toBe(`ctrl-${k}`)
  })

  it('records the sort column and direction, and undo restores order and indicator', () => {
    const { table, history } = setup(rows)
    const before = col(table, 0)
    history.execute(sortRows(table, 0, 'asc')!, table)
    expect(table.sort).toEqual({ colId: table.colIds[0], dir: 'asc' })
    history.execute(sortRows(table, 1, 'desc')!, table)
    expect(table.sort).toEqual({ colId: table.colIds[1], dir: 'desc' })
    history.undo(table)
    expect(table.sort).toEqual({ colId: table.colIds[0], dir: 'asc' })
    history.undo(table)
    expect(col(table, 0)).toEqual(before)
    expect(table.sort).toBeUndefined()
    history.redo(table)
    expect(col(table, 0)).toEqual(['A', 'a', 'b', 'B', 'c', '', ''])
  })

  it('does nothing when already sorted that way', () => {
    const { table, history } = setup(rows)
    history.execute(sortRows(table, 0, 'asc')!, table)
    expect(sortRows(table, 0, 'asc')).toBeUndefined()
  })

  it('follows the column when others are inserted before it, and drops it when deleted', () => {
    const { table, history } = setup(rows)
    history.execute(sortRows(table, 1, 'desc')!, table)
    history.execute(insertColumn(table, 0), table)
    expect(table.columnIndex(table.sort!.colId)).toBe(2)
    history.execute(deleteColumns(2, 2), table)
    expect(table.sort).toBeUndefined()
    history.undo(table)
    expect(table.sort?.dir).toBe('desc')
  })
})

describe('duplicate statistics (D-05)', () => {
  it('counts exact repeats only: case and spaces matter, blanks never count', () => {
    const { view, table } = setup([['a'], ['a'], ['A'], ['a '], [''], [''], ['b']], ['k'])
    const stat = view.stats.get(table.colIds[0]!)
    expect(stat.duplicateValues).toBe(1) // only "a"
    expect(stat.duplicateRows).toBe(2)
  })

  it('reports no duplicates for a unique column', () => {
    const { view, table } = setup([['a'], ['b'], ['']], ['k'])
    expect(view.stats.get(table.colIds[0]!).duplicateValues).toBe(0)
  })

  it('is recomputed for a column after its cells change', () => {
    const { view, table, history } = setup([['a'], ['b']], ['k'])
    const id = table.colIds[0]!
    expect(view.stats.get(id).duplicateValues).toBe(0)
    const cmd = setCell(table, table.order[1]!, 0, 'a')
    history.execute(cmd, table)
    view.stats.invalidate(cmd.invalidates)
    expect(view.stats.get(id).duplicateValues).toBe(1)
  })

  it('lists unique values alphabetically with counts and blanks apart', () => {
    const { view, table } = setup([['b'], ['a'], ['b'], [''], ['A']], ['k'])
    const { values, blanks } = uniqueValues(view.stats.get(table.colIds[0]!))
    expect(values).toEqual([{ value: 'A', count: 1 }, { value: 'a', count: 1 }, { value: 'b', count: 2 }])
    expect(blanks).toBe(1)
  })
})

describe('filters', () => {
  const rows = [['a', 'x'], ['b', 'x'], ['a', 'y'], ['c', 'x'], ['', 'y'], ['b', 'y']]

  it('shows only selected values, including blanks', () => {
    const { view, table } = setup(rows)
    view.setFilter(table.colIds[0]!, { selected: new Set(['a', '']), duplicatesOnly: false })
    expect(shown(view)).toEqual(['a', 'a', ''])
  })

  it('combines filters on several columns with AND (FIL-02)', () => {
    const { view, table } = setup(rows)
    view.setFilter(table.colIds[0]!, { selected: new Set(['a', 'b']), duplicatesOnly: false })
    view.setFilter(table.colIds[1]!, { selected: new Set(['x']), duplicatesOnly: false })
    expect(view.visible.map((id) => table.rowById(id)!.cells.join())).toEqual(['a,x', 'b,x'])
  })

  it('"Duplicates only" keeps rows whose value repeats in the column', () => {
    const { view, table } = setup(rows)
    view.setFilter(table.colIds[0]!, { selected: null, duplicatesOnly: true })
    expect(shown(view)).toEqual(['a', 'b', 'a', 'b']) // "c" is unique, the blank never counts
  })

  it('numbers visible rows by their position in the whole table', () => {
    const { view, table } = setup(rows)
    view.setFilter(table.colIds[0]!, { selected: new Set(['b']), duplicatesOnly: false })
    expect([0, 1].map((i) => view.rowNumber(i))).toEqual([2, 6])
  })

  it('clearing restores every row; nothing was deleted (FIL-05)', () => {
    const { view, table } = setup(rows)
    view.setFilter(table.colIds[0]!, { selected: new Set(['c']), duplicatesOnly: false })
    expect(view.rowCount).toBe(1)
    expect(table.rowCount).toBe(6)
    view.clearFilters()
    expect(view.rowCount).toBe(6)
    expect(view.rowNumber(3)).toBe(4)
  })

  it('an emptied selection hides everything; an unrestricted filter is no filter', () => {
    const { view, table } = setup(rows)
    view.setFilter(table.colIds[0]!, { selected: new Set(), duplicatesOnly: false })
    expect(view.rowCount).toBe(0)
    view.setFilter(table.colIds[0]!, { selected: null, duplicatesOnly: false })
    expect(view.filtered).toBe(false)
    expect(view.rowCount).toBe(6)
  })

  it('an edited row stays visible until the filter is reapplied', () => {
    const { view, table, history } = setup(rows)
    const colId = table.colIds[0]!
    view.setFilter(colId, { selected: new Set(['a']), duplicatesOnly: false })
    const cmd = setCell(table, view.visible[0]!, 0, 'zzz')
    history.execute(cmd, table)
    view.stats.invalidate(cmd.invalidates)
    view.afterChange()
    expect(shown(view)).toEqual(['zzz', 'a']) // no longer matches, still shown
    view.setFilter(colId, view.filters.get(colId)) // reapply
    expect(shown(view)).toEqual(['a'])
  })

  it('shows inserted and restored rows even if the filter would hide them', () => {
    const { view, table, history } = setup(rows)
    view.setFilter(table.colIds[0]!, { selected: new Set(['a']), duplicatesOnly: false })
    const ins = history.execute(insertRows(table, 1, 1), table)
    view.afterChange(ins.cursor!.reveal)
    expect(shown(view)).toEqual(['a', '', 'a'])
    const del = history.execute(deleteRows([view.visible[0]!]), table)
    view.afterChange(del.cursor!.reveal)
    const undo = history.undo(table)!
    view.afterChange(undo.cursor!.reveal)
    expect(shown(view)).toEqual(['a', '', 'a'])
  })

  it('sorting under a filter reorders every row but keeps the same ones visible', () => {
    const { view, table, history } = setup(rows)
    view.setFilter(table.colIds[1]!, { selected: new Set(['y']), duplicatesOnly: false })
    history.execute(sortRows(table, 0, 'asc')!, table)
    view.afterChange()
    expect(shown(view)).toEqual(['a', 'b', ''])
    expect(col(table, 0)).toEqual(['a', 'a', 'b', 'b', 'c', ''])
  })

  it('forgets the filter of a deleted column', () => {
    const { view, table, history } = setup(rows)
    view.setFilter(table.colIds[1]!, { selected: new Set(['y']), duplicatesOnly: false })
    expect(view.rowCount).toBe(3)
    history.execute(deleteColumns(1, 1), table)
    view.afterChange()
    expect(view.filtered).toBe(false)
    expect(view.rowCount).toBe(6)
  })

  it('keeps a filter on the same column when columns are inserted before it', () => {
    const { view, table, history } = setup(rows)
    view.setFilter(table.colIds[1]!, { selected: new Set(['y']), duplicatesOnly: false })
    history.execute(insertColumn(table, 0), table)
    view.afterChange()
    expect(view.rowCount).toBe(3)
  })
})
