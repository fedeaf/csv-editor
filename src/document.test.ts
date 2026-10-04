import { describe, expect, it } from 'vitest'
import { encodeDocumentAsync, loadDocument } from './document'

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
