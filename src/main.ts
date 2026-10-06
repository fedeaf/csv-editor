import { changeFormat, deleteColumns, deleteRows, fillCells, insertColumn, insertRows, pasteCells, renameHeader, replaceCells, setCell, setHeaders, sortRows, type Command } from './model/commands'
import { parseTsv, squared, toTsv } from './model/clipboard'
import { blankDocument, encodeDocumentAsync, loadDocument, untitledName, type CsvDocument } from './document'
import { hasFiles, openCsv, readDropped, readSource, saveCsv, saveCsvAs } from './files'
import { DELIMITER_NAMES, encodingLabel } from './model/formatOptions'
import { History, type Outcome } from './model/history'
import type { FileFormat } from './model/table'
import { nextErrorRow } from './model/errors'
import { createMatcher, findAllMatches, findMatch, findReplacements, matchNumber, patternError, type Position, type SearchGrid } from './model/search'
import { TableView, uniqueValues, type ColumnFilter } from './model/view'
import { closeContextMenu, showContextMenu, type MenuItem } from './ui/contextMenu'
import { closeFilterDropdown, showFilterDropdown, type FilterEntry } from './ui/filterDropdown'
import { DEFAULT_COLUMN_WIDTH } from './ui/columns'
import { Grid, type FillRequest, type GridHandlers, type GridModel, type GridState, type Rect } from './ui/grid'
import { confirmDialog, formatDialog, isDialogOpen, messageDialog, saveOrDiscardDialog } from './ui/dialog'
import { createSearchPanel } from './ui/searchPanel'
import { createAccumulator, type Summary } from './model/summary'
import { fileInfo, plural, selectionSummary, summaryText, type SummaryChip } from './ui/status'
import { currentTheme, toggleTheme, watchTheme } from './ui/theme'
import { createDivider } from './ui/splitDivider'
import { createTabBar, placeTab, tabAfterClose } from './ui/tabBar'

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
  matches: { query: string; exact: boolean; regex: boolean; version: number; list: number[] } | undefined
  /** Scroll and selection to restore when the tab is selected again. */
  state: GridState | undefined
  /** In a side-by-side split, the strip (and pane) it belongs to: 0 for the left one, 1 for the right one. */
  side: 0 | 1
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
  el.querySelector('.empty-new')!.addEventListener('click', () => {
    focusPane(pane)
    newDocument()
  })
  new ResizeObserver(alignStrips).observe(el)
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

/**
 * Side by side, each pane has a strip of tabs of its own above it, the right one starting where its
 * pane starts. Every other layout has the one strip, with all the tabs.
 */
const strips = ([0, 1] as const).map((side) =>
  createTabBar($(side === 0 ? 'tabs' : 'tabs-right'), {
    onSelect: (id) => activate(tabs.find((t) => t.id === id)),
    onClose: (id) => void closeTab(tabs.find((t) => t.id === id)),
    onNew: () => {
      if (layout === 'side' && panes[side]) focusPane(panes[side]!)
      newDocument()
    },
    onMenu: (id, x, y) => {
      const tab = tabs.find((t) => t.id === id)
      if (tab) showContextMenu(x, y, tabItems(tab))
    },
    onDropTab: (id, before) => {
      const tab = tabs.find((t) => t.id === id)
      if (tab) moveTab(tab, side, before)
    },
    draggable: () => true,
  }),
)

/** The right-click menu of a tab. */
function tabItems(tab: Tab): MenuItem[] {
  const items: MenuItem[] = []
  if (layout === 'side') {
    items.push({ label: tab.side === 0 ? 'Move to the right panel' : 'Move to the left panel', run: () => moveTab(tab, tab.side === 0 ? 1 : 0) })
    items.push({ separator: true })
  }
  items.push({ label: 'Close', run: () => void closeTab(tab) })
  return items
}

/**
 * Puts a tab before `before` (or at the end) in the strip it is dropped on. Side by side, a tab dropped on the
 * other strip also goes to that pane and is shown there; the pane it leaves shows its neighbour in the
 * strip, or the start screen if there is none.
 */
function moveTab(tab: Tab, side: 0 | 1, before?: number): void {
  const crossing = layout === 'side' && tab.side !== side
  const from = panes[tab.side]
  const group = tabs.filter((t) => t.side === tab.side)
  const nextId = tabAfterClose(group.map((t) => t.id), tab.id, tab.id)
  if (crossing) tab.side = side
  const order = placeTab(tabs.map((t) => t.id), tab.id, before, (id) => layout !== 'side' || tabs.find((t) => t.id === id)!.side === tab.side)
  tabs.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
  if (!crossing) return showMeta()
  if (from?.tab === tab) {
    showIn(from, tabs.find((t) => t.id === nextId && t !== tab))
    if (from === focused) current = from.tab
  }
  activate(tab)
}

/** Keeps the right strip exactly above the right pane. */
function alignStrips(): void {
  const right = $('tabs-right')
  const second = layout === 'side' ? panes[1] : undefined
  right.hidden = !second
  right.style.width = second ? `${second.el.getBoundingClientRect().width}px` : ''
}

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
    isMatch: (row, col) => {
      const tab = tabs.find((t) => t.view === v)
      const list = tab && highlightFor(tab)
      return !!list && matchNumber(list, { row, col }, table.columnCount) > 0
    },
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
  repaintMarks()
  showMeta()
}

/** Shows a tab (or the start screen) in a pane. Whatever was being edited there is applied first. */
function showIn(pane: Pane, tab: Tab | undefined, fresh = false): void {
  pane.grid.commitEdit()
  // `fresh`: the tab holds a new document, so the old scroll and selection mean nothing.
  if (tab && fresh) tab.state = undefined
  else if (pane.tab) pane.tab.state = pane.grid.saveState()
  pane.tab = tab
  if (tab && layout === 'side') tab.side = panes.indexOf(pane) as 0 | 1
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
  // Side by side a tab belongs to one pane, and selecting it goes there; otherwise it goes to the pane in
  // focus, unless the other pane already shows it.
  const home = tab && (layout === 'side' ? panes[tab.side] : panes.find((p) => p !== focused && p.tab === tab))
  if (home && home !== focused) {
    focusPane(home)
    if (home.tab === tab) {
      grid.focus()
      return
    }
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
  // Side by side, the tab each pane shows is in its strip.
  if (next === 'side') panes.forEach((p, i) => p.tab && (p.tab.side = i as 0 | 1))
  alignStrips()
  showMeta()
}

/** Tabs whose "discard changes?" question is on screen, so a second click on × does not ask twice. */
const closing = new Set<Tab>()

async function closeTab(tab: Tab | undefined): Promise<void> {
  if (!tab || closing.has(tab)) return
  panes.find((p) => p.tab === tab)?.grid.commitEdit() // an unfinished edit counts as a change
  if (tab.history.dirty) {
    closing.add(tab)
    const choice = await saveOrDiscardDialog({
      title: `Close "${tab.doc.name}"?`,
      message: 'It has unsaved changes. Save them, or they will be lost if you close it.',
      discardLabel: 'Close and discard',
    })
    // Saving can still be given up (the Save As window cancelled), and then the tab stays open.
    const saved = choice === 'save' && tabs.includes(tab) ? await saveTab(tab, false).catch((e) => (report(e), false)) : false
    closing.delete(tab)
    if (choice === 'cancel' || (choice === 'save' && !saved) || !tabs.includes(tab)) {
      if (current) grid.focus() // back to the table, not to the × that was clicked
      return
    }
  }
  if (layout === 'side') {
    // The pane that showed it goes on to the next tab of its own strip, or to the start screen.
    const pane = panes.find((p) => p.tab === tab)
    const group = tabs.filter((t) => t.side === tab.side)
    const nextId = tabAfterClose(group.map((t) => t.id), tab.id, pane ? tab.id : undefined)
    tabs.splice(tabs.indexOf(tab), 1)
    const next = tabs.find((t) => t.id === nextId)
    if (!pane) showMeta()
    else if (pane === focused) activate(next)
    else {
      showIn(pane, next)
      showMeta()
    }
    return
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
  const tab: Tab = { id: nextTabId++, doc, view: new TableView(doc.table), history: new History(), lastMatch: undefined, lastError: undefined, version: 0, matches: undefined, state: undefined, side: (panes.indexOf(focused) === 1 ? 1 : 0) }
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

/** What the selected cells hold, once counted; `key` says which selection and which state of the cells it is for. */
let selectionStats: { key: string; summary: Summary } | undefined
let summaryToken = 0
let summaryTimer: number | undefined
const SYNC_CELLS = 5000 // up to here the count is made on the spot, with no pause

/**
 * Counts the cells of `rect`. A big selection is counted a slice at a time so the page stays usable,
 * and a new selection (or a change in the cells) abandons the count in progress.
 */
function summarize(tab: Tab, rect: Rect, key: string): void {
  const token = ++summaryToken
  window.clearTimeout(summaryTimer)
  const acc = createAccumulator()
  const table = tab.doc.table
  let row = rect.r0
  const slice = (budget: number) => {
    const started = performance.now()
    while (row <= rect.r1 && performance.now() - started < budget) {
      const cells = table.rowById(tab.view.visible[row++]!)!.cells
      for (let c = rect.c0; c <= rect.c1; c++) acc.add(cells[c] ?? '')
    }
  }
  const finish = () => {
    selectionStats = { key, summary: acc.result() }
  }
  if ((rect.r1 - rect.r0 + 1) * (rect.c1 - rect.c0 + 1) <= SYNC_CELLS) {
    slice(Infinity)
    return finish() // the caller is showing the status bar and picks the result up
  }
  const step = () => {
    if (token !== summaryToken) return
    slice(12)
    if (row <= rect.r1) {
      summaryTimer = window.setTimeout(step)
    } else {
      finish()
      if (tab === current) showActivity()
    }
  }
  summaryTimer = window.setTimeout(step, 100) // not while the selection is still being dragged out
}

/** Left side of the status bar: the message of the last action while it lasts, else the selection and what it holds. */
function showActivity(): void {
  const activity = $('status-activity')
  let text = statusMessage?.text ?? ''
  let detail = ''
  let chips: SummaryChip[] = []
  if (!statusMessage && current) {
    const rect = grid.selection()
    text = selectionSummary(rect, current.view.rowCount)
    if (text) {
      const key = `${current.id}:${current.version}:${rect.r0},${rect.r1},${rect.c0},${rect.c1}`
      if (selectionStats?.key !== key && key !== pendingKey) {
        pendingKey = key
        summarize(current, rect, key)
      }
      if (selectionStats?.key === key) {
        const stats = summaryText(selectionStats.summary)
        chips = stats.chips
        detail = stats.detail
      }
    }
  }
  // The selection in plain text, then each figure about it as a small coloured label.
  const label = Object.assign(document.createElement('span'), { className: 'st-selection', textContent: text })
  activity.replaceChildren(label, ...chips.map((c) => Object.assign(document.createElement('span'), { className: `st-chip ${c.tone}`, textContent: c.text })))
  activity.title = detail
  activity.classList.toggle('message', !!statusMessage)
  activity.classList.toggle('neutral', !!statusMessage?.neutral)
}

/** The selection being counted now, so that showing the status bar again does not start the count over. */
let pendingKey = ''

/**
 * Tab strip, window title, status bar and menu state, all for the tab in focus. A `message` is the
 * result of an action ("Saved", "Pasted"); without one, any earlier message is cleared.
 */
function showMeta(message?: string, neutral = false): void {
  if (layout === 'side') {
    strips.forEach((strip, side) =>
      strip.render(
        tabs
          .filter((t) => t.side === side)
          .map((t) => ({ id: t.id, label: t.doc.name, dirty: t.history.dirty, active: t === panes[side]?.tab, dim: panes[side] !== focused })),
      ),
    )
  } else {
    strips[0]!.render(tabs.map((t) => ({ id: t.id, label: t.doc.name, dirty: t.history.dirty, active: t === current, shown: t === otherTab() })))
    strips[1]!.render([])
  }
  const tab = current
  // The browser tab keeps the name of the app whatever is open. Its asterisk (ARC-05) says that some
  // document has unsaved changes; which one is shown by the asterisk in the strip of tabs.
  document.title = `${tabs.some((t) => t.history.dirty) ? '* ' : ''}CSV Editor`
  const item = (action: string) => $('menu-list').querySelector(`[data-action=${action}]`)!
  item('undo').classList.toggle('disabled', !tab?.history.canUndo)
  item('redo').classList.toggle('disabled', !tab?.history.canRedo)
  item('save').classList.toggle('disabled', !tab)
  item('save-as').classList.toggle('disabled', !tab)
  item('format').classList.toggle('disabled', !tab)
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
function applyOutcome(tab: Tab, { command, cursor }: Outcome, message?: string): void {
  tab.lastError = undefined // rows may have moved or errors been fixed: the next walk starts from the top
  tab.version++
  tab.view.stats.invalidate(command.invalidates)
  const target = cursor ?? {}
  tab.view.afterChange(target.reveal)
  grid.refresh()
  const at = target.rowId === undefined ? -1 : tab.view.indexOfId(target.rowId)
  const active = grid.activeCell
  grid.setActive(at >= 0 ? at : active.row, target.col ?? active.col)
  showMeta(message)
}

function run(command: Command): void {
  if (current) applyOutcome(current, current.history.execute(command, current.doc.table))
}

/** Undo and redo say what they undid or redid, since the change may be out of sight. */
function undo(): void {
  const tab = current
  if (!tab) return
  const outcome = tab.history.undo(tab.doc.table)
  if (outcome) applyOutcome(tab, outcome, `Undone: ${outcome.command.label}`)
  else showMeta('Nothing to undo', true)
}
function redo(): void {
  const tab = current
  if (!tab) return
  const outcome = tab.history.redo(tab.doc.table)
  if (outcome) applyOutcome(tab, outcome, `Redone: ${outcome.command.label}`)
  else showMeta('Nothing to redo', true)
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
  const command = fillCells(current.doc.table, cellsIn(current, rect), '', 'Clear contents')
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
/** Puts the names of the headers of columns `from` to `to` on the clipboard as one line, to paste them in another file. */
async function copyHeaders(from: number, to: number): Promise<void> {
  const tab = current
  if (!tab) return
  const names = tab.doc.table.headers.slice(from, to + 1)
  try {
    await navigator.clipboard.writeText(toTsv([names]))
  } catch {
    report(new Error('The browser did not let the page write to the clipboard.'), 'Could not copy')
    return
  }
  showMeta(`Copied ${plural(names.length, 'header')}`)
}

/** Takes the first line of the clipboard as header names and gives them to the columns from `col` on, adding columns if they run out. */
async function pasteHeaders(col: number): Promise<void> {
  const tab = current
  if (!tab) return
  let text: string
  try {
    text = await navigator.clipboard.readText()
  } catch {
    report(new Error('The browser did not let the page read the clipboard.'), 'Could not paste')
    return
  }
  const names = parseTsv(text)[0]
  const command = names && setHeaders(tab.doc.table, col, names)
  if (!command) return showMeta('The headers are already those', true)
  const columnsBefore = tab.doc.table.columnCount
  run(command)
  const added = tab.doc.table.columnCount - columnsBefore
  grid.selectRange(0, col, tab.view.rowCount - 1, col + names.length - 1, false)
  showMeta(`Pasted ${plural(names.length, 'header')}${added > 0 ? ` (added ${plural(added, 'column')})` : ''}`)
}

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
    const command = fillCells(table, cellsIn(tab, rect), block[0]![0]!, 'Paste')
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
  // The view stays where it was: a pasted column can be far longer than the screen.
  grid.selectRange(rect.r0, rect.c0, rect.r0 + height - 1, rect.c0 + width - 1, false)
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
  onSearch: () => {
    void find('first')
    repaintMarks()
  },
  onOpen: () => repaintMarks(),
  onStep: (direction) => void find(direction === 1 ? 'next' : 'previous'),
  onReplace: replaceCurrent,
  onReplaceAll: replaceAll,
  onClose: () => {
    repaintMarks()
    grid.focus()
  },
})
search.mount(focused.body)

/** The cells a search looks at: the rows shown in a tab. */
function searchGrid(tab: Tab): SearchGrid {
  const { table } = tab.doc
  const v = tab.view
  return { rowCount: v.rowCount, colCount: table.columnCount, cell: (r, c) => table.rowById(v.visible[r]!)!.cells[c]! }
}

/** All the matches of the search, counted once and reused until the cells or the rows shown change. */
function matchesOf(tab: Tab, query: string, mode: { exact: boolean; regex: boolean }): number[] {
  const cached = tab.matches
  if (cached && cached.query === query && cached.exact === mode.exact && cached.regex === mode.regex && cached.version === tab.version) return cached.list
  const list = findAllMatches(searchGrid(tab), query, mode)
  tab.matches = { query, ...mode, version: tab.version, list }
  return list
}

/** The matches to draw marked in a tab: those of the open Find panel, only for the document in focus. */
let highlight: { tab: Tab; key: string; list: number[] | undefined } | undefined

function highlightFor(tab: Tab): number[] | undefined {
  if (tab !== current || !search.isOpen || search.query === '') return undefined
  const key = `${search.query}\0${search.exact}\0${search.regex}\0${tab.version}`
  if (highlight?.tab === tab && highlight.key === key) return highlight.list
  const list = patternError(search.query, search.regex) === undefined ? matchesOf(tab, search.query, searchMode()) : undefined
  highlight = { tab, key, list }
  return list
}

/** Marks again, in every pane, the cells that Find has matched. */
function repaintMarks(): void {
  for (const pane of panes) pane.grid.repaintMarks()
}

/** How the Find panel asks to read the text to find. */
function searchMode(): { exact: boolean; regex: boolean } {
  return { exact: search.exact, regex: search.regex }
}

/** Says so in the panel and returns true when the text is a regular expression that is not valid. */
function invalidPattern(query: string): boolean {
  const error = patternError(query, search.regex)
  if (error !== undefined) search.setMessage('Invalid pattern', true, `Invalid regular expression: ${error}`)
  return error !== undefined
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
  if (invalidPattern(query)) {
    tab.lastMatch = undefined
    return false
  }
  grid.commitEdit()
  const { table } = tab.doc
  const v = tab.view
  const match = findMatch(
    searchGrid(tab),
    query,
    searchMode(),
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
  grid.flashActive()
  const list = matchesOf(tab, query, searchMode())
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
  if (!tab || query === '' || invalidPattern(query)) return
  grid.commitEdit()
  const { table } = tab.doc
  const { row, col } = grid.activeCell
  const rowId = tab.view.idAt(row)
  let replaced = false
  if (rowId !== undefined) {
    const matcher = createMatcher(query, searchMode())
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
  if (!tab || query === '' || invalidPattern(query)) return
  grid.commitEdit()
  const { table } = tab.doc
  const v = tab.view
  const shown = searchGrid(tab)
  const changes = findReplacements(shown, query, searchMode(), search.replacement)
  if (changes.length === 0) {
    const anyMatch = findMatch(shown, query, searchMode())
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
    showMeta(hidden > 0 ? `${plural(hidden, 'flagged cell')} in this column ${hidden === 1 ? 'is' : 'are'} in rows hidden by a filter` : 'No spreadsheet errors or scientific notation in this column', true)
    return
  }
  tab.lastError = { colId, row: stop.row }
  grid.setActive(stop.row, col)
  grid.flashActive()
  grid.focus()
  const name = table.headers[col] || `column ${col + 1}`
  showMeta(`Warning ${stop.index} of ${stop.total} in "${name}": ${cell(stop.row).trim()}${stop.wrapped ? ' (back at the first)' : ''}`, true)
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
  if (blanks > 0) entries.unshift({ value: '', label: '-[ Blanks ]-', count: blanks }) // first, in brackets so it cannot be taken for a value
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
  if (current) await saveTab(current, as)
}

/** Saves one tab, which need not be the one in focus. False if nothing was written (cancelled, or declined UTF-8). */
async function saveTab(tab: Tab, as: boolean): Promise<boolean> {
  const holder = panes.find((p) => p.tab === tab)
  ;(holder ? holder.grid : grid).commitEdit()
  const encoded = await encodeDocumentAsync(tab.doc, (chars) => confirmUtf8(tab.doc, chars))
  if (!encoded) return false
  const saved = await (as ? saveCsvAs(tab.doc, encoded.bytes) : saveCsv(tab.doc, encoded.bytes))
  if (!saved) return false
  tab.doc.format = encoded.format
  tab.history.markSaved()
  showMeta(tab === current ? `Saved ${tab.doc.name}` : undefined)
  return true
}

/** True when two formats write a document the same way. */
const sameFormat = (a: FileFormat, b: FileFormat) =>
  a.encoding === b.encoding && a.bom === b.bom && a.delimiter === b.delimiter && a.lineEnding === b.lineEnding && a.quoteAll === b.quoteAll

/**
 * The File Format dialog. "Reload file" reads the file again with the encoding and delimiter chosen,
 * for when detection got them wrong; "Use when saving" keeps the cells and changes how the file is
 * written, as an undoable change.
 */
async function chooseFormat(): Promise<void> {
  const tab = current
  if (!tab) return
  grid.commitEdit()
  const answer = await formatDialog(tab.doc.name, tab.doc.format, !!(tab.doc.handle || tab.doc.source))
  if (!answer || !tabs.includes(tab)) return
  const describe = (f: FileFormat) => `${encodingLabel(f)}, ${DELIMITER_NAMES[f.delimiter]}-delimited${f.quoteAll ? ', all fields quoted' : ''}`
  if (answer.action === 'save') {
    if (sameFormat(answer.format, tab.doc.format)) return showMeta('The format is already that one', true)
    applyOutcome(tab, tab.history.execute(changeFormat(tab.doc, answer.format), tab.doc.table))
    return showMeta(`Will be saved as ${describe(answer.format)}`)
  }
  if (tab.history.dirty) {
    const discard = await confirmDialog({
      title: `Reload "${tab.doc.name}"?`,
      message: 'It has unsaved changes. If you reload it, they will be lost.',
      confirmLabel: 'Reload and discard',
      danger: true,
    })
    if (!discard || !tabs.includes(tab)) return
  }
  const doc = loadDocument(tab.doc.name, await readSource(tab.doc), tab.doc.handle, answer.format)
  if (!tabs.includes(tab)) return
  Object.assign(tab, { doc, view: new TableView(doc.table), history: new History(), lastMatch: undefined, lastError: undefined, matches: undefined })
  tab.version++
  for (const pane of panes) if (pane.tab === tab) showIn(pane, tab, true)
  showMeta(`Reloaded as ${describe(doc.format)}`)
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
  format: chooseFormat,
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
  if (kind === 'corner') {
    return [
      { label: 'Copy all headers', run: () => void copyHeaders(0, table.columnCount - 1) },
      { label: 'Paste headers', run: () => void pasteHeaders(0) },
      { separator: true },
      { label: 'Insert row at top', run: () => run(insertRows(table, 0, 1)) },
    ]
  }
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
    { label: from === to ? 'Copy header' : 'Copy headers', run: () => void copyHeaders(from, to) },
    { label: 'Paste headers', run: () => void pasteHeaders(from) },
    { separator: true },
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
