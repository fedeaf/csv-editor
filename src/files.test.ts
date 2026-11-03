import { afterEach, describe, expect, it, vi } from 'vitest'
import { blankDocument, loadDocument } from './document'
import { saveCsv, saveCsvAs } from './files'

const bytes = new Uint8Array([97])

function fakeHandle(name: string): FileSystemFileHandle {
  return {
    name,
    queryPermission: async () => 'granted',
    createWritable: async () => ({ write: async () => {}, close: async () => {} }),
  } as unknown as FileSystemFileHandle
}

/** Replaces the Save dialog: it chooses `chosen` and returns the options it was opened with. */
function stubPicker(chosen: FileSystemFileHandle) {
  const picker = vi.fn(async (_options: SaveFilePickerOptions) => chosen)
  vi.stubGlobal('window', { showSaveFilePicker: picker })
  return picker
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the folder where Save As starts', () => {
  const read = (handle?: FileSystemFileHandle) => loadDocument('a.csv', bytes, handle)

  it("is the folder of the document's own file", async () => {
    const own = fakeHandle('a.csv')
    const picker = stubPicker(fakeHandle('b.csv'))
    await saveCsvAs(read(own), bytes)
    expect(picker.mock.calls[0]![0].startIn).toBe(own)
  })

  it("is the folder of the original for a copy, also when Save has to ask where", async () => {
    const original = fakeHandle('a.csv')
    const picker = stubPicker(fakeHandle('a_copy1.csv'))
    await saveCsv({ ...read(), saveNextTo: original }, bytes)
    expect(picker.mock.calls[0]![0].startIn).toBe(original)
  })

  it('moves to the new file once a copy has been saved, and the original is not written to', async () => {
    const original = fakeHandle('a.csv')
    const written = vi.spyOn(original, 'createWritable')
    const saved = fakeHandle('a_copy1.csv')
    const picker = stubPicker(saved)
    const copy = { ...read(), saveNextTo: original }
    await saveCsvAs(copy, bytes)
    await saveCsv(copy, bytes)
    await saveCsvAs(copy, bytes)
    expect(copy.handle).toBe(saved)
    expect(picker).toHaveBeenCalledTimes(2)
    expect(picker.mock.calls[1]![0].startIn).toBe(saved)
    expect(written).not.toHaveBeenCalled()
  })

  it('is left to the browser for a document with no file', async () => {
    const picker = stubPicker(fakeHandle('Untitled.csv'))
    await saveCsvAs(blankDocument('Untitled.csv'), bytes)
    expect(picker.mock.calls[0]![0].startIn).toBeUndefined()
  })
})
