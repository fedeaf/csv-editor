export interface SearchPanelHandlers {
  /** The text or the exact-match flag changed: search again from the first cell. */
  onSearch(): void
  onStep(direction: 1 | -1): void
  onClose(): void
}

export interface SearchPanel {
  open(): void
  close(): void
  readonly isOpen: boolean
  readonly query: string
  readonly exact: boolean
  setMessage(text: string, isError?: boolean): void
}

/** The floating Find panel (BUS-01). */
export function createSearchPanel(handlers: SearchPanelHandlers): SearchPanel {
  const root = document.createElement('div')
  root.className = 'search-panel'
  root.hidden = true
  root.setAttribute('role', 'search')
  root.innerHTML = `
    <input type="text" class="sp-input" placeholder="Find in visible rows" aria-label="Find" spellcheck="false">
    <label class="sp-exact"><input type="checkbox"> Match entire cell</label>
    <span class="sp-message" aria-live="polite"></span>
    <button class="sp-next" title="Next match (Ctrl+G)">Next</button>
    <button class="sp-close" title="Close (Esc)" aria-label="Close">✕</button>`
  document.body.append(root)
  const input = root.querySelector<HTMLInputElement>('.sp-input')!
  const exact = root.querySelector<HTMLInputElement>('.sp-exact input')!
  const message = root.querySelector<HTMLElement>('.sp-message')!

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
    setMessage(text, isError = false) {
      message.textContent = text
      message.classList.toggle('error', isError)
    },
  }

  input.addEventListener('input', () => handlers.onSearch())
  exact.addEventListener('change', () => handlers.onSearch())
  root.querySelector('.sp-next')!.addEventListener('click', () => handlers.onStep(1))
  root.querySelector('.sp-close')!.addEventListener('click', () => panel.close())
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      panel.close()
    } else if (e.key === 'Enter' && e.target === input) {
      e.preventDefault()
      handlers.onStep(e.shiftKey ? -1 : 1)
    }
  })
  return panel
}
