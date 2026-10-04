import Papa from 'papaparse'

export type Delimiter = ',' | ';'
export type LineEnding = '\n' | '\r\n'

export interface ParsedCsv {
  /** First CSV row (D-01). */
  headers: string[]
  rows: string[][]
  delimiter: Delimiter
  lineEnding: LineEnding
  /** Whether the file ended with a line break, kept so the save matches. */
  trailingNewline: boolean
  warnings: string[]
}

const CANDIDATES: Delimiter[] = [',', ';']

/** Comma or semicolon (D-02): the one that gives the most consistent multi-column rows. */
export function detectDelimiter(text: string): Delimiter {
  let best: Delimiter = ','
  let bestScore = 0
  for (const delimiter of CANDIDATES) {
    const rows = Papa.parse<string[]>(text, { delimiter, preview: 30 }).data
    const width = rows[0]?.length ?? 0
    if (width < 2) continue
    const score = rows.filter((r) => r.length === width).length * width
    if (score > bestScore) {
      best = delimiter
      bestScore = score
    }
  }
  return best
}

export function parseCsv(text: string): ParsedCsv {
  const delimiter = detectDelimiter(text)
  const lineEnding: LineEnding = /\r\n/.test(text.slice(0, text.indexOf('\n') + 1)) ? '\r\n' : '\n'
  const trailingNewline = text.endsWith('\n')
  // Papa reports a spurious empty last row for a trailing line break.
  const body = trailingNewline ? text.slice(0, text.endsWith('\r\n') ? -2 : -1) : text
  const warnings: string[] = []

  const result = Papa.parse<string[]>(body, { delimiter, skipEmptyLines: false })
  const data = result.data
  if (data.length === 0 || (data.length === 1 && data[0]!.length === 1 && data[0]![0] === '')) {
    return { headers: [], rows: [], delimiter, lineEnding, trailingNewline, warnings: ['The file is empty.'] }
  }

  const headers = data[0]!
  const rows = data.slice(1)

  // Rows longer than the header must not lose data: the extra columns get blank headers.
  let width = headers.length
  for (const row of rows) if (row.length > width) width = row.length
  if (width > headers.length) {
    const longRows = rows.filter((r) => r.length > headers.length).length
    warnings.push(
      `${longRows} row(s) have more columns than the header. ` +
        `${width - headers.length} column(s) with a blank header were added so no data is lost.`,
    )
  }
  const shortRows = rows.filter((r) => r.length < width).length
  if (shortRows > 0) warnings.push(`${shortRows} row(s) had fewer columns than expected and were padded with blank cells.`)
  while (headers.length < width) headers.push('')
  for (const row of rows) while (row.length < width) row.push('')

  return { headers, rows, delimiter, lineEnding, trailingNewline, warnings }
}
