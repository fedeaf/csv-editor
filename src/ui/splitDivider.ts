/** Smallest size of a pane along the split, in pixels, so neither can be dragged out of sight. */
export const MIN_PANE = 160

/**
 * Share of the room (0 to 1) that the first pane gets when the divider's centre is at `pos`.
 * `start` and `size` are the container's edge and length along the split, `thickness` the divider's.
 */
export function splitRatio(pos: number, start: number, size: number, thickness: number, min = MIN_PANE): number {
  const room = size - thickness
  if (room <= 0) return 0.5
  // If both minimums cannot fit, split evenly.
  if (room < 2 * min) return 0.5
  const first = Math.min(Math.max(pos - start - thickness / 2, min), room - min)
  return first / room
}

export interface Divider {
  readonly el: HTMLElement
  /** Which way the panes are laid out; the divider is vertical between side-by-side panes. */
  setOrientation(side: boolean): void
}

/**
 * The bar between two panes. Dragging it, or pressing the arrows while it has focus, calls
 * `onChange` with the new share of the first pane; double-clicking it asks for an even split.
 */
export function createDivider(container: HTMLElement, onChange: (ratio: number) => void, current: () => number): Divider {
  const el = document.createElement('div')
  el.className = 'pane-divider'
  el.setAttribute('role', 'separator')
  el.tabIndex = 0
  el.title = 'Drag to resize. Double-click to split evenly.'
  let side = true

  const metrics = () => {
    const box = container.getBoundingClientRect()
    const bar = el.getBoundingClientRect()
    return side
      ? { start: box.left, size: box.width, thickness: bar.width }
      : { start: box.top, size: box.height, thickness: bar.height }
  }

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    el.setPointerCapture(e.pointerId)
    el.classList.add('dragging')
    document.body.classList.add(side ? 'resizing' : 'resizing-rows')
  })
  el.addEventListener('pointermove', (e) => {
    if (!el.hasPointerCapture(e.pointerId)) return
    const { start, size, thickness } = metrics()
    onChange(splitRatio(side ? e.clientX : e.clientY, start, size, thickness))
  })
  const stop = (e: PointerEvent) => {
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    el.classList.remove('dragging')
    document.body.classList.remove('resizing', 'resizing-rows')
  }
  el.addEventListener('pointerup', stop)
  el.addEventListener('pointercancel', stop)
  el.addEventListener('dblclick', () => onChange(0.5))
  el.addEventListener('keydown', (e) => {
    const keys = side ? { less: 'ArrowLeft', more: 'ArrowRight' } : { less: 'ArrowUp', more: 'ArrowDown' }
    const step = e.key === keys.less ? -0.05 : e.key === keys.more ? 0.05 : 0
    if (!step) return
    e.preventDefault()
    const { start, size, thickness } = metrics()
    const room = size - thickness
    // Through the same limits as dragging: ask for the position that the new share would have.
    onChange(splitRatio(start + thickness / 2 + (current() + step) * room, start, size, thickness))
  })

  return {
    el,
    setOrientation(next) {
      side = next
      el.setAttribute('aria-orientation', next ? 'vertical' : 'horizontal')
    },
  }
}
