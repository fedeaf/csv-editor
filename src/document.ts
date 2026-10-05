import { decode, detectEncoding, encode, unencodableChars } from './csv/encoding'
import { parseCsv } from './csv/parse'
import { serializeCsv } from './csv/serialize'
import { FileFormat, Table } from './model/table'

export interface CsvDocument {
  name: string
  table: Table
  format: FileFormat
  handle?: FileSystemFileHandle
  warnings: string[]
}

export function loadDocument(name: string, bytes: Uint8Array, handle?: FileSystemFileHandle): CsvDocument {
  const detected = detectEncoding(bytes)
  const parsed = parseCsv(decode(bytes, detected))
  return {
    name,
    table: new Table(parsed.headers, parsed.rows),
    format: { ...detected, delimiter: parsed.delimiter, lineEnding: parsed.lineEnding, trailingNewline: parsed.trailingNewline },
    handle,
    warnings: parsed.warnings,
  }
}

export const BLANK_COLUMNS = 255
export const BLANK_ROWS = 65535

/** The first "Untitled.csv", "Untitled 2.csv"… that none of `taken` already uses. */
export function untitledName(taken: string[]): string {
  const used = new Set(taken.map((n) => n.toLowerCase()))
  for (let n = 1; ; n++) {
    const name = n === 1 ? 'Untitled.csv' : `Untitled ${n}.csv`
    if (!used.has(name.toLowerCase())) return name
  }
}

/**
 * A new empty document that lives only in memory: it has no file handle, so nothing reaches the
 * disk until the user saves it (Save asks where, as Save As does).
 */
export function blankDocument(name: string): CsvDocument {
  const row = () => Array<string>(BLANK_COLUMNS).fill('')
  return {
    name,
    table: new Table(row(), Array.from({ length: BLANK_ROWS }, row)),
    format: { encoding: 'utf-8', bom: false, delimiter: ',', lineEnding: '\n', trailingNewline: true },
    warnings: [],
  }
}

/**
 * What gets written: the columns that have a header or any content, and the rows up to the last one
 * with content. Empty columns and the empty rows at the end are left out, so a blank document
 * writes no bytes at all. Empty rows between rows with content stay, to keep the rows in place.
 */
export function contentToWrite(table: Table): { headers: string[]; rows: string[][] } {
  const used = table.headers.map((h) => h !== '')
  const all = [...table.orderedCells()]
  let last = -1
  all.forEach((cells, r) => {
    cells.forEach((value, c) => {
      if (value === '') return
      used[c] = true
      last = r
    })
  })
  const keep = used.flatMap((u, c) => (u ? [c] : []))
  return {
    headers: keep.map((c) => table.headers[c]!),
    rows: all.slice(0, last + 1).map((cells) => keep.map((c) => cells[c]!)),
  }
}

export function serializeDocument(doc: CsvDocument): string {
  const { delimiter, lineEnding, trailingNewline } = doc.format
  const { headers, rows } = contentToWrite(doc.table)
  if (headers.length === 0) return ''
  return serializeCsv(headers, rows, { delimiter, lineEnding, trailingNewline })
}

export interface Encoded {
  bytes: Uint8Array
  format: FileFormat
}

/**
 * Bytes to write, in the original encoding (D-03). If the text has characters that
 * encoding cannot hold, `confirmUtf8` decides whether to switch to UTF-8; returns
 * undefined if the user declines. The caller adopts `format` once the write succeeds.
 */
export function encodeDocument(doc: CsvDocument, confirmUtf8: (chars: string[]) => boolean): Encoded | undefined {
  const text = serializeDocument(doc)
  let format = doc.format
  const bad = unencodableChars(text, format.encoding)
  if (bad.length > 0) {
    if (!confirmUtf8(bad)) return undefined
    format = { ...format, encoding: 'utf-8', bom: false }
  }
  return { bytes: encode(text, format), format }
}

/** Asked from inside `encodeDocument` to stop it and report what needs a decision. */
class Utf8Needed extends Error {
  constructor(readonly chars: string[]) {
    super('Some characters need UTF-8')
  }
}

/**
 * Like `encodeDocument`, but the question about UTF-8 can be answered later (a dialog on screen).
 * The first pass stops at the question; if there is one, it is asked and the document is encoded
 * again with the answer. That second pass only happens when characters do not fit the encoding.
 */
export async function encodeDocumentAsync(
  doc: CsvDocument,
  confirmUtf8: (chars: string[]) => Promise<boolean>,
): Promise<Encoded | undefined> {
  try {
    return encodeDocument(doc, (chars) => {
      throw new Utf8Needed(chars)
    })
  } catch (e) {
    if (!(e instanceof Utf8Needed)) throw e
    const accepted = await confirmUtf8(e.chars)
    return encodeDocument(doc, () => accepted)
  }
}
