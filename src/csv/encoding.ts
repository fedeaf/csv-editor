// Encoding detection, decoding and encoding.
// ASCII and ISO-8859-1 are handled as aliases: ASCII is a subset of UTF-8, and
// ISO-8859-1 is Windows-1252 per the WHATWG Encoding Standard.

export type Encoding = 'utf-8' | 'windows-1252'

export interface Detected {
  encoding: Encoding
  bom: boolean
}

const UTF8_BOM = [0xef, 0xbb, 0xbf]

export function detectEncoding(bytes: Uint8Array): Detected {
  if (UTF8_BOM.every((b, i) => bytes[i] === b)) return { encoding: 'utf-8', bom: true }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { encoding: 'utf-8', bom: false }
  } catch {
    return { encoding: 'windows-1252', bom: false }
  }
}

export function decode(bytes: Uint8Array, { encoding, bom }: Detected): string {
  const body = bom ? bytes.subarray(UTF8_BOM.length) : bytes
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
  if (encoding === 'utf-8') return []
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
