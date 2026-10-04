export type MenuItem =
  | {
      label: string
      run: () => void
      disabled?: boolean
      /** The shortcut that does the same, shown at the right. */
      hint?: string
    }
  | { separator: true }

let current: HTMLElement | undefined

export function closeContextMenu(): void {
  current?.remove()
  current = undefined
}

/** Shows a floating menu at the given viewport position, kept inside the window. */
export function showContextMenu(x: number, y: number, items: MenuItem[]): void {
  closeContextMenu()
  const menu = document.createElement('ul')
  menu.className = 'popup-menu context-menu'
  menu.setAttribute('role', 'menu')
  // Pressing an entry must not take the focus away from the table the menu was opened on.
  menu.addEventListener('mousedown', (e) => e.preventDefault())
  for (const item of items) {
    const li = document.createElement('li')
    if ('separator' in item) {
      li.setAttribute('role', 'separator')
      li.className = 'separator'
      menu.append(li)
      continue
    }
    li.setAttribute('role', 'menuitem')
    li.append(item.label)
    if (item.hint) li.append(Object.assign(document.createElement('kbd'), { textContent: item.hint }))
    if (item.disabled) li.classList.add('disabled')
    else
      li.addEventListener('click', () => {
        closeContextMenu()
        item.run()
      })
    menu.append(li)
  }
  document.body.append(menu)
  menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - menu.offsetWidth - 4))}px`
  menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - menu.offsetHeight - 4))}px`
  current = menu
}

// A click anywhere else, a key press, or a scroll closes it.
document.addEventListener('mousedown', (e) => {
  if (current && !current.contains(e.target as Node)) closeContextMenu()
})
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeContextMenu())
window.addEventListener('blur', closeContextMenu)
document.addEventListener('wheel', closeContextMenu, { passive: true })
