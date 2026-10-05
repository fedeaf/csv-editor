// In-page dialogs that replace the browser's alert and confirm: they use the app's own look, can say
// what each button does, and never leave the page.

import type { Delimiter, LineEnding } from '../csv/parse'
import { DELIMITER_OPTIONS, ENCODING_OPTIONS, LINE_ENDING_OPTIONS, encodingOption } from '../model/formatOptions'
import type { FileFormat } from '../model/table'

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

export interface FormatAnswer {
  /** `reload` reads the file again with the encoding and delimiter; `save` only changes how it will be written. */
  action: 'reload' | 'save'
  format: FileFormat
}

/**
 * The File Format dialog: the encoding, delimiter and line endings of a document. Resolves with the
 * choice and what to do with it, or undefined if cancelled. Without a file to read again
 * (`canReload` false) only the choice for saving is offered.
 */
export function formatDialog(name: string, current: FileFormat, canReload: boolean): Promise<FormatAnswer | undefined> {
  const result = queue.then(() => renderFormat(name, current, canReload))
  queue = result.catch(() => undefined)
  return result
}

function renderFormat(name: string, current: FileFormat, canReload: boolean): Promise<FormatAnswer | undefined> {
  return new Promise((resolve) => {
    const previous = document.activeElement as HTMLElement | null
    const backdrop = document.createElement('div')
    backdrop.className = 'dialog-backdrop'
    const dialog = document.createElement('div')
    dialog.className = 'dialog format-dialog'
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.setAttribute('aria-labelledby', 'dialog-title')
    const heading = Object.assign(document.createElement('h2'), { textContent: 'File Format', id: 'dialog-title' })
    const intro = Object.assign(document.createElement('p'), { textContent: `How "${name}" is read and written.` })

    const grid = document.createElement('div')
    grid.className = 'format-grid'
    const select = (label: string, options: { value: string; label: string }[], value: string) => {
      const field = document.createElement('select')
      field.id = `format-${label.toLowerCase().replace(/\W+/g, '-')}`
      for (const o of options) field.append(Object.assign(document.createElement('option'), { value: o.value, textContent: o.label }))
      field.value = value
      grid.append(Object.assign(document.createElement('label'), { textContent: label, htmlFor: field.id }), field)
      return field
    }
    const encoding = select('Encoding', ENCODING_OPTIONS.map((o) => ({ value: o.key, label: o.label })), encodingOption(current).key)
    const delimiter = select('Delimiter', DELIMITER_OPTIONS, current.delimiter)
    const lineEnding = select('Line endings', LINE_ENDING_OPTIONS, current.lineEnding)

    const note = document.createElement('p')
    note.className = 'format-note'
    note.textContent = canReload
      ? '"Reload file" reads it again with this encoding and delimiter, and drops any unsaved changes. "Use when saving" keeps the data as it is and changes how the file is written, line endings included.'
      : 'This document is not a file yet. The choice is used when it is saved.'

    const actions = document.createElement('div')
    actions.className = 'dialog-actions'
    const button = (text: string, className: string) => Object.assign(document.createElement('button'), { textContent: text, className })
    const cancel = button('Cancel', 'secondary-button')
    const save = button('Use when saving', canReload ? 'secondary-button' : 'primary-button')
    const reload = canReload ? button('Reload file', 'primary-button') : undefined
    actions.append(...(reload ? [cancel, save, reload] : [cancel, save]))
    dialog.append(heading, intro, grid, note, actions)
    backdrop.append(dialog)

    const chosen = (): FileFormat => {
      const option = ENCODING_OPTIONS.find((o) => o.key === encoding.value)!
      return {
        ...current,
        encoding: option.encoding,
        bom: option.bom,
        delimiter: delimiter.value as Delimiter,
        lineEnding: lineEnding.value as LineEnding,
      }
    }
    const close = (answer: FormatAnswer | undefined) => {
      document.removeEventListener('keydown', onKey, true)
      backdrop.remove()
      open = false
      previous?.focus({ preventScroll: true })
      resolve(answer)
    }
    // As in the other dialogs, the keys stay inside it; here the lists also need them.
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(undefined)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        const fields = [...dialog.querySelectorAll<HTMLElement>('select, button')]
        const next = fields.indexOf(document.activeElement as HTMLElement) + (e.shiftKey ? -1 : 1)
        fields[(next + fields.length) % fields.length]!.focus()
      }
    }
    dialog.addEventListener('keydown', (e) => e.stopPropagation())
    cancel.addEventListener('click', () => close(undefined))
    save.addEventListener('click', () => close({ action: 'save', format: chosen() }))
    reload?.addEventListener('click', () => close({ action: 'reload', format: chosen() }))
    backdrop.addEventListener('mousedown', (e) => e.target === backdrop && close(undefined))

    open = true
    document.addEventListener('keydown', onKey, true)
    document.body.append(backdrop)
    encoding.focus()
  })
}
