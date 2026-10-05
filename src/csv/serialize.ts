import type { Delimiter, LineEnding } from './parse'

export interface SerializeOptions {
  delimiter: Delimiter
  lineEnding: LineEnding
  trailingNewline: boolean
  /**
   * Every field with anything in it goes between quotes, and empty ones stay empty with no quotes. The header
   * is the exception: each of its fields is quoted as it arrived (`quotedHeaders`), or if it needs it.
   */
  quoteAll?: boolean
  quotedHeaders?: boolean[]
}

const quote = (value: string) => `"${value.replaceAll('"', '""')}"`
const needsQuotes = (value: string, delimiter: Delimiter) => value.includes(delimiter) || /["\r\n]/.test(value)

function field(value: string, delimiter: Delimiter): string {
  // Quote only when needed. A leading/trailing space is kept unquoted: RFC 4180 treats it as data.
  if (value.includes(delimiter) || /["\r\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`
  return value
}

export function serializeCsv(headers: string[], rows: Iterable<string[]>, opts: SerializeOptions): string {
  const { delimiter, lineEnding } = opts
  const writeHeader = opts.quoteAll
    ? (h: string[]) => h.map((v, i) => (opts.quotedHeaders?.[i] || needsQuotes(v, delimiter) ? quote(v) : v)).join(delimiter)
    : (h: string[]) => h.map((v) => field(v, delimiter)).join(delimiter)
  const writeRow = opts.quoteAll
    ? (r: string[]) => r.map((v) => (v === '' ? '' : quote(v))).join(delimiter)
    : (r: string[]) => r.map((v) => field(v, delimiter)).join(delimiter)
  const lines = [writeHeader(headers), ...[...rows].map(writeRow)]
  // A single blank column would serialize to an empty line, which re-parses as no row at all: quote it.
  const out = lines.map((l, i) => (l === '' && headers.length === 1 ? '""' : l) + (i === lines.length - 1 ? '' : lineEnding))
  return out.join('') + (opts.trailingNewline ? lineEnding : '')
}
