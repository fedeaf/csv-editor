// The encodings, delimiters and line endings a document can be read or written with, as the File
// Format dialog and the status bar name them.
import type { Delimiter, LineEnding } from '../csv/parse'
import type { Encoding } from '../csv/encoding'

export interface EncodingOption {
  key: string
  label: string
  encoding: Encoding
  bom: boolean
}

export const ENCODING_OPTIONS: EncodingOption[] = [
  { key: 'utf-8', label: 'UTF-8', encoding: 'utf-8', bom: false },
  { key: 'utf-8-bom', label: 'UTF-8 with BOM', encoding: 'utf-8', bom: true },
  { key: 'windows-1252', label: 'Windows-1252 / ISO-8859-1', encoding: 'windows-1252', bom: false },
  { key: 'utf-16le', label: 'UTF-16 LE (with BOM)', encoding: 'utf-16le', bom: true },
  { key: 'utf-16be', label: 'UTF-16 BE (with BOM)', encoding: 'utf-16be', bom: true },
]

/** The option that describes an encoding and its BOM; UTF-16 always carries its mark. */
export function encodingOption(format: { encoding: Encoding; bom: boolean }): EncodingOption {
  return (
    ENCODING_OPTIONS.find((o) => o.encoding === format.encoding && (o.encoding !== 'utf-8' || o.bom === format.bom)) ??
    ENCODING_OPTIONS[0]!
  )
}

export const encodingLabel = (format: { encoding: Encoding; bom: boolean }): string => encodingOption(format).label

export const DELIMITER_NAMES: Record<Delimiter, string> = { ',': 'comma', ';': 'semicolon', '\t': 'tab', '|': 'pipe' }

export const DELIMITER_OPTIONS: { value: Delimiter; label: string }[] = [
  { value: ',', label: 'Comma ( , )' },
  { value: ';', label: 'Semicolon ( ; )' },
  { value: '\t', label: 'Tab' },
  { value: '|', label: 'Pipe ( | )' },
]

export const LINE_ENDING_OPTIONS: { value: LineEnding; label: string }[] = [
  { value: '\n', label: 'LF (Linux, macOS)' },
  { value: '\r\n', label: 'CRLF (Windows)' },
]

export const QUOTING_OPTIONS: { value: 'needed' | 'all'; label: string }[] = [
  { value: 'needed', label: 'Only where needed' },
  { value: 'all', label: 'Every field with content' },
]
