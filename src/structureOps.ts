// Structural edits (add / remove elements) for every data structure. Anything that shifts indices also
// re-keys cell colours and moves pointers, so "i" keeps pointing at the same element after a removal.

import { boxesIntersect, byIdOf, cellKeyOf, cellTextWidth, getBounds, parseCellKey } from "./geometry";
import { checkpoint, currentElements, deleteElements, setElements, useStore } from "./store";
import {
  LIST_GAP,
  NODE,
  NTREE_DY,
  TREE_DX,
  TREE_DY,
  layoutNTree,
  makeArrow,
  makeShape,
  ntreeChildren,
  ntreeNodeWidth,
} from "./structures";
import type { ArrayEl, ArrowEl, El, Marks, MatrixEl, ShapeEl, TableEl } from "./types";

const fresh = <T extends El>(id: string) => currentElements().find((e) => e.id === id) as T | undefined;

const select = (id: string, cell?: string, edit = false) =>
  useStore.setState({
    selection: [id],
    cells: cell !== undefined ? { id, keys: [cell] } : null,
    editing: edit ? { id, cell } : null,
  });

// ---------- index remapping ----------

/** Maps an old cell key to its new key, or null if that cell was removed. */
type KeyMap = (key: string) => string | null;

function rekey<T>(obj: Record<string, T> | undefined, map: KeyMap): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    const nk = map(k);
    if (nk !== null) out[nk] = v;
  }
  return out;
}

/**
 * Re-key the colours and crossed-out values of element `id` and the cells that pointers aim at. Pointers on a
 * removed cell land on `fallback(key)` (the element that slid into its place).
 */
function remapRefs(els: El[], id: string, map: KeyMap, fallback: (key: string) => string): El[] {
  return els.map((e) => {
    if (e.id === id && (e.type === "array" || e.type === "matrix" || e.type === "table")) {
      return { ...e, marks: rekey<string>(e.marks, map) as Marks, struck: rekey(e.struck, map) };
    }
    if (e.type === "pointer" && e.target?.id === id && e.target.cell !== undefined) {
      return { ...e, target: { ...e.target, cell: map(e.target.cell) ?? fallback(e.target.cell) } };
    }
    return e;
  });
}

const replace = (els: El[], next: El) => els.map((e) => (e.id === next.id ? next : e));

// ---------- arrays (also stacks and queues) ----------

/** Insert a cell at `at`; later cells (and their colours/pointers) shift right. */
export function insertArrayCell(id: string, at: number, value = "", edit = true) {
  const el = fresh<ArrayEl>(id);
  if (!el) return;
  const values = [...el.values.slice(0, at), value, ...el.values.slice(at)];
  const map: KeyMap = (k) => String(+k >= at ? +k + 1 : +k);
  setElements((els) => remapRefs(replace(els, { ...el, values }), id, map, (k) => k));
  select(id, String(at), edit);
}

export const appendArrayCell = (id: string, value = "", edit = true) =>
  insertArrayCell(id, fresh<ArrayEl>(id)?.values.length ?? 0, value, edit);

/** Remove cells; everything after them shifts left. */
export function removeArrayCells(id: string, keys: string[], record = true) {
  const el = fresh<ArrayEl>(id);
  if (!el || !keys.length) return;
  const gone = new Set(keys.map(Number));
  const values = el.values.filter((_, i) => !gone.has(i));
  const shifted = (i: number) => i - [...gone].filter((g) => g < i).length;
  const map: KeyMap = (k) => (gone.has(+k) ? null : String(shifted(+k)));
  const fallback = (k: string) => String(Math.max(0, Math.min(values.length - 1, shifted(+k))));
  setElements((els) => remapRefs(replace(els, { ...el, values }), id, map, fallback), record);
  useStore.setState({ cells: null });
}

/** Turn a 1-D array into a 2-row grid (the array becomes row 0). Same id, so arrows/pointers stay attached. */
export function arrayToMatrix(id: string) {
  const el = fresh<ArrayEl>(id);
  if (!el) return;
  const cols = Math.max(1, el.values.length);
  const first = el.values.length ? el.values.slice() : [""];
  const matrix: MatrixEl = {
    id: el.id,
    x: el.x,
    y: el.y,
    stroke: el.stroke,
    fill: el.fill,
    strokeWidth: el.strokeWidth,
    seed: el.seed,
    type: "matrix",
    cells: [first, Array(cols).fill("")],
    cellW: el.cellW,
    cellH: el.cellH,
    showIndex: el.showIndex,
    rowLabels: [],
    colLabels: [],
    label: el.label,
    marks: el.marks,
    struck: el.struck,
  };
  const map: KeyMap = (k) => cellKeyOf(0, +k);
  // a pointer hanging below the array would now point up through the new row; aim it from above instead
  const flip = (els: El[]) =>
    els.map((e) => (e.type === "pointer" && e.target?.id === id && e.side === "bottom" ? { ...e, side: "top" as const } : e));
  setElements((els) => flip(remapRefs(replace(els, matrix), id, map, () => cellKeyOf(0, 0))));
  select(id, cellKeyOf(1, 0), true);
}

// ---------- matrices ----------

export function matrixAddRow(id: string) {
  const el = fresh<MatrixEl>(id);
  if (!el) return;
  const cols = Math.max(1, ...el.cells.map((r) => r.length));
  setElements((els) => replace(els, { ...el, cells: [...el.cells, Array(cols).fill("")] }));
}

export function matrixAddCol(id: string) {
  const el = fresh<MatrixEl>(id);
  if (!el) return;
  setElements((els) => replace(els, { ...el, cells: el.cells.map((r) => [...r, ""]) }));
}

export function matrixRemoveRow(id: string, row: number) {
  const el = fresh<MatrixEl>(id);
  if (!el || el.cells.length <= 1) return;
  const cells = el.cells.filter((_, r) => r !== row);
  const rowLabels = el.rowLabels.filter((_, r) => r !== row);
  const map: KeyMap = (k) => {
    const [r, c] = parseCellKey(k);
    return r === row ? null : cellKeyOf(r > row ? r - 1 : r, c);
  };
  const fallback = (k: string) => cellKeyOf(Math.min(row, cells.length - 1), parseCellKey(k)[1]);
  setElements((els) => remapRefs(replace(els, { ...el, cells, rowLabels }), id, map, fallback));
  useStore.setState({ cells: null });
}

export function matrixRemoveCol(id: string, col: number) {
  const el = fresh<MatrixEl>(id);
  if (!el || Math.max(...el.cells.map((r) => r.length)) <= 1) return;
  const cells = el.cells.map((r) => r.filter((_, c) => c !== col));
  const colLabels = el.colLabels.filter((_, c) => c !== col);
  const cols = Math.max(...cells.map((r) => r.length));
  const map: KeyMap = (k) => {
    const [r, c] = parseCellKey(k);
    return c === col ? null : cellKeyOf(r, c > col ? c - 1 : c);
  };
  const fallback = (k: string) => cellKeyOf(parseCellKey(k)[0], Math.min(col, cols - 1));
  setElements((els) => remapRefs(replace(els, { ...el, cells, colLabels }), id, map, fallback));
  useStore.setState({ cells: null });
}

// ---------- hash map / variables table ----------

export function tableAddRow(id: string) {
  const el = fresh<TableEl>(id);
  if (!el) return;
  const r = el.rows.length;
  setElements((els) => replace(els, { ...el, rows: [...el.rows, ["", ""]] }));
  select(id, cellKeyOf(r, 0), true);
}

export function tableRemoveRow(id: string, row: number, record = true) {
  const el = fresh<TableEl>(id);
  if (!el) return;
  const rows = el.rows.filter((_, r) => r !== row);
  const map: KeyMap = (k) => {
    const [r, c] = parseCellKey(k);
    return r === row ? null : cellKeyOf(r > row ? r - 1 : r, c);
  };
  setElements((els) => remapRefs(replace(els, { ...el, rows }), id, map, () => cellKeyOf(0, 0)), record);
  useStore.setState({ cells: null });
}

// ---------- crossing out values ----------

type CellEl = ArrayEl | MatrixEl | TableEl;

export function cellValue(el: CellEl, key: string): string {
  if (el.type === "array") return el.values[Number(key)] ?? "";
  const [r, c] = parseCellKey(key);
  return el.type === "matrix" ? el.cells[r]?.[c] ?? "" : el.rows[r]?.[c] ?? "";
}

function withCellValue<T extends CellEl>(el: T, key: string, value: string): T {
  if (el.type === "array") {
    const values = el.values.slice();
    values[Number(key)] = value;
    return { ...el, values };
  }
  const [r, c] = parseCellKey(key);
  if (el.type === "matrix") {
    const cells = el.cells.map((row) => row.slice());
    if (cells[r]) cells[r][c] = value;
    return { ...el, cells };
  }
  const rows = (el as TableEl).rows.map((row) => [...row] as [string, string]);
  while (rows.length <= r) rows.push(["", ""]);
  rows[r][c] = value;
  return { ...el, rows };
}

/**
 * Cross out the current value of each cell (it stays visible with a "/" through it) and open an editor to write
 * the new value beside it.
 */
export function strikeCells(id: string, keys: string[]) {
  const el = fresh<CellEl>(id);
  if (!el || !keys.length) return;
  const live = keys.filter((k) => cellValue(el, k) !== "");
  if (live.length) {
    setElements((els) =>
      els.map((e) => {
        if (e.id !== id) return e;
        let next = e as CellEl;
        const struck = { ...(next.struck ?? {}) };
        for (const k of live) {
          struck[k] = [...(struck[k] ?? []), cellValue(next, k)];
          next = withCellValue(next, k, "");
        }
        return { ...next, struck };
      }),
    );
  }
  select(id, keys[0], true);
}

export function clearStruck(id: string, keys: string[]) {
  const el = fresh<CellEl>(id);
  if (!el?.struck) return;
  const struck = { ...el.struck };
  keys.forEach((k) => delete struck[k]);
  setElements((els) => replace(els, { ...el, struck }));
}

// ---------- node helpers ----------

const isNode = (e: El | undefined, role: ShapeEl["role"]): e is ShapeEl =>
  !!e && (e.type === "rect" || e.type === "ellipse" || e.type === "diamond") && e.role === role;

const centerX = (e: ShapeEl) => e.x + e.w / 2;

function newNodeLike(node: ShapeEl, x: number, y: number): ShapeEl {
  return {
    ...makeShape(node.type, x, y, node.w, node.h, ""),
    role: node.role,
    stroke: node.stroke,
    strokeWidth: node.strokeWidth,
  };
}

const centerOf = (e: El): [number, number] => ("w" in e ? [e.x + e.w / 2, e.y + e.h / 2] : [e.x, e.y]);

/** A bound edge from → to, styled like `template` (an existing edge of the same structure) when there is one. */
function edgeLike(from: ShapeEl, to: El, template: ArrowEl | undefined, head: ArrowEl["head"]): ArrowEl {
  const [x1, y1] = centerOf(from);
  const [x2, y2] = centerOf(to);
  const a = makeArrow(x1, y1, x2, y2, { start: from.id, end: to.id, head: template?.head ?? head });
  return template ? { ...a, stroke: template.stroke, strokeWidth: template.strokeWidth, dashed: template.dashed } : a;
}

const translate = (e: El, dx: number, dy = 0): El =>
  e.type === "arrow" ? { ...e, x: e.x + dx, y: e.y + dy, x2: e.x2 + dx, y2: e.y2 + dy } : { ...e, x: e.x + dx, y: e.y + dy };

// ---------- binary tree ----------

/** A tree node's children; side is decided by whether the child sits left or right of its parent. */
export function treeChildren(els: El[], id: string) {
  const byId = byIdOf(els);
  const parent = byId.get(id) as ShapeEl;
  const kids = els
    .filter((e): e is ArrowEl => e.type === "arrow" && e.start === id && isNode(byId.get(e.end ?? ""), "tree"))
    .map((edge) => ({ edge, node: byId.get(edge.end!) as ShapeEl }))
    .sort((a, b) => centerX(a.node) - centerX(b.node));
  if (kids.length >= 2) return { left: kids[0], right: kids[1], all: kids };
  const only = kids[0];
  if (!only) return { all: kids };
  return centerX(only.node) < centerX(parent) ? { left: only, all: kids } : { right: only, all: kids };
}

type TreeRole = "tree" | "ntree";

const treeParentEdge = (els: El[], id: string, role: TreeRole = "tree") =>
  els.find(
    (e): e is ArrowEl => e.type === "arrow" && e.end === id && !!e.start && isNode(els.find((n) => n.id === e.start), role),
  );

function treeRoot(els: El[], id: string, role: TreeRole = "tree"): string {
  const seen = new Set<string>();
  let cur = id;
  while (!seen.has(cur)) {
    seen.add(cur);
    const up = treeParentEdge(els, cur, role);
    if (!up?.start) break;
    cur = up.start;
  }
  return cur;
}

/** Re-position the tree under `rootId` with the in-order layout used when it was generated; the root stays put. */
function relayoutTree(els: El[], rootId: string): El[] {
  const root = els.find((e) => e.id === rootId) as ShapeEl | undefined;
  if (!root) return els;
  const pos = new Map<string, { order: number; depth: number }>();
  let order = 0;
  const walk = (id: string, depth: number) => {
    if (pos.has(id)) return; // guard against cycles
    pos.set(id, { order: -1, depth });
    const { left, right } = treeChildren(els, id);
    if (left) walk(left.node.id, depth + 1);
    pos.get(id)!.order = order++;
    if (right) walk(right.node.id, depth + 1);
  };
  walk(rootId, 0);
  const rootOrder = pos.get(rootId)!.order;
  return els.map((e) => {
    const p = pos.get(e.id);
    if (!p || e.type !== root.type) return e;
    const n = e as ShapeEl;
    return {
      ...n,
      x: root.x + (root.w - n.w) / 2 + (p.order - rootOrder) * TREE_DX,
      y: root.y + (root.h - n.h) / 2 + p.depth * TREE_DY,
    };
  });
}

export function addTreeChild(id: string, side: "left" | "right") {
  const node = fresh<ShapeEl>(id);
  if (!node) return;
  const els = currentElements();
  const template = treeChildren(els, id).all[0]?.edge ?? treeParentEdge(els, id);
  // start the child on the correct side so the layout classifies it as left/right
  const child = newNodeLike(node, node.x + (side === "left" ? -TREE_DX : TREE_DX), node.y + TREE_DY);
  const link = edgeLike(node, child, template, "none");
  setElements((all) => relayoutTree([...all, child, link], treeRoot(all, id)));
  select(child.id, undefined, true);
}

/** Remove a node together with its subtree (binary or N-ary), then tidy the remaining tree. */
export function removeTreeSubtree(id: string, record = true) {
  const els = currentElements();
  const role: TreeRole = isNode(fresh(id), "ntree") ? "ntree" : "tree";
  const childrenOf = (nid: string) =>
    role === "tree" ? treeChildren(els, nid).all.map((k) => k.node.id) : ntreeChildren(els, nid).map((n) => n.id);
  const doomed: string[] = [];
  const collect = (nid: string) => {
    if (doomed.includes(nid)) return;
    doomed.push(nid);
    childrenOf(nid).forEach(collect);
  };
  collect(id);
  const parent = treeParentEdge(els, id, role)?.start;
  const root = parent ? treeRoot(els, parent, role) : null;
  deleteElements(doomed, record);
  if (root) setElements((all) => (role === "tree" ? relayoutTree(all, root) : layoutNTree(all, root)), false);
}

// ---------- general (N-ary) tree ----------

/** Add a child as the new last (right-most) child, then re-lay the whole tree out. */
export function addNTreeChild(id: string) {
  const node = fresh<ShapeEl>(id);
  if (!node) return;
  const els = currentElements();
  const siblings = ntreeChildren(els, id);
  const last = siblings[siblings.length - 1];
  const template = els.find((e): e is ArrowEl => e.type === "arrow" && (e.start === id || e.end === id));
  // start to the right of the current last child so it keeps that order through the layout
  const child = newNodeLike(node, last ? last.x + last.w + 1 : node.x, node.y + NTREE_DY);
  child.w = NODE;
  const link = edgeLike(node, child, template, "none");
  setElements((all) => layoutNTree([...all, child, link], treeRoot(all, id, "ntree")));
  select(child.id, undefined, true);
}

/** `els` with a node's label set; N-ary tree nodes and list nodes resize to fit it (the tree re-flows / list slides). */
function withNodeText(els: El[], id: string, text: string): El[] {
  const node = els.find((e) => e.id === id) as ShapeEl | undefined;
  if (!node) return els;
  const next = els.map((e) =>
    e.id === id ? { ...node, text, ...(node.role === "ntree" ? { w: ntreeNodeWidth(text) } : {}) } : e,
  );
  if (node.role === "list") return fitListNode(next, id);
  if (node.role === "ntree") return layoutNTree(next, treeRoot(els, id, "ntree"));
  return next;
}

export function setNodeText(id: string, text: string) {
  const node = fresh<ShapeEl>(id);
  if (!node) return;
  // list nodes refit even when unchanged: a strike reserved room to type a value that may not have been written
  if (node.text === text && node.role !== "list") return;
  setElements((all) => withNodeText(all, id, text), node.text !== text);
}

// ---------- linked list ----------

const listOut = (els: El[], id: string) => els.find((e): e is ArrowEl => e.type === "arrow" && e.start === id);
const listIn = (els: El[], id: string) =>
  els.find((e): e is ArrowEl => e.type === "arrow" && e.end === id && isNode(els.find((n) => n.id === e.start), "list"));

/** Everything reachable from `id` by following next-arrows (nodes and the trailing "null"). */
function listChain(els: El[], id: string): Set<string> {
  const out = new Set<string>();
  let cur: string | undefined = id;
  while (cur && !out.has(cur)) {
    out.add(cur);
    cur = listOut(els, cur)?.end;
  }
  return out;
}

/** Insert an empty node right after `id`; the rest of the list slides right to make room. */
export function insertListNodeAfter(id: string) {
  const node = fresh<ShapeEl>(id);
  if (!node) return;
  const els = currentElements();
  const out = listOut(els, id);
  const next = out?.end ? els.find((e) => e.id === out.end) : undefined;
  const gap = Math.max(node.w + LIST_GAP, next ? next.x - node.x : 0);
  const shift = next ? listChain(els, next.id) : new Set<string>();
  const created = { ...newNodeLike(node, node.x + gap, node.y), w: LIST_NODE_W };
  setElements((all) => {
    let res = all.map((e) => (shift.has(e.id) ? translate(e, gap) : e));
    if (out && next) {
      res = res.map((e) => (e.id === out.id ? { ...(e as ArrowEl), end: created.id } : e));
      return [...res, created, edgeLike(created, next, out, "end")];
    }
    return [...res, created, edgeLike(node, created, out, "end")];
  });
  select(created.id, undefined, true);
}

/** Unlink a node: prev now points to next, later nodes slide left, pointers on it move to the next node. */
export function removeListNode(id: string, record = true) {
  const node = fresh<ShapeEl>(id);
  if (!node) return;
  const els = currentElements();
  const inc = listIn(els, id);
  const out = listOut(els, id);
  const next = out?.end ? els.find((e) => e.id === out.end) : undefined;
  const gap = next ? next.x - node.x : 0;
  const shift = next ? listChain(els, next.id) : new Set<string>();
  const heir = next?.id ?? inc?.start;
  setElements((all) =>
    all
      .filter((e) => e.id !== id && e.id !== out?.id && !(e.id === inc?.id && !next))
      // pointers on the node move to the next node (or the previous one); with neither they go too
      .filter((e) => !(e.type === "pointer" && e.target?.id === id && !heir))
      .map((e) => {
        if (shift.has(e.id)) e = translate(e, -gap);
        if (e.id === inc?.id && next) return { ...(e as ArrowEl), end: next.id };
        if (e.type === "pointer" && e.target?.id === id) return { ...e, target: { id: heir! } };
        return e;
      }),
    record,
  );
  useStore.setState({ selection: [], cells: null });
}

export const LIST_NODE_W = 56;

/**
 * Size a list node to its value plus crossed-out history (never below the default width) and slide the rest of the
 * list by the change, so nodes never overlap. `roomToType` leaves space for the replacement value being typed.
 */
function fitListNode(els: El[], id: string, roomToType = false): El[] {
  const node = els.find((e) => e.id === id);
  if (!isNode(node, "list")) return els;
  const want = Math.max(LIST_NODE_W, cellTextWidth(node.text, node.struck, 20) + 24 + (roomToType ? 34 : 0));
  const dx = want - node.w;
  if (Math.abs(dx) < 0.5) return els;
  const out = listOut(els, id);
  const shift = out?.end ? listChain(els, out.end) : new Set<string>();
  return els.map((e) => (e.id === id ? { ...node, w: want } : shift.has(e.id) ? translate(e, dx) : e));
}

/** Cross out a list node's value and open an editor to write the new one beside it. */
export function strikeNode(id: string) {
  const node = fresh<ShapeEl>(id);
  if (!node) return;
  if (node.text) {
    setElements((all) =>
      fitListNode(
        all.map((e) => (e.id === id ? { ...node, struck: [...(node.struck ?? []), node.text], text: "" } : e)),
        id,
        true,
      ),
    );
  }
  select(id, undefined, true);
}

export function clearNodeStruck(id: string) {
  setElements((all) => fitListNode(all.map((e) => (e.id === id ? { ...(e as ShapeEl), struck: undefined } : e)), id));
}

// ---------- graph ----------

/** Add a node connected to `id`, placed in the first free direction around it. */
export function addGraphNeighbor(id: string) {
  const node = fresh<ShapeEl>(id);
  if (!node) return;
  const els = currentElements();
  const byId = byIdOf(els);
  const taken = els.filter((e) => e.id !== id && e.type !== "arrow").map((e) => getBounds(e, byId));
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  const dist = Math.max(node.w, node.h) + 70;
  let spot = { x: cx + dist - node.w / 2, y: cy - node.h / 2 };
  for (const deg of [0, -45, 45, 90, -90, 135, -135, 180]) {
    const a = (deg * Math.PI) / 180;
    const x = cx + Math.cos(a) * dist - node.w / 2;
    const y = cy + Math.sin(a) * dist - node.h / 2;
    if (!taken.some((b) => boxesIntersect(b, { x: x - 12, y: y - 12, w: node.w + 24, h: node.h + 24 }))) {
      spot = { x, y };
      break;
    }
  }
  const template = els.find((e): e is ArrowEl => e.type === "arrow" && (e.start === id || e.end === id));
  const created = newNodeLike(node, spot.x, spot.y);
  setElements((all) => [...all, created, edgeLike(node, created, template, "none")]);
  select(created.id, undefined, true);
}

// ---------- eraser ----------

export interface EraseTarget {
  id: string;
  cell?: string; // cell under the eraser
  struck?: number; // index into the crossed-out history of `struckCell` (or of the node)
  struckCell?: string;
  /** the pointer is on the current value itself: clear just the value (of `valueCell`, or the node's label) */
  value?: boolean;
  valueCell?: string;
}

/**
 * Erase just the thing under the eraser: one crossed-out value, one current value (the cell or node stays, empty),
 * one array element, one grid value, one hash-map entry, one list node (relinked) or tree node (with its subtree).
 * Anything else is deleted whole.
 * `record` is false while dragging so the whole stroke is a single undo step.
 */
export function eraseTarget(t: EraseTarget, record = true) {
  const el = fresh(t.id);
  if (!el) return;

  if (t.struck !== undefined) {
    const drop = (list: string[] | undefined) => (list ?? []).filter((_, i) => i !== t.struck);
    if ((el.type === "array" || el.type === "matrix" || el.type === "table") && t.struckCell !== undefined) {
      const struck = { ...el.struck, [t.struckCell]: drop(el.struck?.[t.struckCell]) };
      if (!struck[t.struckCell].length) delete struck[t.struckCell];
      return setElements((els) => replace(els, { ...el, struck } as El), record);
    }
    if (el.type === "rect" || el.type === "ellipse" || el.type === "diamond") {
      const next = drop((el as ShapeEl).struck);
      return setElements((els) => fitListNode(replace(els, { ...(el as ShapeEl), struck: next.length ? next : undefined }), el.id), record);
    }
  }

  if (t.value) {
    if ((el.type === "array" || el.type === "matrix" || el.type === "table") && t.valueCell !== undefined)
      return setElements((els) => replace(els, withCellValue(el, t.valueCell!, "")), record);
    if (el.type === "rect" || el.type === "ellipse" || el.type === "diamond")
      return setElements((els) => withNodeText(els, el.id, ""), record);
  }

  switch (el.type) {
    case "array":
      if (t.cell !== undefined && el.values.length) return removeArrayCells(el.id, [t.cell], record);
      break;
    case "matrix":
      if (t.cell !== undefined) return setElements((els) => replace(els, withCellValue(el, t.cell!, "")), record);
      break;
    case "table":
      if (t.cell !== undefined && el.rows.length) return tableRemoveRow(el.id, parseCellKey(t.cell)[0], record);
      break;
    case "rect":
    case "ellipse":
    case "diamond":
      if (el.role === "list") return removeListNode(el.id, record);
      if (el.role === "tree" || el.role === "ntree") return removeTreeSubtree(el.id, record);
      break;
  }
  deleteElements([el.id], record);
}

/**
 * Erase everything an eraser stroke marked, as one undo step. Positions refer to the board as it was when the
 * stroke started, so removals are ordered to keep the remaining positions valid: crossed-out values (highest
 * index first), then array elements and hash-map entries per structure in one go, then everything else.
 */
export function eraseTargets(targets: EraseTarget[]) {
  if (!targets.length) return;
  checkpoint();
  const els = currentElements();
  const typeOf = (id: string) => els.find((e) => e.id === id)?.type;
  // these don't move anything else: crossed-out values (highest index first) and cleared current values
  const struck = targets.filter((t) => t.struck !== undefined).sort((a, b) => b.struck! - a.struck!);
  struck.forEach((t) => eraseTarget(t, false));
  targets.filter((t) => t.value).forEach((t) => eraseTarget(t, false));
  const rest = targets.filter((t) => t.struck === undefined && !t.value);
  const grouped = new Map<string, string[]>();
  const others: EraseTarget[] = [];
  for (const t of rest) {
    const type = typeOf(t.id);
    if (t.cell !== undefined && (type === "array" || type === "table")) grouped.set(t.id, [...(grouped.get(t.id) ?? []), t.cell]);
    else others.push(t);
  }
  for (const [id, cells] of grouped) {
    if (typeOf(id) === "array") removeArrayCells(id, cells, false);
    else
      [...new Set(cells.map((c) => parseCellKey(c)[0]))]
        .sort((a, b) => b - a)
        .forEach((r) => tableRemoveRow(id, r, false));
  }
  others.forEach((t) => eraseTarget(t, false));
}

// ---------- removal entry point ----------

/** Delete the selection, keeping lists linked and trees tidy. */
export function removeSelection() {
  const { selection } = useStore.getState();
  const els = currentElements();
  if (selection.length === 1) {
    const el = els.find((e) => e.id === selection[0]);
    const role = el && "role" in el ? el.role : undefined;
    if (role === "tree" || role === "ntree") return removeTreeSubtree(el!.id);
    if (role === "list") return removeListNode(el!.id);
  }
  deleteElements(selection);
}

export { isNode };
