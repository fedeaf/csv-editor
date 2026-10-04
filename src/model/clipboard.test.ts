import { describe, expect, it } from 'vitest'
import { parseTsv, squared, toTsv } from './clipboard'
import { fillCells, pasteCells } from './commands'
import { History } from './history'
import { Table } from './table'
import { TableView } from './view'

describe('toTsv', () => {
  it('joins cells with tabs and rows with line breaks', () => {
    expect(toTsv([['a', 'b'], ['c', 'd']])).toBe('a\tb\nc\td')
  })
  it('quotes cells holding a tab, a line break or a quote', () => {
    expect(toTsv([['x\ty', 'two\nlines', 'say "hi"', 'plain']])).toBe('"x\ty"\t"two\nlines"\t"say ""hi"""\tplain')
  })
  it('keeps blank cells', () => {
    expect(toTsv([['', 'b', '']])).toBe('\tb\t')
  })
})

describe('parseTsv', () => {
  it('reads rows and cells', () => {
    expect(parseTsv('a\tb\nc\td')).toEqual([['a', 'b'], ['c', 'd']])
  })
  it('ignores one line break at the end, as spreadsheets add', () => {
    expect(parseTsv('a\tb\r\nc\td\r\n')).toEqual([['a', 'b'], ['c', 'd']])
    expect(parseTsv('a\n')).toEqual([['a']])
    expect(parseTsv('a\n\n')).toEqual([['a'], ['']]) // only the last one is dropped
  })
  it('understands quoted cells with tabs, line breaks and doubled quotes', () => {
    expect(parseTsv('"x\ty"\t"two\r\nlines"\t"say ""hi"""')).toEqual([['x\ty', 'two\r\nlines', 'say "hi"']])
  })
  it('leaves a quote inside a cell alone', () => {
    expect(parseTsv('5" pipe\tb')).toEqual([['5" pipe', 'b']])
  })
  it('treats text without tabs as one cell, and empty text as nothing', () => {
    expect(parseTsv('just text')).toEqual([['just text']])
    expect(parseTsv('')).toEqual([])
  })
  it('keeps blank cells, also at the ends', () => {
    expect(parseTsv('\tb\t')).toEqual([['', 'b', '']])
  })
  it('round-trips what toTsv writes', () => {
    const rows = [['a', 'b\tc', ''], ['"q"', 'l1\nl2', 'é ñ'], ['', '', '']]
    expect(parseTsv(toTsv(rows))).toEqual(rows)
  })
  it('squares ragged rows', () => {
    expect(squared([['a', 'b'], ['c']])).toEqual([['a', 'b'], ['c', '']])
  })
})

describe('pasteCells', () => {
  const make = () => new Table(['a', 'b', 'c'], [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']])
  const grid = (t: Table) => [...t.orderedCells()].map((r) => [...r])

  it('writes a block and is undone in one step', () => {
    const t = make()
    const h = new History()
    const before = grid(t)
    h.execute(pasteCells(t, [t.order[0]!, t.order[1]!], 1, [['x', 'y'], ['z', 'w']])!, t)
    expect(grid(t)).toEqual([['1', 'x', 'y'], ['4', 'z', 'w'], ['7', '8', '9']])
    h.undo(t)
    expect(grid(t)).toEqual(before)
    expect(h.canUndo).toBe(false)
    h.redo(t)
    expect(grid(t)).toEqual([['1', 'x', 'y'], ['4', 'z', 'w'], ['7', '8', '9']])
  })

  it('adds rows at the end for lines that do not fit, and removes them on undo', () => {
    const t = make()
    const h = new History()
    h.execute(pasteCells(t, [t.order[2]!], 0, [['p'], ['q'], ['r']])!, t)
    expect(grid(t)).toEqual([['1', '2', '3'], ['4', '5', '6'], ['p', '8', '9'], ['q', '', ''], ['r', '', '']])
    expect(new Set(t.order).size).toBe(5)
    h.undo(t)
    expect(grid(t)).toEqual([['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']])
    h.redo(t)
    expect(t.rowCount).toBe(5)
  })

  it('adds columns with blank headers for a block that is too wide, keeping every row aligned', () => {
    const t = make()
    const h = new History()
    h.execute(pasteCells(t, [t.order[0]!, t.order[1]!], 2, [['a', 'b', 'c'], ['d', 'e', 'f']])!, t)
    expect(t.headers).toEqual(['a', 'b', 'c', '', ''])
    expect(grid(t)).toEqual([['1', '2', 'a', 'b', 'c'], ['4', '5', 'd', 'e', 'f'], ['7', '8', '9', '', '']])
    for (const row of t.orderedCells()) expect(row).toHaveLength(t.columnCount)
    h.undo(t)
    expect(t.headers).toEqual(['a', 'b', 'c'])
    expect(grid(t)).toEqual([['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']])
    h.redo(t)
    expect(t.columnCount).toBe(5)
  })

  it('does both at once and still undoes cleanly', () => {
    const t = make()
    const h = new History()
    h.execute(pasteCells(t, [t.order[2]!], 2, [['1', '2'], ['3', '4']])!, t)
    expect(t.rowCount).toBe(4)
    expect(t.columnCount).toBe(4)
    for (const row of t.orderedCells()) expect(row).toHaveLength(4)
    h.undo(t)
    expect(grid(t)).toEqual([['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']])
  })

  it('does nothing when the block is already there', () => {
    const t = make()
    expect(pasteCells(t, [t.order[0]!], 0, [['1', '2']])).toBeUndefined()
  })

  it('reveals the rows it wrote, including new ones, even under a filter', () => {
    const t = make()
    const view = new TableView(t)
    view.setFilter(t.colIds[0]!, { selected: new Set(['1']), duplicatesOnly: false })
    const cmd = pasteCells(t, view.visible, 0, [['x'], ['y']])!
    const cursor = cmd.run(t)!
    view.afterChange(cursor.reveal)
    expect(view.visible.map((id) => t.rowById(id)!.cells[0])).toEqual(['x', 'y'])
  })

  it('a single value filled over a selection is one undo step', () => {
    const t = make()
    const h = new History()
    const targets = t.order.map((rowId) => ({ rowId, col: 1 }))
    h.execute(fillCells(t, targets, 'v')!, t)
    expect(grid(t).map((r) => r[1])).toEqual(['v', 'v', 'v'])
    h.undo(t)
    expect(grid(t).map((r) => r[1])).toEqual(['2', '5', '8'])
  })
})
