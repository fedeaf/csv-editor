import { describe, expect, it } from 'vitest'
import { loadDocument, encodeDocument } from '../document'
import { decode, detectEncoding, encode, unencodableChars } from './encoding'
import { detectDelimiter, parseCsv } from './parse'
import { serializeCsv } from './serialize'

const bytes = (...n: number[]) => new Uint8Array(n)
const utf8 = (s: string) => new TextEncoder().encode(s)

/** Open, save without edits, reopen: same bytes in/out of the codec and same table. */
function roundTrip(input: Uint8Array) {
  const doc = loadDocument('t.csv', input)
  const out = encodeDocument(doc, () => false)!
  const again = loadDocument('t.csv', out.bytes)
  return { doc, out, again }
}

describe('encoding detection', () => {
  it('detects UTF-8 BOM', () => {
    expect(detectEncoding(bytes(0xef, 0xbb, 0xbf, 0x61))).toEqual({ encoding: 'utf-8', bom: true })
  })
  it('detects UTF-8 without BOM, including ASCII', () => {
    expect(detectEncoding(utf8('año,ñ'))).toEqual({ encoding: 'utf-8', bom: false })
    expect(detectEncoding(utf8('plain,ascii'))).toEqual({ encoding: 'utf-8', bom: false })
  })
  it('falls back to Windows-1252', () => {
    expect(detectEncoding(bytes(0x61, 0xf1, 0x6f)).encoding).toBe('windows-1252') // "año"
  })
  it('decodes without the BOM character', () => {
    const b = bytes(0xef, 0xbb, 0xbf, ...utf8('é'))
    expect(decode(b, detectEncoding(b))).toBe('é')
  })
})

describe('Windows-1252 encoding', () => {
  it('round-trips all 256 byte values', () => {
    const all = new Uint8Array(256).map((_, i) => i)
    const fmt = { encoding: 'windows-1252' as const, bom: false }
    expect(encode(decode(all, fmt), fmt)).toEqual(all)
  })
  it('maps the 0x80-0x9F block (euro sign, curly quotes)', () => {
    expect(encode('€“”', { encoding: 'windows-1252', bom: false })).toEqual(bytes(0x80, 0x93, 0x94))
  })
  it('reports characters it cannot represent', () => {
    expect(unencodableChars('ok 😀 ñ 日', 'windows-1252')).toEqual(['😀', '日'])
    expect(() => encode('😀', { encoding: 'windows-1252', bom: false })).toThrow()
  })
  it('keeps the BOM when writing UTF-8', () => {
    expect(encode('a', { encoding: 'utf-8', bom: true })).toEqual(bytes(0xef, 0xbb, 0xbf, 0x61))
  })
})

describe('parsing', () => {
  it('keeps quotes, delimiters and line breaks inside one cell', () => {
    const p = parseCsv('a,b\n"x,1","say ""hi""\nbye"\n')
    expect(p.rows).toEqual([['x,1', 'say "hi"\nbye']])
  })
  it('detects semicolon and comma delimiters', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',')
    expect(detectDelimiter('a;b\n"1,5";2')).toBe(';')
    expect(detectDelimiter('single\nvalue')).toBe(',')
  })
  it('detects CRLF and trailing newline', () => {
    const p = parseCsv('a,b\r\n1,2\r\n')
    expect(p).toMatchObject({ lineEnding: '\r\n', trailingNewline: true })
    expect(p.rows).toEqual([['1', '2']])
    expect(parseCsv('a,b\n1,2')).toMatchObject({ lineEnding: '\n', trailingNewline: false })
  })
  it('pads short rows and widens for long rows, with warnings', () => {
    const p = parseCsv('a,b,c\n1\n1,2,3,4\n')
    expect(p.headers).toEqual(['a', 'b', 'c', ''])
    expect(p.rows).toEqual([['1', '', '', ''], ['1', '2', '3', '4']])
    expect(p.warnings).toHaveLength(2)
  })
  it('handles an empty file', () => {
    expect(parseCsv('').rows).toEqual([])
  })
})

describe('serializing', () => {
  const opts = { delimiter: ',' as const, lineEnding: '\n' as const, trailingNewline: false }
  it('quotes only fields that need it', () => {
    expect(serializeCsv(['a', 'b'], [['x y', 'p,q'], ['say "hi"', 'l1\nl2']], opts)).toBe(
      'a,b\nx y,"p,q"\n"say ""hi""","l1\nl2"',
    )
  })
  it('quotes the delimiter in use only', () => {
    expect(serializeCsv(['a'], [['1,5']], { ...opts, delimiter: ';' })).toBe('a\n1,5')
    expect(serializeCsv(['a', 'b'], [['1;5', 'x']], { ...opts, delimiter: ';' })).toBe('a;b\n"1;5";x')
  })
})

describe('round trip (open, save unedited, reopen)', () => {
  const sameTable = (a: ReturnType<typeof loadDocument>, b: ReturnType<typeof loadDocument>) => {
    expect(b.table.headers).toEqual(a.table.headers)
    expect([...b.table.orderedCells()]).toEqual([...a.table.orderedCells()])
    expect(b.format).toEqual(a.format)
  }

  it('UTF-8 with accents and ñ', () => {
    const input = utf8('name,city\nJosé,Málaga\nNúñez,Cañete\n')
    const { doc, out, again } = roundTrip(input)
    expect(out.bytes).toEqual(input)
    sameTable(doc, again)
  })
  it('UTF-8 with BOM', () => {
    const input = bytes(0xef, 0xbb, 0xbf, ...utf8('a,b\nñ,é\n'))
    const { out, doc, again } = roundTrip(input)
    expect(out.bytes).toEqual(input)
    sameTable(doc, again)
  })
  it('Windows-1252 with accents', () => {
    const input = bytes(...[...'name;city\r\nJos'].map((c) => c.charCodeAt(0)), 0xe9, 0x3b, 0x4d, 0xe1, 0x6c, 0x61, 0x67, 0x61, 0x0d, 0x0a)
    const { doc, out, again } = roundTrip(input)
    expect(doc.format.encoding).toBe('windows-1252')
    expect(doc.table.rowAt(0)!.cells).toEqual(['José', 'Málaga'])
    expect(out.bytes).toEqual(input)
    sameTable(doc, again)
  })
  it('semicolon, CRLF, quoted fields with embedded breaks', () => {
    const input = utf8('a;b\r\n"x;1";"two\r\nlines"\r\n"q""q";z\r\n')
    const { out, doc, again } = roundTrip(input)
    expect(out.bytes).toEqual(input)
    expect(doc.table.rowAt(0)!.cells).toEqual(['x;1', 'two\r\nlines'])
    sameTable(doc, again)
  })
  it('keeps the table identical when redundant quotes are dropped', () => {
    const { doc, again, out } = roundTrip(utf8('a,b\n"1","2"\n'))
    expect(new TextDecoder().decode(out.bytes)).toBe('a,b\n1,2\n')
    sameTable(doc, again)
  })
  it('keeps blank cells and blank rows aligned', () => {
    const { doc, again } = roundTrip(utf8('a,b,c\n,,\n1,,3\n,,\n4,,\n'))
    sameTable(doc, again)
  })
  it('drops the blank rows at the end, which hold nothing', () => {
    const { again } = roundTrip(utf8('a,b,c\n1,,3\n,,\n,,\n'))
    expect(again.table.rowCount).toBe(1)
  })
})

describe('saving with unencodable characters (D-03)', () => {
  it('asks, and switches to UTF-8 only when accepted', () => {
    const doc = loadDocument('t.csv', bytes(0x61, 0x0a, 0xe9, 0x0a)) // Windows-1252 "a\né\n"
    doc.table.rowAt(0)!.cells[0] = '😀'
    expect(encodeDocument(doc, () => false)).toBeUndefined()
    const out = encodeDocument(doc, () => true)!
    expect(out.format.encoding).toBe('utf-8')
    expect(new TextDecoder().decode(out.bytes)).toBe('a\n😀\n')
    expect(doc.format.encoding).toBe('windows-1252') // not adopted until the write succeeds
  })
})
