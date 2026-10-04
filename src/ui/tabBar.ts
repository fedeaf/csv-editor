export interface TabItem {
  id: number
  label: string
  dirty: boolean
  active: boolean
}

export interface TabBarHandlers {
  onSelect(id: number): void
  /** Close was requested (button or middle click); the owner decides whether to ask first. */
  onClose(id: number): void
}

/** Which tab to show after `closingId` is closed: the right neighbour, else the left, else none. */
export function tabAfterClose(ids: number[], closingId: number, activeId: number | undefined): number | undefined {
  if (closingId !== activeId) return activeId
  const at = ids.indexOf(closingId)
  return ids[at + 1] ?? ids[at - 1]
}

/** The strip of document tabs that replaces the plain file name in the toolbar. */
export function createTabBar(host: HTMLElement, handlers: TabBarHandlers): { render(items: TabItem[]): void } {
  host.setAttribute('role', 'tablist')

  const idOf = (target: EventTarget | null) => {
    const tab = (target as Element | null)?.closest<HTMLElement>('.tab')
    return tab ? Number(tab.dataset.id) : undefined
  }

  host.addEventListener('click', (e) => {
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
      if (items.length === 0) {
        const none = document.createElement('span')
        none.className = 'tabs-empty'
        none.textContent = 'No file open'
        host.replaceChildren(none)
        return
      }
      host.replaceChildren(
        ...items.map((item) => {
          const tab = document.createElement('div')
          tab.className = item.active ? 'tab active' : 'tab'
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
      )
      revealActive()
    },
  }
}
