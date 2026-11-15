import type {
  ArrayEl,
  ArrowEl,
  Box,
  CodeEl,
  El,
  MatrixEl,
  Point,
  PointerEl,
  TableEl,
  TextEl,
} from "./types";

export const HAND_FONT = '"Patrick Hand", "Segoe Print", "Comic Sans MS", cursive';
export const MONO_FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export type ById = Map<string, El>;

export const byIdOf = (elements: El[]): ById => new Map(elements.map((e) => [e.id, e]));

// ---------- text measurement ----------

let ctx2d: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();

export function measure(text: string, fontSize: number, mono = false): number {
  const key = `${mono ? "m" : "h"}|${fontSize}|${text}`;
  const hit = widthCache.get(key);
  if (hit !== undefined) return hit;
  ctx2d ??= document.createElement("canvas").getContext("2d");
  let w = text.length * fontSize * 0.55;
  if (ctx2d) {
    ctx2d.font = `${fontSize}px ${mono ? MONO_FONT : HAND_FONT}`;
    w = ctx2d.measureText(text).width;
  }
  widthCache.set(key, w);
  return w;
}

export const clearMeasureCache = () => widthCache.clear();

// ---------- per-type layouts ----------

export const LABEL_FONT = 20;
export const INDEX_FONT = 13;
export const CELL_FONT = 20;

export function textLayout(el: TextEl) {
  const lines = el.text.split("\n");
  const lineH = el.fontSize * 1.25;
  const w = Math.max(8, ...lines.map((l) => measure(l, el.fontSize)));
  return { lines, lineH, w, h: lines.length * lineH };
}

export function arrayLayout(el: ArrayEl) {
  const n = Math.max(1, el.values.length);
  const labelW = el.label ? measure(el.label, LABEL_FONT) + 14 : 0;
  if (el.vertical) {
    const idxW = el.showIndex ? measure(String(n - 1), INDEX_FONT) + 12 : 0;
    const labelH = el.label ? 28 : 0;
    return {
      n,
      bounds: {
        x: el.x - idxW,
        y: el.y,
        w: Math.max(el.cellW + idxW, labelW),
        h: n * el.cellH + labelH,
      },
    };
  }
  const idxH = el.showIndex ? 18 : 0;
  return {
    n,
    bounds: { x: el.x - labelW, y: el.y - idxH, w: n * el.cellW + labelW, h: el.cellH + idxH },
  };
}

export function arrayCellBox(el: ArrayEl, i: number): Box {
  const n = Math.max(1, el.values.length);
  if (el.vertical) return { x: el.x, y: el.y + (n - 1 - i) * el.cellH, w: el.cellW, h: el.cellH };
  return { x: el.x + i * el.cellW, y: el.y, w: el.cellW, h: el.cellH };
}

export function matrixLayout(el: MatrixEl) {
  const rows = Math.max(1, el.cells.length);
  const cols = Math.max(1, ...el.cells.map((r) => r.length));
  const hasColHead = el.showIndex || el.colLabels.some(Boolean);
  const hasRowHead = el.showIndex || el.rowLabels.some(Boolean);
  const rowHeadW = hasRowHead
    ? Math.max(
        ...Array.from({ length: rows }, (_, r) => measure(el.rowLabels[r] || String(r), 15)),
      ) + 12
    : 0;
  const colHeadH = hasColHead ? 20 : 0;
  const labelH = el.label ? 28 : 0;
  return {
    rows,
    cols,
    hasColHead,
    hasRowHead,
    bounds: {
      x: el.x - rowHeadW,
      y: el.y - colHeadH - labelH,
      w: cols * el.cellW + rowHeadW,
      h: rows * el.cellH + colHeadH + labelH,
    },
    colHeadH,
  };
}

export const matrixCellBox = (el: MatrixEl, r: number, c: number): Box => ({
  x: el.x + c * el.cellW,
  y: el.y + r * el.cellH,
  w: el.cellW,
  h: el.cellH,
});

export const TABLE_FONT = 18;

/**
 * How many crossed-out values show before the current one: the last 3 in cells and list nodes; hash-map / vars
 * entries show their whole history (the table widens instead).
 */
export const STRUCK_SHOWN = 3;
export const STRUCK_SCALE = 0.85;
export const TOKEN_GAP = 6;

/** The crossed-out tokens that are displayed, oldest first. */
export const shownStruck = (struck: string[] | undefined, limit = STRUCK_SHOWN) =>
  (struck ?? []).slice(-Math.max(0, limit));

/** Width of a value preceded by its crossed-out values (an empty current value takes no room). */
export function cellTextWidth(value: string, struck: string[] | undefined, size: number, limit = STRUCK_SHOWN): number {
  const widths = shownStruck(struck, limit).map((t) => measure(t, size * STRUCK_SCALE));
  if (value) widths.push(measure(value, size));
  return widths.reduce((a, b) => a + b, 0) + TOKEN_GAP * Math.max(0, widths.length - 1);
}

export function tableLayout(el: TableEl) {
  const headerH = el.title ? 32 : 0;
  const rowH = 30;
  const rows = el.rows.length ? el.rows : [["", ""] as [string, string]];
  const textW = (r: number, c: number, text: string) => cellTextWidth(text, el.struck?.[`${r},${c}`], TABLE_FONT, Infinity);
  const keyW = Math.max(36, ...rows.map(([k], r) => textW(r, 0, k))) + 22;
  const valW = Math.max(48, ...rows.map(([, v], r) => textW(r, 1, v))) + 22;
  const titleW = el.title ? measure(el.title, TABLE_FONT) + 28 : 0;
  const w = Math.max(keyW + valW, titleW);
  return { headerH, rowH, rows, keyW, valW: w - keyW, w, h: headerH + rows.length * rowH };
}

export function codeLayout(el: CodeEl) {
  const lines = el.code.split("\n");
  const lineH = Math.round(el.fontSize * 1.55);
  const pad = 12;
  const gutter = measure(String(lines.length), el.fontSize, true) + 18;
  const textW = Math.max(120, ...lines.map((l) => measure(l, el.fontSize, true)));
  return { lines, lineH, pad, gutter, w: gutter + textW + pad * 2, h: lines.length * lineH + pad * 2 };
}

// ---------- cells ----------

export const cellKeyOf = (r: number, c: number) => `${r},${c}`;
export const parseCellKey = (key: string): [number, number] => {
  const [r, c] = key.split(",").map(Number);
  return [r, c];
};

export function cellBox(el: El, key: string): Box | null {
  if (el.type === "array") {
    const i = Number(key);
    if (!Number.isInteger(i) || i < 0 || i >= Math.max(1, el.values.length)) return null;
    return arrayCellBox(el, i);
  }
  if (el.type === "matrix") {
    const [r, c] = parseCellKey(key);
    if (!(r >= 0 && r < el.cells.length && c >= 0 && c < (el.cells[r]?.length ?? 0))) return null;
    return matrixCellBox(el, r, c);
  }
  if (el.type === "table") {
    // "row,0" is the key, "row,1" the value
    const L = tableLayout(el);
    const [r, c] = parseCellKey(key);
    if (!(r >= 0 && r < L.rows.length && (c === 0 || c === 1))) return null;
    return { x: el.x + (c ? L.keyW : 0), y: el.y + L.headerH + r * L.rowH, w: c ? L.valW : L.keyW, h: L.rowH };
  }
  return null;
}

// ---------- bounds ----------

const normBox = (x: number, y: number, w: number, h: number): Box => ({
  x: Math.min(x, x + w),
  y: Math.min(y, y + h),
  w: Math.abs(w),
  h: Math.abs(h),
});

const boxOfPoints = (pts: Point[]): Box => {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

export function getBounds(el: El, byId: ById): Box {
  switch (el.type) {
    case "rect":
    case "ellipse":
    case "diamond":
      return normBox(el.x, el.y, el.w, el.h);
    case "text": {
      const { w, h } = textLayout(el);
      return { x: el.x, y: el.y, w, h };
    }
    case "freedraw": {
      const b = boxOfPoints(el.points.length ? el.points : [[0, 0]]);
      return { ...b, x: b.x + el.x, y: b.y + el.y };
    }
    case "arrow":
      return boxOfPoints(resolveArrow(el, byId));
    case "array":
      return arrayLayout(el).bounds;
    case "matrix":
      return matrixLayout(el).bounds;
    case "table": {
      const { w, h } = tableLayout(el);
      return { x: el.x, y: el.y, w, h };
    }
    case "code": {
      const { w, h } = codeLayout(el);
      return { x: el.x, y: el.y, w, h };
    }
    case "pointer": {
      const g = pointerGeometry(el, byId, 0, 1);
      const lb = { x: g.label[0] - g.labelW / 2, y: g.label[1] - 12, w: g.labelW, h: 24 };
      return unionBoxes([lb, boxOfPoints([g.tail, g.tip])]);
    }
  }
}

export function unionBoxes(boxes: Box[]): Box {
  if (!boxes.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w));
  const y2 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

export const boxesIntersect = (a: Box, b: Box) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const boxContains = (outer: Box, inner: Box) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

// ---------- arrows ----------

export const isBindable = (el: El) =>
  el.type !== "arrow" && el.type !== "pointer" && el.type !== "freedraw";

/** Point on the outline of `el` along the ray from its centre towards `toward`. */
function clipToOutline(el: El, byId: ById, toward: Point): Point {
  const b = getBounds(el, byId);
  const c: Point = [b.x + b.w / 2, b.y + b.h / 2];
  const dx = toward[0] - c[0];
  const dy = toward[1] - c[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return c;
  const a = b.w / 2;
  const bb = b.h / 2;
  let t: number;
  if (el.type === "ellipse") t = 1 / Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (bb * bb));
  else if (el.type === "diamond") t = 1 / (Math.abs(dx) / a + Math.abs(dy) / bb);
  else t = Math.min(dx ? a / Math.abs(dx) : Infinity, dy ? bb / Math.abs(dy) : Infinity);
  const gap = 5 / len;
  return [c[0] + dx * (t + gap), c[1] + dy * (t + gap)];
}

const centerOf = (el: El, byId: ById): Point => {
  const b = getBounds(el, byId);
  return [b.x + b.w / 2, b.y + b.h / 2];
};

export function resolveArrow(el: ArrowEl, byId: ById): [Point, Point] {
  const s = el.start ? byId.get(el.start) : undefined;
  const e = el.end && el.end !== el.start ? byId.get(el.end) : undefined;
  let p1: Point = [el.x, el.y];
  let p2: Point = [el.x2, el.y2];
  const ref1 = s ? centerOf(s, byId) : p1;
  const ref2 = e ? centerOf(e, byId) : p2;
  if (s) p1 = clipToOutline(s, byId, ref2);
  if (e) p2 = clipToOutline(e, byId, ref1);
  return [p1, p2];
}

// ---------- pointers ----------

export const POINTER_FONT = 19;
const POINTER_GAP = 4;
const POINTER_LEN = 26;

/**
 * Geometry of a pointer ("i", "left", "slow"...). `slot`/`slots` spread multiple pointers
 * that aim at the same cell side-by-side so their labels never overlap.
 */
export function pointerGeometry(p: PointerEl, byId: ById, slot: number, slots: number) {
  const labelW = Math.max(18, measure(p.label || "?", POINTER_FONT)) + 10;
  const target = p.target ? byId.get(p.target.id) : undefined;
  let anchor: Box | null = null;
  if (target) {
    anchor = p.target!.cell ? cellBox(target, p.target!.cell) : getBounds(target, byId);
  }
  const spreadX = (slot - (slots - 1) / 2) * (labelW + 6);
  const spreadY = (slot - (slots - 1) / 2) * 26;
  let tip: Point;
  let label: Point;
  if (!anchor) {
    // floating: label at x,y with the arrow pointing away from the side it would attach on
    label = [p.x, p.y];
    const dir = sideVector(p.side);
    tip = [p.x - dir[0] * (POINTER_LEN + 22), p.y - dir[1] * (POINTER_LEN + 22)];
  } else {
    const cx = anchor.x + anchor.w / 2;
    const cy = anchor.y + anchor.h / 2;
    switch (p.side) {
      case "bottom":
        tip = [cx, anchor.y + anchor.h + POINTER_GAP];
        label = [cx + spreadX, tip[1] + POINTER_LEN + 12];
        break;
      case "top":
        tip = [cx, anchor.y - POINTER_GAP];
        label = [cx + spreadX, tip[1] - POINTER_LEN - 12];
        break;
      case "right":
        tip = [anchor.x + anchor.w + POINTER_GAP, cy];
        label = [tip[0] + POINTER_LEN + labelW / 2 + 2, cy + spreadY];
        break;
      case "left":
        tip = [anchor.x - POINTER_GAP, cy];
        label = [tip[0] - POINTER_LEN - labelW / 2 - 2, cy + spreadY];
        break;
    }
  }
  const tail = pointerTail(p.side, label, labelW);
  return { tip, tail, label, labelW };
}

function sideVector(side: PointerEl["side"]): Point {
  return side === "bottom" ? [0, 1] : side === "top" ? [0, -1] : side === "right" ? [1, 0] : [-1, 0];
}

function pointerTail(side: PointerEl["side"], label: Point, labelW: number): Point {
  switch (side) {
    case "bottom":
      return [label[0], label[1] - 12];
    case "top":
      return [label[0], label[1] + 12];
    case "right":
      return [label[0] - labelW / 2, label[1]];
    case "left":
      return [label[0] + labelW / 2, label[1]];
  }
}

/** Pointers that aim at the same cell & side get consecutive slots. */
export function pointerSlots(elements: El[]): Map<string, [number, number]> {
  const groups = new Map<string, string[]>();
  for (const el of elements) {
    if (el.type !== "pointer" || !el.target) continue;
    const k = `${el.target.id}|${el.target.cell ?? ""}|${el.side}`;
    const g = groups.get(k) ?? [];
    g.push(el.id);
    groups.set(k, g);
  }
  const slots = new Map<string, [number, number]>();
  for (const ids of groups.values()) ids.forEach((id, i) => slots.set(id, [i, ids.length]));
  return slots;
}

export function defaultPointerSide(target: El | undefined): PointerEl["side"] {
  if (target?.type === "array" && target.vertical) return "right";
  if (target?.type === "matrix") return "left";
  return "bottom";
}
