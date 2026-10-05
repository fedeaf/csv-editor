// Encoding detection, decoding and encoding.
// ASCII and ISO-8859-1 are handled as aliases: ASCII is a subset of UTF-8, and
// ISO-8859-1 is Windows-1252 per the WHATWG Encoding Standard.

export type Encoding = 'utf-8' | 'windows-1252' | 'utf-16le' | 'utf-16be'

export interface Detected {
  encoding: Encoding
  bom: boolean
}

const UTF8_BOM = [0xef, 0xbb, 0xbf]
const UTF16LE_BOM = [0xff, 0xfe]
const UTF16BE_BOM = [0xfe, 0xff]

const startsWith = (bytes: Uint8Array, prefix: number[]) => prefix.every((b, i) => bytes[i] === b)

export function detectEncoding(bytes: Uint8Array): Detected {
  if (startsWith(bytes, UTF8_BOM)) return { encoding: 'utf-8', bom: true }
  if (startsWith(bytes, UTF16LE_BOM)) return { encoding: 'utf-16le', bom: true }
  if (startsWith(bytes, UTF16BE_BOM)) return { encoding: 'utf-16be', bom: true }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { encoding: 'utf-8', bom: false }
  } catch {
    return { encoding: 'windows-1252', bom: false }
  }
}

/**
 * Reads `bytes` as `encoding`. A byte order mark of that encoding is never part of the text, whether
 * or not the caller expects one (the file may be read as an encoding other than the one detected).
 */
export function decode(bytes: Uint8Array, { encoding }: Pick<Detected, 'encoding'>): string {
  const mark = encoding === 'utf-8' ? UTF8_BOM : encoding === 'utf-16le' ? UTF16LE_BOM : encoding === 'utf-16be' ? UTF16BE_BOM : undefined
  const body = mark && startsWith(bytes, mark) ? bytes.subarray(mark.length) : bytes
  return new TextDecoder(encoding).decode(body)
}

// Reverse table built from the decoder itself, so it always matches the browser.
let reverse: Map<string, number> | undefined
function windows1252Reverse(): Map<string, number> {
  if (!reverse) {
    const all = new Uint8Array(256).map((_, i) => i)
    const chars = new TextDecoder('windows-1252').decode(all)
    reverse = new Map()
    for (let i = 0; i < 256; i++) reverse.set(chars[i]!, i)
  }
  return reverse
}

/** Characters of `text` that `encoding` cannot represent (deduplicated). */
export function unencodableChars(text: string, encoding: Encoding): string[] {
  if (encoding !== 'windows-1252') return []
  const table = windows1252Reverse()
  const bad = new Set<string>()
  for (const ch of text) if (!table.has(ch)) bad.add(ch)
  return [...bad]
}

/** Throws if `text` contains characters the encoding cannot represent. */
export function encode(text: string, { encoding, bom }: Detected): Uint8Array {
  if (encoding === 'utf-8') {
    const body = new TextEncoder().encode(text)
    if (!bom) return body
    const out = new Uint8Array(UTF8_BOM.length + body.length)
    out.set(UTF8_BOM)
    out.set(body, UTF8_BOM.length)
    return out
  }
  if (encoding === 'utf-16le' || encoding === 'utf-16be') {
    const little = encoding === 'utf-16le'
    const start = bom ? 2 : 0
    const out = new Uint8Array(start + text.length * 2)
    const view = new DataView(out.buffer)
    if (bom) view.setUint16(0, 0xfeff, little)
    for (let i = 0; i < text.length; i++) view.setUint16(start + i * 2, text.charCodeAt(i), little)
    return out
  }
  const table = windows1252Reverse()
  const out = new Uint8Array(text.length) // every char is one byte, UTF-16 units >= chars
  let n = 0
  for (const ch of text) {
    const byte = table.get(ch)
    if (byte === undefined) throw new Error(`Character "${ch}" cannot be encoded as Windows-1252`)
    out[n++] = byte
  }
  return out.subarray(0, n)
}
