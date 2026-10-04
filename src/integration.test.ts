// H7: one session that combines the features, then saves and reopens the file. The file that comes
// back must hold exactly what is expected, whatever order the operations ran in.
import { describe, expect, it } from 'vitest'
import { encodeDocument, loadDocument } from './document'
import { fillCells, pasteCells, setCell, sortRows } from './model/commands'
import { History } from './model/history'
import { findMatch } from './model/search'
import { TableView } from './model/view'

const latin1 = (text: string) => new Uint8Array(Buffer.from(text, 'latin1'))
const text = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1')

describe('filter, sort, search, fill, edit, paste, undo, save and reopen', () => {
  // A Windows-1252 file with accents, semicolons and CRLF: the parts that are easiest to corrupt.
  const original =
    'id;name;city;note\r\n' +
    '1;Íñigo;Madrid;x\r\n' +
    '2;Ana;Lugo;x\r\n' +
    '3;álvaro;Madrid;x\r\n' +
    '4;Beatriz;Cádiz;x\r\n' +
    '5;ana;Lugo;x\r\n' +
    '6;Carlos;Madrid;x\r\n'

  it('writes exactly what the session left, in the original encoding', () => {
    const doc = loadDocument('people.csv', latin1(original))
    const { table } = doc
    const view = new TableView(table)
    const history = new History()
    const col = (name: string) => table.headers.indexOf(name)
    const run = (command: Parameters<History['execute']>[0]) => {
      const { command: done, cursor } = history.execute(command, table)
      view.stats.invalidate(done.invalidates)
      view.afterChange(cursor?.reveal)
    }
    const undo = () => {
      const outcome = history.undo(table)!
      view.stats.invalidate(outcome.command.invalidates)
      view.afterChange(outcome.cursor?.reveal)
    }
    const shown = (name: string) => view.visible.map((id) => table.rowById(id)!.cells[col(name)])

    expect(doc.format).toMatchObject({ encoding: 'windows-1252', delimiter: ';', lineEnding: '\r\n', trailingNewline: true })

    // 1. Filter: only Madrid and Lugo. "Cádiz" (Beatriz) is hidden, not deleted.
    view.setFilter(table.colIds[col('city')]!, { selected: new Set(['Madrid', 'Lugo']), duplicatesOnly: false })
    expect(shown('id')).toEqual(['1', '2', '3', '5', '6'])

    // 2. Sort by name. Whole rows move; the hidden row moves with them and stays hidden.
    run(sortRows(table, col('name'), 'asc')!)
    expect(shown('name')).toEqual(['álvaro', 'Ana', 'ana', 'Carlos', 'Íñigo'])
    expect([...table.orderedCells()].map((r) => r[1])).toEqual(['álvaro', 'Ana', 'ana', 'Beatriz', 'Carlos', 'Íñigo'])

    // 3. Search "ana" over the rows shown: first match, next, then back to the first.
    const grid = {
      rowCount: view.rowCount,
      colCount: table.columnCount,
      cell: (r: number, c: number) => table.rowById(view.visible[r]!)!.cells[c]!,
    }
    const first = findMatch(grid, 'ana', false)
    expect(first).toEqual({ row: 1, col: 1 }) // "Ana"
    const second = findMatch(grid, 'ana', false, first)
    expect(second).toEqual({ row: 2, col: 1 }) // "ana"
    expect(findMatch(grid, 'ana', false, second)).toEqual(first) // wraps around
    expect(findMatch(grid, 'beatriz', false)).toBeUndefined() // hidden rows are not searched

    // 4. Fill: put FILLED in the first note, then copy it down over the rows shown only.
    run(setCell(table, view.visible[0]!, col('note'), 'FILLED'))
    const below = view.visible.slice(1).map((rowId) => ({ rowId, col: col('note') }))
    run(fillCells(table, below, 'FILLED')!)
    expect(shown('note')).toEqual(['FILLED', 'FILLED', 'FILLED', 'FILLED', 'FILLED'])
    expect(table.rowById(table.order[3]!)!.cells[col('note')]).toBe('x') // Beatriz, hidden, untouched

    // 5. Edits: Carlos moves to Lugo, then Ana to Valencia. Ana no longer matches the filter but
    //    stays on screen until the filter is applied again.
    run(setCell(table, view.visible[3]!, col('city'), 'Lugo'))
    run(setCell(table, view.visible[1]!, col('city'), 'Valencia'))
    expect(shown('city')).toEqual(['Madrid', 'Valencia', 'Lugo', 'Lugo', 'Madrid'])

    // 6. Paste three lines at the name column of the fourth row shown: two rows are overwritten,
    //    the third becomes a new row at the end of the table.
    run(
      pasteCells(table, view.visible.slice(3, 6), col('name'), [
        ['Pablo', 'Sevilla'],
        ['Quique', 'Huelva'],
        ['Rosa', 'León'],
      ])!,
    )
    expect(table.rowCount).toBe(7)
    expect(table.rowAt(6)!.cells).toEqual(['', 'Rosa', 'León', ''])

    // 7. Undo two steps: the paste, then the Valencia edit. Everything before them stays.
    undo()
    undo()
    expect(table.rowCount).toBe(6)
    expect(shown('city')).toEqual(['Madrid', 'Lugo', 'Lugo', 'Lugo', 'Madrid'])
    expect(history.canRedo).toBe(true)

    // 8. Save with the filter still on: all rows are written, in the current order, with the
    //    original encoding, delimiter, line endings and trailing line break.
    const encoded = encodeDocument(doc, () => {
      throw new Error('no character needs another encoding here')
    })!
    const expected =
      'id;name;city;note\r\n' +
      '3;álvaro;Madrid;FILLED\r\n' +
      '2;Ana;Lugo;FILLED\r\n' +
      '5;ana;Lugo;FILLED\r\n' +
      '4;Beatriz;Cádiz;x\r\n' +
      '6;Carlos;Lugo;FILLED\r\n' +
      '1;Íñigo;Madrid;FILLED\r\n'
    expect(text(encoded.bytes)).toBe(expected)
    expect(encoded.bytes).toEqual(latin1(expected))
    expect(encoded.format).toEqual(doc.format)

    // 9. Reopen: the same table, cell by cell, and the same format.
    const reopened = loadDocument('people.csv', encoded.bytes)
    expect(reopened.table.headers).toEqual(['id', 'name', 'city', 'note'])
    expect([...reopened.table.orderedCells()]).toEqual([
      ['3', 'álvaro', 'Madrid', 'FILLED'],
      ['2', 'Ana', 'Lugo', 'FILLED'],
      ['5', 'ana', 'Lugo', 'FILLED'],
      ['4', 'Beatriz', 'Cádiz', 'x'],
      ['6', 'Carlos', 'Lugo', 'FILLED'],
      ['1', 'Íñigo', 'Madrid', 'FILLED'],
    ])
    expect(reopened.format).toEqual(doc.format)
  })

  it('offers UTF-8 when a pasted character does not fit the original encoding', () => {
    const doc = loadDocument('people.csv', latin1(original))
    const history = new History()
    history.execute(pasteCells(doc.table, [doc.table.order[0]!], 1, [['😀']])!, doc.table)
    expect(encodeDocument(doc, () => false)).toBeUndefined() // declined: nothing is written
    const utf8 = encodeDocument(doc, (chars) => chars.includes('😀'))!
    expect(utf8.format.encoding).toBe('utf-8')
    expect(loadDocument('people.csv', utf8.bytes).table.rowAt(0)!.cells[1]).toBe('😀')
    expect(doc.format.encoding).toBe('windows-1252') // only adopted once the write succeeds
  })
})
