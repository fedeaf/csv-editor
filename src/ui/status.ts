// The texts of the status bar. Its left side says what is going on (the selection, or the result of
// the last action) and its right side describes the file; both are built here.
import { DELIMITER_NAMES, encodingLabel } from '../model/formatOptions'
import type { Summary } from '../model/summary'
import type { FileFormat } from '../model/table'
import type { Rect } from './grid'

export const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`

/** "Selected 3 rows × 2 columns (6 cells)", or nothing when at most one cell is selected. */
export function selectionSummary(rect: Rect, rowsShown: number): string {
  const rows = rect.r1 - rect.r0 + 1
  const cols = rect.c1 - rect.c0 + 1
  if (rowsShown === 0 || rows * cols < 2) return ''
  return `Selected ${plural(rows, 'row')} × ${plural(cols, 'column')} (${plural(rows * cols, 'cell')})`
}

export interface FileInfo {
  rows: number
  /** Rows a filter leaves visible; omitted when nothing is filtered. */
  rowsShown?: number
  columns: number
  format: Pick<FileFormat, 'encoding' | 'bom' | 'delimiter'>
}

/** "Showing 5 of 7 rows × 4 columns · UTF-8 · comma-delimited". */
export function fileInfo({ rows, rowsShown, columns, format }: FileInfo): string {
  const encoding = encodingLabel(format)
  const delimiter = DELIMITER_NAMES[format.delimiter]
  const rowText = rowsShown === undefined ? plural(rows, 'row') : `Showing ${rowsShown.toLocaleString('en-US')} of ${plural(rows, 'row')}`
  return `${rowText} × ${plural(columns, 'column')} · ${encoding} · ${delimiter}-delimited`
}

const n = (count: number) => count.toLocaleString('en-US')

/**
 * What the selected cells hold, for the status bar: "2 blank · 1 null · 9 unique · 3 duplicate values (12 cells)".
 * `detail` is the longer explanation for the tooltip.
 */
export function summaryText(s: Summary): { text: string; detail: string } {
  const parts: string[] = []
  if (s.blank === 0 && s.nullLike === 0) parts.push('No blanks')
  if (s.blank > 0) parts.push(`${n(s.blank)} blank`)
  if (s.nullLike > 0) parts.push(`${n(s.nullLike)} null`)
  if (s.duplicatesSkipped) parts.push('Unique and duplicates not counted')
  else {
    parts.push(`${n(s.uniqueValues)} unique`)
    parts.push(s.duplicateValues === 0 ? 'No duplicates' : `${plural(s.duplicateValues, 'duplicate value')} (${plural(s.duplicateCells, 'cell')})`)
  }
  const detail = [
    `${n(s.cells)} cells selected`,
    `Blank: ${n(s.blank)} (empty, or only spaces)`,
    `Null: ${n(s.nullLike)} (text such as null, NaN, N/A, none)`,
    s.duplicatesSkipped
      ? 'Unique values and duplicates: not counted, there are too many different values'
      : `Unique: ${plural(s.uniqueValues, 'different value')} (blanks left out)\nDuplicates: ${plural(s.duplicateValues, 'value')} repeat, in ${plural(s.duplicateCells, 'cell')} (exact matches among the cells selected; blanks never count)`,
  ].join('\n')
  return { text: parts.join(' · '), detail }
}
