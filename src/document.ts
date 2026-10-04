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

export function serializeDocument(doc: CsvDocument): string {
  const { delimiter, lineEnding, trailingNewline } = doc.format
  return serializeCsv(doc.table.headers, doc.table.orderedCells(), { delimiter, lineEnding, trailingNewline })
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
