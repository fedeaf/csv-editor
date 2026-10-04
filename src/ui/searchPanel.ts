export interface SearchPanelHandlers {
  /** The text or the exact-match flag changed: search again from the first cell. */
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
  readonly isOpen: boolean
  readonly query: string
  readonly exact: boolean
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
    <div class="sp-row">
      <input type="text" class="sp-input" placeholder="Find in visible rows" aria-label="Find" spellcheck="false">
      <label class="sp-exact"><input type="checkbox"> Match entire cell</label>
      <span class="sp-message" aria-live="polite"></span>
      <button class="sp-next" title="Next match (Ctrl+G)">Next</button>
      <button class="sp-close" title="Close (Esc)" aria-label="Close">✕</button>
    </div>
    <div class="sp-row">
      <input type="text" class="sp-replace" placeholder="Replace with" aria-label="Replace with" spellcheck="false">
      <button class="sp-replace-one" title="Replace this match and go to the next">Replace</button>
      <button class="sp-replace-all" title="Replace every match in the rows shown">Replace all</button>
    </div>`
  document.body.append(root)
  const $ = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!
  const input = $<HTMLInputElement>('.sp-input')
  const exact = $<HTMLInputElement>('.sp-exact input')
  const message = $('.sp-message')
  const replaceInput = $<HTMLInputElement>('.sp-replace')
  const replaceButtons = [$('.sp-replace-one'), $('.sp-replace-all')] as HTMLButtonElement[]

  /** There is nothing to replace until there is something to look for. */
  const syncReplaceButtons = () => replaceButtons.forEach((b) => (b.disabled = input.value === ''))
  syncReplaceButtons()

  const panel: SearchPanel = {
    open() {
      root.hidden = false
      document.body.classList.add('find-open')
      input.focus()
      input.select()
    },
    close() {
      if (root.hidden) return
      root.hidden = true
      document.body.classList.remove('find-open')
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
