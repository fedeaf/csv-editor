// Writes a table as an xlsx package, following ISO/IEC 29500 (ECMA-376), Transitional: one worksheet, Sheet1, with no
// styles and no document properties. Every cell is text, an inline string: nothing is read as a number, date or formula.
import { zip } from './zip'

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const CONTENT_TYPES = 'http://schemas.openxmlformats.org/package/2006/content-types'
const RELATIONSHIPS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const OFFICE_RELATIONSHIPS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const SPREADSHEET_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml'

/** The name of a column from its position, counting from 0: A, B… Z, AA, AB… */
export function columnName(index: number): string {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}

const code = (unit: number) => `_x${unit.toString(16).toUpperCase().padStart(4, '0')}_`
// The carriage return is a character of XML, but only as a reference: written as it is, it reads as a line feed.
const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\r': '&#13;' }

/**
 * A value as the content of an element of type ST_Xstring (22.9.2.19). Characters that XML 1.0 cannot represent are
 * written `_xHHHH_`: the control characters, the two code points that are not characters and half of a surrogate pair.
 * An underscore that would read as such a code is itself written that way. Spaces need nothing: the type derives from
 * xsd:string, which keeps white space as it is.
 */
export function escapeText(value: string): string {
  return value.replace(
    /_(?=x[0-9A-Fa-f]{4}_)|[&<>\r]|[\0-\x08\x0b\x0c\x0e-\x1f￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g,
    (c) => ENTITIES[c] ?? code(c.charCodeAt(0)),
  )
}

/** The worksheet, in pieces. An empty cell, and a row with nothing in it, are left out; the references keep the rest in place. */
export function* worksheetChunks(headers: string[], rows: string[][]): Generator<Uint8Array> {
  const encoder = new TextEncoder()
  const columns = headers.map((_, c) => columnName(c))
  let xml = `${XML}<worksheet xmlns="${MAIN}"><sheetData>`
  let number = 0
  for (const cells of [headers, ...rows]) {
    number++
    let row = ''
    for (let c = 0; c < cells.length; c++) {
      const value = cells[c]!
      if (value !== '') row += `<c r="${columns[c]}${number}" t="inlineStr"><is><t>${escapeText(value)}</t></is></c>`
    }
    if (row !== '') xml += `<row r="${number}">${row}</row>`
    if (xml.length >= 1 << 20) {
      yield encoder.encode(xml)
      xml = ''
    }
  }
  yield encoder.encode(`${xml}</sheetData></worksheet>`)
}

const part = (name: string, xml: string) => ({ name, chunks: [new TextEncoder().encode(XML + xml)] })

/** The bytes of an xlsx file holding these headers, as its first row, and these rows. */
export function writeXlsx(headers: string[], rows: string[][]): Promise<Blob> {
  return zip([
    part(
      '[Content_Types].xml',
      `<Types xmlns="${CONTENT_TYPES}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        `<Override PartName="/xl/workbook.xml" ContentType="${SPREADSHEET_TYPE}.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="${SPREADSHEET_TYPE}.worksheet+xml"/></Types>`,
    ),
    part('_rels/.rels', `<Relationships xmlns="${RELATIONSHIPS}"><Relationship Id="rId1" Type="${OFFICE_RELATIONSHIPS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    part('xl/workbook.xml', `<workbook xmlns="${MAIN}" xmlns:r="${OFFICE_RELATIONSHIPS}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    part('xl/_rels/workbook.xml.rels', `<Relationships xmlns="${RELATIONSHIPS}"><Relationship Id="rId1" Type="${OFFICE_RELATIONSHIPS}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    { name: 'xl/worksheets/sheet1.xml', chunks: worksheetChunks(headers, rows) },
  ])
}
