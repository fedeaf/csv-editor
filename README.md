# CSV Editor

A web-based CSV editor with a spreadsheet-style grid. Every value is text and every row is an
indivisible unit: no operation can misalign the values of a row. Sorting, filtering and searching
always act on whole rows.

It ships as **one self-contained HTML file**, [`dist/index.html`](dist/index.html). Open it in
Chrome by double-clicking it. No server, no install, nothing to download.

> **Chrome only.** Opening and saving over the original file uses Chrome's File System Access API.
> Other browsers are not supported, and there is no mobile or responsive layout.

## Using it

Open a file with **Menu ▸ Open…**, or drag one or more `.csv` files onto the window. Each file opens
in its own tab and works independently: its own history, filters, sort and search position. Save,
undo, redo and Find only act on the tab in focus.

### What it does

| Area | Details |
| --- | --- |
| **Files** | Opens and saves CSV. Detects the encoding (UTF-8 with or without BOM, ASCII, Windows-1252 / ISO-8859-1) and the delimiter (comma or semicolon). On save it keeps the encoding, delimiter, line endings and BOM. Save writes over the same file; Save As creates a new one. |
| **Tabs** | Several documents at once. Close with the **×** or a middle click. Opening a file that is already open just brings its tab forward. A `*` marks unsaved changes in the tab and in the window title, and the browser warns before closing or reloading with unsaved changes. |
| **Editing** | Edit a cell by double-clicking, pressing F2 or just typing. Insert and delete rows and columns and rename headers from the right-click menu on row numbers and column headers. The first row is always the header. |
| **Undo / redo** | Covers cell edits, fill, paste, insert and delete of rows and columns, header renames and sorting. |
| **Sort** | ▲ and ▼ on every header. Whole rows move. Case-insensitive, English collation, blanks last, stable. Numbers are plain text, so `10` sorts before `9`. |
| **Filters** | The funnel on every header opens the AutoFilter: unique values with checkboxes, *Select All*, *(Blanks)*, a search box and *Duplicates only*. Filters on several columns combine. Filtering hides rows, it never deletes them, and saving writes every row. |
| **Duplicates** | Each header shows **DUP** when its column has repeated values, or a ✓ when it does not, as soon as the file opens. Click **DUP** to show only the duplicates of that column. Duplicates are exact matches, sensitive to case and spaces; blank cells never count. |
| **Find** | `Ctrl+F` opens a floating panel. Case-insensitive, partial match by default, with an *entire cell* option. It searches the rows shown, row by row, and wraps around. |
| **Fill** | Drag the handle at the corner of the selected cell, or double-click it to copy the value down the whole column. Values are copied as they are, with no series. With a filter active, only the rows shown change. |
| **Selection** | Select blocks by dragging, or with `Shift` and the arrows. Click a row number or a header to select the whole row or column. |
| **Copy and paste** | `Ctrl+C`, `Ctrl+X` and `Ctrl+V` on a cell, a block, a row or a column. The clipboard format is the tab-separated text that Excel and Google Sheets use. See below. |

### Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl+S` | Save the tab in focus |
| `Ctrl+Z`, `Ctrl+Y` | Undo, redo (`Ctrl+Shift+Z` also redoes) |
| `Ctrl+F`, `Ctrl+G` | Find; next match (`Shift+Ctrl+G` for the previous one) |
| Arrows, `Tab`, `Enter` | Move (`Shift+Tab` and `Shift+Enter` move back) |
| `Ctrl` + arrow | Jump to the first or last row or column |
| `Shift` + arrow | Extend the selection by one cell |
| `Ctrl+Shift` + arrow | Extend the selection to the end of the row or column |
| `Ctrl+A` | Select everything |
| `Ctrl+C`, `Ctrl+X`, `Ctrl+V` | Copy, cut, paste |
| `F2`, or typing | Edit the cell (`Alt+Enter` adds a line break inside it) |
| `Enter` / `Tab` / `Esc` in a cell | Confirm and move down / confirm and move right / cancel |
| `Delete` | Empty the selected cells |
| `Page Up`, `Page Down`, `Home`, `End` | Move by page, or to the first or last column |

### Copy and paste in detail

- Copying takes what you see: rows hidden by a filter are left out. A whole row or column copies its
  cells without the header.
- Pasting starts at the top-left cell of the selection and writes one clipboard row per row shown.
- A single value pasted over several selected cells fills all of them.
- Nothing is cut off. Lines that do not fit become new rows at the end of the table, and a block that
  is too wide adds columns with a blank header. The status bar says what was added.
- Every copy, cut, paste and delete is a single undo step.

## Development

Requires Node.js. The stack is TypeScript, [Vite](https://vite.dev) and
[Papa Parse](https://www.papaparse.com), with no UI framework. Tests use [Vitest](https://vitest.dev).

```bash
npm install
npm run dev       # development server at http://localhost:5173
npm run build     # type-checks, then writes the single file to dist/index.html
npm test          # unit tests
npm run samples   # writes test CSVs into samples/ (encodings, delimiters, a 200,000-row file)
```

`dist/index.html` is committed, so run `npm run build` before committing a change to the source.

In development, `window.__app` exposes a small test hook (load a file, read the active document and
history, switch and close tabs). It is not part of the production build.

### Structure

```
src/
  csv/        parsing, serializing and encoding detection (the part that must not corrupt data)
  model/      table, commands with undo, history, filters and duplicate statistics, search, clipboard
  ui/         grid, tab bar, filter dropdown, find panel, context menu
  document.ts a file loaded into a table, and turning it back into bytes
  files.ts    open, save and drag-and-drop with the File System Access API
  main.ts     ties the tabs, the grid and the menus together
```

How it holds together:

- Each row has a stable internal id that is never written to the file, and the table order is a list
  of those ids. Sorting reorders the list, never one column's values, so a row cannot come apart.
- Each column has a stable id too, so filters and the sort indicator stay on the right column when
  others are inserted or deleted.
- Every data-changing operation is a command with `run` and `revert`, which is what undo, redo and
  the unsaved-changes indicator are built on.
- Filters are a derived view over the table and are not part of the history.
- The grid is virtualized: only the rows in view, plus a small buffer, are in the DOM.

## Status and limits

Milestones H1 to H6 of [the specification](CSV%20Editor%20MVP%20Specification.md) are done, plus
several things beyond it: tabs, drag and drop, block selection and copy and paste.

Still open for H7, the wrap-up: a combined test of filtering, sorting, searching, filling, undoing and
saving, the final colour palette, and closing decisions D-01 to D-09 in the specification. The
defaults it proposes are what the editor does today.

Known limits:

- The browser caps how tall a scrolling area can be, which limits the grid to about 1.2 million rows.
- Opening a very large file takes a moment: about 1.2 s for 200,000 rows, mostly computing the
  duplicate indicators.
- Redundant quotes are not preserved on save: only fields that need quoting are quoted, so a file
  saved without edits can differ in its quotes while holding identical data.
- A file with mixed line endings is saved with the first one it uses.
- Windows-1252 and ISO-8859-1 cannot be told apart automatically and are treated as one encoding. If
  you type a character that encoding cannot represent, the editor asks before saving as UTF-8.
- The unit tests cover the model, the CSV handling and the clipboard format. The interface was
  checked by hand in Chrome, not with automated tests.
