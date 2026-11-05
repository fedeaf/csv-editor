import { inflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { columnName, escapeText, worksheetChunks, writeXlsx } from './write'
import { zip } from './zip'

/** Reads an archive through its central directory, checking what each entry declares against what it holds. */
async function unzip(blob: Blob): Promise<Map<string, string>> {
  const bytes = Buffer.from(await blob.arrayBuffer())
  const end = bytes.length - 22
  expect(bytes.readUInt32LE(end)).toBe(0x06054b50)
  const count = bytes.readUInt16LE(end + 10)
  expect(bytes.readUInt16LE(end + 8)).toBe(count)
  const start = bytes.readUInt32LE(end + 16)
  expect(start + bytes.readUInt32LE(end + 12)).toBe(end)
  const parts = new Map<string, string>()
  let at = start
  for (let i = 0; i < count; i++) {
    expect(bytes.readUInt32LE(at)).toBe(0x02014b50)
    const compressed = bytes.readUInt32LE(at + 20)
    const size = bytes.readUInt32LE(at + 24)
    const nameLength = bytes.readUInt16LE(at + 28)
    const local = bytes.readUInt32LE(at + 42)
    const name = bytes.toString('latin1', at + 46, at + 46 + nameLength)
    expect(bytes.readUInt32LE(local)).toBe(0x04034b50)
    expect(bytes.readUInt16LE(local + 8)).toBe(8)
    expect(bytes.readUInt32LE(local + 14)).toBe(bytes.readUInt32LE(at + 16))
    expect(bytes.readUInt32LE(local + 18)).toBe(compressed)
    expect(bytes.readUInt32LE(local + 22)).toBe(size)
    const body = local + 30 + bytes.readUInt16LE(local + 26)
    const data = inflateRawSync(bytes.subarray(body, body + compressed))
    expect(data.length).toBe(size)
    expect(crc32(data)).toBe(bytes.readUInt32LE(at + 16))
    parts.set(name, data.toString('utf8'))
    at += 46 + nameLength
  }
  return parts
}

function crc32(data: Uint8Array): number {
  let crc = -1
  for (const byte of data) {
    crc ^= byte
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  }
  return (crc ^ -1) >>> 0
}

const sheetOf = (headers: string[], rows: string[][]) =>
  Buffer.concat([...worksheetChunks(headers, rows)]).toString('utf8').replace(/^.*?<sheetData>|<\/sheetData>.*$/gs, '')

describe('columnName', () => {
  it('counts in letters from A, with no zero', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA'])
    expect(columnName(16383)).toBe('XFD')
    expect(columnName(18277)).toBe('ZZZ')
    expect(columnName(18278)).toBe('AAAA')
  })
})

describe('escapeText', () => {
  it('leaves ordinary text alone, spaces, tabs, line feeds and other alphabets included', () => {
    for (const text of ['plain', ' spaced ', 'a\tb', 'one\ntwo', 'Ñandú 日本語 😀', "it's \"quoted\"", '_x', 'a_b_c', '_x12_', '_xGGGG_']) expect(escapeText(text)).toBe(text)
  })

  it('writes the characters that mean something to XML as references', () => {
    expect(escapeText('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d')
    expect(escapeText(']]>')).toBe(']]&gt;')
  })

  it('writes what XML cannot carry as a code', () => {
    expect(escapeText('a\u0001b')).toBe('a_x0001_b')
    expect(escapeText('\0')).toBe('_x0000_')
    expect(escapeText('\u001f')).toBe('_x001F_')
    expect(escapeText('\u000b\u000c')).toBe('_x000B__x000C_')
    expect(escapeText('￾￿')).toBe('_xFFFE__xFFFF_')
  })

  it('keeps a carriage return, which XML would otherwise turn into a line feed', () => {
    expect(escapeText('one\r\ntwo')).toBe('one&#13;\ntwo')
  })

  it('writes half of a surrogate pair as a code, and leaves a whole pair alone', () => {
    expect(escapeText('\ud83d')).toBe('_xD83D_')
    expect(escapeText('\ude00')).toBe('_xDE00_')
    expect(escapeText('\ud83dx\ude00')).toBe('_xD83D_x_xDE00_')
    expect(escapeText('😀')).toBe('😀')
  })

  it('does not let text read as a code', () => {
    expect(escapeText('_x0041_')).toBe('_x005F_x0041_')
    expect(escapeText('_xabCD_')).toBe('_x005F_xabCD_')
    expect(escapeText('__x0041_')).toBe('__x005F_x0041_')
  })
})

describe('worksheetChunks', () => {
  it('writes every value as text, whatever it looks like', () => {
    const values = ['1.5', '-7', '00123', '2026-11-05', '=1+1', '#N/A', 'TRUE', '1.2E+15']
    const sheet = sheetOf(values, [])
    expect(sheet.match(/<c /g)).toHaveLength(values.length)
    expect(sheet.match(/<c r="[A-Z]+1" t="inlineStr"><is><t>/g)).toHaveLength(values.length)
    expect(sheet).not.toContain('<v>')
    expect(sheet).not.toContain('<f>')
    for (const value of values) expect(sheet).toContain(`<t>${value}</t>`)
  })

  it('puts the headers in row 1 and the rows after them', () => {
    expect(sheetOf(['a', 'b'], [['1', '2']])).toBe(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c><c r="B1" t="inlineStr"><is><t>b</t></is></c></row>' +
        '<row r="2"><c r="A2" t="inlineStr"><is><t>1</t></is></c><c r="B2" t="inlineStr"><is><t>2</t></is></c></row>',
    )
  })

  it('leaves out empty cells and empty rows, and the rest keeps its place', () => {
    const sheet = sheetOf(['', 'b'], [['', ''], ['x', '']])
    expect(sheet).toBe('<row r="1"><c r="B1" t="inlineStr"><is><t>b</t></is></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>x</t></is></c></row>')
  })

  it('has no rows at all for no content', () => {
    expect(sheetOf([], [])).toBe('')
  })

  it('comes in pieces for a large table, and the pieces join into the whole', () => {
    const rows = Array.from({ length: 30000 }, (_, r) => [`row ${r}`, 'x'.repeat(100)])
    const chunks = [...worksheetChunks(['a', 'b'], rows)]
    expect(chunks.length).toBeGreaterThan(1)
    const xml = Buffer.concat(chunks).toString('utf8')
    expect(xml.endsWith('</sheetData></worksheet>')).toBe(true)
    expect(xml.match(/<row /g)).toHaveLength(30001)
    expect(xml).toContain('<c r="A30001" t="inlineStr"><is><t>row 29999</t></is></c>')
  })
})

describe('zip', () => {
  it('holds each entry, joined from its chunks, with a correct checksum and sizes', async () => {
    const text = (s: string) => new TextEncoder().encode(s)
    const parts = await unzip(await zip([
      { name: 'a.txt', chunks: [text('hello '), text('world')] },
      { name: 'dir/b.txt', chunks: [] },
      { name: 'c.txt', chunks: [text('ñ'.repeat(10000))] },
    ]))
    expect([...parts.keys()]).toEqual(['a.txt', 'dir/b.txt', 'c.txt'])
    expect(parts.get('a.txt')).toBe('hello world')
    expect(parts.get('dir/b.txt')).toBe('')
    expect(parts.get('c.txt')).toBe('ñ'.repeat(10000))
  })

  it('says nothing about when it was made', async () => {
    const bytes = Buffer.from(await (await zip([{ name: 'a', chunks: [] }])).arrayBuffer())
    expect(bytes.readUInt16LE(10)).toBe(0)
    expect(bytes.readUInt16LE(12)).toBe(0x21)
  })
})

describe('writeXlsx', () => {
  it('writes the parts of a package, with one sheet named Sheet1 and nothing else', async () => {
    const parts = await unzip(await writeXlsx(['a'], [['1']]))
    expect([...parts.keys()].sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml'])
    expect(parts.get('xl/workbook.xml')).toContain('<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>')
    expect(parts.get('xl/_rels/workbook.xml.rels')).toContain('Target="worksheets/sheet1.xml"')
    expect(parts.get('_rels/.rels')).toContain('Target="xl/workbook.xml"')
    expect(parts.get('[Content_Types].xml')).toContain('PartName="/xl/worksheets/sheet1.xml"')
    expect(parts.get('xl/worksheets/sheet1.xml')).toContain('<t>1</t>')
  })

  it('is a valid package with an empty sheet for a table with no content', async () => {
    const parts = await unzip(await writeXlsx([], []))
    expect(parts.get('xl/worksheets/sheet1.xml')).toContain('<sheetData></sheetData>')
  })

  it('writes the same bytes for the same table', async () => {
    const bytes = async () => Buffer.from(await (await writeXlsx(['a'], [['b']])).arrayBuffer())
    expect((await bytes()).equals(await bytes())).toBe(true)
  })
})
