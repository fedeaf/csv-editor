import type { Delimiter, LineEnding } from './parse'

export interface SerializeOptions {
  delimiter: Delimiter
  lineEnding: LineEnding
  trailingNewline: boolean
}

function field(value: string, delimiter: Delimiter): string {
  // Quote only when needed. A leading/trailing space is kept unquoted: RFC 4180 treats it as data.
  if (value.includes(delimiter) || /["\r\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`
  return value
}

export function serializeCsv(headers: string[], rows: Iterable<string[]>, opts: SerializeOptions): string {
  const { delimiter, lineEnding } = opts
  const lines = [headers, ...rows].map((r) => r.map((v) => field(v, delimiter)).join(delimiter))
  // A single blank column would serialize to an empty line, which re-parses as no row at all: quote it.
  const out = lines.map((l, i) => (l === '' && headers.length === 1 ? '""' : l) + (i === lines.length - 1 ? '' : lineEnding))
  return out.join('') + (opts.trailingNewline ? lineEnding : '')
}
