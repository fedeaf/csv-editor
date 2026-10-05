import { deleteColumns, deleteRows, fillCells, insertColumn, insertRows, pasteCells, renameHeader, replaceCells, setCell, sortRows, type Command } from './model/commands'
import { parseTsv, squared, toTsv } from './model/clipboard'
import { blankDocument, encodeDocumentAsync, untitledName, type CsvDocument } from './document'
import { hasFiles, openCsv, readDropped, saveCsv, saveCsvAs } from './files'
import { History, type Outcome } from './model/history'
import { nextErrorRow } from './model/errors'
import { createMatcher, findAllMatches, findMatch, findReplacements, matchNumber, type Position, type SearchGrid } from './model/search'
import { TableView, uniqueValues, type ColumnFilter } from './model/view'
import { closeContextMenu, showContextMenu, type MenuItem } from './ui/contextMenu'
import { closeFilterDropdown, showFilterDropdown, type FilterEntry } from './ui/filterDropdown'
import { DEFAULT_COLUMN_WIDTH } from './ui/columns'
import { Grid, type FillRequest, type GridHandlers, type GridModel, type GridState, type Rect } from './ui/grid'
import { confirmDialog, isDialogOpen, messageDialog } from './ui/dialog'
import { createSearchPanel } from './ui/searchPanel'
import { fileInfo, plural, selectionSummary } from './ui/status'
import { currentTheme, toggleTheme, watchTheme } from './ui/theme'
import { createDivider } from './ui/splitDivider'
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
  /** The last error cell reached from a header's warning, so the next click goes on to the following one. */
  lastError: { colId: number; row: number } | undefined
  /** Goes up whenever the cells or the rows shown change; the match list below is only good for one value of it. */
  version: number
  /** Every match of the current search, kept so that stepping from one to the next only has to look up a number. */
  matches: { query: string; exact: boolean; version: number; list: number[] } | undefined
  /** Scroll and selection to restore when the tab is selected again. */
  state: GridState | undefined
}

const tabs: Tab[] = []
let current: Tab | undefined
let nextTabId = 1

/**
 * What the window shows is one or two panes, each with a table of its own (or the start screen).
 * `focused` is the one being used; `grid` and `current` always belong to it, so shortcuts, menu
 * actions and Find only ever act on the document in the pane in focus.
 */
interface Pane {
  el: HTMLElement
  body: HTMLElement
  warnings: HTMLElement
  empty: HTMLElement
  grid: Grid
  tab: Tab | undefined
}

type Layout = 'single' | 'side' | 'stacked'

const panes: Pane[] = []
let layout: Layout = 'single'
let focused: Pane
let grid: Grid

/** The first pane's share of the room when the window is split; the bar between the panes changes it. */
let splitShare = 0.5

function applyShare(): void {
  panes.forEach((p, i) => (p.el.style.flex = panes.length < 2 ? '' : `${i === 0 ? splitShare : 1 - splitShare} 1 0`))
}

const divider = createDivider(
  $('panes'),
  (share) => {
    splitShare = share
    applyShare()
  },
  () => splitShare,
)

function createPane(): Pane {
  const el = ($('pane-template') as HTMLTemplateElement).content.firstElementChild!.cloneNode(true) as HTMLElement
  const pane: Pane = {
    el,
    body: el.querySelector<HTMLElement>('.pane-body')!,
    warnings: el.querySelector<HTMLElement>('.pane-warnings')!,
    empty: el.querySelector<HTMLElement>('.pane-empty')!,
    grid: undefined!,
    tab: undefined,
  }
  pane.grid = new Grid(pane.body, GRID_HANDLERS)
  // Whatever is used in a pane (a click, the keyboard) puts that pane in focus first.
  el.addEventListener('pointerdown', () => focusPane(pane), true)
  el.addEventListener('focusin', () => focusPane(pane))
  el.querySelector('.empty-open')!.addEventListener('click', () => {
    focusPane(pane)
    Promise.resolve(actions.open!()).catch(report)
  })
  panes.push(pane)
  $('panes').append(el)
  return pane
}

const GRID_HANDLERS: GridHandlers = {
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
  onWarning: goToError,
  onFill: fill,
  onClear: (rect) => clearCells(rect),
  onColumnResize: (col, width) => current?.view.widths.set(current.doc.table.colIds[col]!, width),
  onSelectionChange: () => {
    setStatusMessage(undefined) // the selection took over from the last message
    showActivity()
  },
}

focused = createPane()
grid = focused.grid
focused.el.classList.add('focused')

const tabBar = createTabBar($('tabs'), {
  onSelect: (id) => activate(tabs.find((t) => t.id === id)),
  onClose: (id) => void closeTab(tabs.find((t) => t.id === id)),
  onNew: () => newDocument(),
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
        errorCells: stat.errorCells,
        errorExamples: stat.errorExamples,
      }
    },
  }
}

// --- tabs -------------------------------------------------------------------------------

/** Puts another pane in focus: from here on, `grid` and `current` are its own. */
function focusPane(pane: Pane): void {
  if (pane === focused) return
  grid.commitEdit()
  focused.el.classList.remove('focused')
  focused = pane
  grid = pane.grid
  current = pane.tab
  pane.el.classList.add('focused')
  search.mount(pane.body)
  search.setMessage('')
  showMeta()
}

/** Shows a tab (or the start screen) in a pane. Whatever was being edited there is applied first. */
function showIn(pane: Pane, tab: Tab | undefined): void {
  pane.grid.commitEdit()
  if (pane.tab) pane.tab.state = pane.grid.saveState()
  pane.tab = tab
  if (pane === focused) current = tab
  pane.grid.setModel(tab && modelFor(tab.view), tab?.state)
  pane.empty.hidden = !!tab
  pane.warnings.hidden = !tab?.doc.warnings.length
  pane.warnings.replaceChildren(
    ...(tab?.doc.warnings ?? []).map((text) => Object.assign(document.createElement('p'), { textContent: text })),
  )
}

/** The tab the other pane shows, if the window is split. */
function otherTab(): Tab | undefined {
  return panes.find((p) => p !== focused)?.tab
}

/** Brings a tab into focus, in the pane in focus; if the other pane already shows it, that pane is the one focused. */
function activate(tab: Tab | undefined): void {
  const elsewhere = tab && panes.find((p) => p !== focused && p.tab === tab)
  if (elsewhere) {
    focusPane(elsewhere)
    grid.focus()
    return
  }
  if (tab === current) {
    grid.focus()
    return
  }
  closeFilterDropdown()
  closeContextMenu()
  showIn(focused, tab)
  search.setMessage('')
  showMeta()
  if (tab) grid.focus()
  else focused.empty.querySelector<HTMLElement>('.empty-open')!.focus() // the start screen's button, so Enter opens a file
}

/** One pane, or two side by side or one above the other. The second shows a file not shown yet, or the start screen. */
function setLayout(next: Layout): void {
  if (next === layout) return
  grid.commitEdit()
  if (next === 'single') {
    for (const gone of panes.filter((p) => p !== focused)) {
      panes.splice(panes.indexOf(gone), 1)
      gone.el.remove()
    }
    divider.el.remove()
  } else if (panes.length === 1) {
    const spare = tabs.find((t) => t !== current)
    splitShare = 0.5
    showIn(createPane(), spare)
    panes[0]!.el.after(divider.el)
  }
  layout = next
  $('panes').className = next === 'single' ? '' : next
  divider.setOrientation(next === 'side')
  applyShare()
  showMeta()
}

/** Tabs whose "discard changes?" question is on screen, so a second click on × does not ask twice. */
const closing = new Set<Tab>()

async function closeTab(tab: Tab | undefined): Promise<void> {
  if (!tab || closing.has(tab)) return
  panes.find((p) => p.tab === tab)?.grid.commitEdit() // an unfinished edit counts as a change
  if (tab.history.dirty) {
    closing.add(tab)
    const discard = await confirmDialog({
      title: `Close "${tab.doc.name}"?`,
      message: 'It has unsaved changes. If you close it, they will be lost.',
      confirmLabel: 'Close and discard',
      danger: true,
    })
    closing.delete(tab)
    if (!discard || !tabs.includes(tab)) {
      if (current) grid.focus() // back to the table, not to the × that was clicked
      return
    }
  }
  const next = tabAfterClose(tabs.map((t) => t.id), tab.id, current?.id, otherTab()?.id)
  tabs.splice(tabs.indexOf(tab), 1)
  // In the other pane, a closed file gives way to one not shown yet, or to the start screen.
  const holder = panes.find((p) => p !== focused && p.tab === tab)
  if (holder) showIn(holder, tabs.find((t) => t !== current))
  // Closing the tab in focus switches to its neighbour (or to the empty state); another tab just goes away.
  if (tab === current) activate(tabs.find((t) => t.id === next))
  else showMeta()
}

function addTab(doc: CsvDocument): Tab {
  const tab: Tab = { id: nextTabId++, doc, view: new TableView(doc.table), history: new History(), lastMatch: undefined, lastError: undefined, version: 0, matches: undefined, state: undefined }
  tabs.push(tab)
  return tab
}

/** Opens each document in its own tab; a file that is already open is just brought into focus. */
async function openDocuments(docs: CsvDocument[]): Promise<void> {
  let first: Tab | undefined
  for (const doc of docs) {
    let tab = await findOpenTab(doc)
    if (!tab) {
      tab = addTab(doc)
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

/** The last action's result, shown on the left of the status bar for a few seconds. */
let statusMessage: { text: string; neutral: boolean } | undefined
let statusTimer: number | undefined
const MESSAGE_SECONDS = 4

function setStatusMessage(text: string | undefined, neutral = false): void {
  window.clearTimeout(statusTimer)
  statusMessage = text === undefined ? undefined : { text, neutral }
  if (text !== undefined) {
    statusTimer = window.setTimeout(() => {
      statusMessage = undefined
      showActivity()
    }, MESSAGE_SECONDS * 1000)
  }
}

/** Left side of the status bar: the message of the last action while it lasts, else the selection. */
function showActivity(): void {
  const activity = $('status-activity')
  const text = statusMessage?.text ?? (current ? selectionSummary(grid.selection(), current.view.rowCount) : '')
  activity.textContent = text
  activity.classList.toggle('message', !!statusMessage)
  activity.classList.toggle('neutral', !!statusMessage?.neutral)
}

/**
 * Tab strip, window title, status bar and menu state, all for the tab in focus. A `message` is the
 * result of an action ("Saved", "Pasted"); without one, any earlier message is cleared.
 */
function showMeta(message?: string, neutral = false): void {
  tabBar.render(tabs.map((t) => ({ id: t.id, label: t.doc.name, dirty: t.history.dirty, active: t === current, shown: t === otherTab() })))
  const tab = current
  // The browser tab keeps the name of the app whatever is open. Its asterisk (ARC-05) says that some
  // document has unsaved changes; which one is shown by the asterisk in the strip of tabs.
  document.title = `${tabs.some((t) => t.history.dirty) ? '* ' : ''}CSV Editor`
  const item = (action: string) => $('menu-list').querySelector(`[data-action=${action}]`)!
  item('undo').classList.toggle('disabled', !tab?.history.canUndo)
  item('redo').classList.toggle('disabled', !tab?.history.canRedo)
  item('save').classList.toggle('disabled', !tab)
  item('save-as').classList.toggle('disabled', !tab)
  item('find').classList.toggle('disabled', !tab)
  item('clear-filters').classList.toggle('disabled', !tab?.view.filtered)
  item('split-side').classList.toggle('disabled', layout === 'side')
  item('split-stacked').classList.toggle('disabled', layout === 'stacked')
  item('single-view').classList.toggle('disabled', layout === 'single')
  setStatusMessage(message, neutral)
  showActivity()
  $('status-info').textContent = tab
    ? fileInfo({
        rows: tab.doc.table.rowCount,
        rowsShown: tab.view.filtered ? tab.view.rowCount : undefined,
        columns: tab.doc.table.columnCount,
        format: tab.doc.format,
      })
    : ''
}

/** After a command ran, was undone or redone: refresh statistics, filters and grid, then place the cursor. */
function applyOutcome(tab: Tab, { command, cursor }: Outcome): void {
  tab.lastError = undefined // rows may have moved or errors been fixed: the next walk starts from the top
  tab.version++
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

const isTextField = (target: EventTarget | null) =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement

/** What the selection holds as text spreadsheets understand. Rows hidden by a filter are left out. */
function selectionText(tab: Tab): { text: string; size: string; rect: Rect } | undefined {
  const rect = grid.selection()
  const rows: string[][] = []
  for (let r = rect.r0; r <= rect.r1; r++) {
    const rowId = tab.view.idAt(r)
    if (rowId !== undefined) rows.push(tab.doc.table.rowById(rowId)!.cells.slice(rect.c0, rect.c1 + 1))
  }
  if (rows.length === 0) return undefined
  return { text: toTsv(rows), size: `${plural(rows.length, 'row')} × ${plural(rect.c1 - rect.c0 + 1, 'column')}`, rect }
}

/** After the text is on the clipboard: a cut empties what was taken, and the status bar says what happened. */
function copied({ rect, size }: { rect: Rect; size: string }, cut: boolean): void {
  if (cut) clearCells(rect)
  showMeta(`${cut ? 'Cut' : 'Copied'} ${size}`)
}

/** Ctrl+C and Ctrl+X, through the browser's clipboard events. */
function copySelection(e: ClipboardEvent, cut: boolean): void {
  const tab = current
  if (!tab || isDialogOpen() || grid.isEditing || isTextField(e.target) || !e.clipboardData) return
  const selection = selectionText(tab)
  if (!selection) return
  e.clipboardData.setData('text/plain', selection.text)
  e.preventDefault()
  copied(selection, cut)
}

/** Cut and Copy from the context menu, which has no clipboard event to work with. */
async function copyFromMenu(cut: boolean): Promise<void> {
  const selection = current && selectionText(current)
  if (!selection) return
  try {
    await navigator.clipboard.writeText(selection.text)
  } catch {
    report(new Error('The browser did not let the page write to the clipboard.'), cut ? 'Could not cut' : 'Could not copy')
    return
  }
  copied(selection, cut)
}

/** Paste from the context menu. The browser asks for permission to read the clipboard the first time. */
async function pasteFromMenu(): Promise<void> {
  let text: string
  try {
    text = await navigator.clipboard.readText()
  } catch {
    report(new Error('The browser did not let the page read the clipboard. You can paste with Ctrl+V instead.'), 'Could not paste')
    return
  }
  pasteText(text)
}

/** Ctrl+V, through the browser's clipboard event. */
function pasteClipboard(e: ClipboardEvent): void {
  const text = e.clipboardData?.getData('text/plain')
  if (!current || isDialogOpen() || grid.isEditing || isTextField(e.target) || !text) return
  if (pasteText(text)) e.preventDefault()
}

/**
 * Pastes at the top-left of the selection, one clipboard row per row shown. A single value pasted
 * over several selected cells fills them all. Lines that do not fit become new rows at the end of the
 * table and extra columns are added, so nothing is dropped; it is all one undo step. Returns false
 * when there was nothing to paste.
 */
function pasteText(text: string): boolean {
  const tab = current
  if (!tab) return false
  const block = squared(parseTsv(text))
  const table = tab.doc.table
  if (block.length === 0 || table.columnCount === 0) return false
  const rect = grid.selection()
  const height = block.length
  const width = block[0]!.length
  const rowsBefore = tab.view.rowCount
  const colsBefore = table.columnCount

  if (height === 1 && width === 1 && (rect.r1 > rect.r0 || rect.c1 > rect.c0)) {
    const command = fillCells(table, cellsIn(tab, rect), block[0]![0]!)
    if (command) run(command)
    showMeta(`Pasted into ${plural((rect.r1 - rect.r0 + 1) * (rect.c1 - rect.c0 + 1), 'cell')}`)
    return true
  }
  const command = pasteCells(table, tab.view.visible.slice(rect.r0, rect.r0 + height), rect.c0, block)
  if (!command) {
    showMeta('Nothing changed', true)
    return true
  }
  run(command)
  grid.selectRange(rect.r0, rect.c0, rect.r0 + height - 1, rect.c0 + width - 1)
  const added = [
    tab.view.rowCount > rowsBefore ? plural(tab.view.rowCount - rowsBefore, 'row') : '',
    table.columnCount > colsBefore ? plural(table.columnCount - colsBefore, 'column') : '',
  ].filter(Boolean)
  showMeta(`Pasted ${plural(height, 'row')} × ${plural(width, 'column')}${added.length ? ` (added ${added.join(' and ')})` : ''}`)
  return true
}

document.addEventListener('copy', (e) => copySelection(e, false))
document.addEventListener('cut', (e) => copySelection(e, true))
document.addEventListener('paste', pasteClipboard)

// --- search (BUS-01 to BUS-07) -------------------------------------------------------------

const search = createSearchPanel({
  onSearch: () => void find('first'),
  onStep: (direction) => void find(direction === 1 ? 'next' : 'previous'),
  onReplace: replaceCurrent,
  onReplaceAll: replaceAll,
  onClose: () => grid.focus(),
})
search.mount(focused.body)

/** The cells a search looks at: the rows shown in a tab. */
function searchGrid(tab: Tab): SearchGrid {
  const { table } = tab.doc
  const v = tab.view
  return { rowCount: v.rowCount, colCount: table.columnCount, cell: (r, c) => table.rowById(v.visible[r]!)!.cells[c]! }
}

/** All the matches of the search, counted once and reused until the cells or the rows shown change. */
function matchesOf(tab: Tab, query: string, exact: boolean): number[] {
  const cached = tab.matches
  if (cached && cached.query === query && cached.exact === exact && cached.version === tab.version) return cached.list
  const list = findAllMatches(searchGrid(tab), query, exact)
  tab.matches = { query, exact, version: tab.version, list }
  return list
}

/**
 * Searches the rows shown in the tab in focus, selects the match and scrolls to it. A new search starts
 * at the first cell. The panel says which match it is: "3 of 12".
 */
function find(mode: 'first' | 'next' | 'previous'): boolean {
  const tab = current
  const query = search.query
  if (!tab || query === '') {
    if (tab) tab.lastMatch = undefined
    search.setMessage('')
    return false
  }
  grid.commitEdit()
  const { table } = tab.doc
  const v = tab.view
  const match = findMatch(
    searchGrid(tab),
    query,
    search.exact,
    mode === 'first' ? undefined : tab.lastMatch,
    mode === 'previous' ? -1 : 1,
  )
  if (!match) {
    tab.lastMatch = undefined
    search.setMessage('No matches', true)
    return false
  }
  tab.lastMatch = match
  grid.setActive(match.row, match.col)
  const list = matchesOf(tab, query, search.exact)
  const number = matchNumber(list, match, table.columnCount).toLocaleString('en-US')
  const total = list.length.toLocaleString('en-US')
  const name = table.headers[match.col] || `column ${match.col + 1}`
  search.setMessage(`${number} of ${total}`, false, `Match ${number} of ${total} · row ${v.rowNumber(match.row)}, ${name}`)
  return true
}

/**
 * Replace: if the selected cell matches, its text is replaced (every occurrence in it) and the next
 * match is selected; if it does not, this just goes to the next match, so repeated presses walk through
 * the matches one at a time, replacing each.
 */
function replaceCurrent(): void {
  const tab = current
  const query = search.query
  if (!tab || query === '') return
  grid.commitEdit()
  const { table } = tab.doc
  const { row, col } = grid.activeCell
  const rowId = tab.view.idAt(row)
  let replaced = false
  if (rowId !== undefined) {
    const matcher = createMatcher(query, search.exact)
    const value = table.rowById(rowId)!.cells[col]!
    if (matcher.test(value)) {
      const command = replaceCells(table, [{ rowId, col, value: matcher.replace(value, search.replacement) }])
      if (command) run(command)
      replaced = true
    }
  }
  tab.lastMatch = grid.activeCell // carry on from here
  const found = find('next')
  if (replaced && !found) search.setMessage('No more matches')
}

/** Replace all: every match in the rows shown, as one undo step. Rows hidden by a filter are left alone. */
function replaceAll(): void {
  const tab = current
  const query = search.query
  if (!tab || query === '') return
  grid.commitEdit()
  const { table } = tab.doc
  const v = tab.view
  const shown = searchGrid(tab)
  const changes = findReplacements(shown, query, search.exact, search.replacement)
  if (changes.length === 0) {
    const anyMatch = findMatch(shown, query, search.exact)
    search.setMessage(anyMatch ? 'Nothing to change' : 'No matches', !anyMatch)
    return
  }
  const command = replaceCells(table, changes.map((c) => ({ rowId: v.idAt(c.row)!, col: c.col, value: c.value })))
  if (command) run(command)
  tab.lastMatch = undefined
  search.setMessage('')
  showMeta(`Replaced ${plural(changes.length, 'cell')} in ${plural(new Set(changes.map((c) => c.row)).size, 'row')}`)
}


// --- spreadsheet errors ----------------------------------------------------------------------

/**
 * Click on a header's warning: go to the first cell with a spreadsheet error in that column, and with
 * each further click to the next, starting over after the last. Only rows shown are visited, like Find.
 */
function goToError(col: number): void {
  const tab = current
  if (!tab) return
  grid.commitEdit()
  const { table } = tab.doc
  const v = tab.view
  const colId = table.colIds[col]!
  const cell = (row: number) => table.rowById(v.visible[row]!)!.cells[col]!
  const from = tab.lastError?.colId === colId ? tab.lastError.row : undefined
  const stop = nextErrorRow(cell, v.rowCount, from)
  if (!stop) {
    const hidden = v.stats.get(colId).errorCells
    showMeta(hidden > 0 ? `${plural(hidden, 'error cell')} in this column ${hidden === 1 ? 'is' : 'are'} in rows hidden by a filter` : 'No spreadsheet errors in this column', true)
    return
  }
  tab.lastError = { colId, row: stop.row }
  grid.setActive(stop.row, col)
  grid.focus()
  const name = table.headers[col] || `column ${col + 1}`
  showMeta(`Error ${stop.index} of ${stop.total} in "${name}": ${cell(stop.row).trim()}${stop.wrapped ? ' (back at the first)' : ''}`, true)
}

// --- filters (view only: not part of history, never delete rows) -------------------------

function setFilter(colId: number, filter: ColumnFilter | undefined): void {
  const tab = current
  if (!tab) return
  tab.view.setFilter(colId, filter)
  tab.lastMatch = undefined
  tab.lastError = undefined
  tab.version++
  grid.refresh()
  grid.setActive(0, grid.activeCell.col)
  showMeta()
}

function clearFilters(): void {
  const tab = current
  if (!tab?.view.filtered) return
  tab.view.clearFilters()
  tab.lastMatch = undefined
  tab.lastError = undefined
  tab.version++
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

/** Asks, with a dialog, whether to save as UTF-8 characters the file's own encoding cannot hold. */
function confirmUtf8(doc: CsvDocument, chars: string[]): Promise<boolean> {
  const label = doc.format.encoding === 'windows-1252' ? 'Windows-1252' : doc.format.encoding.toUpperCase()
  const list = chars.slice(0, 10).join(' ') + (chars.length > 10 ? ' …' : '')
  return confirmDialog({
    title: 'Save as UTF-8?',
    message: `"${doc.name}" is saved as ${label}, which cannot represent: ${list}\n\nUTF-8 can. Save it as UTF-8 instead?`,
    confirmLabel: 'Save as UTF-8',
  })
}

/** A blank document in a new tab. It is not a file yet: nothing is written until it is saved. */
function newDocument(): void {
  grid.commitEdit()
  const doc = blankDocument(untitledName(tabs.map((t) => t.doc.name)))
  activate(addTab(doc))
}

async function open(): Promise<void> {
  await openDocuments(await openCsv())
}

/** Saves the tab in focus only. The tab is captured up front: the dialog or write may take a while. */
async function save(as: boolean): Promise<void> {
  const tab = current
  if (!tab) return
  grid.commitEdit()
  const encoded = await encodeDocumentAsync(tab.doc, (chars) => confirmUtf8(tab.doc, chars))
  if (!encoded) return
  const saved = await (as ? saveCsvAs(tab.doc, encoded.bytes) : saveCsv(tab.doc, encoded.bytes))
  if (!saved) return
  tab.doc.format = encoded.format
  tab.history.markSaved()
  showMeta(tab === current ? `Saved ${tab.doc.name}` : undefined)
}

function report(err: unknown, title = 'Something went wrong'): void {
  void messageDialog(title, err instanceof Error ? err.message : String(err))
}

// --- menus ------------------------------------------------------------------------------

const actions: Record<string, () => void | Promise<void>> = {
  new: newDocument,
  open,
  save: () => save(false),
  'save-as': () => save(true),
  undo,
  redo,
  'split-side': () => setLayout('side'),
  'split-stacked': () => setLayout('stacked'),
  'single-view': () => setLayout('single'),
  'clear-filters': clearFilters,
  find: () => search.open(),
  'dark-mode': () => {
    toggleTheme()
    showTheme()
  },
}

/** The Dark Mode switch in the menu shows the theme in use. */
function showTheme(): void {
  $('menu-list').querySelector('[data-action=dark-mode]')!.setAttribute('aria-checked', String(currentTheme() === 'dark'))
}
watchTheme(showTheme)

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
  // A switch stays where it is, so the change can be seen; the other entries close the menu.
  if (item.hasAttribute('data-keep-open')) {
    void actions[item.dataset.action!]!()
    return
  }
  setMenu(false)
  Promise.resolve(actions[item.dataset.action!]!()).catch(report).finally(() => grid.focus())
})

/**
 * Insert and delete live in the context menu of row numbers and column headers (D-09), and the menu of
 * a cell has them too, together with cut, copy, paste and clear. They all act on what is selected.
 */
/** Cut, copy, paste and clear, acting on the cells selected (a block, or the whole of the rows or columns chosen). */
function editItems(rect: Rect): MenuItem[] {
  return [
    { label: 'Cut', hint: 'Ctrl+X', run: () => void copyFromMenu(true) },
    { label: 'Copy', hint: 'Ctrl+C', run: () => void copyFromMenu(false) },
    { label: 'Paste', hint: 'Ctrl+V', run: () => void pasteFromMenu() },
    { separator: true },
    { label: 'Clear contents', hint: 'Delete', run: () => clearCells(rect) },
    { separator: true },
  ]
}

function contextItems(tab: Tab, kind: 'rows' | 'cols' | 'corner' | 'cell'): MenuItem[] {
  const table = tab.doc.table
  const v = tab.view
  if (kind === 'corner') return [{ label: 'Insert row at top', run: () => run(insertRows(table, 0, 1)) }]
  if (kind === 'cell') {
    const rect = grid.selection()
    const ids = v.visible.slice(rect.r0, rect.r1 + 1)
    const cols = rect.c1 - rect.c0 + 1
    return [
      ...editItems(rect),
      { label: 'Insert row above', run: () => run(insertRows(table, table.indexOfRow(ids[0]!), 1)) },
      { label: 'Insert row below', run: () => run(insertRows(table, table.indexOfRow(ids[ids.length - 1]!) + 1, 1)) },
      { label: ids.length > 1 ? `Delete ${ids.length} rows` : 'Delete row', run: () => run(deleteRows(ids)) },
      { separator: true },
      { label: 'Insert column left', run: () => run(insertColumn(table, rect.c0)) },
      { label: 'Insert column right', run: () => run(insertColumn(table, rect.c1 + 1)) },
      {
        label: cols > 1 ? `Delete ${cols} columns` : 'Delete column',
        run: () => run(deleteColumns(rect.c0, rect.c1)),
        disabled: cols >= table.columnCount, // a table keeps at least one column
      },
    ]
  }
  if (kind === 'rows') {
    // Rows are chosen among the visible ones; a new row goes next to its neighbour in the whole table.
    const [from, to] = grid.selectedRows()
    const ids = v.visible.slice(from, to + 1)
    return [
      ...editItems(grid.selection()),
      { label: 'Insert row above', run: () => run(insertRows(table, table.indexOfRow(ids[0]!), 1)) },
      { label: 'Insert row below', run: () => run(insertRows(table, table.indexOfRow(ids[ids.length - 1]!) + 1, 1)) },
      { label: ids.length > 1 ? `Delete ${ids.length} rows` : 'Delete row', run: () => run(deleteRows(ids)) },
    ]
  }
  const [from, to] = grid.selectedCols()
  return [
    ...editItems(grid.selection()),
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
    void find(e.shiftKey ? 'previous' : 'next')
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
  // In a split view, the file goes to the pane it was dropped on.
  const target = panes.find((p) => {
    const r = p.el.getBoundingClientRect()
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
  })
  if (target) focusPane(target)
  readDropped(e.dataTransfer!)
    .then(async ({ docs, errors }) => {
      await openDocuments(docs)
      if (errors.length > 0) await messageDialog(errors.length === 1 ? 'A file was not opened' : 'Some files were not opened', errors.join('\n'))
    })
    .catch(report)
})

window.addEventListener('beforeunload', (e) => {
  if (!tabs.some((t) => t.history.dirty)) return
  e.preventDefault()
  e.returnValue = ''
})

showMeta()
focused.empty.querySelector<HTMLElement>('.empty-open')!.focus({ preventScroll: true })

// Test hook for headless runs, where native file pickers cannot be driven.
if (import.meta.env.DEV) {
  const { loadDocument } = await import('./document')
  Object.assign(window, {
    __app: {
      load: (name: string, bytes: Uint8Array) => openDocuments([loadDocument(name, bytes)]),
      get grid() {
        return grid
      },
      setLayout,
      panes: () => panes.map((p) => ({ tab: p.tab?.doc.name, focused: p === focused })),
      getDoc: () => current?.doc,
      getHistory: () => current?.history,
      getView: () => current?.view,
      tabs: () => tabs.map((t) => ({ name: t.doc.name, dirty: t.history.dirty, active: t === current, rows: t.doc.table.rowCount })),
      select: (i: number) => activate(tabs[i]),
      close: (i: number) => closeTab(tabs[i]),
    },
  })
}
