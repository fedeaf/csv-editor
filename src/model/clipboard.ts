// The clipboard format spreadsheets use for plain text: tab between cells, line break between
// rows, and a cell that contains a tab, a line break or a quote wrapped in quotes with inner
// quotes doubled. Excel and Google Sheets read and write it, so copy and paste work with them too.

export function toTsv(rows: string[][]): string {
  return rows.map((row) => row.map(quote).join('\t')).join('\n')
}

function quote(cell: string): string {
  return /[\t\r\n"]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell
}

/**
 * Splits clipboard text into rows of cells. A quote only opens a quoted cell at the start of a
 * cell, so text like 5" pipe stays as typed. One line break at the very end is ignored: spreadsheets
 * add it after the last row. Rows come back as written, possibly of different lengths.
 */
export function parseTsv(text: string): string[][] {
  const body = text.replace(/(\r\n|\n|\r)$/, '')
  if (text === '') return []
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let atStart = true
  let quoted = false
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!
    if (quoted) {
      if (ch !== '"') cell += ch
      else if (body[i + 1] === '"') {
        cell += '"'
        i++
      } else quoted = false
    } else if (ch === '"' && atStart) {
      quoted = true
      atStart = false
    } else if (ch === '\t') {
      row.push(cell)
      cell = ''
      atStart = true
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      atStart = true
    } else {
      cell += ch
      atStart = false
    }
  }
  row.push(cell)
  rows.push(row)
  return rows
}

/** Pads every row with blank cells to the width of the widest one. */
export function squared(rows: string[][]): string[][] {
  const width = rows.reduce((n, r) => Math.max(n, r.length), 0)
  return rows.map((r) => (r.length === width ? r : [...r, ...new Array<string>(width - r.length).fill('')]))
}
