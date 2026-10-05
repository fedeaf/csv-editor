import { describe, expect, it } from 'vitest'
import { fileInfo, plural, selectionSummary } from './status'

describe('plural', () => {
  it('uses the singular for one and groups thousands', () => {
    expect(plural(1, 'row')).toBe('1 row')
    expect(plural(0, 'row')).toBe('0 rows')
    expect(plural(200000, 'row')).toBe('200,000 rows')
  })
})

describe('selectionSummary', () => {
  it('describes a block of cells', () => {
    expect(selectionSummary({ r0: 1, r1: 3, c0: 1, c1: 2 }, 7)).toBe('Selected 3 rows × 2 columns (6 cells)')
  })
  it('handles a single row or column, and a selection of the whole table', () => {
    expect(selectionSummary({ r0: 4, r1: 4, c0: 0, c1: 3 }, 7)).toBe('Selected 1 row × 4 columns (4 cells)')
    expect(selectionSummary({ r0: 0, r1: 6, c0: 2, c1: 2 }, 7)).toBe('Selected 7 rows × 1 column (7 cells)')
    expect(selectionSummary({ r0: 0, r1: 199999, c0: 0, c1: 3 }, 200000)).toBe(
      'Selected 200,000 rows × 4 columns (800,000 cells)',
    )
  })
  it('says nothing for a single cell or when no rows are shown', () => {
    expect(selectionSummary({ r0: 2, r1: 2, c0: 1, c1: 1 }, 7)).toBe('')
    expect(selectionSummary({ r0: 0, r1: 0, c0: 0, c1: 3 }, 0)).toBe('')
  })
})

describe('fileInfo', () => {
  const utf8 = { encoding: 'utf-8' as const, bom: false, delimiter: ',' as const }
  it('describes the file', () => {
    expect(fileInfo({ rows: 7, columns: 4, format: utf8 })).toBe('7 rows × 4 columns · UTF-8 · comma-delimited')
    expect(fileInfo({ rows: 1, columns: 1, format: utf8 })).toBe('1 row × 1 column · UTF-8 · comma-delimited')
  })
  it('names the encoding and the delimiter', () => {
    expect(fileInfo({ rows: 2, columns: 2, format: { ...utf8, bom: true } })).toContain('UTF-8 with BOM')
    expect(fileInfo({ rows: 2, columns: 2, format: { encoding: 'windows-1252', bom: false, delimiter: ';' } })).toBe(
      '2 rows × 2 columns · Windows-1252 / ISO-8859-1 · semicolon-delimited',
    )
  })
  it('says how many rows a filter shows', () => {
    expect(fileInfo({ rows: 200000, rowsShown: 1200, columns: 4, format: utf8 })).toBe(
      'Showing 1,200 of 200,000 rows × 4 columns · UTF-8 · comma-delimited',
    )
  })
})

describe('fileInfo formats', () => {
  const info = (format: Parameters<typeof fileInfo>[0]['format']) => fileInfo({ rows: 1, columns: 2, format })
  it('names every encoding and delimiter', () => {
    expect(info({ encoding: 'utf-16le', bom: true, delimiter: '\t' })).toBe('1 row × 2 columns · UTF-16 LE (with BOM) · tab-delimited')
    expect(info({ encoding: 'utf-8', bom: true, delimiter: '|' })).toBe('1 row × 2 columns · UTF-8 with BOM · pipe-delimited')
  })
})
