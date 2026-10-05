export interface SearchPanelHandlers {
  /** The text or one of the options changed: search again from the first cell. */
  onSearch(): void
  onStep(direction: 1 | -1): void
  /** Replace the match that is selected, then move on to the next one. */
  onReplace(): void
  onReplaceAll(): void
  onClose(): void
}

export interface SearchPanel {
  open(): void
  close(): void
  /** Puts the panel in the area of a table; it follows the pane in focus. */
  mount(host: HTMLElement): void
  readonly isOpen: boolean
  readonly query: string
  readonly exact: boolean
  /** The text to find is a regular expression. */
  readonly regex: boolean
  readonly replacement: string
  /** `detail` is the longer text for the tooltip; by default the message itself. */
  setMessage(text: string, isError?: boolean, detail?: string): void
}

/**
 * The floating Find panel (BUS-01). Replace lives in the same panel, in a second row that is always
 * there, so it needs no shortcut of its own: Ctrl+F reaches both.
 */
export function createSearchPanel(handlers: SearchPanelHandlers): SearchPanel {
  const root = document.createElement('div')
  root.className = 'search-panel'
  root.hidden = true
  root.setAttribute('role', 'search')
  root.innerHTML = `
    <div class="sp-grip" title="Drag to move. Double-click to put it back."></div>
    <div class="sp-row">
      <input type="text" class="sp-input" placeholder="Find in visible rows" aria-label="Find" spellcheck="false">
      <label class="sp-exact"><input type="checkbox"> Match entire cell</label>
      <label class="sp-regex" title="Read the text as a regular expression (JavaScript syntax, ignoring case)"><input type="checkbox"> Regex</label>
      <span class="sp-message" aria-live="polite"></span>
      <button class="sp-next" title="Next match (Ctrl+G)">Next</button>
      <button class="sp-close" title="Close (Esc)" aria-label="Close">✕</button>
    </div>
    <div class="sp-row">
      <input type="text" class="sp-replace" placeholder="Replace with" aria-label="Replace with" spellcheck="false" title="With Regex on, $1, $&amp; and $&lt;name&gt; insert what the pattern matched">
      <button class="sp-replace-one" title="Replace this match and go to the next">Replace</button>
      <button class="sp-replace-all" title="Replace every match in the rows shown">Replace all</button>
    </div>`
  const $ = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!
  const input = $<HTMLInputElement>('.sp-input')
  const exact = $<HTMLInputElement>('.sp-exact input')
  const regex = $<HTMLInputElement>('.sp-regex input')
  const message = $('.sp-message')
  const replaceInput = $<HTMLInputElement>('.sp-replace')
  const replaceButtons = [$('.sp-replace-one'), $('.sp-replace-all')] as HTMLButtonElement[]

  /** There is nothing to replace until there is something to look for. */
  const syncReplaceButtons = () => replaceButtons.forEach((b) => (b.disabled = input.value === ''))
  syncReplaceButtons()

  // --- moving the panel -------------------------------------------------------------------
  // Dragging the strip on its left, or any part of it that is not a control, moves it within the
  // area of the table. Until it is moved it sits in the top right corner.

  /** Puts the panel at `left`, `top` inside its area, never partly outside it. */
  const place = (left: number, top: number) => {
    const area = root.parentElement
    if (!area) return
    root.style.right = 'auto'
    root.style.left = `${Math.max(0, Math.min(left, area.clientWidth - root.offsetWidth))}px`
    root.style.top = `${Math.max(0, Math.min(top, area.clientHeight - root.offsetHeight))}px`
  }
  const moved = () => root.style.left !== ''
  /** Keeps a moved panel in view when the area changes size or the panel opens or changes pane. */
  const keepInside = () => {
    if (moved() && !root.hidden) place(root.offsetLeft, root.offsetTop)
  }
  let drag: { x: number; y: number; left: number; top: number } | undefined
  const isControl = (target: EventTarget | null) => !!(target as Element).closest('input, button, label')
  // The text field keeps the focus while the panel is dragged by its edge.
  root.addEventListener('mousedown', (e) => {
    if (!isControl(e.target)) e.preventDefault()
  })
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || isControl(e.target)) return
    drag = { x: e.clientX, y: e.clientY, left: root.offsetLeft, top: root.offsetTop }
    root.setPointerCapture(e.pointerId)
    document.body.classList.add('moving-panel')
  })
  root.addEventListener('pointermove', (e) => {
    if (drag) place(drag.left + e.clientX - drag.x, drag.top + e.clientY - drag.y)
  })
  const drop = () => {
    drag = undefined
    document.body.classList.remove('moving-panel')
  }
  root.addEventListener('pointerup', drop)
  root.addEventListener('pointercancel', drop)
  root.querySelector('.sp-grip')!.addEventListener('dblclick', () => {
    root.style.left = root.style.top = root.style.right = ''
  })
  const watcher = new ResizeObserver(keepInside)

  const panel: SearchPanel = {
    // In the area of the table, so that it sits under the column headers and follows the table around.
    mount(host) {
      watcher.disconnect()
      host.append(root)
      watcher.observe(host)
      keepInside()
    },
    open() {
      root.hidden = false
      keepInside()
      input.focus()
      input.select()
    },
    close() {
      if (root.hidden) return
      root.hidden = true
      handlers.onClose()
    },
    get isOpen() {
      return !root.hidden
    },
    get query() {
      return input.value
    },
    get exact() {
      return exact.checked
    },
    get regex() {
      return regex.checked
    },
    get replacement() {
      return replaceInput.value
    },
    setMessage(text, isError = false, detail) {
      message.textContent = text
      message.title = detail ?? text // the full text, in case a narrow window cuts it short
      message.classList.toggle('error', isError)
    },
  }

  input.addEventListener('input', () => {
    syncReplaceButtons()
    handlers.onSearch()
  })
  exact.addEventListener('change', () => handlers.onSearch())
  regex.addEventListener('change', () => handlers.onSearch())
  $('.sp-next').addEventListener('click', () => handlers.onStep(1))
  $('.sp-replace-one').addEventListener('click', () => handlers.onReplace())
  $('.sp-replace-all').addEventListener('click', () => handlers.onReplaceAll())
  $('.sp-close').addEventListener('click', () => panel.close())
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      panel.close()
    } else if (e.key === 'Enter' && e.target === input) {
      e.preventDefault()
      handlers.onStep(e.shiftKey ? -1 : 1)
    } else if (e.key === 'Enter' && e.target === replaceInput && input.value !== '') {
      e.preventDefault()
      handlers.onReplace()
    }
  })
  return panel
}
