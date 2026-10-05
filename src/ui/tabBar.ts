export interface TabItem {
  id: number
  label: string
  dirty: boolean
  active: boolean
  /** Shown in the other pane of a split view. */
  shown?: boolean
}

export interface TabBarHandlers {
  onSelect(id: number): void
  /** Close was requested (button or middle click); the owner decides whether to ask first. */
  onClose(id: number): void
  /** The + after the last tab was clicked. */
  onNew(): void
}

/** Which tab to show after `closingId` is closed: the right neighbour, else the left, else none. A tab `shownElsewhere` (in the other pane) is skipped. */
export function tabAfterClose(ids: number[], closingId: number, activeId: number | undefined, shownElsewhere?: number): number | undefined {
  if (closingId !== activeId) return activeId
  const at = ids.indexOf(closingId)
  // Nearest on the right first, then on the left; never the one the other pane already shows.
  const candidates = [...ids.slice(at + 1), ...ids.slice(0, at).reverse()]
  return candidates.find((id) => id !== shownElsewhere)
}

/** The strip of document tabs that replaces the plain file name in the toolbar. */
export function createTabBar(host: HTMLElement, handlers: TabBarHandlers): { render(items: TabItem[]): void } {
  host.setAttribute('role', 'tablist')

  const idOf = (target: EventTarget | null) => {
    const tab = (target as Element | null)?.closest<HTMLElement>('.tab')
    return tab ? Number(tab.dataset.id) : undefined
  }

  host.addEventListener('click', (e) => {
    if ((e.target as Element).closest('.tab-new')) {
      handlers.onNew()
      return
    }
    const id = idOf(e.target)
    if (id === undefined) return
    if ((e.target as Element).closest('.tab-close')) handlers.onClose(id)
    else handlers.onSelect(id)
  })
  // Middle click closes, as in browsers.
  host.addEventListener('auxclick', (e) => {
    const id = idOf(e.target)
    if (e.button === 1 && id !== undefined) handlers.onClose(id)
  })
  host.addEventListener('mousedown', (e) => {
    if (e.button === 1) e.preventDefault() // no autoscroll cursor
  })

  const revealActive = () => host.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  // The strip shrinks when the window is resized or the Find panel opens: keep the active tab in view.
  new ResizeObserver(revealActive).observe(host)

  return {
    render(items) {
      const plus = document.createElement('button')
      plus.className = 'tab-new'
      plus.tabIndex = -1
      plus.title = 'New blank document'
      plus.setAttribute('aria-label', 'New blank document')
      plus.textContent = '+'
      if (items.length === 0) {
        const none = document.createElement('span')
        none.className = 'tabs-empty'
        none.textContent = 'No file open'
        host.replaceChildren(none, plus)
        return
      }
      host.replaceChildren(
        ...items.map((item) => {
          const tab = document.createElement('div')
          tab.className = item.active ? 'tab active' : item.shown ? 'tab shown' : 'tab'
          tab.dataset.id = String(item.id)
          tab.setAttribute('role', 'tab')
          tab.setAttribute('aria-selected', String(item.active))
          tab.title = item.label
          const name = document.createElement('span')
          name.className = 'tab-name'
          name.textContent = item.dirty ? `* ${item.label}` : item.label
          const close = document.createElement('button')
          close.className = 'tab-close'
          close.tabIndex = -1
          close.title = 'Close'
          close.setAttribute('aria-label', `Close ${item.label}`)
          close.textContent = '×'
          tab.append(name, close)
          return tab
        }),
        plus,
      )
      revealActive()
    },
  }
}
