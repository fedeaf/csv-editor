// The AutoFilter dropdown (FIL-01): a "Duplicates only" switch, the column's unique values with
// checkboxes, "Select All" and "-[ Blanks ]-". Changes are drafted and applied with OK.

export interface FilterEntry {
  value: string
  label: string
  count: number
}

export interface FilterDropdownOptions {
  anchor: HTMLElement
  /** "-[ Blanks ]-" first when the column has blank cells, then the unique values alphabetical. */
  entries: FilterEntry[]
  /** Currently allowed values, or null when every value is allowed. */
  selected: Set<string> | null
  duplicatesOnly: boolean
  hasDuplicates: boolean
  onApply(selected: Set<string> | null, duplicatesOnly: boolean): void
  onClear(): void
}

const ITEM_HEIGHT = 24
const LIST_HEIGHT = ITEM_HEIGHT * 8

let current: HTMLElement | undefined

export function closeFilterDropdown(): void {
  current?.remove()
  current = undefined
}

export function showFilterDropdown(opts: FilterDropdownOptions): void {
  closeFilterDropdown()
  const { entries } = opts
  const draft = new Set(opts.selected ?? entries.map((e) => e.value))
  let duplicatesOnly = opts.duplicatesOnly
  let query = ''
  let shown = entries

  const root = document.createElement('div')
  root.className = 'filter-dropdown'
  root.innerHTML = `
    <label class="fd-row fd-dup"><input type="checkbox" class="fd-dup-box"> <span>Duplicates only</span></label>
    <input type="search" class="fd-search" placeholder="Search values" aria-label="Search values">
    <label class="fd-row fd-all"><input type="checkbox" class="fd-all-box"> <span>(Select All)</span></label>
    <div class="fd-list"><div class="fd-spacer"></div></div>
    <div class="fd-footer"><button class="fd-clear">Clear filter</button><span class="fd-gap"></span><button class="fd-cancel">Cancel</button><button class="fd-ok">OK</button></div>`
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!
  const dupBox = $<HTMLInputElement>('.fd-dup-box')
  const search = $<HTMLInputElement>('.fd-search')
  const allBox = $<HTMLInputElement>('.fd-all-box')
  const list = $('.fd-list')
  const spacer = $('.fd-spacer')

  dupBox.checked = duplicatesOnly
  dupBox.disabled = !opts.hasDuplicates && !duplicatesOnly
  if (dupBox.disabled) $('.fd-dup').title = 'This column has no duplicate values.'
  list.style.height = `${LIST_HEIGHT}px`

  // Only the rows in view exist in the DOM: a column can have hundreds of thousands of values.
  function renderList(): void {
    spacer.style.height = `${shown.length * ITEM_HEIGHT}px`
    const first = Math.floor(list.scrollTop / ITEM_HEIGHT)
    const last = Math.min(shown.length, first + LIST_HEIGHT / ITEM_HEIGHT + 2)
    list.querySelectorAll('.fd-item').forEach((n) => n.remove())
    for (let i = first; i < last; i++) {
      const entry = shown[i]!
      const item = document.createElement('label')
      item.className = 'fd-item'
      item.style.top = `${i * ITEM_HEIGHT}px`
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.checked = draft.has(entry.value)
      box.dataset.index = String(i)
      const text = document.createElement('span')
      text.textContent = entry.label
      text.title = entry.label
      const count = document.createElement('em')
      count.textContent = String(entry.count)
      item.append(box, text, count)
      list.append(item)
    }
    const selectedShown = shown.filter((e) => draft.has(e.value)).length
    allBox.checked = shown.length > 0 && selectedShown === shown.length
    allBox.indeterminate = selectedShown > 0 && selectedShown < shown.length
  }

  list.addEventListener('scroll', renderList)
  list.addEventListener('change', (e) => {
    const box = e.target as HTMLInputElement
    const entry = shown[Number(box.dataset.index)]
    if (!entry) return
    if (box.checked) draft.add(entry.value)
    else draft.delete(entry.value)
    renderList()
  })
  allBox.addEventListener('change', () => {
    // Applies to the values listed, so a search narrows what "Select All" means.
    for (const e of shown) allBox.checked ? draft.add(e.value) : draft.delete(e.value)
    renderList()
  })
  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase()
    shown = query ? entries.filter((e) => e.label.toLowerCase().includes(query)) : entries
    list.scrollTop = 0
    renderList()
  })
  dupBox.addEventListener('change', () => (duplicatesOnly = dupBox.checked))

  $('.fd-ok').addEventListener('click', () => {
    const all = entries.every((e) => draft.has(e.value))
    closeFilterDropdown()
    opts.onApply(all ? null : new Set(draft), duplicatesOnly)
  })
  $('.fd-cancel').addEventListener('click', closeFilterDropdown)
  $('.fd-clear').addEventListener('click', () => {
    closeFilterDropdown()
    opts.onClear()
  })
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeFilterDropdown()
    else if (e.key === 'Enter' && e.target === search) $('.fd-ok').click()
  })

  document.body.append(root)
  const box = opts.anchor.closest('.header-cell')!.getBoundingClientRect()
  root.style.left = `${Math.max(4, Math.min(box.left, window.innerWidth - root.offsetWidth - 4))}px`
  root.style.top = `${Math.max(4, Math.min(box.bottom + 2, window.innerHeight - root.offsetHeight - 4))}px`
  current = root
  renderList()
  search.focus()
}

// Clicking elsewhere, scrolling the grid, or leaving the window closes it without applying.
document.addEventListener('mousedown', (e) => {
  if (current && !current.contains(e.target as Node) && !(e.target as Element).closest('[data-role=filter]')) {
    closeFilterDropdown()
  }
})
document.addEventListener('wheel', (e) => current && !current.contains(e.target as Node) && closeFilterDropdown(), {
  passive: true,
})
window.addEventListener('blur', closeFilterDropdown)
