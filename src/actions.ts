import { cellKeyOf, parseCellKey } from "./geometry";
import { currentElements, setElements, updateElement, useStore } from "./store";
import { appendArrayCell, insertArrayCell, removeArrayCells } from "./structureOps";
import type { ArrayEl, CodeEl, El, MatrixEl, PointerEl, TableEl } from "./types";

export const MARK_COLORS = [
  { name: "Current", color: "#ffec99" },
  { name: "Visited", color: "#a5d8ff" },
  { name: "Found", color: "#b2f2bb" },
  { name: "Removed", color: "#ffc9c9" },
  { name: "Window", color: "#d0bfff" },
  { name: "Ignored", color: "#dee2e6" },
];

export const STROKE_COLORS = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00", "#9c36b5"];
export const FILL_COLORS = ["transparent", ...MARK_COLORS.map((m) => m.color)];

const getEl = <T extends El>(id: string) => currentElements().find((e) => e.id === id) as T | undefined;

/** Colour the selected cells, or fill the selected shapes. `null` clears. */
export function applyMark(color: string | null) {
  const { cells, selection } = useStore.getState();
  if (cells?.keys.length) {
    updateElement<ArrayEl | MatrixEl | TableEl>(cells.id, (el) => {
      const marks = { ...(el.marks ?? {}) };
      for (const k of cells.keys) {
        if (color) marks[k] = color;
        else delete marks[k];
      }
      return { ...el, marks };
    });
    return;
  }
  const ids = new Set(selection);
  setElements((els) =>
    els.map((e) => {
      if (!ids.has(e.id)) return e;
      if (e.type === "array" || e.type === "matrix") return color ? e : { ...e, marks: {} };
      if (e.type === "rect" || e.type === "ellipse" || e.type === "diamond") return { ...e, fill: color ?? "transparent" };
      return e;
    }),
  );
}

/** Move a pointer attached to an array/matrix cell by (dr, dc). Returns false if not applicable. */
export function stepPointer(p: PointerEl, dRow: number, dCol: number): boolean {
  if (!p.target?.cell) return false;
  const target = getEl(p.target.id);
  if (!target) return false;
  let cell: string | null = null;
  if (target.type === "array") {
    const delta = target.vertical ? -dRow || dCol : dCol || dRow;
    const i = Number(p.target.cell) + delta;
    if (i >= 0 && i < target.values.length) cell = String(i);
    else return true; // at the edge — swallow the key
  } else if (target.type === "matrix") {
    const [r, c] = parseCellKey(p.target.cell);
    const nr = r + dRow;
    const nc = c + dCol;
    if (nr >= 0 && nr < target.cells.length && nc >= 0 && nc < (target.cells[nr]?.length ?? 0)) cell = cellKeyOf(nr, nc);
    else return true;
  } else return false;
  updateElement<PointerEl>(p.id, { target: { ...p.target, cell } });
  return true;
}

/** Move the selected cell(s) cursor inside an array/matrix. */
export function stepCellSelection(dRow: number, dCol: number): boolean {
  const { cells } = useStore.getState();
  if (!cells || cells.keys.length !== 1) return false;
  const el = getEl(cells.id);
  let key: string | null = null;
  if (el?.type === "array") {
    const delta = el.vertical ? -dRow || dCol : dCol || dRow;
    const i = Number(cells.keys[0]) + delta;
    if (i >= 0 && i < el.values.length) key = String(i);
  } else if (el?.type === "matrix") {
    const [r, c] = parseCellKey(cells.keys[0]);
    if (el.cells[r + dRow]?.[c + dCol] !== undefined) key = cellKeyOf(r + dRow, c + dCol);
  } else if (el?.type === "table") {
    const [r, c] = parseCellKey(cells.keys[0]);
    if (el.rows[r + dRow]?.[c + dCol] !== undefined) key = cellKeyOf(r + dRow, c + dCol);
  } else return false;
  if (key) useStore.setState({ cells: { id: cells.id, keys: [key] } });
  return true;
}

/** Move the highlighted line of a code block up/down (the "program counter"). */
export function stepCodeLine(code: CodeEl, delta: number) {
  const lines = code.code.split("\n").length;
  const cur = code.active.length ? code.active[code.active.length - 1] : delta > 0 ? -1 : lines;
  const next = Math.max(0, Math.min(lines - 1, cur + delta));
  updateElement<CodeEl>(code.id, { active: [next] });
}

export function toggleCodeLine(code: CodeEl, line: number, additive: boolean) {
  const has = code.active.includes(line);
  const active = additive ? (has ? code.active.filter((l) => l !== line) : [...code.active, line]) : has && code.active.length === 1 ? [] : [line];
  updateElement<CodeEl>(code.id, { active });
}

// ---------- array operations ----------

export type ArrayOp = "push" | "pop" | "unshift" | "shift";

export function arrayOp(el: ArrayEl, op: ArrayOp, value = "") {
  switch (op) {
    case "push":
      return appendArrayCell(el.id, value, false);
    case "pop":
      return el.values.length && removeArrayCells(el.id, [String(el.values.length - 1)]);
    case "unshift":
      return insertArrayCell(el.id, 0, value, false);
    case "shift":
      return el.values.length && removeArrayCells(el.id, ["0"]);
  }
}

export function swapCells(el: ArrayEl | MatrixEl, a: string, b: string) {
  if (el.type === "array") {
    const values = el.values.slice();
    [values[+a], values[+b]] = [values[+b], values[+a]];
    updateElement<ArrayEl>(el.id, { values });
  } else {
    const cells = el.cells.map((r) => r.slice());
    const [r1, c1] = parseCellKey(a);
    const [r2, c2] = parseCellKey(b);
    [cells[r1][c1], cells[r2][c2]] = [cells[r2][c2], cells[r1][c1]];
    updateElement<MatrixEl>(el.id, { cells });
  }
}

export function setCellValue(el: ArrayEl | MatrixEl | TableEl, key: string, value: string) {
  if (el.type === "array") {
    const values = el.values.slice();
    values[Number(key)] = value;
    updateElement<ArrayEl>(el.id, { values });
  } else if (el.type === "table") {
    const [r, c] = parseCellKey(key);
    const rows = el.rows.map((row) => [...row] as [string, string]);
    while (rows.length <= r) rows.push(["", ""]);
    rows[r][c] = value;
    updateElement<TableEl>(el.id, { rows });
  } else {
    const [r, c] = parseCellKey(key);
    const cells = el.cells.map((row) => row.slice());
    cells[r][c] = value;
    updateElement<MatrixEl>(el.id, { cells });
  }
}
