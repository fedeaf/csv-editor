import { describe, expect, it } from 'vitest'
import { fillCells, replaceCells, setCell } from './commands'
import { History } from './history'
import { createMatcher, findAllMatches, findMatch, findReplacements, matchNumber, type SearchGrid } from './search'
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

describe('createMatcher', () => {
  it('replaces every occurrence in a cell, ignoring case', () => {
    const m = createMatcher('ana', false)
    expect(m.replace('Ana and ANA and banana', 'X')).toBe('X and X and bXna') // matches do not overlap
    expect(m.test('Mariana')).toBe(true)
    expect(m.test('Mario')).toBe(false)
  })
  it('takes the replacement literally: $ patterns mean nothing', () => {
    expect(createMatcher('a', false).replace('banana', '$&$1$$')).toBe('b$&$1$$n$&$1$$n$&$1$$')
  })
  it('takes the query literally: characters that mean something in a pattern do not', () => {
    expect(createMatcher('a.b', false).replace('a.b axb', '-')).toBe('- axb')
    expect(createMatcher('(1+1)', false).replace('x (1+1) y', '2')).toBe('x 2 y')
    expect(createMatcher('[a-z]*', false).replace('[a-z]* and abc', '?')).toBe('? and abc')
    expect(createMatcher('\\', false).replace('a\\b', '/')).toBe('a/b')
    expect(createMatcher('?', false).test('what?')).toBe(true)
  })
  it('works with accents and other scripts', () => {
    expect(createMatcher('ñ', false).replace('Niño y NIÑO', 'n')).toBe('Nino y NInO')
    expect(createMatcher('é', false).replace('Éric café', 'e')).toBe('eric cafe')
    expect(createMatcher('日本', false).test('こんにちは日本')).toBe(true)
  })
  it('exact: the whole cell must equal the query, and it is swapped whole', () => {
    const m = createMatcher('ana', true)
    expect(m.test('ANA')).toBe(true)
    expect(m.test('Mariana')).toBe(false)
    expect(m.replace('ANA', 'Eva')).toBe('Eva')
    expect(m.replace('Mariana', 'Eva')).toBe('Mariana')
  })
  it('agrees with Find: a cell that is found can be replaced', () => {
    const cells = ['Ana', 'MARIANA', 'banana', 'x.y', 'İstanbul', 'straße']
    for (const query of ['ana', 'a', 'X.Y', 'stanbul', 'ß']) {
      const m = createMatcher(query, false)
      for (const cell of cells) {
        if (m.test(cell)) expect(m.replace(cell, '#')).not.toBe(cell)
      }
    }
  })
})

describe('findReplacements', () => {
  const rows = [
    ['Mariana', 'x', 'ANA'],
    ['bob', 'ana', 'y'],
    ['', 'z', 'Anabel'],
  ]
  const grid = (): SearchGrid => ({ rowCount: rows.length, colCount: 3, cell: (r, c) => rows[r]![c]! })

  it('lists every cell that changes, with its new text', () => {
    expect(findReplacements(grid(), 'ana', false, '_')).toEqual([
      { row: 0, col: 0, value: 'Mari_' },
      { row: 0, col: 2, value: '_' },
      { row: 1, col: 1, value: '_' },
      { row: 2, col: 2, value: '_bel' },
    ])
  })
  it('exact: only whole cells', () => {
    expect(findReplacements(grid(), 'ana', true, 'Eva')).toEqual([
      { row: 0, col: 2, value: 'Eva' },
      { row: 1, col: 1, value: 'Eva' },
    ])
  })
  it('can replace with nothing', () => {
    expect(findReplacements(grid(), 'ana', false, '')[0]).toEqual({ row: 0, col: 0, value: 'Mari' })
  })
  it('leaves out cells that would not change, and an empty query finds nothing', () => {
    expect(findReplacements(grid(), 'bob', false, 'BOB')).toEqual([{ row: 1, col: 0, value: 'BOB' }])
    expect(findReplacements(grid(), 'bob', false, 'bob')).toEqual([{ row: 1, col: 0, value: 'bob' }].slice(1))
    expect(findReplacements(grid(), '', false, 'x')).toEqual([])
  })
})

describe('replaceCells', () => {
  const make = () => new Table(['a', 'b'], [['ana', 'x'], ['bob', 'ana'], ['eve', 'y']])
  const cells = (t: Table) => [...t.orderedCells()].map((r) => [...r])

  it('changes many cells as one undo step', () => {
    const t = make()
    const h = new History()
    const changes = [
      { rowId: t.order[0]!, col: 0, value: 'EVA' },
      { rowId: t.order[1]!, col: 1, value: 'EVA' },
    ]
    h.execute(replaceCells(t, changes)!, t)
    expect(cells(t)).toEqual([['EVA', 'x'], ['bob', 'EVA'], ['eve', 'y']])
    h.undo(t)
    expect(cells(t)).toEqual([['ana', 'x'], ['bob', 'ana'], ['eve', 'y']])
    expect(h.canUndo).toBe(false)
    h.redo(t)
    expect(cells(t)[0]![0]).toBe('EVA')
  })
  it('does nothing when no cell would change', () => {
    const t = make()
    expect(replaceCells(t, [{ rowId: t.order[0]!, col: 0, value: 'ana' }])).toBeUndefined()
    expect(replaceCells(t, [])).toBeUndefined()
  })
  it('reports the columns whose duplicates may change', () => {
    const t = make()
    expect(replaceCells(t, [{ rowId: t.order[0]!, col: 1, value: 'q' }])!.invalidates).toEqual([t.colIds[1]])
  })
  it('under a filter, Replace All only touches the rows shown', () => {
    const t = new Table(['k', 'v'], [['a', 'ana'], ['b', 'ana'], ['a', 'ana']])
    const view = new TableView(t)
    view.setFilter(t.colIds[0]!, { selected: new Set(['a']), duplicatesOnly: false })
    const shown: SearchGrid = { rowCount: view.rowCount, colCount: 2, cell: (r, c) => t.rowById(view.visible[r]!)!.cells[c]! }
    const changes = findReplacements(shown, 'ana', false, 'EVA').map((c) => ({ rowId: view.visible[c.row]!, col: c.col, value: c.value }))
    replaceCells(t, changes)!.run(t)
    expect([...t.orderedCells()].map((r) => r[1])).toEqual(['EVA', 'ana', 'EVA']) // the hidden row keeps its text
  })
})

describe('counting matches', () => {
  const rows = [
    ['Mariana', 'x', 'ANA'],
    ['bob', 'ana', 'y'],
    ['', 'z', 'Anabel'],
  ]
  const grid = (): SearchGrid => ({ rowCount: 3, colCount: 3, cell: (r, c) => rows[r]![c]! })

  it('lists the matching cells in reading order', () => {
    expect(findAllMatches(grid(), 'ana', false)).toEqual([0, 2, 4, 8]) // (0,0) (0,2) (1,1) (2,2)
    expect(findAllMatches(grid(), 'ana', true)).toEqual([2, 4])
    expect(findAllMatches(grid(), 'zzz', false)).toEqual([])
    expect(findAllMatches(grid(), '', false)).toEqual([])
  })

  it('gives each match its number, as Find walks through them', () => {
    const list = findAllMatches(grid(), 'ana', false)
    const walked: number[] = []
    let at = findMatch(grid(), 'ana', false)
    for (let i = 0; i < 4 && at; i++) {
      walked.push(matchNumber(list, at, 3))
      at = findMatch(grid(), 'ana', false, at)
    }
    expect(walked).toEqual([1, 2, 3, 4])
  })

  it('wraps to number 1 after the last match, like Next does', () => {
    const list = findAllMatches(grid(), 'ana', false)
    const wrapped = findMatch(grid(), 'ana', false, { row: 2, col: 2 })!
    expect(matchNumber(list, wrapped, 3)).toBe(1)
  })

  it('numbers going backwards too', () => {
    const list = findAllMatches(grid(), 'ana', false)
    expect(matchNumber(list, findMatch(grid(), 'ana', false, undefined, -1)!, 3)).toBe(4)
  })

  it('says 0 for a cell that is not a match', () => {
    expect(matchNumber(findAllMatches(grid(), 'ana', false), { row: 1, col: 0 }, 3)).toBe(0)
    expect(matchNumber([], { row: 0, col: 0 }, 3)).toBe(0)
  })

  it('agrees with a plain count on a larger table', () => {
    const big: SearchGrid = { rowCount: 5000, colCount: 4, cell: (r, c) => ((r * 7 + c * 3) % 11 === 0 ? 'hit' : 'miss') }
    const list = findAllMatches(big, 'hit', false)
    let expected = 0
    for (let r = 0; r < 5000; r++) for (let c = 0; c < 4; c++) if ((r * 7 + c * 3) % 11 === 0) expected++
    expect(list.length).toBe(expected)
    expect(matchNumber(list, { row: Math.floor(list[100]! / 4), col: list[100]! % 4 }, 4)).toBe(101)
  })

  it('counts only the rows it is given, so rows hidden by a filter are not in the total', () => {
    const t = new Table(['k', 'v'], [['a', 'hit'], ['b', 'hit'], ['a', 'hit']])
    const view = new TableView(t)
    view.setFilter(t.colIds[0]!, { selected: new Set(['a']), duplicatesOnly: false })
    const shown: SearchGrid = { rowCount: view.rowCount, colCount: 2, cell: (r, c) => t.rowById(view.visible[r]!)!.cells[c]! }
    expect(findAllMatches(shown, 'hit', false)).toHaveLength(2)
  })
})
