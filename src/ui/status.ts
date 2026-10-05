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
  format: Pick<FileFormat, 'encoding' | 'bom' | 'delimiter'> & { quoteAll?: boolean }
}

/** "Showing 5 of 7 rows × 4 columns · UTF-8 · comma-delimited". */
export function fileInfo({ rows, rowsShown, columns, format }: FileInfo): string {
  const encoding = encodingLabel(format)
  const delimiter = DELIMITER_NAMES[format.delimiter]
  const rowText = rowsShown === undefined ? plural(rows, 'row') : `Showing ${rowsShown.toLocaleString('en-US')} of ${plural(rows, 'row')}`
  return `${rowText} × ${plural(columns, 'column')} · ${encoding} · ${delimiter}-delimited${format.quoteAll ? ' · all fields quoted' : ''}`
}

const n = (count: number) => count.toLocaleString('en-US')

/** How a piece of the summary is drawn: `ok` for good news, `warn` for something to look at, `plain` for a figure. */
export type Tone = 'ok' | 'warn' | 'plain'

export interface SummaryChip {
  text: string
  tone: Tone
}

/**
 * What the selected cells hold, for the status bar, in pieces: "2 blank", "1 null", "9 unique",
 * "3 duplicate values (12 cells)", or "No blanks" and "No duplicates". `text` is the same joined
 * with " · ", and `detail` the longer explanation for the tooltip.
 */
export function summaryText(s: Summary): { chips: SummaryChip[]; text: string; detail: string } {
  const chips: SummaryChip[] = []
  if (s.blank === 0 && s.nullLike === 0) chips.push({ text: 'No blanks', tone: 'ok' })
  if (s.blank > 0) chips.push({ text: `${n(s.blank)} blank`, tone: 'warn' })
  if (s.nullLike > 0) chips.push({ text: `${n(s.nullLike)} null`, tone: 'warn' })
  if (s.duplicatesSkipped) {
    chips.push({ text: 'Unique and duplicates not counted', tone: 'plain' })
  } else {
    chips.push({ text: `${n(s.uniqueValues)} unique`, tone: 'plain' })
    chips.push(
      s.duplicateValues === 0
        ? { text: 'No duplicates', tone: 'ok' }
        : { text: `${plural(s.duplicateValues, 'duplicate value')} (${plural(s.duplicateCells, 'cell')})`, tone: 'warn' },
    )
  }
  const detail = [
    `${n(s.cells)} cells selected`,
    `Blank: ${n(s.blank)} (empty, or only spaces)`,
    `Null: ${n(s.nullLike)} (text such as null, NaN, N/A, none)`,
    s.duplicatesSkipped
      ? 'Unique values and duplicates: not counted, there are too many different values'
      : `Unique: ${plural(s.uniqueValues, 'different value')} (blanks left out)\nDuplicates: ${plural(s.duplicateValues, 'value')} repeat, in ${plural(s.duplicateCells, 'cell')} (exact matches among the cells selected; blanks never count)`,
  ].join('\n')
  return { chips, text: chips.map((c) => c.text).join(' · '), detail }
}
