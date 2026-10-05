import { describe, expect, it } from 'vitest'
import { BLANK_COLUMNS, BLANK_ROWS, blankDocument, encodeDocumentAsync, loadDocument, serializeDocument, untitledName } from './document'

const latin1 = (text: string) => new Uint8Array(Buffer.from(text, 'latin1'))
const windows1252 = () => loadDocument('t.csv', latin1('a,b\n1,\xe9\n')) // "1,é" in Windows-1252

describe('encodeDocumentAsync', () => {
  it('does not ask when everything fits the original encoding', async () => {
    let asked = 0
    const out = await encodeDocumentAsync(windows1252(), async () => (asked++, true))
    expect(asked).toBe(0)
    expect(out!.format.encoding).toBe('windows-1252')
    expect(Buffer.from(out!.bytes).toString('latin1')).toBe('a,b\n1,\xe9\n')
  })

  it('asks which characters do not fit, and saves as UTF-8 when accepted', async () => {
    const doc = windows1252()
    doc.table.rowAt(0)!.cells[1] = '😀 ñ'
    let shown: string[] = []
    const out = await encodeDocumentAsync(doc, async (chars) => ((shown = chars), true))
    expect(shown).toEqual(['😀'])
    expect(out!.format).toMatchObject({ encoding: 'utf-8', bom: false })
    expect(new TextDecoder().decode(out!.bytes)).toBe('a,b\n1,😀 ñ\n')
    expect(doc.format.encoding).toBe('windows-1252') // adopted only after the write succeeds
  })

  it('writes nothing when the question is declined', async () => {
    const doc = windows1252()
    doc.table.rowAt(0)!.cells[1] = '😀'
    expect(await encodeDocumentAsync(doc, async () => false)).toBeUndefined()
  })

  it('waits for a slow answer', async () => {
    const doc = windows1252()
    doc.table.rowAt(0)!.cells[1] = '日本'
    const out = await encodeDocumentAsync(doc, () => new Promise((resolve) => setTimeout(() => resolve(true), 30)))
    expect(out!.format.encoding).toBe('utf-8')
  })

  it('lets other errors through', async () => {
    const doc = windows1252()
    Object.defineProperty(doc, 'table', { get: () => { throw new Error('broken') } })
    await expect(encodeDocumentAsync(doc, async () => true)).rejects.toThrow('broken')
  })
})

describe('blank documents', () => {
  it('names new documents after the first free "Untitled"', () => {
    expect(untitledName([])).toBe('Untitled.csv')
    expect(untitledName(['Untitled.csv', 'a.csv'])).toBe('Untitled 2.csv')
    expect(untitledName(['untitled.csv', 'Untitled 2.csv'])).toBe('Untitled 3.csv')
    expect(untitledName(['Untitled 2.csv'])).toBe('Untitled.csv')
  })

  it('starts empty, without a file, and saves as plain UTF-8 CSV', () => {
    const doc = blankDocument('Untitled.csv')
    expect(doc.handle).toBeUndefined()
    expect(doc.table.headers.length).toBe(BLANK_COLUMNS)
    expect(doc.table.rowCount).toBe(BLANK_ROWS)
    expect([...doc.table.orderedCells()].every((r) => r.every((v) => v === ''))).toBe(true)
    expect(serializeDocument(doc).split('\n')[0]).toBe(','.repeat(BLANK_COLUMNS - 1))
  })
})
