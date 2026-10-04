import type { Command, Cursor } from './commands'
import type { Table } from './table'

/** What running, undoing or redoing did: the command (for cache invalidation) and where to put the cursor. */
export interface Outcome {
  command: Command
  cursor: Cursor | void
}

/** Undo and redo stacks, plus whether the table differs from what was last saved. */
export class History {
  private undoStack: Command[] = []
  private redoStack: Command[] = []
  /** Undo depth at the last save, or undefined once that state can no longer be reached. */
  private savedAt: number | undefined = 0

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get dirty(): boolean {
    return this.savedAt !== this.undoStack.length
  }

  execute(command: Command, table: Table): Outcome {
    const cursor = command.run(table)
    this.undoStack.push(command)
    this.redoStack = []
    if (this.savedAt !== undefined && this.savedAt >= this.undoStack.length) this.savedAt = undefined
    return { command, cursor }
  }

  undo(table: Table): Outcome | undefined {
    const command = this.undoStack.pop()
    if (!command) return
    this.redoStack.push(command)
    return { command, cursor: command.revert(table) }
  }

  redo(table: Table): Outcome | undefined {
    const command = this.redoStack.pop()
    if (!command) return
    this.undoStack.push(command)
    return { command, cursor: command.run(table) }
  }

  markSaved(): void {
    this.savedAt = this.undoStack.length
  }
}
