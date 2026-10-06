# CSV Editor: MVP Specification

Oct 4, 2026 · @Fed

## Summary

A web-based CSV editor with a spreadsheet-style interface, where every value is text and every row is an indivisible unit. The MVP ships in 7 milestones, starting with opening, viewing and saving a CSV without corrupting it.

| Aspect | Definition |
| --- | --- |
| Platform | Desktop web application. Chrome only. No mobile, tablet or responsive layout. |
| Language | Everything in English: UI text, messages, code, identifiers and comments. |
| Format | CSV only, for both opening and saving. |
| Data types | Text only. No numbers, dates, formulas or arithmetic operations. |
| Encodings | UTF-8, ASCII, Windows-1252 and ISO-8859-1, detected automatically. |
| Design | Functional, Excel-inspired interface with a floating dropdown action menu. |
| Approach | MVP. No defined file size limits, no exhaustive test suite, no optimization for edge cases. |

Guiding principle: no operation may misalign the values of a row. Sorting, filtering and searching always act on whole rows.

## Status

All seven milestones are done and every acceptance criterion below is ticked. The nine decisions are closed (see Decisions). The palette and the selection style were defined in H7 (see Design). Several features were added after the original scope; they are listed in Beyond the original scope.

## Functional requirements

Each requirement has an ID for referencing in tickets and milestones. Items marked as assumptions point to a decision (D-xx); all of them are closed in the Decisions section.

### File (ARC)

| ID | Requirement |
| --- | --- |
| ARC-01 | Open a CSV file from the menu. |
| ARC-02 | Automatically detect the encoding among UTF-8, ASCII, Windows-1252 and ISO-8859-1. No manual selection in the MVP. |
| ARC-03 | Save over the same file, and Save As. |
| ARC-04 | On save, preserve the original encoding, delimiter, line endings and BOM (assumption, D-03). |
| ARC-05 | Unsaved changes indicator: an asterisk in the browser tab title and in the UI. The browser tab keeps the name "CSV Editor" whatever files are open, with the asterisk in front while any of them has unsaved changes; the asterisk next to each file's name is in the strip of tabs. |
| ARC-06 | Browser warning when closing or reloading with unsaved changes. |

### Grid and editing (EDI)

| ID | Requirement |
| --- | --- |
| EDI-01 | Grid with column headers and row numbers. The first CSV row is the header (assumption, D-01). |
| EDI-02 | Select a cell by clicking. Edit by double-clicking, pressing F2 or typing directly, as in Excel. |
| EDI-03 | Tab moves right and Enter moves down. Shift+Tab and Shift+Enter move in reverse. Arrow keys navigate. |
| EDI-04 | Escape cancels the edit in progress. |
| EDI-05 | Insert a row above or below the selected one, and delete rows. |
| EDI-06 | Insert a column to the left or right, delete columns and rename headers. |
| EDI-07 | Virtualized grid: only the rows visible on screen, plus a small buffer, are rendered. |

### Sort (ORD)

| ID | Requirement |
| --- | --- |
| ORD-01 | Ascending and descending arrows on every column header. |
| ORD-02 | Sorting always moves the whole row. There is no option to sort a single column and the user is never asked. |
| ORD-03 | Text comparison, case-insensitive, alphabetical using English collation, blank cells last (decided, D-04). |
| ORD-04 | Stable sort: rows with equal values keep their relative order. |
| ORD-05 | Visual indicator of the active sort column and direction. |
| ORD-06 | Sorting can be undone. |

### Filters and duplicates (FIL)

| ID | Requirement |
| --- | --- |
| FIL-01 | AutoFilter button on every header. Opens a dropdown listing the column's unique values, each with a checkbox, plus "Select All" and "-[ Blanks ]-", which is the first entry of the list and written in brackets so it cannot be taken for a value. |
| FIL-02 | Filters on several columns combine: a row is shown only if it matches all of them. |
| FIL-03 | "Duplicates only" option in the dropdown: shows rows whose value in that column appears more than once (equality rule, D-05). |
| FIL-04 | Visual indicator on filtered columns. Clear the filter per column, and clear all filters. |
| FIL-05 | Filtering hides rows, it never deletes them. Saving writes all rows, visible or hidden (assumption, D-06). |

### Global search (BUS)

| ID | Requirement |
| --- | --- |
| BUS-01 | Floating panel opened from the menu or with Ctrl+F. |
| BUS-02 | Searching jumps to and selects the first matching cell. |
| BUS-03 | The "Next" button and Ctrl+G move to the next match. After the last match it wraps to the first. |
| BUS-04 | Case-insensitive. |
| BUS-05 | Partial match by default. The panel has a flag to switch to exact match. |
| BUS-06 | Searches visible rows only, that is, rows not hidden by an active filter. |
| BUS-07 | Traversal row by row, left to right (assumption, D-07). |

### Drag-copy and fill (REL)

| ID | Requirement |
| --- | --- |
| REL-01 | Fill handle in the bottom-right corner of the selected cell. |
| REL-02 | Dragging it horizontally or vertically copies the value as-is into the covered cells. No incrementing series. |
| REL-03 | Double-clicking the fill handle copies the value down the whole column, to the last row of the table. |
| REL-04 | With an active filter, fill only affects visible rows (assumption, D-08). |
| REL-05 | Each fill is a single undo step. |

### Undo and redo (HIS)

| ID | Requirement |
| --- | --- |
| HIS-01 | Undo and redo from the menu and with Ctrl+Z and Ctrl+Y. |
| HIS-02 | Covers cell edits, fill, inserting and deleting rows and columns, renaming headers, and sorting. |
| HIS-03 | Applying or clearing filters is not recorded in history, because it only changes the view (assumption, D-06). |

### Menu (MEN)

| ID | Requirement |
| --- | --- |
| MEN-01 | Discreet floating dropdown action menu with Open, Save, Save As, Undo, Redo and Find. |
| MEN-02 | Inserting and deleting rows and columns from a right-click context menu (assumption, D-09). |
| MEN-03 | Ctrl+S shortcut to save, in addition to Ctrl+F, Ctrl+G, Ctrl+Z and Ctrl+Y. |

## Out of scope and phase 2

The MVP explicitly leaves out the following; none of it should block delivery.

| Topic | Status |
| --- | --- |
| Manual encoding selection when opening | Phase 2 |
| Match counter such as "3 of 12" in search | Done: the panel shows which match is selected and how many there are |
| Previous match with Shift+Ctrl+G | Done (Shift+Ctrl+G, and Shift+Enter in the search field) |
| Formats other than CSV (xlsx, json, tsv) | Out of scope |
| Data types, formulas and arithmetic operations | Out of scope |
| Mobile, tablet and browsers other than Chrome | Out of scope |
| Maximum file size | Not defined |
| Exhaustive test suite and edge cases | After the MVP |
| Color palette and selection highlight style | Decided in H7 (see Design) |

## Decisions

Nine points were not defined during the scoping conversation. All are now closed; each row says what the editor does. Where the decision was the default proposal, the alternative that was not taken is noted.

| ID | Question | Decision | Closed in |
| --- | --- | --- | --- |
| D-01 | Is the first row always the header? | Yes, always. A row with more cells than the header adds columns with a blank header, so no data is lost, and the user is warned. A row with fewer cells is padded with blanks, also with a warning. | H1 |
| D-02 | Which delimiters are supported? | Comma and semicolon, detected automatically: the one that gives the most consistent rows of two or more columns, comma on a tie. | H1 |
| D-03 | Which encoding is used on save? | The original one, with its BOM. If an edit adds a character that encoding cannot represent (for example an emoji in Windows-1252), the editor asks whether to save as UTF-8. If the user declines, nothing is written. Windows-1252 and ISO-8859-1 cannot be told apart and are one encoding. | H1 |
| D-04 | Which sort order is used? | Alphabetical using English collation, case-insensitive, blank cells last, in ascending and descending order. Accents still count, so "é" and "e" are different letters, but "A" and "a" are equal and keep their original order. Since everything is text, "10" sorts before "9". | H3 |
| D-05 | What counts as a duplicate? | Exact equality, case- and whitespace-sensitive. Blank cells never count. Duplicates are always measured over the whole column, whatever other filters are active. Not taken: ignoring case and surrounding spaces. | H4 |
| D-06 | What is saved with active filters or a sort applied? | All rows, in the current order. Filters are view-only and are not part of undo. | H1 and H4 |
| D-07 | In which order does search traverse cells? | Row by row, left to right, over the rows shown. A new search starts at the first visible row; Next continues from the last match and wraps around. Not taken: starting from the selected cell. | H5 |
| D-08 | Does fill affect rows hidden by a filter? | No, visible rows only. The same rule applies to paste and to Delete over a selection. | H6 |
| D-09 | Where do inserting and deleting rows and columns live? | Right-click context menu on row numbers and column headers. The top-left corner offers "Insert row at top", for a table that has no rows to click. The menu of a cell has them too, next to Cut, Copy, Paste and Clear contents (with their shortcuts shown): it acts on what is selected, keeping a selection when the click is inside it and selecting the cell otherwise. The menus of row numbers and column headers begin with the same four entries (Cut, Copy, Paste, Clear contents), acting on the whole rows or columns chosen. Paste from the menu needs the browser's permission to read the clipboard, asked the first time; if it is refused the editor says to use Ctrl+V. | H2 |

## Technical notes

The biggest technical risk in the MVP is opening and saving without corrupting data, not the grid. These notes do not impose a stack; they set constraints any implementation must respect.

### CSV parsing

- Follow RFC 4180: quoted fields, quotes escaped as two double quotes, and line breaks and delimiters inside quoted fields.
- Rows with fewer columns than the header are padded with blank cells. Rows with more columns are handled per D-01 and the user is warned.
- Prefer a proven parsing library over a custom parser \[Inference\]. Splitting on commas breaks on quoted fields.

### Encoding detection

Proposed algorithm, in this order:

1. If the file starts with the UTF-8 BOM (EF BB BF), it is UTF-8.
2. If it decodes as valid UTF-8 with `TextDecoder('utf-8', { fatal: true })`, it is UTF-8. A pure ASCII file lands here, because ASCII is a subset of UTF-8.
3. Otherwise, decode as Windows-1252.

In Chrome, the labels "iso-8859-1", "latin1" and "ascii" are synonyms for Windows-1252 per the WHATWG Encoding Standard ([source](https://encoding.spec.whatwg.org/)). Telling Windows-1252 apart from ISO-8859-1 automatically is not reliable: they only differ in bytes 0x80 to 0x9F. Proposal: treat them as a single case, "Windows-1252 / ISO-8859-1".

### Writing and saving

- The browser's `TextEncoder` only encodes UTF-8 ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/TextEncoder)). Saving as Windows-1252 requires a custom encoder built on that encoding's 256-entry table.
- Saving over the same file is feasible with Chrome's File System Access API (`showOpenFilePicker` and `showSaveFilePicker`). It requires HTTPS or localhost and a user gesture such as a click ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker)). The API is not available in other major browsers, which is acceptable because the target is Chrome only.
- On save, quote only the fields that need it. Consequence: a file saved without edits may differ from the original in redundant quotes, even though the data is identical.

### Data model

- Each row has a stable internal identifier that is never written to the file. Table order is a list of those identifiers.
- Sorting reorders the list of identifiers, never the values of a single column. This makes ORD-02 hold by design.
- Filters are a derived view: the set of visible rows is recomputed while the data stays unchanged.
- Columns have stable ids as well, so filters and the sort indicator stay on the same column when others are inserted or deleted.
- History is implemented as a list of commands with do and undo. Every data-changing operation is defined as a command from milestone H2 onward.

### Performance

There is no defined size limit, but rendering every cell in the DOM degrades the interface with files of tens of thousands of rows \[Inference\]. Decision: the grid is virtualized from H1 (EDI-07), rendering only the rows visible on screen. Adding it later would force rewriting selection, editing and fill.

### Keyboard shortcuts

Ctrl+F, Ctrl+G and Ctrl+S have built-in behavior in Chrome. The app intercepts them while it has focus. Verified in Chrome: all three can be overridden.

## Implementation milestones

Seven milestones. H1 and H2 are sequential and lay the foundation; after that H3 and H4 can proceed in parallel, while H5 and H6 wait for H4 because they depend on which rows are visible.

&#91;embedded content: milestone dependencies · 7 milestones\]

H1 is highlighted because opening and saving without corrupting data is the biggest technical risk. Each arrow means a milestone needs the previous one finished.

| Milestone | Goal | Requirements | Depends on |
| --- | --- | --- | --- |
| H1 Open, view and save | Open a CSV, show it in the grid and save it without data loss | ARC-01 to ARC-04, EDI-01, EDI-07, MEN-01 (Open, Save, Save As) | None |
| H2 Editing and history | Edit the table with undo, redo and a change indicator | ARC-05, ARC-06, EDI-02 to EDI-06, HIS-01, HIS-02, MEN-02, MEN-03 | H1 |
| H3 Sort | Sort by column, moving whole rows | ORD-01 to ORD-06 | H2 |
| H4 AutoFilter and duplicates | Filter by values and detect duplicates | FIL-01 to FIL-05, HIS-03 | H2 |
| H5 Global search | Search and jump between matches | BUS-01 to BUS-07 | H4 |
| H6 Drag-copy and fill | Copy values by dragging or double-clicking | REL-01 to REL-05 | H2 and H4 |
| H7 MVP wrap-up | Integration, final design and closed decisions | All | H3, H5 and H6 |

### H1 Open, view and save

Acceptance criteria:

- [x] Files in UTF-8 with and without BOM, ASCII and Windows-1252 display accented letters and ñ correctly.
- [x] Opening, saving without edits and reopening produces the same table, cell by cell.
- [x] Fields with quotes, delimiters and embedded line breaks appear in a single cell.
- [x] A semicolon-delimited file opens correctly (D-02).
- [x] Save writes over the original file and Save As creates a new one.
- [x] The grid is virtualized and scrolling does not stall with the largest test file the team chooses.

### H2 Editing and history

Acceptance criteria:

- [x] Editing works by double-click, F2 or typing. Enter commits and moves down, Tab commits and moves right, Escape cancels.
- [x] Rows and columns can be inserted and deleted, and headers renamed.
- [x] Every change can be undone and redone with Ctrl+Z and Ctrl+Y and from the menu.
- [x] The asterisk appears with the first change and disappears on save.
- [x] Closing or reloading the tab with unsaved changes shows the browser warning.

### H3 Sort

Acceptance criteria:

- [x] The arrows sort the table and every cell of each row stays together, verified with a control row.
- [x] Rows with equal values keep their relative order.
- [x] The active column and direction are visible.
- [x] Undo restores the previous order.
- [x] Saving writes rows in the current order.

### H4 AutoFilter and duplicates

Acceptance criteria:

- [x] The dropdown lists the column's unique values, including "-[ Blanks ]-" (first).
- [x] Filters on two columns combine correctly.
- [x] "Duplicates only" shows only rows whose value repeats in that column.
- [x] Filtered columns are visually marked and clearing the filter restores all rows.
- [x] Saving with an active filter writes all rows.
- [x] If an edited cell no longer matches the filter, its row stays visible until the filter is reapplied, as in Excel (assumption).

### H5 Global search

Acceptance criteria:

- [x] Ctrl+F and the menu open the panel with focus in the search field.
- [x] Searching jumps to the first match, selects it and scrolls the grid to it.
- [x] "Next" and Ctrl+G advance, and after the last match they wrap to the first.
- [x] Searching "ana" finds "Mariana" and "ANA". With the exact match flag it only finds cells whose whole value is "ana", case-insensitive.
- [x] Rows hidden by a filter are skipped.
- [x] With no matches, the panel says so.

### H6 Drag-copy and fill

Acceptance criteria:

- [x] Dragging the fill handle copies the value into the covered cells, horizontally or vertically.
- [x] Double-clicking the fill handle copies the value down to the last row, including in an empty column.
- [x] With an active filter, only visible rows change (D-08).
- [x] A single Ctrl+Z undoes the whole fill.

### H7 MVP wrap-up

Acceptance criteria:

- [x] Cross-feature test: filter, sort, search, fill, undo some of the changes and save. The reopened file contains exactly what is expected.
- [x] Color palette and selection highlight defined and applied across the interface.
- [x] Decisions D-01 to D-09 closed and reflected in this document.

## Design

The palette is defined once, as named values at the top of the stylesheet, and every colour in the interface comes from those names. It is one accent blue on a cool-grey scale, plus a few colours that only carry meaning.

| Role | Colour | Used for |
| --- | --- | --- |
| Accent | `#1a73e8` | Active cell outline, the outline of a selected block, fill handle, OK button, links |
| Selection fill | `#dce8fc` | The cells of a selected block |
| Selection header | `#dde3ea` | Row numbers and headers of the selected rows and columns |
| Chrome | `#f1f3f4` | Toolbar, headers, row numbers, status bar |
| Lines | `#d4d4d4`, `#ececec` | Borders, grid lines |
| Text | `#202124`, `#5f6368` | Main and secondary text |
| Duplicates | `#fde7c4` on `#a24a00` | The DUP indicator on a header |
| No duplicates | `#34a853` | The ✓ on a header |
| Error | `#c5221f` | "No matches" in the search panel |

Each colour is written once with its two values, light and dark (`light-dark()`), and a dark theme is built from the same names. The accent turns lighter and the text on it dark; every pair of text and background keeps at least the contrast WCAG asks for (4.5:1), which a test checks for both themes. The page opens with the system's theme. **Menu > Dark Mode** is a switch that changes it for as long as the page stays open; the choice is deliberately not stored, so the next visit starts from the system again.

Reading aid: while a single cell is selected, the rest of its row carries a faint tint of the accent colour (`--row-here`, a translucent layer over the background of the row); it disappears when a block, a row or a column is selected, where the selection style below takes over. The column is not tinted.

Selection style: the cells of a block are tinted and the block is outlined along its outer edge. The active cell, where typing goes, is tinted like the rest and told apart by its own outline. The row numbers and headers the block covers are shaded, and a whole selected column has a darker header.

The Find panel floats at the top right of the table, starting just under the row of column headers, so the headers stay in view and only the first rows are covered.

The Menu button is drawn like a tab: flat, with a menu icon, the same height as a tab and on the same line, rounded only at the top. It lights up under the pointer, stays marked while its menu is open, and shows a focus ring when reached with the keyboard.

Header controls: every header carries the same controls, all always in view. From left to right: the warning for spreadsheet errors (only when it applies, ahead of the name), the duplicates indicator, the sort control and the filter. The icons share one style and size. The two sort directions are one control, an up arrow over a down arrow, each half a target of its own; the active direction takes the accent colour. The duplicates indicator is a tag that stands out when there are duplicates and a quiet check mark when there are none, so that the exception is what catches the eye. At rest the icons are drawn quietly; they firm up under the pointer, and an active one (a sorted direction, a filtered column) takes the accent colour.

## Beyond the original scope

Added after the MVP was specified:

- **Duplicate indicator on every header**, shown as soon as a file opens: DUP when the column has repeated values, a check mark when it does not. Clicking DUP shows only the duplicates of that column.
- **Warning for spreadsheet errors and scientific notation.** A red warning ahead of a header's name while the column holds a cell whose whole content is a number in scientific notation as spreadsheets write it (digits, an optional decimal part with a point or a comma, an `E` in either case and an exponent with its sign: `1.23457E+15`, `-4.5E-07`, `1,5E+10`; an exponent without a sign, as in `1e5`, is not taken because a spreadsheet always writes it, and codes and identifiers often look like that), or a spreadsheet error value, ignoring case and surrounding spaces: `#NULL!`, `#DIV/0!`, `#VALUE!`, `#REF!`, `#NAME?`, `#NUM!`, `#N/A`, `#SPILL!`, `#CALC!`, `#GETTING_DATA`, `#FIELD!`, `#BLOCKED!`, `#CONNECT!`, `#UNKNOWN!` (Excel), `#ERROR!` (Google Sheets), `#¡NULO!`, `#¡DIV/0!`, `#¡VALOR!`, `#¡REF!`, `#¿NOMBRE?`, `#¡NUM!`, `#N/D` (Excel in Spanish) and `Err:` followed by three digits (LibreOffice). Plain text that only resembles an error (`N/A`, `NaN`, `null`, `#1`, `div0`) does not count. The warning is measured over the whole column, whatever a filter hides, and its tooltip gives the number of cells and a few of the errors. Clicking it selects the first cell of the column with an error, scrolling to it; each further click goes to the next, top to bottom, and after the last one starts over from the first. Only rows shown are visited, as in Find; if every error is in rows hidden by a filter, the status bar says so. Any edit or filter change makes the walk start again from the top.
- **Several documents in tabs.** Each tab has its own history, filters, sort and search position. Save, undo, redo and Find act on the tab in focus. Several files can be chosen in the Open dialog; a file that is already open is brought forward instead of opened twice.
- **New blank documents.** A **+** after the last tab (it stays at the right end of the strip when the tabs overflow, and is there even with no file open) and **Menu ▸ New** open an empty document in a new tab: 255 columns with blank headers and 65,535 empty rows, UTF-8, comma-delimited (it takes under a second to appear). It is named "Untitled.csv", "Untitled 2.csv"… and exists only in memory; nothing is written to disk until the user saves it, and Save (`Ctrl+S`) on it asks where to save, as Save As does, after which the tab takes the name of the file. **Saving writes only what has content:** the columns that have a header or hold any text, and the rows up to the last one with text. Empty columns and empty rows at the end are left out (empty rows in between stay, so rows keep their place), which applies to every file, not only new ones. A document still blank therefore saves as an empty, zero-byte file, and a column with no header but with data is kept so no data is lost. An untouched blank document counts as unsaved-change-free, so closing it does not ask; once edited, closing it asks like any other tab.
- **Split view of two documents.** Menu entries *Split Side by Side*, *Split Top and Bottom* and *Single View*. At most two panes, equal in size at first. The bar between them can be dragged (neither pane goes below 160 px), double-clicked to split evenly, or moved with the arrow keys while it has focus; the proportion is kept when the orientation changes and starts again at one half with each new split. Each shows one document, with its own scroll and selection; a document is shown in one pane at a time. The pane in focus is the last one clicked or typed in (a blue line on its top edge; the selection of the other turns grey), and Save, undo, redo, Find, the menu and the status bar act on its document only. Top and bottom, and in a single view, the window has one strip of tabs: a click on a tab shows that document in the pane in focus, or moves the focus to the pane that already shows it, and the tab shown in the other pane is underlined. Side by side, the strip is divided in two: each pane has its own, the right one beginning at the left edge of the right pane (and as wide as that pane, following the divider when it is dragged), and every open document belongs to one of them. A document belongs to the pane where it is shown; opening, creating or dropping one puts it in the pane in focus, and a click on a tab shows it in its own pane and focuses that pane. Each strip has its own **+**, which creates the document in its pane. The selected tab of each strip is drawn as selected, with the blue line on top only for the pane in focus. A tab moves to the other strip by dragging it there or with *Move to the right panel* / *Move to the left panel* in its right-click menu; the pane it leaves shows its next neighbour in the strip, or the start screen if there is none, and closing a tab does the same. Going back to one strip, or splitting again, gathers the tabs and gives each pane's document to its strip. When the split is made, the second pane shows the first open document not yet shown, or, if there is none, the start screen, which can open or take dropped files like the one of an empty window. Files are dropped into the pane under the cursor. Closing the document of the other pane gives that pane another open document or the start screen; Single View keeps the pane in focus.
- **Choosing the format by hand** (*Menu ▸ File Format…*). A dialog with the encoding (UTF-8, UTF-8 with BOM, Windows-1252 / ISO-8859-1, UTF-16 LE or BE, the last two always with a byte order mark), the delimiter (comma, semicolon, tab, pipe) and the line endings (LF, CRLF), starting from what the document has now. *Reload file* reads the file again from disk (or from the bytes kept, for a file dropped without a handle) with the encoding and delimiter chosen, as a fresh document: its history, filters and scroll are gone, and if it has unsaved changes the editor asks before dropping them. *Use when saving* leaves the cells alone and changes only how they are written; it is an ordinary step of the history, so it marks the document as changed and can be undone. A new document, which has no file to read again, is only offered this second choice. Automatic detection still knows only comma and semicolon (D-02) and now also recognises UTF-16 by its byte order mark; tab and pipe have to be chosen. A value containing the delimiter chosen is quoted on save, as with any other. The Open dialog and drag and drop also accept `.tsv` and `.txt` files.
- **Small visual refinements.** A tab with unsaved changes shows an amber dot ahead of its name instead of an asterisk (the browser tab's title keeps its `*`), and the active tab has a line in the accent colour on top. In the Find panel the message ("3 of 12", "No matches", "Invalid pattern") sits inside the text field at its right end instead of squeezing it, and the field turns red while the search finds nothing or the pattern is not valid. The start screen, shown in every empty pane, has *Open file…* and *New blank document* side by side and a short list of the main shortcuts. Menus, filter lists and dialogs appear with a very short fade and slide (about 0.15 s), and the cell a jump lands on (a Find match, or a click on a header's warning) flashes in amber for under a second; all of it is switched off when the system asks for reduced motion.
- **Saving with every field quoted** (*Quotes* in *Menu ▸ File Format…*, applied with *Use when saving*; there is no menu entry of its own). Part of the document's format, so it is undoable and the saves that follow keep it. The rules: the header line is written as it arrived, each header quoted if the file quoted it (a header added or renamed keeps its column's style, and a new column's is unquoted) and always quoted when it holds the delimiter, a quote or a line break; an empty cell is written empty, with no quotes; any other cell is written between quotes, with the quotes inside doubled, whether it holds text, spaces or what looks like a number. The one exception is a table of a single column, where an empty value would make a blank line that a reader skips, so it is written as `""`, as it already was. Without the option, quoting stays minimal (D-03 and the limit noted under *Known limits*). The status bar adds "all fields quoted".
- **App icon** in the browser tab: a blue rounded square with a white table (a pale header row over three more), the colour of the interface's accent. It is an SVG written inline in the page's `<link rel="icon">`, so the file stays self-contained, and it stays legible at 16 px.
- **Tabs can be reordered** by dragging: a blue line marks the place, before the tab whose middle the pointer has not passed yet, or at the end. It works in the single strip and in each strip of a side-by-side split, where dropping on the other strip also moves the document to that pane at that place.
- **Undo and redo name what they did.** The status bar says "Undone: Edit cell" or "Redone: Paste" (the names are those of the operations: Edit cell, Rename header, Insert row(s), Delete row(s), Insert column, Delete column(s), Sort, Fill, Clear contents, Paste, Replace, Change file format), for the few seconds that any result stays there. With nothing to undo or redo it says "Nothing to undo" or "Nothing to redo", in grey. The change may be out of sight, which is why the message is worth having.
- **Drag and drop** of one or more CSV files onto the window; each opens in its own tab.
- **Selecting blocks** by dragging, with Shift and the arrows, and with Ctrl+Shift and the arrows to the end of a row or column. Whole rows and columns by their number or header. Ctrl+A selects everything.
- **The corner cell** (above the row numbers, left of the headers) selects everything when clicked, like Ctrl+A, without moving the view. Its right-click menu is unchanged.
- **Ctrl and the arrows** jump to the first or last row or column.
- **Copy, cut and paste** of cells, blocks, rows and columns, as the tab-separated text that Excel and Google Sheets use. A single value pasted over a selection fills it. Lines that do not fit become new rows and a block that is too wide adds columns, so nothing is dropped.
- **Delete** empties the selected cells.
- **Start screen.** With no file open, the window shows an Open button and a note that files can be dropped anywhere in it.
- **In-page dialogs** instead of the browser's own alert and confirm, for closing a tab with unsaved changes (with three buttons: Cancel, *Close and discard* in red and *Save* in green, which saves that tab, asking where first if it has no file, and closes it only once it was written; if the save is cancelled or fails, the tab stays open), for saving as UTF-8 when a character does not fit the file's encoding, and for errors. They name what each button does, start on Cancel when the action discards something, and keep keys and shortcuts from reaching the table underneath.
- **Summary of the selection** on the left of the status bar, drawn as small rounded labels after the size of the selection: green for good news ("No blanks", "No duplicates"), amber, as the DUP indicator, for blanks, nulls and duplicates, and grey for the unique count (new palette tokens `--ok-bg` and `--ok-ink`, checked for contrast like the rest), after the size of the selection (shown from two cells up): the cells that are blank (empty or only spaces), those that are a null (whole content, ignoring case and spaces: `null`, `nil`, `none`, `NaN`, `N/A`, `NA`), or "No blanks" when there are neither, the number of unique values (the different values among the cells, each counted once however often it repeats, blanks left out), and the duplicates: how many different values appear more than once and how many cells they fill, or "No duplicates". Duplicates follow the same rules as the header indicator (exact matches, case and spaces matter, blanks never count) and compare all the cells selected with each other, across columns too. Nothing is ever treated as a number: this is a text editor, so there are no sums or averages. The tooltip gives every count. It counts the rows shown only, follows edits and filters, and for selections over 5,000 cells is made in slices after a short pause so that dragging a selection or selecting a whole big table never blocks the page; past two million different values neither the unique values nor the repeats are counted.
- **A status bar in two parts.** On the left, the size of the selection, or for four seconds the result of the last action (saved, copied, pasted); a new selection replaces the message. On the right, the file's rows, columns, encoding and delimiter, and "Showing X of Y rows" under a filter.
- **Dark theme**, following the system setting, with a Dark Mode switch in the menu that overrides it for the visit (not saved).
- **Regular expressions in Find and Replace.** A *Regex* checkbox in the Find panel makes the text to find a JavaScript regular expression instead of plain text, still ignoring case. The dot also matches line breaks, since a cell can hold several lines; the unicode mode is used when the pattern allows it (so `\p{L}` works) and dropped when it does not (so `\-` works). With *Match entire cell* the pattern has to match the cell from end to end. A pattern that is not valid is reported in the panel ("Invalid pattern", with the reason in the tooltip) and nothing is searched or replaced. With the option on, the replacement may use `$1`..`$9`, `$&`, `$<name>` and `$$`; with it off the replacement stays literal as before. Count, "3 of 12", stepping, Replace and Replace all work as for plain text, and changing the option searches again from the first cell.
- **All the matches of a search are marked.** While the Find panel is open and has something to find, every cell of the rows shown that matches is drawn with a pale yellow background, and the one Find has selected with a stronger orange (two palette tokens, `--match` and `--match-current`, checked for contrast). It is the same list that the "3 of 12" counts, so the number of marked cells and the count agree; it is only drawn in the document in focus (the marks move with the focus in a split view), follows edits, filters and scrolling, and disappears when the panel closes, when the text is emptied or when a regular expression is not valid. A block selection takes precedence over the mark in the cells it covers.
- **The Find panel can be moved.** A strip of dots on its left edge, and any part of the panel that is not a control, drags it within the area of the table (it never goes partly outside it, and the text field keeps the focus while it is dragged). Double-clicking the strip puts it back in the top right corner. Where it was left is kept while the page stays open, and it follows the pane in focus in a split view, kept inside that pane; the panel is never wider than its pane.
- **Replace**, in a second row of the Find panel that is always shown, so it has no shortcut of its own. Replace changes the selected match, every occurrence of the text inside that cell, and goes on to the next; with *Match entire cell* it swaps the whole cell. Replace all changes every match as one undo step. The text to replace and the replacement are taken literally, matching ignores case, and only the rows shown are searched and changed (D-08), so rows hidden by a filter keep their text.
- **The editor shows the whole text of a cell.** F2, a double click, or typing opens the editor over the cell, as wide as its column while the text fits. When it does not, the editor spreads to the right, over the columns beside it, just as far as the text needs and no further than a little before the scroll bar; in the last columns, where there is no room to the right, it slides left to get it. Only if the text still does not fit on a line does it wrap, and then it grows downward as tall as the wrapped text needs, up to the room the table has (past that it scrolls inside), and the table scrolls if the editor would run past its bottom. Line breaks show as lines. A scroll bar appears only when the text is longer than the room there is. Rows keep their height, so the table itself does not change; a header name still edits on one line. Alt+Enter adds a line break, Enter confirms and Escape throws the change away, as before.
- **A second click edits.** Clicking a cell that is already the only one selected opens its editor, like F2. It does not apply with Shift, to a cell that is part of a larger selection (that click narrows the selection first), after a drag, or when the click only brings the focus back to the table from another field.
- **Resizable columns.** Drag the edge of a header to resize a column, between 120 and 1200 pixels; double-click it to fit the content. The minimum leaves room for the header's controls. Widths belong to the view: they are kept per tab, are not part of the history and are not saved in the file.

## Verification

- The model, the CSV handling and the clipboard format have unit tests (`npm test`).
- `src/integration.test.ts` runs the H7 scenario on a Windows-1252 file with semicolons and CRLF: filter, sort, search, fill, edit, paste, undo two steps, save with the filter still on, reopen. The saved bytes are compared with the expected text, and the reopened table cell by cell.
- The same scenario was run against the real application in Chrome with real clicks, key presses, drag of the fill handle and clipboard, and the saved file matched byte for byte.
- The interface itself has no automated tests; it was checked by hand in Chrome.

## Sources

- [Encoding Standard, WHATWG](https://encoding.spec.whatwg.org/)
- [TextEncoder, MDN](https://developer.mozilla.org/en-US/docs/Web/API/TextEncoder)
- [showSaveFilePicker(), MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker)
