# CSV Editor: notes for whoever continues the work

A web CSV editor with a spreadsheet-style grid. Read `README.md` first (what it does) and the specification,
`CSV Editor MVP Specification.md` (the source of truth for behaviour: requirements, decisions D-01 to D-09, and the
long list under *Beyond the original scope*).

## Hard constraints

- **Chrome only**, and **one self-contained file**: `dist/index.html` must work opened with a double click, with no server.
- **Nothing leaves the computer.** The built page carries a Content-Security-Policy (`vite.config.ts`, `addPolicy`) with
  `default-src 'none'`, no connection of any kind, and only its own inline script and style, by hash. So: no `fetch`,
  XHR, WebSocket, beacon, worker, remote font or image; no `eval` or `new Function`; no inline `style="..."` attributes
  in markup (setting `el.style.x = ...` from code is fine). The development server has no policy.
- **English UI** (all texts, messages, code, comments). The user writes to you in Spanish; answer in Spanish.
- **License AGPL-3.0-or-later**, copyright fedeaf. Papa Parse (MIT) is the only runtime dependency; the build writes its
  license text at the top of `dist/index.html` (`addNotices`) and `THIRD_PARTY_NOTICES.md` holds it.
- **The grid keeps fixed row height.** The user rejected wrapping and variable heights; do not change the grid layout.

## Commands

```bash
npm install
npm run dev        # http://localhost:5173 (no security policy; window.__app is a small test hook)
npm test           # unit tests (vitest); keep them passing
npm run build      # type-checks, then writes dist/index.html
```

`dist/index.html` is **committed**: run `npm run build` before committing any change to the source.

## Map of the code

- `src/csv/` parse (Papa Parse), serialize (minimal or every-field quoting), encodings, delimiters.
- `src/model/` `table.ts` (rows and columns with stable ids), `commands.ts` (every change is a command with `run` and
  `revert`; undo, redo and the unsaved indicator rest on this), `history.ts`, `view.ts` (filters, column statistics,
  lazy; empty columns have a shortcut), `search.ts` (plain text and regex), `errors.ts` (spreadsheet errors and
  scientific notation), `summary.ts`, `clipboard.ts`, `formatOptions.ts`.
- `src/ui/` `grid.ts` (virtualized grid: selection, editing, fill, resize), `tabBar.ts`, `splitDivider.ts`, `dialog.ts`,
  `filterDropdown.ts`, `searchPanel.ts`, `contextMenu.ts`, `status.ts`, and pure helpers (`intervals`, `rects`, `columns`).
- `src/main.ts` wires everything. Key ideas:
  - **Panes.** One or two panes, each with its own `Grid`. The globals `grid` and `current` always belong to the pane in
    focus (`focusPane`). Side by side, each pane has its own strip of tabs (`Tab.side`); top and bottom, and single
    view, have one strip.
  - **Selection.** `Grid` keeps an active cell, an `extent` or a `band` (whole rows or columns) as the part being made,
    and `others` (parts added with Ctrl). `grid.ranges()` returns disjoint rectangles; copy, clear, delete and the status
    bar all work from it.
  - **Documents.** `CsvDocument` has a `format` (encoding, delimiter, line endings, quoting) changed through the
    `changeFormat` command, `quotedHeaders`, and either a `handle` or the `source` bytes.
- `src/style.css` holds the palette as `light-dark()` tokens; `src/palette.test.ts` checks contrast of text pairs, so a new
  text colour pair needs a line there.

## How a feature is done here

1. Implement it, with unit tests for the pure parts.
2. **Verify it in real Chrome** (below), by reading results, not by assuming.
3. Update `README.md` and the specification (*Beyond the original scope*, and the rows of the tables that it touches).
4. Rebuild `dist`, run the tests, and **wait to be asked** to commit or push.

### Verifying the interface (there is no UI test suite, on purpose)

Write a throwaway Node script (keep it in the scratchpad, not in the repo) that starts `google-chrome --headless=new
--remote-debugging-port=9333 --no-sandbox --user-data-dir=<tmp>`, connects to the page with the built-in `WebSocket`, and
drives it with the DevTools protocol: `Input.dispatchMouseEvent`, `Input.dispatchKeyEvent` (modifiers: Ctrl 2, Shift 8,
Alt 1), `Runtime.evaluate`, `Page.captureScreenshot`, and `Emulation.setEmulatedMedia` for dark mode. Things learnt the
hard way:

- Serve `dist` over `http://localhost:8765` (e.g. `python3 -m http.server`) when you need OPFS, which `file://` lacks.
  Replace `window.showOpenFilePicker` and `showSaveFilePicker` with functions that return OPFS file handles, so files can
  be opened and saved without a native dialog. `Browser.grantPermissions` for `clipboardReadWrite`.
- Drop events: dispatch a `DragEvent` with a real `DataTransfer` and patch
  `DataTransferItem.prototype.getAsFileSystemHandle` to return the OPFS handle.
- In a JS template string, `\n` becomes a real newline; write `\\n` inside code you evaluate in the page.
- Do not `pkill -f` a pattern that appears in your own command line (it kills your shell); use `pkill -f "[r]emote-debugging-port=9333"`
  on its own, and kill leftover headless browsers, which slow everything down.
- Geometry of the grid: row number column 72 px, header 28 px, rows 26 px, default column 200 px.
- A scripted session that shows no policy violation (`securitypolicyviolation` events) and no request but the page's own
  is how the no-network promise was checked.

## Working agreements with the user

- **Commit and push only when asked** ("haz commit", "push"). Messages: imperative first line, a short body, and the
  `Co-Authored-By` trailer. Nothing else is pushed.
- **A question is not a request.** "¿Es mucho trabajo?" or "¿qué sugieres?" gets an answer, not an implementation. "No
  implementes nada" means exactly that. If asked to wait ("esperaté"), wait for "ya".
- When a request is ambiguous in a way that changes the work, ask once (a short question with options); the user has
  dismissed wrong guesses before. For visual ideas, a mockup first.
- They are not interested in an end-to-end test suite; unit tests stay and should keep passing.
- Keep answers concrete, say what was verified and how, and say what was *not* done.

## Ideas not done yet (the user has seen the list)

Clean text (trim spaces, change case) and remove duplicate rows; value counts per column; compare two files side by
side (designed and mocked up, put aside); recover unsaved work (draft in the browser); column tools (freeze the first
column, reorder, hide); keyboard focus ring everywhere, and tabs reachable with the keyboard; arrow-key navigation in
menus; recent files on the start screen; chips listing active filters; go to row; sort by several columns; a case
option for Find; tooltip with the full text of a truncated cell; `Ctrl+D` to fill down; dimmer header controls; showing
empty and null cells, and invisible whitespace, differently; density setting.

## Small open decisions

- The license says "or later" (`AGPL-3.0-or-later`); change to `-only` in `package.json`, `vite.config.ts` and the README
  if preferred.
- A copy of an open file is named `name_copy1.ext`; the original's own characters (spaces included) are kept.
- Ctrl+click on a cell deselects it, and the last part of a selection cannot be deselected (Excel's rule is similar).
