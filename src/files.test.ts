import { afterEach, describe, expect, it, vi } from 'vitest'
import { blankDocument, loadDocument } from './document'
import { exportXlsx, saveCsv, saveCsvAs } from './files'

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

describe('exportXlsx', () => {
  const content = async () => new Blob(['x'])

  it('offers the same name as xlsx, in the folder of the file, and returns the name chosen', async () => {
    const own = fakeHandle('report.csv')
    const picker = stubPicker(fakeHandle('chosen.xlsx'))
    expect(await exportXlsx(loadDocument('report.csv', bytes, own), content)).toBe('chosen.xlsx')
    const options = picker.mock.calls[0]![0]
    expect(options.suggestedName).toBe('report.xlsx')
    expect(options.startIn).toBe(own)
    expect(Object.values(options.types![0]!.accept!)).toEqual([['.xlsx']])
  })

  it("starts in the original's folder for a copy", async () => {
    const original = fakeHandle('a.csv')
    const picker = stubPicker(fakeHandle('a_copy1.xlsx'))
    await exportXlsx({ ...loadDocument('a_copy1.csv', bytes), saveNextTo: original }, content)
    expect(picker.mock.calls[0]![0].startIn).toBe(original)
  })

  it('leaves the document with its own file and name, and does not write to its file', async () => {
    const own = fakeHandle('report.csv')
    const written = vi.spyOn(own, 'createWritable')
    const chosen = fakeHandle('report.xlsx')
    const writing = vi.spyOn(chosen, 'createWritable')
    stubPicker(chosen)
    const doc = loadDocument('report.csv', bytes, own)
    await exportXlsx(doc, content)
    expect(doc.handle).toBe(own)
    expect(doc.name).toBe('report.csv')
    expect(written).not.toHaveBeenCalled()
    expect(writing).toHaveBeenCalledOnce()
  })

  it('makes the content only once a file is chosen, and nothing if the window is cancelled', async () => {
    vi.stubGlobal('window', {
      showSaveFilePicker: async () => {
        throw new DOMException('Cancelled', 'AbortError')
      },
    })
    const making = vi.fn(content)
    expect(await exportXlsx(loadDocument('a.csv', bytes), making)).toBeUndefined()
    expect(making).not.toHaveBeenCalled()
  })

  it('reports any other failure', async () => {
    vi.stubGlobal('window', {
      showSaveFilePicker: async () => {
        throw new Error('No room')
      },
    })
    await expect(exportXlsx(loadDocument('a.csv', bytes), content)).rejects.toThrow('No room')
  })
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
