import { describe, expect, it } from 'vitest'
import { isSpreadsheetError, nextErrorRow, SPREADSHEET_ERRORS } from './errors'

describe('isSpreadsheetError', () => {
  it('recognises every error Excel, Google Sheets and LibreOffice write in English', () => {
    for (const e of ['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A', '#SPILL!', '#CALC!', '#GETTING_DATA', '#FIELD!', '#BLOCKED!', '#CONNECT!', '#UNKNOWN!', '#ERROR!']) {
      expect(isSpreadsheetError(e), e).toBe(true)
    }
  })
  it('recognises the ones Excel writes in Spanish', () => {
    for (const e of ['#¡NULO!', '#¡DIV/0!', '#¡VALOR!', '#¡REF!', '#¿NOMBRE?', '#¡NUM!', '#N/D']) {
      expect(isSpreadsheetError(e), e).toBe(true)
    }
  })
  it("recognises LibreOffice's numbered errors", () => {
    expect(isSpreadsheetError('Err:502')).toBe(true)
    expect(isSpreadsheetError('Err:508')).toBe(true)
    expect(isSpreadsheetError('ERR:522')).toBe(true)
  })
  it('ignores case', () => {
    expect(isSpreadsheetError('#n/a')).toBe(true)
    expect(isSpreadsheetError('#Name?')).toBe(true)
    expect(isSpreadsheetError('#div/0!')).toBe(true)
    expect(isSpreadsheetError('#¡valor!')).toBe(true)
  })
  it('ignores spaces around the value', () => {
    expect(isSpreadsheetError('  #REF!  ')).toBe(true)
    expect(isSpreadsheetError('\t#N/A\n')).toBe(true)
  })
  it('needs the whole cell to be the error', () => {
    expect(isSpreadsheetError('#N/A in row 3')).toBe(false)
    expect(isSpreadsheetError('see #REF!')).toBe(false)
    expect(isSpreadsheetError('#N/A #N/A')).toBe(false)
  })
  it('does not take text that only resembles an error for one', () => {
    for (const text of ['N/A', 'n/a', 'NaN', 'null', 'NULL', 'undefined', '#', '#1', '#hashtag', '#NAME', '#DIV/0', '#N/A!', 'div0', 'DIV/0!', 'Error', 'Err:5', 'Err:5022', 'Err:abc', '', ' ', '0', '#######']) {
      expect(isSpreadsheetError(text), JSON.stringify(text)).toBe(false)
    }
  })
  it('stays quick on long text', () => {
    expect(isSpreadsheetError('x'.repeat(100_000))).toBe(false)
  })
  it('lists the literals it knows, all starting with #', () => {
    expect(SPREADSHEET_ERRORS.length).toBe(22)
    expect(SPREADSHEET_ERRORS.every((e) => e.startsWith('#'))).toBe(true)
    expect(new Set(SPREADSHEET_ERRORS.map((e) => e.toUpperCase())).size).toBe(SPREADSHEET_ERRORS.length)
  })
})

describe('nextErrorRow', () => {
  //          0     1       2     3        4     5       6
  const col = ['ok', '#N/A', 'ok', '#REF!', 'ok', 'ok', '#n/a']
  const at = (after?: number) => nextErrorRow((r) => col[r]!, col.length, after)

  it('goes to the first error when there is no starting point', () => {
    expect(at()).toEqual({ row: 1, index: 1, total: 3, wrapped: false })
  })
  it('walks through the errors one after another', () => {
    expect(at(1)).toEqual({ row: 3, index: 2, total: 3, wrapped: false })
    expect(at(3)).toEqual({ row: 6, index: 3, total: 3, wrapped: false })
  })
  it('starts over after the last one and says so', () => {
    expect(at(6)).toEqual({ row: 1, index: 1, total: 3, wrapped: true })
  })
  it('works from a row that is not an error, going forward', () => {
    expect(at(0)).toMatchObject({ row: 1 })
    expect(at(2)).toMatchObject({ row: 3 })
    expect(at(4)).toMatchObject({ row: 6 })
    expect(at(5)).toMatchObject({ row: 6 })
  })
  it('wraps from any row past the last error', () => {
    expect(nextErrorRow((r) => col[r] ?? 'ok', 10, 8)).toMatchObject({ row: 1, wrapped: true })
  })
  it('stays on the only error, and says it wrapped when asked again', () => {
    const one = (after?: number) => nextErrorRow((r) => ['x', '#N/A', 'y'][r]!, 3, after)
    expect(one()).toEqual({ row: 1, index: 1, total: 1, wrapped: false })
    expect(one(1)).toEqual({ row: 1, index: 1, total: 1, wrapped: true })
  })
  it('finds nothing in a clean column or an empty one', () => {
    expect(nextErrorRow(() => 'fine', 5)).toBeUndefined()
    expect(nextErrorRow(() => '', 0)).toBeUndefined()
  })
  it('still sees an error with spaces or lower case in front of the quick check', () => {
    expect(nextErrorRow((r) => ['x', '  #N/A', 'err:502'][r]!, 3)).toMatchObject({ row: 1, total: 2 })
  })
})
