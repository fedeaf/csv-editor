// A ZIP archive, the container of an xlsx package, compressed with the browser's own deflate.

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

const updateCrc = (crc: number, bytes: Uint8Array): number => {
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]!) & 255]! ^ (crc >>> 8)
  return crc
}

export interface ZipEntry {
  /** ASCII: the names of a package's parts. */
  name: string
  chunks: Iterable<Uint8Array>
}

interface Deflated {
  data: Blob
  crc: number
  size: number
}

async function deflate(chunks: Iterable<Uint8Array>): Promise<Deflated> {
  const stream = new CompressionStream('deflate-raw')
  const writer = stream.writable.getWriter()
  // Read while writing: a stream with nobody reading it stops accepting data. A Blob needs no single block of memory.
  const data = new Response(stream.readable).blob()
  let crc = -1
  let size = 0
  for (const chunk of chunks) {
    crc = updateCrc(crc, chunk)
    size += chunk.length
    await writer.write(chunk as BufferSource)
  }
  await writer.close()
  return { data: await data, crc: (crc ^ -1) >>> 0, size }
}

const VERSION = 20 // 2.0, the version that introduced deflate
const DEFLATE = 8
const DOS_DATE = 0x21 // 1980-01-01, the earliest there is: an archive says nothing about when it was made
const LIMIT = 2 ** 32 // what the fields of a ZIP without its 64-bit extension can hold

function fieldsOf(view: DataView, at: number, { crc, size, data }: Deflated, nameLength: number): void {
  view.setUint16(at, DEFLATE, true)
  view.setUint16(at + 4, DOS_DATE, true)
  view.setUint32(at + 6, crc, true)
  view.setUint32(at + 10, data.size, true)
  view.setUint32(at + 14, size, true)
  view.setUint16(at + 18, nameLength, true)
}

/** The archive of these entries. A size that the format's fields cannot hold is an error, never a damaged file. */
export async function zip(entries: ZipEntry[]): Promise<Blob> {
  const parts: BlobPart[] = []
  const directory: Uint8Array[] = []
  let offset = 0
  for (const { name, chunks } of entries) {
    const nameBytes = new TextEncoder().encode(name)
    const deflated = await deflate(chunks)
    if (deflated.size >= LIMIT || deflated.data.size >= LIMIT || offset >= LIMIT) throw new Error('The table is too large to be written as xlsx.')

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, VERSION, true)
    fieldsOf(local, 8, deflated, nameBytes.length)

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, VERSION, true)
    central.setUint16(6, VERSION, true)
    fieldsOf(central, 10, deflated, nameBytes.length)
    central.setUint32(42, offset, true)

    parts.push(local.buffer, nameBytes as BlobPart, deflated.data)
    directory.push(new Uint8Array(central.buffer), nameBytes)
    offset += 30 + nameBytes.length + deflated.data.size
  }
  const directorySize = directory.reduce((total, part) => total + part.length, 0)
  if (offset >= LIMIT) throw new Error('The table is too large to be written as xlsx.')

  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, directorySize, true)
  end.setUint32(16, offset, true)
  return new Blob([...parts, ...(directory as BlobPart[]), end.buffer])
}
