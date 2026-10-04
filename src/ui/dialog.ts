// In-page dialogs that replace the browser's alert and confirm: they use the app's own look, can say
// what each button does, and never leave the page.

export interface DialogOptions {
  title: string
  message: string
  /** Label of the main button. */
  confirmLabel?: string
  /** Label of the cancel button; null for a message with a single button. */
  cancelLabel?: string | null
  /** The main button discards something: it is drawn in red and the focus starts on Cancel. */
  danger?: boolean
}

let open = false
let queue: Promise<unknown> = Promise.resolve()

/** True while a dialog is on screen, so the rest of the app can leave keys and clipboard alone. */
export function isDialogOpen(): boolean {
  return open
}

/** Asks a question: resolves true for the main button, false for Cancel, Escape or a click outside. */
export function confirmDialog(options: DialogOptions): Promise<boolean> {
  return show({ cancelLabel: 'Cancel', ...options })
}

/** Tells the user something; resolves when it is dismissed. */
export async function messageDialog(title: string, message: string): Promise<void> {
  await show({ title, message, cancelLabel: null })
}

// One at a time: a second dialog waits for the first to be answered.
function show(options: DialogOptions): Promise<boolean> {
  const result = queue.then(() => render(options))
  queue = result.catch(() => undefined)
  return result
}

function render({ title, message, confirmLabel = 'OK', cancelLabel = null, danger = false }: DialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const previous = document.activeElement as HTMLElement | null
    const backdrop = document.createElement('div')
    backdrop.className = 'dialog-backdrop'
    const dialog = document.createElement('div')
    dialog.className = 'dialog'
    dialog.setAttribute('role', cancelLabel === null ? 'alertdialog' : 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    const heading = Object.assign(document.createElement('h2'), { textContent: title, id: 'dialog-title' })
    const body = Object.assign(document.createElement('p'), { textContent: message, id: 'dialog-message' })
    dialog.setAttribute('aria-labelledby', heading.id)
    dialog.setAttribute('aria-describedby', body.id)

    const actions = document.createElement('div')
    actions.className = 'dialog-actions'
    const main = document.createElement('button')
    main.textContent = confirmLabel
    main.className = danger ? 'danger-button' : 'primary-button'
    const cancel = cancelLabel === null ? undefined : Object.assign(document.createElement('button'), { textContent: cancelLabel })
    cancel?.classList.add('secondary-button')
    actions.append(...(cancel ? [cancel, main] : [main]))
    dialog.append(heading, body, actions)
    backdrop.append(dialog)

    const close = (answer: boolean) => {
      document.removeEventListener('keydown', onKey, true)
      backdrop.remove()
      open = false
      previous?.focus({ preventScroll: true })
      resolve(answer)
    }
    // Keys belong to the dialog while it is open: Escape cancels, Tab stays on its buttons, and nothing
    // else reaches the grid or the shortcuts underneath. Enter and Space press the focused button.
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(false)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        const buttons = [...dialog.querySelectorAll('button')]
        const next = buttons.indexOf(document.activeElement as HTMLButtonElement) + (e.shiftKey ? -1 : 1)
        buttons[(next + buttons.length) % buttons.length]!.focus()
      }
      e.stopPropagation()
    }
    main.addEventListener('click', () => close(true))
    cancel?.addEventListener('click', () => close(false))
    // Clicking the dim area outside the dialog cancels it, as Escape does.
    backdrop.addEventListener('mousedown', (e) => e.target === backdrop && close(false))

    open = true
    document.addEventListener('keydown', onKey, true)
    document.body.append(backdrop)
    // A dialog that discards something starts on Cancel, so an Enter pressed in a hurry is safe.
    ;(danger && cancel ? cancel : main).focus()
  })
}
