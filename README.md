# CSV Editor

A web-based CSV editor with a spreadsheet-style grid. Every value is text and every row is an
indivisible unit: no operation can misalign the values of a row. Sorting, filtering and searching
always act on whole rows.

It ships as **one self-contained HTML file**, [`dist/index.html`](dist/index.html). Open it in
Chrome by double-clicking it. No server, no install, nothing to download.

> **Your data never leaves the computer.** The page makes no network request of any kind, and the built file
> carries a Content-Security-Policy that makes the browser refuse one: no fetch, XHR, WebSocket, beacon, frame, worker,
> font or remote image, and no script or style other than the two blocks of the file itself (allowed by their hash).
> Code that tried to send something, ours or a library's, would be stopped by Chrome and not by our goodwill. The
> development server (`npm run dev`) has no such policy, since it needs its own socket.

> **Chrome only.** Opening and saving over the original file uses Chrome's File System Access API.
> Other browsers are not supported, and there is no mobile or responsive layout.

## Using it

Open a file with the **Open file…** button on the start screen (which also has **New blank document** and a reminder of the main shortcuts) or **Menu ▸ Open…**, or drag one or more `.csv` files onto the window. Each file opens
in its own tab and works independently: its own history, filters, sort and search position. Save,
undo, redo and Find only act on the tab in focus.

### What it does

| Area | Details |
| --- | --- |
| **Files** | Opens and saves CSV. Detects the encoding (UTF-8 with or without BOM, ASCII, UTF-16 with BOM, Windows-1252 / ISO-8859-1) and the delimiter (comma or semicolon). On save it keeps the encoding, delimiter, line endings and BOM, and leaves out columns that have no header and no content and the empty rows at the end, so a blank document saves as an empty file. Save writes over the same file; Save As creates a new one. Besides `.csv` it opens `.tsv` and `.txt`. When detection gets it wrong, **Menu ▸ File Format…** lets you choose the encoding (UTF-8 with or without BOM, Windows-1252 / ISO-8859-1, UTF-16 LE or BE), the delimiter (comma, semicolon, tab or pipe) and the line endings (LF or CRLF). **Reload file** reads the file again with the encoding and delimiter chosen, dropping unsaved changes after asking; **Use when saving** keeps the cells and only changes how the file is written, as a change that can be undone. Only the second is offered for a new document. Setting *Quotes* to *Every field with content* in **File Format…** (with *Use when saving*) makes the saves write every field that has content between quotes: the header is written as it arrived (a quoted header stays quoted, an unquoted one stays unquoted), empty cells stay empty with no quotes, and anything else, spaces and numbers included, is quoted. The document remembers it (the status bar then says "all fields quoted") until *Quotes* is set back to *Only where needed* |
| **Tabs** | Several documents at once. The **+** after the last tab (or **Menu ▸ New**) starts a blank document, "Untitled.csv", of 255 columns and 65,535 rows, that exists only in memory: nothing is written to disk until you save it, and the first Save asks where. Only what has content is saved, so it is not 16 MB of commas. Drag a tab along the strip to put it in another place (a blue line shows where it will go). Close with the **×** or a middle click; a tab with unsaved changes asks first, with **Save** (green, which saves it and then closes it; if the Save As window is cancelled the tab stays open), **Close and discard** (red) and **Cancel**. Opening a file that is already open just brings its tab forward. An amber dot ahead of the name marks unsaved changes in the tab, and the active tab has a blue line on top. The browser tab always reads "CSV Editor", with a `*` in front while any document has unsaved changes, and the browser warns before closing or reloading with them. |
| **Split view** | **Menu ▸ Split Side by Side** or **Split Top and Bottom** shows two documents at once; **Single View** goes back to one. Each pane has its own document, scroll and selection. The pane in focus (the one you last clicked or typed in, marked by a blue line on its top edge; the other pane's selection turns grey) is the one that Save, undo, redo, Find, the menu and the status bar act on. Side by side, each pane has a strip of tabs of its own above it, and the right one starts exactly where its pane starts; clicking a tab shows that document in its pane, each strip has its own **+**, and a tab changes pane by dragging it to the other strip or from its right-click menu (*Move to the right panel*). Top and bottom, and in a single view, there is one strip: clicking a tab shows it in the focused pane, or focuses the pane that already shows it, and the tab shown in the other pane is underlined. A document can be in one pane at a time. With only one file open, the second pane shows the start screen, so a file can be opened or dropped into it; a file dropped on a pane opens there. Drag the bar between the panes to resize them (neither goes below 160 px), double-click it to split evenly, or focus it and use the arrows. |
| **Editing** | Edit a cell by clicking it again once it is selected, double-clicking, pressing F2 or just typing. The editor opens over the cell and shows all of its text. If the text does not fit the column, the editor spreads to the right over the columns beside it, up to just before the scroll bar (or slides left when the cell is among the last columns), and only if the text still does not fit on a line does it wrap and grow downward, up to the room the table has, past which it scrolls. Line breaks show as lines. The rows of the table stay where they are, one line each. Insert and delete rows and columns and rename headers from the right-click menu on row numbers and column headers, which also has Cut, Copy, Paste and Clear contents for the whole rows or columns chosen. Headers travel between files with **Copy header(s)** and **Paste headers** in the menu of a column header (or **Copy all headers** and **Paste headers** in the menu of the corner cell): the names go on the clipboard as one line, and pasting them gives their names to the columns from the one chosen on, adding columns if the file has fewer; it is one undo step. Ordinary copying of a row or column leaves the header out. Right-click on a cell for Cut, Copy, Paste, Clear contents and the same insert and delete entries, acting on what is selected. The first row is always the header. |
| **Undo / redo** | Covers cell edits, fill, paste, insert and delete of rows and columns, header renames and sorting Each one says what it did in the status bar ("Undone: Edit cell", "Redone: Sort"), or "Nothing to undo" / "Nothing to redo" when there is nothing left. |
| **Sort** | ▲ and ▼ on every header. Whole rows move. Case-insensitive, English collation, blanks last, stable. Numbers are plain text, so `10` sorts before `9`. |
| **Filters** | The funnel on every header opens the AutoFilter: unique values with checkboxes, *Select All*, *-[ Blanks ]-* (first in the list), a search box and *Duplicates only*. Filters on several columns combine. Filtering hides rows, it never deletes them, and saving writes every row. |
| **Duplicates** | Each header shows **DUP** when its column has repeated values, or a ✓ when it does not, as soon as the file opens. Click **DUP** to show only the duplicates of that column. Duplicates are exact matches, sensitive to case and spaces; blank cells never count. |
| **Spreadsheet errors and scientific notation** | A red warning ahead of a header's name appears while the column holds a cell that is a spreadsheet error, or a number that Excel turned into scientific notation (`1.23457E+15`, `4.5E-07`, `1,5E+10`; the exponent must carry its sign, as spreadsheets write it, so `1e5` is left alone). Spreadsheet errors are: `#N/A`, `#DIV/0!`, `#VALUE!`, `#REF!`, `#NAME?`, `#NUM!`, `#NULL!`, `#SPILL!`, `#CALC!` and the other Excel ones, `#ERROR!` from Google Sheets, Excel's Spanish versions (`#¡DIV/0!`, `#N/D`, `#¿NOMBRE?`…) and LibreOffice's `Err:502`-style codes. The whole cell must be the error; case and surrounding spaces are ignored. Text such as `N/A`, `NaN` or `null` does not count. The tooltip says how many cells and which errors. Click the warning to go to the first of them, click again for the next, and so on; after the last it starts over. The count covers the whole column, whatever a filter hides, but only rows shown are visited. The warning goes away when the last error is fixed. |
| **Find and replace** | `Ctrl+F` opens a floating panel. Drag it by the dotted strip on its left, or by any part of it that is not a control, to put it where it does not cover what you are reading; it stays inside the table's area, and double-clicking the strip puts it back in the corner. Case-insensitive, partial match by default, with an *entire cell* option and a *Regex* option that reads the text as a regular expression (JavaScript syntax; `.` also crosses the line breaks of a cell; with *entire cell* the pattern must match the whole cell). An invalid pattern is reported in the panel instead of searching. While the panel is open, every cell that matches is marked in the table (pale yellow, and orange for the one selected), in the document in focus; the marks follow edits, filters and scrolling, and go when the panel is closed. The message ("3 of 12", "No matches") sits inside the text field, which turns red when nothing is found or the pattern is not valid. It searches the rows shown, row by row, and wraps around, and the panel says which match you are on ("3 of 12", counting cells that match; the tooltip adds the row and column). A second row of the same panel is for replacing: **Replace** changes the selected match (every occurrence in that cell) and moves to the next one, and **Replace all** changes every match in the rows shown as one undo step. With *Regex* on, the replacement can use `$1`, `$&` and `$<name>` for what the pattern matched (`$$` is a dollar sign); otherwise it is taken literally. There is no separate shortcut for it. |
| **Fill** | Drag the handle at the corner of the selected cell, or double-click it to copy the value down the whole column. Values are copied as they are, with no series. With a filter active, only the rows shown change. |
| **Columns** | Drag the right edge of a header to resize its column, or double-click the edge to fit the column to its longest cells and its header. Widths are kept per document and are not saved in the file. |
| **Theme** | A light and a dark look. The page opens with the system's setting; **Menu ▸ Dark Mode** switches it for as long as the page stays open. The choice is not saved anywhere: the next visit starts from the system again. |
| **Status bar** | The left side shows the size of the selection ("Selected 3 rows × 2 columns (6 cells)") followed by what the cells hold, each figure as a small coloured label (green for "No blanks" and "No duplicates", amber for blanks, nulls and duplicates, grey for the unique count): how many are blank (empty or only spaces), how many are a null (text such as `null`, `NaN`, `N/A`, `none`), or "No blanks", how many different values there are ("9 unique"), and the duplicates: how many of them repeat and in how many cells ("2 duplicate values (4 cells)"), or "No duplicates". Duplicates are exact matches, sensitive to case and spaces, with blanks never counting, and all the cells selected are compared with each other. No cell is ever read as a number. Hover it for the full count. Only the rows shown are counted, and a very large selection is counted in the background, so the figures can arrive a moment after the selection or, for a few seconds, the result of the last action ("✓ Saved", "✓ Pasted"). The right side describes the file: rows, columns, encoding and delimiter, and how many rows a filter leaves visible. |
| **Selection** | With a single cell selected, its row is tinted faintly, to find it again at a glance; the tint goes away when a block, row or column is selected. Select blocks by dragging, or with `Shift` and the arrows. Click a row number or a header to select the whole row or column, or the corner cell above the row numbers to select everything (`Ctrl+A` does the same). |
| **Copy and paste** | `Ctrl+C`, `Ctrl+X` and `Ctrl+V` on a cell, a block, a row or a column. The clipboard format is the tab-separated text that Excel and Google Sheets use. See below. |

### Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl+S` | Save the tab in focus |
| `Ctrl+Z`, `Ctrl+Y` | Undo, redo (`Ctrl+Shift+Z` also redoes) |
| `Ctrl+F`, `Ctrl+G` | Find (and replace, from the same panel); next match (`Shift+Ctrl+G` for the previous one) |
| Arrows, `Tab`, `Enter` | Move (`Shift+Tab` and `Shift+Enter` move back) |
| `Ctrl` + arrow | Jump to the first or last row or column |
| `Shift` + arrow | Extend the selection by one cell |
| `Ctrl+Shift` + arrow | Extend the selection to the end of the row or column |
| `Ctrl+A` | Select everything (the view stays where it is) |
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
- After a paste the pasted block is selected and the view stays where it was, even if the block is far longer than the screen.
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

## License

Copyright (C) 2026 fedeaf.

CSV Editor is free software: you can redistribute it and modify it under the terms of the GNU Affero General Public
License as published by the Free Software Foundation, either version 3 of the License or (at your option) any later
version (`AGPL-3.0-or-later`). It is distributed in the hope that it will be useful, but without any warranty. See
[LICENSE](LICENSE) for the full text. The built `dist/index.html` states the same at its top, with the address of this
repository where the source is.

## Third-party software

The CSV is read with [Papa Parse](https://www.papaparse.com), which is MIT licensed (compatible with the AGPL, and
it keeps its own license inside the combined work). Its license text is written at the
top of the built `dist/index.html` and in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Status and limits

All seven milestones of [the specification](CSV%20Editor%20MVP%20Specification.md) are done, and its
decisions D-01 to D-09 are closed there, each with what the editor does. On top of the original scope
there are tabs, drag and drop, block selection, copy and paste, and the duplicate indicators.

The look comes from one palette, defined as named values at the top of
[`src/style.css`](src/style.css), with each colour written once for both themes, and described in the
specification under *Design*. A test keeps the text readable in both themes (WCAG contrast ratios).

Known limits:

- The browser caps how tall a scrolling area can be, which limits the grid to about 1.2 million rows.
- Opening a very large file takes a moment: about 1.2 s for 200,000 rows, mostly computing the
  duplicate indicators.
- Redundant quotes are not preserved on a normal save: only fields that need quoting are quoted, so a file
  saved without edits can differ in its quotes while holding identical data. To keep a file fully quoted,
  set *Quotes* in *File Format…*.
- Saving drops empty rows at the end of the table and columns with no header and no content, so a file that had them comes back without them. Empty rows between rows with content stay.
- A file with mixed line endings is saved with the first one it uses.
- Windows-1252 and ISO-8859-1 cannot be told apart automatically and are treated as one encoding. If
  you type a character that encoding cannot represent, the editor asks before saving as UTF-8.
- The unit tests cover the model, the CSV handling, the clipboard format and a combined scenario
  (filter, sort, search, fill, edit, paste, undo, save and reopen a Windows-1252 file). The interface
  itself was checked by hand in Chrome, not with automated tests.
