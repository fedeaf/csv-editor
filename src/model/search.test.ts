import { describe, expect, it } from 'vitest'
import { fillCells, setCell } from './commands'
import { History } from './history'
import { findMatch, type SearchGrid } from './search'
import { Table } from './table'
import { TableView } from './view'

const grid = (rows: string[][]): SearchGrid => ({
  rowCount: rows.length,
  colCount: rows[0]?.length ?? 0,
  cell: (r, c) => rows[r]![c]!,
})
const rows = [
  ['Mariana', 'x', 'ANA'],
  ['bob', 'ana', 'y'],
  ['', 'z', 'Anabel'],
]

describe('findMatch', () => {
  it('finds partial matches ignoring case, row by row and left to right', () => {
    const g = grid(rows)
    const hits: unknown[] = []
    let at = findMatch(g, 'ana', false)
    for (let i = 0; i < 4 && at; i++) {
      hits.push(at)
      at = findMatch(g, 'ana', false, at)
    }
    expect(hits).toEqual([{ row: 0, col: 0 }, { row: 0, col: 2 }, { row: 1, col: 1 }, { row: 2, col: 2 }])
  })

  it('wraps from the last match to the first (BUS-03)', () => {
    expect(findMatch(grid(rows), 'ana', false, { row: 2, col: 2 })).toEqual({ row: 0, col: 0 })
  })

  it('returns the same cell when it is the only match', () => {
    const g = grid([['a', 'b'], ['c', 'needle']])
    expect(findMatch(g, 'needle', false, { row: 1, col: 1 })).toEqual({ row: 1, col: 1 })
  })

  it('exact match needs the whole cell, still ignoring case (BUS-05)', () => {
    const g = grid(rows)
    expect(findMatch(g, 'ana', true)).toEqual({ row: 0, col: 2 }) // "ANA", not "Mariana"
    expect(findMatch(g, 'ana', true, { row: 0, col: 2 })).toEqual({ row: 1, col: 1 })
    expect(findMatch(g, 'ana', true, { row: 1, col: 1 })).toEqual({ row: 0, col: 2 })
  })

  it('reports no match, and nothing for an empty query or table', () => {
    expect(findMatch(grid(rows), 'zzz', false)).toBeUndefined()
    expect(findMatch(grid(rows), '', false)).toBeUndefined()
    expect(findMatch(grid([]), 'a', false)).toBeUndefined()
  })

  it('goes backwards and wraps the other way', () => {
    const g = grid(rows)
    expect(findMatch(g, 'ana', false, undefined, -1)).toEqual({ row: 2, col: 2 })
    expect(findMatch(g, 'ana', false, { row: 0, col: 0 }, -1)).toEqual({ row: 2, col: 2 })
  })

  it('copes with a stale start position after rows were removed', () => {
    expect(findMatch(grid(rows), 'bob', false, { row: 50, col: 9 })).toEqual({ row: 1, col: 0 })
  })

  it('skips rows hidden by a filter (BUS-06)', () => {
    const table = new Table(['k', 'v'], [['a', 'hit'], ['b', 'hit'], ['a', 'miss']])
    const view = new TableView(table)
    view.setFilter(table.colIds[0]!, { selected: new Set(['b']), duplicatesOnly: false })
    const g: SearchGrid = {
      rowCount: view.rowCount,
      colCount: 2,
      cell: (r, c) => table.rowById(view.visible[r]!)!.cells[c]!,
    }
    expect(findMatch(g, 'hit', false)).toEqual({ row: 0, col: 1 })
    expect(findMatch(g, 'hit', false, { row: 0, col: 1 })).toEqual({ row: 0, col: 1 }) // only one visible
    expect(findMatch(g, 'miss', false)).toBeUndefined() // hidden row
  })
})

describe('fillCells', () => {
  const make = () => new Table(['a', 'b', 'c'], [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']])

  it('copies the value as-is and is one undo step (REL-02, REL-05)', () => {
    const t = make()
    const h = new History()
    const targets = [1, 2].map((i) => ({ rowId: t.order[i]!, col: 0 }))
    h.execute(fillCells(t, targets, '1')!, t)
    expect([...t.orderedCells()].map((r) => r[0])).toEqual(['1', '1', '1'])
    h.undo(t)
    expect([...t.orderedCells()].map((r) => r[0])).toEqual(['1', '4', '7'])
    expect(h.canUndo).toBe(false) // a single step undid the whole fill
    h.redo(t)
    expect([...t.orderedCells()].map((r) => r[0])).toEqual(['1', '1', '1'])
  })

  it('fills across columns', () => {
    const t = make()
    fillCells(t, [1, 2].map((col) => ({ rowId: t.order[0]!, col })), 'x')!.run(t)
    expect(t.rowAt(0)!.cells).toEqual(['1', 'x', 'x'])
  })

  it('does nothing when every target already holds the value', () => {
    const t = make()
    expect(fillCells(t, [{ rowId: t.order[0]!, col: 0 }], '1')).toBeUndefined()
  })

  it('only touches the rows it is given, so hidden rows stay as they were (REL-04)', () => {
    const t = make()
    const view = new TableView(t)
    view.setFilter(t.colIds[1]!, { selected: new Set(['2', '8']), duplicatesOnly: false })
    const below = view.visible.slice(1).map((rowId) => ({ rowId, col: 0 }))
    fillCells(t, below, 'F')!.run(t)
    expect([...t.orderedCells()].map((r) => r[0])).toEqual(['1', '4', 'F']) // row 2 was hidden
  })

  it('reports the columns whose duplicate counts change', () => {
    const t = make()
    const cmd = fillCells(t, [{ rowId: t.order[1]!, col: 2 }], 'x')!
    expect(cmd.invalidates).toEqual([t.colIds[2]])
    expect(setCell(t, t.order[0]!, 0, 'z').invalidates).toEqual([t.colIds[0]])
  })
})
