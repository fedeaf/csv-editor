import { deleteColumns, deleteRows, fillCells, insertColumn, insertRows, pasteCells, renameHeader, setCell, sortRows, type Command } from './model/commands'
import { parseTsv, squared, toTsv } from './model/clipboard'
import { encodeDocument, type CsvDocument } from './document'
import { hasFiles, openCsv, readDropped, saveCsv, saveCsvAs } from './files'
import { History, type Outcome } from './model/history'
import { findMatch, type Position } from './model/search'
import { TableView, uniqueValues, type ColumnFilter } from './model/view'
import { closeContextMenu, showContextMenu } from './ui/contextMenu'
import { closeFilterDropdown, showFilterDropdown, type FilterEntry } from './ui/filterDropdown'
import { DEFAULT_COLUMN_WIDTH } from './ui/columns'
import { Grid, type FillRequest, type GridModel, type GridState, type Rect } from './ui/grid'
import { createSearchPanel } from './ui/searchPanel'
import { createTabBar, tabAfterClose } from './ui/tabBar'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

/**
 * Each open file is a tab with its own table, view (filters), history and search position, so
 * documents are fully independent. `current` is the tab in focus: shortcuts, menu actions and
 * Find only ever act on it.
 */
interface Tab {
  id: number
  doc: CsvDocument
  view: TableView
  history: History
  /** Display position of the last search match, where "Next" continues from. */
  lastMatch: Position | undefined
  /** Scroll and selection to restore when the tab is selected again. */
  state: GridState | undefined
}

const tabs: Tab[] = []
let current: Tab | undefined
let nextTabId = 1

const grid = new Grid($('grid-host'), {
  onCellEdit: (row, col, value) => {
    const rowId = current?.view.idAt(row)
    if (current && rowId !== undefined) run(setCell(current.doc.table, rowId, col, value))
  },
  onHeaderEdit: (col, value) => current && run(renameHeader(current.doc.table, col, value)),
  onContextMenu: (kind, x, y) => current && showContextMenu(x, y, contextItems(current, kind)),
  onSort: (col, dir) => {
    const command = current && sortRows(current.doc.table, col, dir)
    if (command) run(command)
  },
  onFilter: openFilter,
  onDuplicates: toggleDuplicates,
  onFill: fill,
  onClear: (rect) => clearCells(rect),
  onColumnResize: (col, width) => current?.view.widths.set(current.doc.table.colIds[col]!, width),
})

const tabBar = createTabBar($('tabs'), {
  onSelect: (id) => activate(tabs.find((t) => t.id === id)),
  onClose: (id) => closeTab(tabs.find((t) => t.id === id)),
})

/** The grid reads the view live, so a refresh is enough after any change. */
function modelFor(v: TableView): GridModel {
  const { table } = v
  return {
    get headers() {
      return table.headers
    },
    get rowCount() {
      return v.rowCount
    },
    cells: (row) => table.rowById(v.visible[row]!)!.cells,
    rowNumber: (row) => v.rowNumber(row),
    columnWidth: (col) => v.widths.get(table.colIds[col]!) ?? DEFAULT_COLUMN_WIDTH,
    column: (col) => {
      const colId = table.colIds[col]!
      const stat = v.stats.get(colId)
      return {
        sort: table.sort?.colId === colId ? table.sort.dir : undefined,
        filtered: v.filters.has(colId),
        duplicateValues: stat.duplicateValues,
        duplicateRows: stat.duplicateRows,
      }
    },
  }
}

// --- tabs -------------------------------------------------------------------------------

/** Brings a tab into focus. Whatever was being edited in the old one is applied to it first. */
function activate(tab: Tab | undefined): void {
  if (tab === current) {
    grid.focus()
    return
  }
  grid.commitEdit()
  closeFilterDropdown()
  closeContextMenu()
  if (current) current.state = grid.saveState()
  current = tab
  grid.setModel(tab && modelFor(tab.view), tab?.state)
  $('empty').hidden = !!tab
  const warnings = $('warnings')
  warnings.hidden = !tab?.doc.warnings.length
  warnings.replaceChildren(
    ...(tab?.doc.warnings ?? []).map((text) => Object.assign(document.createElement('p'), { textContent: text })),
  )
  search.setMessage('')
  showMeta()
  grid.focus()
}

function closeTab(tab: Tab | undefined): void {
  if (!tab) return
  if (tab === current) grid.commitEdit() // an unfinished edit counts as a change
  if (tab.history.dirty && !confirm(`"${tab.doc.name}" has unsaved changes. Close it and discard them?`)) return
  const next = tabAfterClose(tabs.map((t) => t.id), tab.id, current?.id)
  tabs.splice(tabs.indexOf(tab), 1)
  // Closing the tab in focus switches to its neighbour (or to the empty state); another tab just goes away.
  if (tab === current) activate(tabs.find((t) => t.id === next))
  else showMeta()
}

/** Opens each document in its own tab; a file that is already open is just brought into focus. */
async function openDocuments(docs: CsvDocument[]): Promise<void> {
  let first: Tab | undefined
  for (const doc of docs) {
    let tab = await findOpenTab(doc)
    if (!tab) {
      tab = { id: nextTabId++, doc, view: new TableView(doc.table), history: new History(), lastMatch: undefined, state: undefined }
      tabs.push(tab)
    }
    first ??= tab
  }
  if (!first) return
  if (first === current) showMeta()
  activate(first)
}

/** The tab already showing this file, recognised by its file handle (the same file can have another name). */
async function findOpenTab(doc: CsvDocument): Promise<Tab | undefined> {
  if (!doc.handle) return undefined
  for (const tab of tabs) {
    if (tab.doc.handle && (await tab.doc.handle.isSameEntry(doc.handle))) return tab
  }
}

// --- document and history ---------------------------------------------------------------

/** Tab strip, window title, status line and menu state, all for the tab in focus. */
function showMeta(message?: string): void {
  tabBar.render(tabs.map((t) => ({ id: t.id, label: t.doc.name, dirty: t.history.dirty, active: t === current })))
  const tab = current
  const mark = tab?.history.dirty ? '* ' : ''
  document.title = tab ? `${mark}${tab.doc.name} - CSV Editor` : 'CSV Editor'
  const item = (action: string) => $('menu-list').querySelector(`[data-action=${action}]`)!
  item('undo').classList.toggle('disabled', !tab?.history.canUndo)
  item('redo').classList.toggle('disabled', !tab?.history.canRedo)
  item('save').classList.toggle('disabled', !tab)
  item('save-as').classList.toggle('disabled', !tab)
  item('find').classList.toggle('disabled', !tab)
  item('clear-filters').classList.toggle('disabled', !tab?.view.filtered)
  if (!tab) {
    $('status').textContent = ''
    return
  }
  const { format, table } = tab.doc
  const encoding = format.encoding === 'utf-8' ? (format.bom ? 'UTF-8 with BOM' : 'UTF-8') : 'Windows-1252 / ISO-8859-1'
  const delimiter = format.delimiter === ',' ? 'comma' : 'semicolon'
  const count = (n: number) => n.toLocaleString('en-US')
  const rows = tab.view.filtered
    ? `Showing ${count(tab.view.rowCount)} of ${count(table.rowCount)} rows`
    : `${count(table.rowCount)} rows`
  const info = `${rows} × ${table.columnCount} columns · ${encoding} · ${delimiter}-delimited`
  $('status').textContent = message ? `${message} · ${info}` : info
}

/** After a command ran, was undone or redone: refresh statistics, filters and grid, then place the cursor. */
function applyOutcome(tab: Tab, { command, cursor }: Outcome): void {
  tab.view.stats.invalidate(command.invalidates)
  const target = cursor ?? {}
  tab.view.afterChange(target.reveal)
  grid.refresh()
  const at = target.rowId === undefined ? -1 : tab.view.indexOfId(target.rowId)
  const active = grid.activeCell
  grid.setActive(at >= 0 ? at : active.row, target.col ?? active.col)
  showMeta()
}

function run(command: Command): void {
  if (current) applyOutcome(current, current.history.execute(command, current.doc.table))
}

function undo(): void {
  const outcome = current?.history.undo(current.doc.table)
  if (current && outcome) applyOutcome(current, outcome)
}

function redo(): void {
  const outcome = current?.history.redo(current.doc.table)
  if (current && outcome) applyOutcome(current, outcome)
}

// --- fill (REL-01 to REL-05) ---------------------------------------------------------------

/** Copies the source cell's value into the covered cells. Only rows shown are covered (D-08). */
function fill({ row, col, toRow, toCol }: FillRequest): void {
  if (!current) return
  const { view } = current
  const { table } = current.doc
  const sourceId = view.idAt(row)
  if (sourceId === undefined) return
  const value = table.rowById(sourceId)!.cells[col]!
  const targets: { rowId: number; col: number }[] = []
  if (toCol === col) {
    for (let r = Math.min(row, toRow); r <= Math.max(row, toRow); r++) {
      if (r !== row) targets.push({ rowId: view.idAt(r)!, col })
    }
  } else {
    for (let c = Math.min(col, toCol); c <= Math.max(col, toCol); c++) {
      if (c !== col) targets.push({ rowId: sourceId, col: c })
    }
  }
  const command = fillCells(table, targets, value)
  if (command) run(command)
}

// --- clear, copy, cut and paste ------------------------------------------------------------

/** The cells of a block that are shown, as row ids and columns. Rows hidden by a filter are not in it. */
function cellsIn(tab: Tab, rect: Rect): { rowId: number; col: number }[] {
  const cells: { rowId: number; col: number }[] = []
  for (let r = rect.r0; r <= rect.r1; r++) {
    const rowId = tab.view.idAt(r)
    if (rowId === undefined) continue
    for (let c = rect.c0; c <= rect.c1; c++) cells.push({ rowId, col: c })
  }
  return cells
}

/** Delete over a selection empties every cell in it, as one undo step. */
function clearCells(rect: Rect): void {
  if (!current) return
  const command = fillCells(current.doc.table, cellsIn(current, rect), '')
  if (command) run(command)
}

const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`
const isTextField = (target: EventTarget | null) =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement

/** Copies what is shown in the selection (rows hidden by a filter are left out) as text spreadsheets understand. */
function copySelection(e: ClipboardEvent, cut: boolean): void {
  const tab = current
  if (!tab || grid.isEditing || isTextField(e.target) || !e.clipboardData) return
  const rect = grid.selection()
  const rows: string[][] = []
  for (let r = rect.r0; r <= rect.r1; r++) {
    const rowId = tab.view.idAt(r)
    if (rowId !== undefined) rows.push(tab.doc.table.rowById(rowId)!.cells.slice(rect.c0, rect.c1 + 1))
  }
  if (rows.length === 0) return
  e.clipboardData.setData('text/plain', toTsv(rows))
  e.preventDefault()
  const size = `${plural(rows.length, 'row')} × ${plural(rect.c1 - rect.c0 + 1, 'column')}`
  if (cut) clearCells(rect)
  showMeta(`${cut ? 'Cut' : 'Copied'} ${size}`)
}

/**
 * Pastes at the top-left of the selection, one clipboard row per row shown. A single value pasted
 * over several selected cells fills them all. Lines that do not fit become new rows at the end of the
 * table and extra columns are added, so nothing is dropped; it is all one undo step.
 */
function pasteClipboard(e: ClipboardEvent): void {
  const tab = current
  const text = e.clipboardData?.getData('text/plain')
  if (!tab || grid.isEditing || isTextField(e.target) || !text) return
  const block = squared(parseTsv(text))
  const table = tab.doc.table
  if (block.length === 0 || table.columnCount === 0) return
  e.preventDefault()
  const rect = grid.selection()
  const height = block.length
  const width = block[0]!.length
  const rowsBefore = tab.view.rowCount
  const colsBefore = table.columnCount

  if (height === 1 && width === 1 && (rect.r1 > rect.r0 || rect.c1 > rect.c0)) {
    const command = fillCells(table, cellsIn(tab, rect), block[0]![0]!)
    if (command) run(command)
    showMeta(`Pasted into ${plural((rect.r1 - rect.r0 + 1) * (rect.c1 - rect.c0 + 1), 'cell')}`)
    return
  }
  const command = pasteCells(table, tab.view.visible.slice(rect.r0, rect.r0 + height), rect.c0, block)
  if (!command) {
    showMeta('Pasted: nothing changed')
    return
  }
  run(command)
  grid.selectRange(rect.r0, rect.c0, rect.r0 + height - 1, rect.c0 + width - 1)
  const added = [
    tab.view.rowCount > rowsBefore ? plural(tab.view.rowCount - rowsBefore, 'row') : '',
    table.columnCount > colsBefore ? plural(table.columnCount - colsBefore, 'column') : '',
  ].filter(Boolean)
  showMeta(`Pasted ${plural(height, 'row')} × ${plural(width, 'column')}${added.length ? ` (added ${added.join(' and ')})` : ''}`)
}

document.addEventListener('copy', (e) => copySelection(e, false))
document.addEventListener('cut', (e) => copySelection(e, true))
document.addEventListener('paste', pasteClipboard)

// --- search (BUS-01 to BUS-07) -------------------------------------------------------------

const search = createSearchPanel({
  onSearch: () => find('first'),
  onStep: (direction) => find(direction === 1 ? 'next' : 'previous'),
  onClose: () => grid.focus(),
})

/** Searches the rows shown in the tab in focus, selects the match and scrolls to it. A new search starts at the first cell. */
function find(mode: 'first' | 'next' | 'previous'): void {
  const tab = current
  const query = search.query
  if (!tab || query === '') {
    if (tab) tab.lastMatch = undefined
    search.setMessage('')
    return
  }
  grid.commitEdit()
  const { table } = tab.doc
  const v = tab.view
  const match = findMatch(
    { rowCount: v.rowCount, colCount: table.columnCount, cell: (r, c) => table.rowById(v.visible[r]!)!.cells[c]! },
    query,
    search.exact,
    mode === 'first' ? undefined : tab.lastMatch,
    mode === 'previous' ? -1 : 1,
  )
  if (!match) {
    tab.lastMatch = undefined
    search.setMessage('No matches', true)
    return
  }
  tab.lastMatch = match
  grid.setActive(match.row, match.col)
  const name = table.headers[match.col] || `column ${match.col + 1}`
  search.setMessage(`Row ${v.rowNumber(match.row)}, ${name}`)
}

// --- filters (view only: not part of history, never delete rows) -------------------------

function setFilter(colId: number, filter: ColumnFilter | undefined): void {
  const tab = current
  if (!tab) return
  tab.view.setFilter(colId, filter)
  tab.lastMatch = undefined
  grid.refresh()
  grid.setActive(0, grid.activeCell.col)
  showMeta()
}

function clearFilters(): void {
  const tab = current
  if (!tab?.view.filtered) return
  tab.view.clearFilters()
  tab.lastMatch = undefined
  grid.refresh()
  showMeta()
}

function openFilter(col: number, anchor: HTMLElement): void {
  if (!current) return
  const { view } = current
  const colId = current.doc.table.colIds[col]!
  const stat = view.stats.get(colId)
  const { values, blanks } = uniqueValues(stat)
  const entries: FilterEntry[] = values.map((v) => ({ value: v.value, label: v.value, count: v.count }))
  if (blanks > 0) entries.push({ value: '', label: '(Blanks)', count: blanks })
  const existing = view.filters.get(colId)
  showFilterDropdown({
    anchor,
    entries,
    selected: existing?.selected ?? null,
    duplicatesOnly: existing?.duplicatesOnly ?? false,
    hasDuplicates: stat.duplicateValues > 0,
    onApply: (selected, duplicatesOnly) => setFilter(colId, { selected, duplicatesOnly }),
    onClear: () => setFilter(colId, undefined),
  })
}

/** Clicking the duplicate indicator of a header toggles "Duplicates only" for that column. */
function toggleDuplicates(col: number): void {
  if (!current) return
  const { view } = current
  const colId = current.doc.table.colIds[col]!
  const existing = view.filters.get(colId)
  if (!existing && view.stats.get(colId).duplicateValues === 0) return
  setFilter(colId, { selected: existing?.selected ?? null, duplicatesOnly: !existing?.duplicatesOnly })
}

// --- file actions -----------------------------------------------------------------------

function confirmUtf8(chars: string[]): boolean {
  const list = chars.slice(0, 10).join(' ')
  return confirm(`This file is saved as Windows-1252, which cannot represent: ${list}\n\nSave it as UTF-8 instead?`)
}

async function open(): Promise<void> {
  await openDocuments(await openCsv())
}

/** Saves the tab in focus only. The tab is captured up front: the dialog or write may take a while. */
async function save(as: boolean): Promise<void> {
  const tab = current
  if (!tab) return
  grid.commitEdit()
  const encoded = encodeDocument(tab.doc, confirmUtf8)
  if (!encoded) return
  const saved = await (as ? saveCsvAs(tab.doc, encoded.bytes) : saveCsv(tab.doc, encoded.bytes))
  if (!saved) return
  tab.doc.format = encoded.format
  tab.history.markSaved()
  showMeta(tab === current ? `Saved ${tab.doc.name}` : undefined)
}

function report(err: unknown): void {
  alert(err instanceof Error ? err.message : String(err))
}

// --- menus ------------------------------------------------------------------------------

const actions: Record<string, () => void | Promise<void>> = {
  open,
  save: () => save(false),
  'save-as': () => save(true),
  undo,
  redo,
  'clear-filters': clearFilters,
  find: () => search.open(),
}

const menuButton = $('menu-button')
const menuList = $('menu-list')
function setMenu(isOpen: boolean): void {
  menuList.hidden = !isOpen
  menuButton.setAttribute('aria-expanded', String(isOpen))
}
menuButton.addEventListener('click', () => setMenu(menuList.hidden !== false))
document.addEventListener('click', (e) => {
  if (!(e.target as Element).closest('.menu')) setMenu(false)
})
menuList.addEventListener('click', (e) => {
  const item = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')
  if (!item || item.classList.contains('disabled')) return
  setMenu(false)
  Promise.resolve(actions[item.dataset.action!]!()).catch(report).finally(() => grid.focus())
})

/** Insert and delete live in the context menu of row numbers and column headers (D-09). */
function contextItems(tab: Tab, kind: 'rows' | 'cols' | 'corner') {
  const table = tab.doc.table
  const v = tab.view
  if (kind === 'corner') return [{ label: 'Insert row at top', run: () => run(insertRows(table, 0, 1)) }]
  if (kind === 'rows') {
    // Rows are chosen among the visible ones; a new row goes next to its neighbour in the whole table.
    const [from, to] = grid.selectedRows()
    const ids = v.visible.slice(from, to + 1)
    return [
      { label: 'Insert row above', run: () => run(insertRows(table, table.indexOfRow(ids[0]!), 1)) },
      { label: 'Insert row below', run: () => run(insertRows(table, table.indexOfRow(ids[ids.length - 1]!) + 1, 1)) },
      { label: ids.length > 1 ? `Delete ${ids.length} rows` : 'Delete row', run: () => run(deleteRows(ids)) },
    ]
  }
  const [from, to] = grid.selectedCols()
  return [
    { label: 'Insert column left', run: () => run(insertColumn(table, from)) },
    { label: 'Insert column right', run: () => run(insertColumn(table, to + 1)) },
    {
      label: to > from ? `Delete ${to - from + 1} columns` : 'Delete column',
      run: () => run(deleteColumns(from, to)),
      disabled: to - from + 1 >= table.columnCount, // a table keeps at least one column
    },
    { label: 'Rename header', run: () => grid.startHeaderEdit(from) },
  ]
}

// --- shortcuts and warnings -------------------------------------------------------------

// Ctrl+S, Ctrl+F, Ctrl+G, Ctrl+Z and Ctrl+Y, always on the tab in focus. While typing in a text
// box (a cell, the Find field) undo and redo belong to that text.
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return
  const key = e.key.toLowerCase()
  const typing = grid.isEditing || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
  const isRedo = key === 'y' || (key === 'z' && e.shiftKey)
  if (key === 's' && !e.shiftKey) {
    e.preventDefault()
    save(false).catch(report)
  } else if (key === 'f' && !e.shiftKey) {
    e.preventDefault()
    closeContextMenu()
    search.open()
  } else if (key === 'g') {
    e.preventDefault()
    if (!search.isOpen) search.open()
    find(e.shiftKey ? 'previous' : 'next')
  } else if (key === 'z' && !e.shiftKey && !typing) {
    e.preventDefault()
    closeContextMenu()
    undo()
  } else if (isRedo && !typing) {
    e.preventDefault()
    closeContextMenu()
    redo()
  }
})

// --- drag and drop files onto the window ------------------------------------------------------

const dropOverlay = $('drop-overlay')
let dragDepth = 0 // dragenter/dragleave fire for every child element crossed

function endDrag(): void {
  dragDepth = 0
  dropOverlay.hidden = true
}

window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e.dataTransfer)) return
  e.preventDefault()
  dragDepth++
  dropOverlay.hidden = false
})
window.addEventListener('dragover', (e) => {
  if (!hasFiles(e.dataTransfer)) return
  e.preventDefault() // required, or the browser would open the file in this tab on drop
  e.dataTransfer!.dropEffect = 'copy'
})
window.addEventListener('dragleave', (e) => {
  if (hasFiles(e.dataTransfer) && --dragDepth <= 0) endDrag()
})
window.addEventListener('drop', (e) => {
  if (!hasFiles(e.dataTransfer)) return
  e.preventDefault()
  endDrag()
  readDropped(e.dataTransfer!)
    .then(async ({ docs, errors }) => {
      await openDocuments(docs)
      if (errors.length > 0) report(new Error(errors.join('\n')))
    })
    .catch(report)
})

window.addEventListener('beforeunload', (e) => {
  if (!tabs.some((t) => t.history.dirty)) return
  e.preventDefault()
  e.returnValue = ''
})

showMeta()

// Test hook for headless runs, where native file pickers cannot be driven.
if (import.meta.env.DEV) {
  const { loadDocument } = await import('./document')
  Object.assign(window, {
    __app: {
      load: (name: string, bytes: Uint8Array) => openDocuments([loadDocument(name, bytes)]),
      grid,
      getDoc: () => current?.doc,
      getHistory: () => current?.history,
      getView: () => current?.view,
      tabs: () => tabs.map((t) => ({ name: t.doc.name, dirty: t.history.dirty, active: t === current, rows: t.doc.table.rowCount })),
      select: (i: number) => activate(tabs[i]),
      close: (i: number) => closeTab(tabs[i]),
    },
  })
}
