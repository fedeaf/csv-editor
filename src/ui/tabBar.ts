export interface TabItem {
  id: number
  label: string
  dirty: boolean
  active: boolean
  /** Shown in the other pane of a split view. */
  shown?: boolean
  /** The selected tab of a strip whose pane is not in focus: selected, but without the mark of focus. */
  dim?: boolean
}

export interface TabBarHandlers {
  onSelect(id: number): void
  /** Close was requested (button or middle click); the owner decides whether to ask first. */
  onClose(id: number): void
  /** The + after the last tab was clicked. */
  onNew(): void
  /** A tab was right-clicked, at this position of the window. */
  onMenu?(id: number, x: number, y: number): void
  /** A tab was dropped on this strip, to go before the tab `before` (or at the end if there is none). */
  onDropTab?(id: number, before: number | undefined): void
  /** Whether tabs can be dragged now. */
  draggable?(): boolean
}

const TAB_MIME = 'application/x-csv-editor-tab'

/** Which tab to show after `closingId` is closed: the right neighbour, else the left, else none. A tab `shownElsewhere` (in the other pane) is skipped. */
export function tabAfterClose(ids: number[], closingId: number, activeId: number | undefined, shownElsewhere?: number): number | undefined {
  if (closingId !== activeId) return activeId
  const at = ids.indexOf(closingId)
  // Nearest on the right first, then on the left; never the one the other pane already shows.
  const candidates = [...ids.slice(at + 1), ...ids.slice(0, at).reverse()]
  return candidates.find((id) => id !== shownElsewhere)
}

/** Where a tab dragged to horizontal position `x` goes: before the first tab whose middle is past it, or at the end (undefined). */
export function dropBefore(tabs: { id: number; left: number; width: number }[], x: number): number | undefined {
  return tabs.find((t) => x < t.left + t.width / 2)?.id
}

/**
 * The order of the tabs after `moving` is put before `before` (or after the last tab of its strip if there is
 * none, or at the end if the strip has no other tab). `inStrip` says which tabs share the strip it goes to.
 */
export function placeTab(ids: number[], moving: number, before: number | undefined, inStrip: (id: number) => boolean): number[] {
  const rest = ids.filter((id) => id !== moving)
  let at = before === undefined ? -1 : rest.indexOf(before)
  if (at < 0) {
    const last = rest.reduce((found, id, i) => (inStrip(id) ? i : found), -1)
    at = last < 0 ? rest.length : last + 1
  }
  return [...rest.slice(0, at), moving, ...rest.slice(at)]
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
  host.addEventListener('contextmenu', (e) => {
    const id = idOf(e.target)
    if (id === undefined || !handlers.onMenu) return
    e.preventDefault()
    handlers.onMenu(id, e.clientX, e.clientY)
  })
  // Tabs are reordered, and moved between the strips of a split view, by dragging.
  const tabRects = () =>
    [...host.querySelectorAll<HTMLElement>('.tab')].map((el) => {
      const r = el.getBoundingClientRect()
      return { el, id: Number(el.dataset.id), left: r.left, width: r.width }
    })
  const clearMarks = () => {
    host.classList.remove('drop-target')
    host.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'))
  }
  host.addEventListener('dragstart', (e) => {
    const id = idOf(e.target)
    if (id === undefined || !e.dataTransfer) return
    e.dataTransfer.setData(TAB_MIME, String(id))
    e.dataTransfer.effectAllowed = 'move'
    ;(e.target as Element).closest('.tab')?.classList.add('dragging')
  })
  host.addEventListener('dragend', () => {
    host.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'))
    clearMarks()
  })
  host.addEventListener('dragover', (e) => {
    if (!handlers.onDropTab || !e.dataTransfer?.types.includes(TAB_MIME)) return
    e.preventDefault()
    clearMarks()
    host.classList.add('drop-target')
    const rects = tabRects()
    const before = dropBefore(rects, e.clientX)
    const mark = rects.find((r) => r.id === before)?.el ?? rects[rects.length - 1]?.el
    mark?.classList.add(before === undefined ? 'drop-after' : 'drop-before')
  })
  host.addEventListener('dragleave', (e) => {
    if (!host.contains(e.relatedTarget as Node | null)) clearMarks()
  })
  host.addEventListener('drop', (e) => {
    const before = dropBefore(tabRects(), e.clientX)
    clearMarks()
    const raw = e.dataTransfer?.getData(TAB_MIME)
    if (!raw || !handlers.onDropTab) return
    e.preventDefault()
    handlers.onDropTab(Number(raw), before)
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
          tab.className = item.active ? (item.dim ? 'tab active dim' : 'tab active') : item.shown ? 'tab shown' : 'tab'
          tab.draggable = handlers.draggable?.() ?? false
          tab.dataset.id = String(item.id)
          tab.setAttribute('role', 'tab')
          tab.setAttribute('aria-selected', String(item.active))
          tab.title = item.dirty ? `${item.label} (unsaved changes)` : item.label
          const name = document.createElement('span')
          name.className = 'tab-name'
          name.textContent = item.label
          const close = document.createElement('button')
          close.className = 'tab-close'
          close.tabIndex = -1
          close.title = 'Close'
          close.setAttribute('aria-label', `Close ${item.label}`)
          close.textContent = '×'
          if (item.dirty) {
            // A coloured dot ahead of the name: unsaved changes.
            const dot = document.createElement('span')
            dot.className = 'tab-dirty'
            dot.setAttribute('role', 'img')
            dot.setAttribute('aria-label', 'Unsaved changes')
            tab.append(dot)
          }
          tab.append(name, close)
          return tab
        }),
        plus,
      )
      revealActive()
    },
  }
}
