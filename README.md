# DSA Tracer

An Excalidraw-style whiteboard built for **explaining DSA solutions in interviews** — insert a data structure,
move pointers across it, colour cells, and capture every iteration as a **step** you can play back.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build in dist/
```

## Workflow

1. **Insert a data structure** (`S`): array, stack, queue, grid / DP table, binary tree (LeetCode level order),
   general **tree (N-ary)** for recursion trees and tries (indented outline, or LeetCode `[1,null,3,2,4,null,5,6]`),
   linked list, graph (edge list, `->` directed, `:w` weights, or `[[0,1],[1,2]]`), hash map / variables, code.
   Inserting **Code** also sets up the board it works on (on by default, see the checkbox): parameters become structures
   with sample values (`nums` → `[2, 7, 11, 15]`, `grid`, `root`, `head`, `edges`…), local collections start empty
   (`seen = {}` → hash map, `stack = []`, `deque()`, `dp = [0] * (n + 1)`, 2-D DP tables with string headers), index
   variables (`i`, `lo`/`hi`/`mid`, `left`/`right`, `slow`/`fast`) become pointers, and all scalars go into a `vars`
   table. Works with Python, Java, C++, JS/TS and Go; it's pattern-based, so review and tweak what it creates.
2. **Add pointers** (`I`, then click a cell or node): `i`, `lo`, `mid`, `slow`… A pointer always points at a cell or
   node: drag it onto another one, or select it and press `←` / `→` to move it by one cell. It's removed together with
   what it points at. To point at anything else, draw an arrow (`A`). The name and the arrow have separate colours (red arrow, blue name by
   default; change either in the panel).
3. **Colour cells or nodes** with `1`–`6` (current, visited, found, removed, window, ignored); `0` clears.
   Shift-click to select several cells.
   **Cross out & rewrite** a value like on a whiteboard: select a cell (array, grid, hash-map/vars) or a linked-list
   node and press `/` (or the `/` button on it), then type the new value — the old one stays beside it with a slash
   through it (`i = 0̸ 1̸ 2`). Leaving the new value empty just keeps the value crossed out. Cells and list nodes
   show their last 3 crossed-out values; hash-map/vars entries show the whole history. Grid cells show their `r,c`
   coordinates in the corner (toggle in the panel).
4. **Next step** (`N`) snapshots the board; then edit it for the next iteration. Each step has a note.
   Values that changed since the previous step get an orange dot.
5. **Present** (`Shift+P`): fullscreen, `←` / `→` to step (pointers slide between cells), drag for the laser.

**Growing and shrinking structures.** Select a structure and use the on-canvas buttons:
`+` after an array's last cell appends an element, `+` on its bottom edge turns it into a grid; grids get `+` for a new
row/column, stacks push on top, hash maps add an entry, binary-tree nodes add a left/right child, N-ary tree nodes add any number of children, list nodes insert after
themselves and graph nodes add a connected neighbour. Select cells (or a node) to get `×`: later elements shift down,
and their indices, colours and pointers move with them. Removing a list node relinks prev → next; removing a tree
node removes its subtree.

Code blocks act as a program counter: click a line to highlight it, `↑` / `↓` moves the highlight.
Double-click (or `Enter`) edits any value; while editing a cell, `Tab` jumps to the next cell.

**Eraser** (`E`) removes only what's under it (outlined in red as you hover):
- on a **value** (current or crossed-out): just that value — the cell or node stays, empty, ready for a new value;
- elsewhere in a **cell / node**: the array element (later ones shift, pointers follow), the hash-map entry, the list
  node (relinked) or the tree node with its subtree; a grid cell's value; anything else goes whole.

Drag to mark several things — they're erased together on release, as one undo. Where the stroke starts decides what
it erases: start on a value to erase only values, start on a cell to remove only cells.

Plain drawing tools (shapes, arrows that bind to shapes, freehand, text) work as in Excalidraw.
Dark mode is the default; switch with the ☀/☾ button (top right) or `Alt+Shift+D`. PNG exports always use a
light background. Everything autosaves to localStorage. From the menu you can save/open `.dsatrace.json` files, export the current step
as a PNG, or export a **trace sheet** (all steps and notes in a single PNG).
Press `?` in the app for all shortcuts.

## Code map

| File | Purpose |
| --- | --- |
| `src/types.ts` | Element and document model (a document is a list of steps, each a full element snapshot) |
| `src/store.ts` | Zustand store: history, step timeline, viewport, persistence |
| `src/structures.ts` | Element factories and input parsers / layouts for trees, lists, graphs, grids |
| `src/geometry.ts` | Bounds, cell boxes, arrow binding, pointer placement |
| `src/actions.ts` | Tracing operations: marks, pointer stepping, array ops, code cursor |
| `src/render/` | Pure SVG `Scene` (shared by canvas and export), rough.js primitives, code highlighter |
| `src/components/` | Canvas interactions, inline editor, toolbar, properties panel, timeline, dialogs |
| `src/exporter.ts` | JSON save/open, PNG and trace-sheet export |
