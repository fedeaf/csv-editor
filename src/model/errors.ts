// Error values that spreadsheets write into a cell when a formula fails. They survive in an exported
// CSV as plain text, and a column that holds one is usually a column that needs a look.
//
// A cell counts when the whole of it is one of these, ignoring case and surrounding spaces. Text that
// merely resembles an error ("N/A", "NaN", "null", "#1", "#hashtag", "div0") does not.

/** Excel, Google Sheets and LibreOffice in English. */
const ENGLISH = [
  '#NULL!',
  '#DIV/0!',
  '#VALUE!',
  '#REF!',
  '#NAME?',
  '#NUM!',
  '#N/A',
  '#SPILL!',
  '#CALC!',
  '#GETTING_DATA',
  '#FIELD!',
  '#BLOCKED!',
  '#CONNECT!',
  '#UNKNOWN!',
  '#ERROR!', // Google Sheets
]

/** Excel in Spanish writes its errors in Spanish, and a CSV saved from it keeps them that way. */
const SPANISH = ['#¡NULO!', '#¡DIV/0!', '#¡VALOR!', '#¡REF!', '#¿NOMBRE?', '#¡NUM!', '#N/D']

/** LibreOffice's numbered errors: Err:502, Err:508 and so on. */
const LIBREOFFICE = /^ERR:\d{3}$/

const KNOWN = new Set([...ENGLISH, ...SPANISH])

/** Every literal that triggers, for the documentation and the tests (LibreOffice's Err:NNN is a pattern). */
export const SPREADSHEET_ERRORS: readonly string[] = [...ENGLISH, ...SPANISH]

export function isSpreadsheetError(value: string): boolean {
  if (value.length > 40) return false // far longer than any error; saves trimming big text cells
  // Every error starts with "#" or "Err:" once spaces are set aside, so most cells are ruled out at a glance.
  const first = value.charCodeAt(0)
  if (first !== 35 && first !== 69 && first !== 101 && first > 32) return false
  const text = value.trim().toUpperCase()
  return KNOWN.has(text) || LIBREOFFICE.test(text)
}

export interface ErrorStop {
  /** The row to go to. */
  row: number
  /** Its place among the errors of the column, counting from 1, and how many there are. */
  index: number
  total: number
  /** True when the walk reached the end and started over from the first. */
  wrapped: boolean
}

/**
 * The next row, after `after` (or the first one if there is none), whose cell holds a spreadsheet
 * error; past the last one it starts over from the first. `cell` gives the text of a row.
 */
export function nextErrorRow(cell: (row: number) => string, rowCount: number, after?: number): ErrorStop | undefined {
  const rows: number[] = []
  for (let row = 0; row < rowCount; row++) if (isSpreadsheetError(cell(row))) rows.push(row)
  if (rows.length === 0) return undefined
  const at = after === undefined ? 0 : rows.findIndex((row) => row > after)
  if (at < 0) return { row: rows[0]!, index: 1, total: rows.length, wrapped: true }
  return { row: rows[at]!, index: at + 1, total: rows.length, wrapped: false }
}
