import { clampWidth, columnAt, columnOffsets, fitWidth, longestStrings } from './columns'

const ROW_HEIGHT = 26
const HEADER_HEIGHT = 28
const ROW_NUMBER_WIDTH = 72
const BUFFER_ROWS = 10
const EDITOR_LINE_HEIGHT = 18

/** What the grid shows. Rows are display positions: filtered-out rows do not exist here. */
export interface GridModel {
  headers: string[]
  rowCount: number
  cells(row: number): string[]
  /** Number shown for the row: its position in the whole table, so filtering leaves gaps. */
  rowNumber(row: number): number
  column(col: number): ColumnInfo
  /** Width in pixels of a column, as the user left it. */
  columnWidth(col: number): number
}

export interface ColumnInfo {
  sort: 'asc' | 'desc' | undefined
  filtered: boolean
  /** Distinct values that repeat in the column, and how many rows hold them. */
  duplicateValues: number
  duplicateRows: number
}

/** A fill from the cell (row, col) to (toRow, toCol): the same row or the same column. */
export interface FillRequest {
  row: number
  col: number
  toRow: number
  toCol: number
}

/** A block of cells, inclusive on all sides, in display rows and columns. */
export interface Rect {
  r0: number
  c0: number
  r1: number
  c1: number
}

/** Where the user was in a document: restored when its tab is selected again. */
export interface GridState {
  scrollTop: number
  scrollLeft: number
  active: { row: number; col: number }
  extent: { row: number; col: number } | null
}

export interface GridHandlers {
  onFill(fill: FillRequest): void
  /** The selection moved, grew or shrank. */
  onSelectionChange(): void
  /** A column was dragged (or fitted) to a new width: the owner keeps it. */
  onColumnResize(col: number, width: number): void
  /** Delete or Backspace over the selection. */
  onClear(rect: Rect): void
  onSort(col: number, dir: 'asc' | 'desc'): void
  onFilter(col: number, anchor: HTMLElement): void
  onDuplicates(col: number): void
  onCellEdit(row: number, col: number, value: string): void
  onHeaderEdit(col: number, value: string): void
  /** The grid has already selected what was clicked. */
  onContextMenu(kind: 'rows' | 'cols' | 'corner', clientX: number, clientY: number): void
}

/** Whole rows or whole columns selected by their number or header; `end` is the moving side. */
interface Band {
  type: 'rows' | 'cols'
  anchor: number
  end: number
}

type Pos = { row: number; col: number }

interface Editing {
  kind: 'cell' | 'header'
  row: number
  col: number
  original: string
  input: HTMLTextAreaElement
}

type Hit =
  | { zone: 'corner' }
  | { zone: 'header'; col: number }
  | { zone: 'rowNumber'; row: number }
  | { zone: 'cell'; row: number; col: number }

/**
 * Virtualized grid: only the rows in view plus a buffer exist in the DOM.
 * Rows are positioned by index, so row `i` is always at `i * ROW_HEIGHT`.
 * Cells are located from mouse coordinates, so they carry no per-cell listeners or attributes.
 */
export class Grid {
  private scroller: HTMLElement
  private header: HTMLElement
  private body: HTMLElement
  private model: GridModel | undefined
  private rendered = new Map<number, HTMLElement>()
  /** Width of each column, and the left edge of each (counted from the first column) with the total last. */
  private widths: number[] = []
  private offsets: number[] = [0]
  private frame = 0
  private active = { row: 0, col: 0 }
  /** The other corner of a cell selection: the block runs from `active` to `extent`. */
  private extent: Pos | null = null
  private band: Band | null = null
  private editing: Editing | null = null
  /** Selecting by dragging with the mouse; `moved` keeps a plain click from scrolling. */
  private selDrag: { mode: 'cells' | 'rows' | 'cols'; x: number; y: number; originX: number; originY: number; moved: boolean; frame: number } | null =
    null
  private fillHandle: HTMLElement
  private fillPreview: HTMLElement
  private drag: {
    row: number
    col: number
    target: { row: number; col: number }
    /** Pointer position in the viewport, and where the drag began in grid coordinates. */
    x: number
    y: number
    originX: number
    originY: number
    /** Set once the pointer really moved: a click or double-click on the handle must not scroll. */
    moved: boolean
    frame: number
  } | null = null

  constructor(
    host: HTMLElement,
    private handlers: GridHandlers,
  ) {
    this.scroller = el('div', 'grid-scroller')
    this.scroller.tabIndex = 0
    this.header = el('div', 'grid-header')
    this.body = el('div', 'grid-body')
    this.fillHandle = el('div', 'fill-handle')
    this.fillHandle.title = 'Drag to copy the value. Double-click to copy it down the column.'
    this.fillPreview = el('div', 'fill-preview')
    this.fillHandle.hidden = this.fillPreview.hidden = true
    this.body.append(this.fillHandle, this.fillPreview)
    this.scroller.append(this.header, this.body)
    host.append(this.scroller)

    host.style.setProperty('--row-number-width', `${ROW_NUMBER_WIDTH}px`)
    this.header.addEventListener('click', (e) => this.onHeaderClick(e))
    this.scroller.addEventListener('scroll', () => this.scheduleRender())
    this.scroller.addEventListener('mousedown', (e) => this.onMouseDown(e))
    this.scroller.addEventListener('dblclick', (e) => this.onDoubleClick(e))
    this.scroller.addEventListener('contextmenu', (e) => this.onContextMenu(e))
    this.scroller.addEventListener('keydown', (e) => this.onKeyDown(e))
    new ResizeObserver(() => this.scheduleRender()).observe(host)
  }

  // --- public API -------------------------------------------------------------------------

  /** Shows another document, at `state` if it was open before, else at the top left. */
  setModel(model: GridModel | undefined, state?: GridState): void {
    this.commitEdit()
    this.model = model
    this.active = state ? { ...state.active } : { row: 0, col: 0 }
    this.extent = state?.extent ? { ...state.extent } : null
    this.band = null
    this.scroller.scrollTo(0, 0)
    this.refresh()
    if (state) this.scroller.scrollTo(state.scrollLeft, state.scrollTop)
  }

  saveState(): GridState {
    return {
      scrollTop: this.scroller.scrollTop,
      scrollLeft: this.scroller.scrollLeft,
      active: { ...this.active },
      extent: this.extent && { ...this.extent },
    }
  }

  /** Re-lays out header and rows after the data changed, keeping the scroll position. */
  refresh(): void {
    const model = this.model
    for (const node of this.rendered.values()) node.remove()
    this.rendered.clear()
    this.header.replaceChildren()
    this.widths = model ? model.headers.map((_, c) => clampWidth(model.columnWidth(c))) : []
    this.layoutColumns()
    if (model) {
      const columns = model.headers.length
      this.header.style.height = `${HEADER_HEIGHT}px`
      this.body.style.height = `${model.rowCount * ROW_HEIGHT}px`
      this.header.append(cell('row-number', ''))
      model.headers.forEach((name, col) => this.header.append(this.buildHeaderCell(col, name, model.column(col))))
      this.active = {
        row: clamp(this.active.row, model.rowCount - 1),
        col: clamp(this.active.col, columns - 1),
      }
      if (this.extent) {
        this.extent = { row: clamp(this.extent.row, model.rowCount - 1), col: clamp(this.extent.col, columns - 1) }
      }
    }
    this.band = null
    this.paintHeader()
    this.placeFillHandle()
    this.scheduleRender()
  }

  /** Applies the column widths: one template shared by the header and every row. */
  private layoutColumns(): void {
    this.offsets = columnOffsets(this.widths)
    const total = ROW_NUMBER_WIDTH + this.offsets[this.offsets.length - 1]!
    this.header.style.width = this.body.style.width = `${total}px`
    this.scroller.style.setProperty('--grid-cols', `${ROW_NUMBER_WIDTH}px ${this.widths.map((w) => `${w}px`).join(' ')}`)
  }

  private colLeft(col: number): number {
    return ROW_NUMBER_WIDTH + (this.offsets[col] ?? 0)
  }

  private colWidth(col: number): number {
    return this.widths[col] ?? 0
  }

  /** The column at a horizontal position counted from the left of the grid content; -1 outside the columns. */
  private colAtX(x: number): number {
    const gx = x - ROW_NUMBER_WIDTH
    if (gx < 0 || gx >= this.offsets[this.offsets.length - 1]!) return -1
    return columnAt(this.offsets, gx)
  }

  /** The active cell, as display row and column. */
  get activeCell(): { row: number; col: number } {
    return { ...this.active }
  }

  get isEditing(): boolean {
    return this.editing !== null
  }

  /** The selected block: whole rows or columns, a dragged or Shift-extended block, or the active cell. */
  selection(): Rect {
    const model = this.model
    const lastRow = Math.max(0, (model?.rowCount ?? 1) - 1)
    const lastCol = Math.max(0, (model?.headers.length ?? 1) - 1)
    const band = this.band
    if (band) {
      const [from, to] = bandRange(band)
      return band.type === 'rows' ? { r0: from, r1: to, c0: 0, c1: lastCol } : { r0: 0, r1: lastRow, c0: from, c1: to }
    }
    const e = this.extent ?? this.active
    return {
      r0: Math.min(this.active.row, e.row),
      r1: Math.max(this.active.row, e.row),
      c0: Math.min(this.active.col, e.col),
      c1: Math.max(this.active.col, e.col),
    }
  }

  /** Selects a block, with the cursor at its top-left cell (used to show what a paste filled). */
  selectRange(r0: number, c0: number, r1: number, c1: number): void {
    const model = this.model
    if (!model || model.rowCount === 0) return
    this.active = { row: clamp(r0, model.rowCount - 1), col: clamp(c0, model.headers.length - 1) }
    this.extent = { row: clamp(r1, model.rowCount - 1), col: clamp(c1, model.headers.length - 1) }
    this.band = null
    this.ensureVisible(this.extent.row, this.extent.col)
    this.paint()
  }

  /** Inclusive range of selected rows. */
  selectedRows(): [number, number] {
    const { r0, r1 } = this.selection()
    return [r0, r1]
  }

  selectedCols(): [number, number] {
    const { c0, c1 } = this.selection()
    return [c0, c1]
  }

  setActive(row: number, col: number, scroll = true): void {
    const model = this.model
    if (!model) return
    this.active = { row: clamp(row, model.rowCount - 1), col: clamp(col, model.headers.length - 1) }
    this.extent = null
    this.band = null
    if (scroll) this.ensureVisible(this.active.row, this.active.col)
    this.paint()
  }

  focus(): void {
    this.scroller.focus({ preventScroll: true })
  }

  /** Number of row elements currently in the DOM (exposed for tests). */
  get renderedRowCount(): number {
    return this.rendered.size
  }

  startHeaderEdit(col: number): void {
    const model = this.model
    if (!model || col < 0 || col >= model.headers.length) return
    this.commitEdit()
    this.ensureVisible(this.active.row, col)
    const original = model.headers[col]!
    const input = this.createEditor(original)
    input.style.top = '0'
    input.style.left = `${this.colLeft(col)}px`
    input.style.width = `${this.colWidth(col)}px`
    input.style.height = `${HEADER_HEIGHT}px`
    this.header.append(input)
    this.editing = { kind: 'header', row: 0, col, original, input }
    this.focusEditor(input, original.length)
  }

  /** Applies the edit in progress, if any. */
  commitEdit(): void {
    this.finishEdit(true)
  }

  // --- editing ----------------------------------------------------------------------------

  private startCellEdit(replace: boolean): void {
    const model = this.model
    if (!model || model.rowCount === 0 || model.headers.length === 0) return
    this.commitEdit()
    const { row, col } = this.active
    this.ensureVisible(row, col)
    const original = model.cells(row)[col]!
    const input = this.createEditor(replace ? '' : original)
    input.style.top = `${row * ROW_HEIGHT}px`
    input.style.left = `${this.colLeft(col)}px`
    input.style.width = `${this.colWidth(col)}px`
    this.body.append(input)
    this.editing = { kind: 'cell', row, col, original, input }
    this.placeFillHandle()
    this.focusEditor(input, input.value.length)
    this.fitEditor(input)
  }

  private createEditor(value: string): HTMLTextAreaElement {
    const input = document.createElement('textarea')
    input.className = 'cell-editor'
    input.wrap = 'off'
    input.spellcheck = false
    input.value = value
    input.addEventListener('keydown', (e) => this.onEditorKeyDown(e))
    input.addEventListener('input', () => this.fitEditor(input))
    input.addEventListener('blur', () => this.finishEdit(true))
    return input
  }

  private focusEditor(input: HTMLTextAreaElement, caret: number): void {
    input.focus({ preventScroll: true })
    input.setSelectionRange(caret, caret)
  }

  /** Grows the editor with the number of lines (cells can hold line breaks). */
  private fitEditor(input: HTMLTextAreaElement): void {
    if (this.editing?.kind !== 'cell') return
    const lines = input.value.split('\n').length
    input.style.height = `${Math.max(ROW_HEIGHT, lines * EDITOR_LINE_HEIGHT + 8)}px`
  }

  private finishEdit(commit: boolean): void {
    const editing = this.editing
    if (!editing) return
    this.editing = null // first, so the blur caused by removing the editor does not re-enter
    this.placeFillHandle()
    const { input, original, kind, row, col } = editing
    let value = input.value
    input.remove()
    if (!commit) return
    // A textarea normalizes CRLF to LF; keep the cell's own line breaks if it used CRLF.
    if (value === original.replaceAll('\r\n', '\n')) return
    if (original.includes('\r\n')) value = value.replace(/\r?\n/g, '\r\n')
    if (kind === 'cell') this.handlers.onCellEdit(row, col, value)
    else this.handlers.onHeaderEdit(col, value)
  }

  private onEditorKeyDown(e: KeyboardEvent): void {
    const editing = this.editing
    if (!editing) return
    if (e.ctrlKey || e.metaKey) return // Ctrl+S and friends reach the document; Ctrl+Z stays with the text
    const isCell = editing.kind === 'cell'
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        this.finishEdit(false)
        this.focus()
        return
      case 'Enter':
        e.preventDefault()
        if (e.altKey) {
          const input = editing.input
          input.setRangeText('\n', input.selectionStart, input.selectionEnd, 'end')
          this.fitEditor(input)
          return
        }
        this.finishEdit(true)
        this.focus()
        if (isCell) this.move(e.shiftKey ? -1 : 1, 0)
        return
      case 'Tab':
        e.preventDefault()
        this.finishEdit(true)
        this.focus()
        if (isCell) this.move(0, e.shiftKey ? -1 : 1)
        return
    }
  }

  // --- keyboard and mouse -----------------------------------------------------------------

  private onKeyDown(e: KeyboardEvent): void {
    const model = this.model
    if (!model || this.editing || e.target !== this.scroller) return
    const handled = (): void => e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+arrow jumps to the edge of the table, in the rows shown; with Shift it selects up to
      // that edge. Ctrl+A selects everything. Other application shortcuts (Ctrl+S, Ctrl+F, Ctrl+C...)
      // are handled at the document.
      if (e.altKey) return
      const lastRow = model.rowCount - 1
      const lastCol = model.headers.length - 1
      if (e.shiftKey) {
        switch (e.key) {
          case 'ArrowUp': return handled(), this.extendTo(0, undefined)
          case 'ArrowDown': return handled(), this.extendTo(lastRow, undefined)
          case 'ArrowLeft': return handled(), this.extendTo(undefined, 0)
          case 'ArrowRight': return handled(), this.extendTo(undefined, lastCol)
        }
        return
      }
      switch (e.key) {
        case 'ArrowUp': return handled(), this.setActive(0, this.active.col)
        case 'ArrowDown': return handled(), this.setActive(lastRow, this.active.col)
        case 'ArrowLeft': return handled(), this.setActive(this.active.row, 0)
        case 'ArrowRight': return handled(), this.setActive(this.active.row, lastCol)
        case 'a':
        case 'A':
          return handled(), this.selectRange(0, 0, lastRow, lastCol)
      }
      return
    }
    if (e.shiftKey) {
      // Shift+arrow grows the selection by one cell (or one row or column of a selected line).
      switch (e.key) {
        case 'ArrowUp': return handled(), this.extendBy(-1, 0)
        case 'ArrowDown': return handled(), this.extendBy(1, 0)
        case 'ArrowLeft': return handled(), this.extendBy(0, -1)
        case 'ArrowRight': return handled(), this.extendBy(0, 1)
      }
    }
    const page = Math.max(1, Math.floor((this.scroller.clientHeight - HEADER_HEIGHT) / ROW_HEIGHT) - 1)
    switch (e.key) {
      case 'ArrowUp': return handled(), this.move(-1, 0)
      case 'ArrowDown': return handled(), this.move(1, 0)
      case 'ArrowLeft': return handled(), this.move(0, -1)
      case 'ArrowRight': return handled(), this.move(0, 1)
      case 'Enter': return handled(), this.move(e.shiftKey ? -1 : 1, 0)
      case 'Tab': return handled(), this.move(0, e.shiftKey ? -1 : 1)
      case 'PageUp': return handled(), this.move(-page, 0)
      case 'PageDown': return handled(), this.move(page, 0)
      case 'Home': return handled(), this.setActive(this.active.row, 0)
      case 'End': return handled(), this.setActive(this.active.row, model.headers.length - 1)
      case 'F2': return handled(), this.startCellEdit(false)
      case 'Escape':
        this.band = null
        this.extent = null
        return this.paint()
      case 'Delete':
      case 'Backspace':
        handled()
        if (model.rowCount > 0 && model.headers.length > 0) this.handlers.onClear(this.selection())
        return
    }
    // Typing starts an edit that replaces the content. The key is not cancelled: the editor takes
    // focus now, so the browser delivers the character (including dead keys such as ´) to it.
    const altGraph = e.getModifierState('AltGraph')
    if ((e.key.length === 1 && (!e.altKey || altGraph)) || e.key === 'Dead' || e.key === 'Process') {
      this.startCellEdit(true)
    }
  }

  private move(dRow: number, dCol: number): void {
    this.setActive(this.active.row + dRow, this.active.col + dCol)
  }

  /** Moves the free corner of the selection by one step (Shift+arrow). */
  private extendBy(dRow: number, dCol: number): void {
    const model = this.model
    if (!model || model.rowCount === 0) return
    const band = this.band
    if (band) {
      // A selected line grows along its own direction only.
      if ((band.type === 'rows') !== (dRow !== 0)) return
      band.end = clamp(band.end + (dRow || dCol), (band.type === 'rows' ? model.rowCount : model.headers.length) - 1)
      this.ensureVisible(band.type === 'rows' ? band.end : this.active.row, band.type === 'cols' ? band.end : this.active.col)
      this.paint()
      return
    }
    const from = this.extent ?? this.active
    this.extendTo(from.row + dRow, from.col + dCol)
  }

  /** Moves the free corner of the selection to a row and/or column, keeping the other as it is. */
  private extendTo(row: number | undefined, col: number | undefined): void {
    const model = this.model
    if (!model || model.rowCount === 0) return
    const band = this.band
    if (band) {
      const target = band.type === 'rows' ? row : col
      if (target === undefined) return
      band.end = clamp(target, (band.type === 'rows' ? model.rowCount : model.headers.length) - 1)
      this.ensureVisible(band.type === 'rows' ? band.end : this.active.row, band.type === 'cols' ? band.end : this.active.col)
      this.paint()
      return
    }
    const from = this.extent ?? this.active
    this.extent = {
      row: clamp(row ?? from.row, model.rowCount - 1),
      col: clamp(col ?? from.col, model.headers.length - 1),
    }
    this.ensureVisible(this.extent.row, this.extent.col)
    this.paint()
  }

  private hit(e: MouseEvent): Hit | undefined {
    const model = this.model
    if (!model) return
    const box = this.scroller.getBoundingClientRect()
    const x = e.clientX - box.left
    const y = e.clientY - box.top
    if (x >= this.scroller.clientWidth || y >= this.scroller.clientHeight) return // scrollbars
    const inRowNumber = x < ROW_NUMBER_WIDTH
    const col = this.colAtX(x + this.scroller.scrollLeft)
    if (y < HEADER_HEIGHT) {
      if (inRowNumber) return { zone: 'corner' }
      return col >= 0 ? { zone: 'header', col } : undefined
    }
    const row = Math.floor((y + this.scroller.scrollTop - HEADER_HEIGHT) / ROW_HEIGHT)
    if (row >= model.rowCount) return
    if (inRowNumber) return { zone: 'rowNumber', row }
    return col >= 0 ? { zone: 'cell', row, col } : undefined
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0 || e.target === this.editing?.input) return
    if (e.target === this.fillHandle) return this.startFill(e)
    this.commitEdit()
    const resizer = (e.target as Element).closest<HTMLElement>('[data-role=resize]')
    if (resizer) return this.startResize(e, Number(resizer.closest<HTMLElement>('.header-cell')!.dataset.col))
    if ((e.target as Element).closest('[data-role]')) return // header buttons act on click
    const hit = this.hit(e)
    if (!hit) return
    switch (hit.zone) {
      case 'cell':
        if (e.shiftKey) this.extendTo(hit.row, hit.col)
        else this.setActive(hit.row, hit.col)
        this.startSelectDrag('cells', e)
        break
      case 'rowNumber':
        this.selectBand('rows', hit.row, e.shiftKey)
        this.startSelectDrag('rows', e)
        break
      case 'header':
        this.selectBand('cols', hit.col, e.shiftKey)
        this.startSelectDrag('cols', e)
        break
    }
    this.focus()
    e.preventDefault() // no text selection while clicking and dragging over the grid
  }

  private selectBand(type: Band['type'], index: number, extend: boolean): void {
    const model = this.model!
    const keep = this.band?.type === type ? this.band.anchor : type === 'rows' ? this.active.row : this.active.col
    const anchor = extend ? keep : index
    this.band = { type, anchor, end: index }
    this.extent = null
    // The active cell follows the clicked line so keyboard use continues from there.
    if (type === 'rows') this.active = { row: anchor, col: clamp(this.active.col, model.headers.length - 1) }
    else this.active = { row: clamp(this.active.row, model.rowCount - 1), col: anchor }
    this.paint()
  }

  private onDoubleClick(e: MouseEvent): void {
    if (e.target === this.fillHandle) return this.fillDown()
    const resizer = (e.target as Element).closest<HTMLElement>('[data-role=resize]')
    if (resizer) return this.fitColumn(Number(resizer.closest<HTMLElement>('.header-cell')!.dataset.col))
    if ((e.target as Element).closest('[data-role]')) return
    const hit = this.hit(e)
    if (hit?.zone === 'cell') this.startCellEdit(false)
    else if (hit?.zone === 'header') this.startHeaderEdit(hit.col)
  }

  private onHeaderClick(e: MouseEvent): void {
    const button = (e.target as Element).closest<HTMLElement>('[data-role]')
    const col = Number(button?.closest<HTMLElement>('.header-cell')?.dataset.col)
    if (!button || Number.isNaN(col)) return
    switch (button.dataset.role) {
      case 'sort-asc': return this.handlers.onSort(col, 'asc')
      case 'sort-desc': return this.handlers.onSort(col, 'desc')
      case 'filter': return this.handlers.onFilter(col, button)
      case 'dup': return this.handlers.onDuplicates(col)
    }
  }

  private onContextMenu(e: MouseEvent): void {
    const hit = this.hit(e)
    if (!hit) return
    if (hit.zone === 'rowNumber') {
      const inBand = this.inBand('rows', hit.row)
      if (!inBand) this.selectBand('rows', hit.row, false)
      e.preventDefault()
      this.handlers.onContextMenu('rows', e.clientX, e.clientY)
    } else if (hit.zone === 'header') {
      const inBand = this.inBand('cols', hit.col)
      if (!inBand) this.selectBand('cols', hit.col, false)
      e.preventDefault()
      this.handlers.onContextMenu('cols', e.clientX, e.clientY)
    } else if (hit.zone === 'corner') {
      e.preventDefault()
      this.handlers.onContextMenu('corner', e.clientX, e.clientY)
    }
  }

  private ensureVisible(row: number, col: number): void {
    const s = this.scroller
    const viewHeight = s.clientHeight - HEADER_HEIGHT
    const top = row * ROW_HEIGHT
    if (top < s.scrollTop) s.scrollTop = top
    else if (top + ROW_HEIGHT > s.scrollTop + viewHeight) s.scrollTop = top + ROW_HEIGHT - viewHeight
    const viewWidth = s.clientWidth - ROW_NUMBER_WIDTH
    const left = this.offsets[col] ?? 0
    const width = this.colWidth(col)
    if (left < s.scrollLeft) s.scrollLeft = left
    else if (left + width > s.scrollLeft + viewWidth) s.scrollLeft = left + width - viewWidth
  }

  // --- rendering --------------------------------------------------------------------------

  private scheduleRender(): void {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.render())
  }

  private render(): void {
    const model = this.model
    if (!model) return
    const viewport = this.scroller.clientHeight - HEADER_HEIGHT
    const first = Math.max(0, Math.floor(this.scroller.scrollTop / ROW_HEIGHT) - BUFFER_ROWS)
    const last = Math.min(model.rowCount - 1, Math.ceil((this.scroller.scrollTop + viewport) / ROW_HEIGHT) + BUFFER_ROWS)

    for (const [index, node] of this.rendered) {
      if (index < first || index > last) {
        node.remove()
        this.rendered.delete(index)
      }
    }
    const fragment = document.createDocumentFragment()
    for (let i = first; i <= last; i++) {
      if (this.rendered.has(i)) continue
      const node = this.buildRow(model, i)
      this.rendered.set(i, node)
      fragment.append(node)
    }
    this.body.prepend(fragment) // before the editor, which must stay on top
  }

  private buildHeaderCell(col: number, name: string, info: ColumnInfo): HTMLElement {
    const node = el('div', 'header-cell')
    node.dataset.col = String(col)
    node.classList.toggle('filtered', info.filtered)
    const text = el('span', 'header-text')
    text.textContent = name
    text.title = name
    const dup = button('dup', info.duplicateValues > 0 ? 'dup' : '✓')
    dup.classList.add(info.duplicateValues > 0 ? 'has' : 'none')
    dup.title =
      info.duplicateValues > 0
        ? `${info.duplicateValues} value(s) repeat, in ${info.duplicateRows} rows. Click to show only duplicates.`
        : 'No duplicate values in this column.'
    const asc = button('sort-asc', '▲', 'Sort ascending')
    const desc = button('sort-desc', '▼', 'Sort descending')
    asc.classList.toggle('active', info.sort === 'asc')
    desc.classList.toggle('active', info.sort === 'desc')
    const filter = button('filter', '', info.filtered ? 'Filter (active)' : 'Filter')
    filter.innerHTML = FUNNEL
    filter.classList.toggle('active', info.filtered)
    const resizer = el('div', 'col-resizer')
    resizer.dataset.role = 'resize'
    resizer.title = 'Drag to resize. Double-click to fit the content.'
    node.append(text, dup, asc, desc, filter, resizer)
    return node
  }

  private buildRow(model: GridModel, index: number): HTMLElement {
    const row = el('div', index % 2 ? 'grid-row alt' : 'grid-row')
    row.style.top = `${index * ROW_HEIGHT}px`
    row.style.height = `${ROW_HEIGHT}px`
    row.append(cell('row-number', String(model.rowNumber(index))))
    for (const value of model.cells(index)) row.append(cell('cell', value))
    this.paintRow(row, index)
    return row
  }

  private paint(): void {
    for (const [index, node] of this.rendered) this.paintRow(node, index)
    this.paintHeader()
    this.placeFillHandle()
    this.handlers.onSelectionChange()
  }

  // --- fill handle (REL-01 to REL-03) -------------------------------------------------------

  /** The handle sits on the bottom-right corner of the active cell, when it is the only one selected. */
  private placeFillHandle(): void {
    const model = this.model
    const single = !this.band && (!this.extent || (this.extent.row === this.active.row && this.extent.col === this.active.col))
    const show = !!model && model.rowCount > 0 && model.headers.length > 0 && !this.editing && single
    this.fillHandle.hidden = !show
    if (!show) return
    this.fillHandle.style.left = `${this.colLeft(this.active.col) + this.colWidth(this.active.col) - 6}px`
    this.fillHandle.style.top = `${(this.active.row + 1) * ROW_HEIGHT - 6}px`
  }

  /** Double-click: copy the value down to the last row shown (REL-03). */
  private fillDown(): void {
    const model = this.model
    const { row, col } = this.active
    if (model && row < model.rowCount - 1) this.handlers.onFill({ row, col, toRow: model.rowCount - 1, toCol: col })
  }

  private startFill(e: MouseEvent): void {
    e.preventDefault()
    const { row, col } = this.active
    const box = this.scroller.getBoundingClientRect()
    const originX = e.clientX - box.left + this.scroller.scrollLeft
    const originY = e.clientY - box.top + this.scroller.scrollTop
    this.drag = { row, col, target: { row, col }, x: e.clientX, y: e.clientY, originX, originY, moved: false, frame: 0 }
    document.body.classList.add('filling')
    document.addEventListener('mousemove', this.onDragMove)
    document.addEventListener('mouseup', this.onDragEnd)
    document.addEventListener('keydown', this.onDragKey)
    this.dragFrame()
  }

  private onDragMove = (e: MouseEvent): void => {
    const d = this.drag
    if (!d) return
    d.x = e.clientX
    d.y = e.clientY
    const box = this.scroller.getBoundingClientRect()
    const travelled = Math.hypot(
      e.clientX - box.left + this.scroller.scrollLeft - d.originX,
      e.clientY - box.top + this.scroller.scrollTop - d.originY,
    )
    if (travelled > 4) d.moved = true
  }

  private onDragKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.endFill(false)
  }

  private onDragEnd = (): void => this.endFill(true)

  /** Each frame: scroll when the pointer is near an edge, then follow the pointer, locked to one axis. */
  private dragFrame(): void {
    const d = this.drag
    const model = this.model
    if (!d || !model) return
    const s = this.scroller
    const box = s.getBoundingClientRect()
    // One axis only: whichever the pointer has travelled further along since the drag began.
    const dx = d.x - box.left + s.scrollLeft - d.originX
    const dy = d.y - box.top + s.scrollTop - d.originY
    const horizontal = Math.abs(dx) > Math.abs(dy)

    // Near an edge of that axis the grid scrolls, but only once the pointer has actually moved.
    if (d.moved) {
      const edge = 28
      const speed = (distance: number) => Math.min(30, Math.ceil(distance / 2))
      if (horizontal) {
        const right = box.left + s.clientWidth - edge
        const left = box.left + ROW_NUMBER_WIDTH + edge
        if (d.x > right) s.scrollLeft += speed(d.x - right)
        else if (d.x < left) s.scrollLeft -= speed(left - d.x)
      } else {
        const bottom = box.top + s.clientHeight - edge
        const top = box.top + HEADER_HEIGHT + edge
        if (d.y > bottom) s.scrollTop += speed(d.y - bottom)
        else if (d.y < top) s.scrollTop -= speed(top - d.y)
      }
    }

    const col = columnAt(this.offsets, d.x - box.left + s.scrollLeft - ROW_NUMBER_WIDTH)
    const row = clamp(Math.floor((d.y - box.top + s.scrollTop - HEADER_HEIGHT) / ROW_HEIGHT), model.rowCount - 1)
    d.target = horizontal ? { row: d.row, col } : { row, col: d.col }

    const same = d.target.row === d.row && d.target.col === d.col
    this.fillPreview.hidden = same
    if (!same) {
      const r0 = Math.min(d.row, d.target.row)
      const r1 = Math.max(d.row, d.target.row)
      const c0 = Math.min(d.col, d.target.col)
      const c1 = Math.max(d.col, d.target.col)
      Object.assign(this.fillPreview.style, {
        top: `${r0 * ROW_HEIGHT}px`,
        height: `${(r1 - r0 + 1) * ROW_HEIGHT}px`,
        left: `${this.colLeft(c0)}px`,
        width: `${this.colLeft(c1) + this.colWidth(c1) - this.colLeft(c0)}px`,
      })
    }
    d.frame = requestAnimationFrame(() => this.dragFrame())
  }

  private endFill(apply: boolean): void {
    const d = this.drag
    if (!d) return
    this.drag = null
    cancelAnimationFrame(d.frame)
    document.body.classList.remove('filling')
    document.removeEventListener('mousemove', this.onDragMove)
    document.removeEventListener('mouseup', this.onDragEnd)
    document.removeEventListener('keydown', this.onDragKey)
    this.fillPreview.hidden = true
    this.focus()
    const moved = d.target.row !== d.row || d.target.col !== d.col
    if (apply && moved) this.handlers.onFill({ row: d.row, col: d.col, toRow: d.target.row, toCol: d.target.col })
  }

  private inBand(type: Band['type'], index: number): boolean {
    if (this.band?.type !== type) return false
    const [from, to] = bandRange(this.band)
    return index >= from && index <= to
  }

  private paintRow(node: HTMLElement, index: number): void {
    const { r0, c0, r1, c1 } = this.selection()
    const inRows = index >= r0 && index <= r1
    const block = r1 > r0 || c1 > c0 // a single cell is shown by its outline alone
    node.firstElementChild!.classList.toggle('active', inRows)
    const cells = node.children
    for (let c = 1; c < cells.length; c++) {
      const col = c - 1
      const inBlock = block && inRows && col >= c0 && col <= c1
      const classes = cells[c]!.classList
      classes.toggle('active', index === this.active.row && col === this.active.col)
      classes.toggle('selected', inBlock)
      // The outline of the block goes on the cells along its edges.
      classes.toggle('sel-t', inBlock && index === r0)
      classes.toggle('sel-b', inBlock && index === r1)
      classes.toggle('sel-l', inBlock && col === c0)
      classes.toggle('sel-r', inBlock && col === c1)
    }
  }

  private paintHeader(): void {
    const { c0, c1 } = this.selection()
    const cells = this.header.children
    for (let c = 1; c < cells.length; c++) {
      cells[c]!.classList.toggle('active', c - 1 >= c0 && c - 1 <= c1)
      cells[c]!.classList.toggle('band', this.inBand('cols', c - 1))
    }
  }

  // --- column widths ------------------------------------------------------------------------

  private setWidth(col: number, width: number): void {
    this.widths[col] = clampWidth(width)
    this.layoutColumns()
    this.placeFillHandle()
  }

  /** Dragging the edge of a header resizes its column live; the width is kept when the button is released. */
  private startResize(e: MouseEvent, col: number): void {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = this.colWidth(col)
    const move = (ev: MouseEvent) => this.setWidth(col, startWidth + ev.clientX - startX)
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      document.body.classList.remove('resizing')
      this.handlers.onColumnResize(col, this.colWidth(col))
    }
    document.body.classList.add('resizing')
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  /** Double-clicking the edge fits the column to its longest cells and its header. */
  private fitColumn(col: number): void {
    const model = this.model
    if (!model) return
    const context = document.createElement('canvas').getContext('2d')!
    const style = getComputedStyle(this.scroller)
    const measure = (text: string, bold: boolean) => {
      context.font = `${bold ? 600 : 400} ${style.fontSize} ${style.fontFamily}`
      return context.measureText(text).width
    }
    function* column(): Generator<string> {
      for (let r = 0; r < model!.rowCount; r++) yield model!.cells(r)[col] ?? ''
    }
    // Measuring every cell of a large file would be slow; the longest few decide the width.
    this.setWidth(col, fitWidth(longestStrings(column(), 40), model.headers[col] ?? '', measure))
    this.handlers.onColumnResize(col, this.colWidth(col))
  }

  // --- selecting by dragging ----------------------------------------------------------------

  /** The cell under a viewport point, clamped to the table: dragging past an edge keeps selecting. */
  private cellAt(clientX: number, clientY: number): Pos {
    const model = this.model!
    const s = this.scroller
    const box = s.getBoundingClientRect()
    return {
      row: clamp(Math.floor((clientY - box.top + s.scrollTop - HEADER_HEIGHT) / ROW_HEIGHT), model.rowCount - 1),
      col: columnAt(this.offsets, clientX - box.left + s.scrollLeft - ROW_NUMBER_WIDTH),
    }
  }

  private startSelectDrag(mode: 'cells' | 'rows' | 'cols', e: MouseEvent): void {
    const box = this.scroller.getBoundingClientRect()
    this.selDrag = {
      mode,
      x: e.clientX,
      y: e.clientY,
      originX: e.clientX - box.left + this.scroller.scrollLeft,
      originY: e.clientY - box.top + this.scroller.scrollTop,
      moved: false,
      frame: 0,
    }
    document.addEventListener('mousemove', this.onSelectMove)
    document.addEventListener('mouseup', this.onSelectEnd)
    this.selectFrame()
  }

  private onSelectMove = (e: MouseEvent): void => {
    const d = this.selDrag
    if (!d) return
    d.x = e.clientX
    d.y = e.clientY
    const box = this.scroller.getBoundingClientRect()
    const travelled = Math.hypot(
      e.clientX - box.left + this.scroller.scrollLeft - d.originX,
      e.clientY - box.top + this.scroller.scrollTop - d.originY,
    )
    if (travelled > 4) d.moved = true
  }

  private onSelectEnd = (): void => {
    const d = this.selDrag
    if (!d) return
    this.selDrag = null
    cancelAnimationFrame(d.frame)
    document.removeEventListener('mousemove', this.onSelectMove)
    document.removeEventListener('mouseup', this.onSelectEnd)
  }

  /** Each frame: scroll when the pointer is near an edge, then stretch the selection to the pointer. */
  private selectFrame(): void {
    const d = this.selDrag
    const model = this.model
    if (!d || !model) return
    const s = this.scroller
    const box = s.getBoundingClientRect()
    if (d.moved) {
      const edge = 28
      const speed = (distance: number) => Math.min(30, Math.ceil(distance / 2))
      if (d.mode !== 'cols') {
        const bottom = box.top + s.clientHeight - edge
        const top = box.top + HEADER_HEIGHT + edge
        if (d.y > bottom) s.scrollTop += speed(d.y - bottom)
        else if (d.y < top) s.scrollTop -= speed(top - d.y)
      }
      if (d.mode !== 'rows') {
        const right = box.left + s.clientWidth - edge
        const left = box.left + ROW_NUMBER_WIDTH + edge
        if (d.x > right) s.scrollLeft += speed(d.x - right)
        else if (d.x < left) s.scrollLeft -= speed(left - d.x)
      }
      const { row, col } = this.cellAt(d.x, d.y)
      if (d.mode === 'cells') {
        const current = this.extent ?? this.active
        if (current.row !== row || current.col !== col) {
          this.extent = { row, col }
          this.paint()
        }
      } else if (this.band) {
        const end = d.mode === 'rows' ? row : col
        if (this.band.end !== end) {
          this.band.end = end
          this.paint()
        }
      }
    }
    d.frame = requestAnimationFrame(() => this.selectFrame())
  }
}

function bandRange(band: Band): [number, number] {
  return [Math.min(band.anchor, band.end), Math.max(band.anchor, band.end)]
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(value, max))
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  return node
}

const FUNNEL =
  '<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M1 2h10L7 6.5V10L5 11V6.5z" fill="currentColor"/></svg>'

function button(role: string, label: string, title?: string): HTMLElement {
  const node = el('button', `hbtn ${role}`)
  node.dataset.role = role
  node.tabIndex = -1
  node.textContent = label
  if (title) node.title = title
  return node
}

function cell(className: string, text: string): HTMLElement {
  const node = el('div', className)
  node.textContent = text
  if (className !== 'row-number') node.title = text
  return node
}
