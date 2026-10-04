import { loadDocument, type CsvDocument } from './document'

const CSV_TYPES: FilePickerAcceptType[] = [{ description: 'CSV files', accept: { 'text/csv': ['.csv'] } }]

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

/** The files chosen in the Open dialog; several can be picked at once. */
export async function openCsv(): Promise<CsvDocument[]> {
  try {
    const handles = await window.showOpenFilePicker({ types: CSV_TYPES, multiple: true })
    return await Promise.all(
      handles.map(async (handle) => {
        const file = await handle.getFile()
        return loadDocument(file.name, new Uint8Array(await file.arrayBuffer()), handle)
      }),
    )
  } catch (e) {
    if (isAbort(e)) return []
    throw e
  }
}

export function hasFiles(data: DataTransfer | null): boolean {
  return !!data && Array.from(data.types).includes('Files')
}

/**
 * Opens every file dropped on the window; the ones that cannot be opened are reported by name in
 * `errors` and do not stop the rest. Call it from inside the drop event: the items stop being
 * readable once the event ends. Where Chrome provides a file handle, Save writes back to the same
 * file; otherwise the document has no handle and Save asks where to save.
 */
export async function readDropped(data: DataTransfer): Promise<{ docs: CsvDocument[]; errors: string[] }> {
  // Everything that needs the live items happens before the first await.
  const dropped = Array.from(data.items)
    .filter((item) => item.kind === 'file')
    .map((item) => ({ handle: item.getAsFileSystemHandle?.(), file: item.getAsFile() }))

  const docs: CsvDocument[] = []
  const errors: string[] = []
  for (const entry of dropped) {
    let name = entry.file?.name ?? 'A dropped item'
    try {
      const found = await entry.handle?.catch(() => null)
      if (found) name = found.name
      if (found?.kind === 'directory') throw new Error(`"${name}" is a folder, not a CSV file.`)
      const handle = found?.kind === 'file' ? (found as FileSystemFileHandle) : undefined
      const file = handle ? await handle.getFile() : entry.file
      if (!file) throw new Error(`"${name}" could not be read.`)
      if (!/\.csv$/i.test(file.name)) throw new Error(`"${file.name}" is not a CSV file. Only .csv files can be opened.`)
      docs.push(loadDocument(file.name, new Uint8Array(await file.arrayBuffer()), handle))
    } catch (e) {
      errors.push(e instanceof Error ? e.message : `"${name}" could not be opened.`)
    }
  }
  return { docs, errors }
}

async function write(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<void> {
  if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
    if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('Write permission denied.')
  }
  const writable = await handle.createWritable()
  await writable.write(bytes as BufferSource)
  await writable.close()
}

/** Writes to the document's own file; false if the user cancelled. Falls back to Save As without a handle. */
export async function saveCsv(doc: CsvDocument, bytes: Uint8Array): Promise<boolean> {
  if (!doc.handle) return saveCsvAs(doc, bytes)
  await write(doc.handle, bytes)
  return true
}

export async function saveCsvAs(doc: CsvDocument, bytes: Uint8Array): Promise<boolean> {
  try {
    const handle = await window.showSaveFilePicker({ suggestedName: doc.name, types: CSV_TYPES })
    await write(handle, bytes)
    doc.handle = handle
    doc.name = handle.name
    return true
  } catch (e) {
    if (isAbort(e)) return false
    throw e
  }
}
