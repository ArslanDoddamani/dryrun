import { measure } from "./geometry";
import type {
  ArrayEl,
  ArrowEl,
  CodeEl,
  El,
  FreeDrawEl,
  MatrixEl,
  PointerEl,
  ShapeEl,
  StyleDefaults,
  TableEl,
  TextEl,
} from "./types";

export const uid = () => Math.random().toString(36).slice(2, 10);
const seed = () => Math.floor(Math.random() * 2 ** 31);

export const INK = "#1e1e1e";

const base = (x: number, y: number, style?: Partial<StyleDefaults>) => ({
  id: uid(),
  x,
  y,
  stroke: style?.stroke ?? INK,
  fill: style?.fill ?? "transparent",
  strokeWidth: style?.strokeWidth ?? 2,
  seed: seed(),
});

// ---------- primitive factories ----------

export const makeShape = (
  type: ShapeEl["type"],
  x: number,
  y: number,
  w: number,
  h: number,
  text = "",
  style?: Partial<StyleDefaults>,
): ShapeEl => ({ ...base(x, y, style), type, w, h, text });

export const makeText = (x: number, y: number, text: string, fontSize = 22, style?: Partial<StyleDefaults>): TextEl => ({
  ...base(x, y, style),
  type: "text",
  text,
  fontSize,
});

export const makeFreeDraw = (x: number, y: number, style?: Partial<StyleDefaults>): FreeDrawEl => ({
  ...base(x, y, style),
  type: "freedraw",
  points: [[0, 0]],
});

export const makeArrow = (
  x: number,
  y: number,
  x2: number,
  y2: number,
  opts: Partial<Pick<ArrowEl, "start" | "end" | "head" | "label" | "dashed">> = {},
  style?: Partial<StyleDefaults>,
): ArrowEl => ({
  ...base(x, y, style),
  type: "arrow",
  x2,
  y2,
  head: "end",
  label: "",
  dashed: false,
  ...opts,
});

/** New pointers: red arrow, blue name — easy to tell apart from each other and from the values. */
export const POINTER_ARROW_COLOR = "#e03131";
export const POINTER_NAME_COLOR = "#1971c2";

export const makePointer = (
  label: string,
  target: PointerEl["target"],
  side: PointerEl["side"],
  x = 0,
  y = 0,
  stroke = POINTER_ARROW_COLOR,
  labelColor = POINTER_NAME_COLOR,
): PointerEl => ({ ...base(x, y), stroke, labelColor, type: "pointer", label, target, side });

export const makeArray = (x: number, y: number, values: string[], opts: Partial<ArrayEl> = {}): ArrayEl => ({
  ...base(x, y),
  type: "array",
  values,
  cellW: 52,
  cellH: 52,
  vertical: false,
  showIndex: true,
  label: "",
  marks: {},
  ...opts,
});

export const makeMatrix = (x: number, y: number, cells: string[][], opts: Partial<MatrixEl> = {}): MatrixEl => ({
  ...base(x, y),
  type: "matrix",
  cells,
  cellW: 48,
  cellH: 44,
  showIndex: true,
  rowLabels: [],
  colLabels: [],
  label: "",
  marks: {},
  ...opts,
});

export const makeTable = (x: number, y: number, title: string, rows: [string, string][]): TableEl => ({
  ...base(x, y),
  type: "table",
  title,
  rows,
});

export const makeCode = (x: number, y: number, code: string): CodeEl => ({
  ...base(x, y),
  type: "code",
  code,
  fontSize: 15,
  active: [],
});

export const translateEls = (els: El[], dx: number, dy: number): El[] =>
  els.map((e) => (e.type === "arrow" ? { ...e, x: e.x + dx, y: e.y + dy, x2: e.x2 + dx, y2: e.y2 + dy } : { ...e, x: e.x + dx, y: e.y + dy }));

// ---------- input parsing ----------

const unquote = (s: string) => s.trim().replace(/^["'`](.*)["'`]$/s, "$1");

/** "[1, 2, 3]", "1 2 3", "1,2,3" or a quoted string "abc" (split into chars). */
export function parseList(input: string): string[] {
  const t = input.trim();
  if (!t) return [];
  if (/^["'`].*["'`]$/s.test(t) && !t.includes(",")) return [...unquote(t)];
  const inner = t.replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return [];
  return inner.split(inner.includes(",") ? "," : /\s+/).map(unquote);
}

/** "[[1,2],[3,4]]", one row per line ("1 0 1"), or "3x4" for an empty grid. */
export function parseGrid(input: string): string[][] {
  const t = input.trim();
  const size = t.match(/^(\d+)\s*[x×*,]\s*(\d+)(?:\s+(.*))?$/);
  if (size) {
    const [r, c] = [Number(size[1]), Number(size[2])];
    return Array.from({ length: r }, () => Array.from({ length: c }, () => size[3] ?? ""));
  }
  if (t.startsWith("[")) {
    const rows = t.match(/\[[^\[\]]*\]/g) ?? [];
    return rows.map(parseList);
  }
  return t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/[,\s]/.test(l) ? parseList(l) : [...l]));
}

/** "key: value" per line, or a JSON-ish object {"a": 1, "b": 2}. */
export function parsePairs(input: string): [string, string][] {
  const t = input.trim();
  if (!t) return [];
  if (t.startsWith("{")) {
    return t
      .replace(/^\{/, "")
      .replace(/\}$/, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((pair) => {
        const i = pair.indexOf(":");
        return i < 0 ? [unquote(pair), ""] : [unquote(pair.slice(0, i)), unquote(pair.slice(i + 1))];
      });
  }
  return t
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const m = l.match(/^\s*(.*?)\s*(?::|=|->)\s*(.*)$/);
      return m ? [m[1], m[2].trim()] : [l.trim(), ""];
    });
}

export const formatPairs = (rows: [string, string][]) => rows.map(([k, v]) => `${k}: ${v}`).join("\n");

// ---------- composite structures ----------

export const NODE = 44;
export const TREE_DX = 50;
export const TREE_DY = 78;
export const LIST_GAP = 40;

/** Binary tree from LeetCode level-order: [3,9,20,null,null,15,7]. */
export function buildTree(input: string, x: number, y: number): El[] {
  const vals = parseList(input);
  if (!vals.length || vals[0] === "null") return [];
  interface N {
    v: string;
    l?: N;
    r?: N;
    depth: number;
    order?: number;
    el?: ShapeEl;
  }
  const root: N = { v: vals[0], depth: 0 };
  const queue: N[] = [root];
  let i = 1;
  while (queue.length && i < vals.length) {
    const n = queue.shift()!;
    for (const side of ["l", "r"] as const) {
      if (i >= vals.length) break;
      const v = vals[i++];
      if (v !== "null" && v !== "") {
        n[side] = { v, depth: n.depth + 1 };
        queue.push(n[side]!);
      }
    }
  }
  // in-order index gives a non-overlapping x position for every node
  let order = 0;
  const all: N[] = [];
  const walk = (n?: N) => {
    if (!n) return;
    walk(n.l);
    n.order = order++;
    all.push(n);
    walk(n.r);
  };
  walk(root);
  const out: El[] = [];
  for (const n of all) {
    n.el = { ...makeShape("ellipse", x + n.order! * TREE_DX, y + n.depth * TREE_DY, NODE, NODE, n.v), role: "tree" };
    out.push(n.el);
  }
  for (const n of all) {
    for (const c of [n.l, n.r]) {
      if (!c) continue;
      out.push(edge(n.el!, c.el!, "none"));
    }
  }
  return out;
}

function edge(a: ShapeEl, b: ShapeEl, head: ArrowEl["head"], label = ""): ArrowEl {
  return makeArrow(a.x + a.w / 2, a.y + a.h / 2, b.x + b.w / 2, b.y + b.h / 2, {
    start: a.id,
    end: b.id,
    head,
    label,
  });
}

// ---------- general (N-ary) tree ----------

export const NTREE_GAP = 22;
export const NTREE_DY = 80;

/** Node width that fits its label (recursion-tree labels like "fib(3)" are wider than a digit). */
export const ntreeNodeWidth = (label: string) =>
  Math.max(NODE, Math.max(...label.split("\n").map((l) => measure(l, 20))) + 28);

const isNTreeNode = (e: El | undefined): e is ShapeEl =>
  !!e && (e.type === "rect" || e.type === "ellipse" || e.type === "diamond") && e.role === "ntree";

/** Children of an N-ary tree node, left to right by their current position. */
export function ntreeChildren(els: El[], id: string): ShapeEl[] {
  const byId = new Map(els.map((e) => [e.id, e]));
  return els
    .filter((e): e is ArrowEl => e.type === "arrow" && e.start === id && isNTreeNode(byId.get(e.end ?? "")))
    .map((a) => byId.get(a.end!) as ShapeEl)
    .sort((a, b) => a.x + a.w / 2 - (b.x + b.w / 2));
}

/**
 * Tidy layout: every subtree gets a band as wide as max(its node, its children side by side), and each parent is
 * centred over its band, so nothing overlaps whatever the label widths. The root keeps its centre and top.
 */
export function layoutNTree(els: El[], rootId: string): El[] {
  const byId = new Map(els.map((e) => [e.id, e]));
  const root = byId.get(rootId);
  if (!isNTreeNode(root)) return els;
  const kids = new Map<string, ShapeEl[]>();
  const width = new Map<string, number>();
  const seen = new Set<string>();
  const measureSub = (n: ShapeEl): number => {
    seen.add(n.id);
    const cs = ntreeChildren(els, n.id).filter((c) => !seen.has(c.id));
    kids.set(n.id, cs);
    const span = cs.reduce((sum, c) => sum + measureSub(c), 0) + NTREE_GAP * Math.max(0, cs.length - 1);
    const w = Math.max(n.w, span);
    width.set(n.id, w);
    return w;
  };
  measureSub(root);
  const pos = new Map<string, { x: number; y: number }>();
  const place = (n: ShapeEl, left: number, depth: number) => {
    const w = width.get(n.id)!;
    pos.set(n.id, { x: left + (w - n.w) / 2, y: root.y + depth * NTREE_DY + (root.h - n.h) / 2 });
    const cs = kids.get(n.id)!;
    const span = cs.reduce((sum, c) => sum + width.get(c.id)!, 0) + NTREE_GAP * Math.max(0, cs.length - 1);
    let x = left + (w - span) / 2;
    for (const c of cs) {
      place(c, x, depth + 1);
      x += width.get(c.id)! + NTREE_GAP;
    }
  };
  place(root, root.x + root.w / 2 - width.get(root.id)! / 2, 0);
  return els.map((e) => (pos.has(e.id) ? { ...e, ...pos.get(e.id)! } : e));
}

/**
 * N-ary tree, either as an indented outline (one node per line, children indented under their parent) or in
 * LeetCode's level order with null separating each node's children: [1,null,3,2,4,null,5,6].
 */
export function buildNTree(input: string, x: number, y: number): El[] {
  interface N {
    v: string;
    kids: N[];
  }
  const roots: N[] = [];
  const t = input.trim();
  if (t.startsWith("[")) {
    const vals = parseList(t);
    if (!vals.length || vals[0] === "null") return [];
    const root: N = { v: vals[0], kids: [] };
    roots.push(root);
    const queue = [root];
    let i = 2; // skip the root and the null after it
    while (i < vals.length && queue.length) {
      const parent = queue.shift()!;
      for (; i < vals.length && vals[i] !== "null"; i++) {
        const child: N = { v: vals[i], kids: [] };
        parent.kids.push(child);
        queue.push(child);
      }
      i++;
    }
  } else {
    const stack: { indent: number; node: N }[] = [];
    for (const raw of input.replace(/\t/g, "    ").split("\n")) {
      if (!raw.trim()) continue;
      const indent = raw.length - raw.trimStart().length;
      const node: N = { v: raw.trim().replace(/^[-*•]\s*/, ""), kids: [] };
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      if (stack.length) stack[stack.length - 1].node.kids.push(node);
      else roots.push(node);
      stack.push({ indent, node });
    }
  }
  let out: El[] = [];
  let left = x;
  for (const root of roots) {
    const shapes: El[] = [];
    const walk = (n: N): ShapeEl => {
      const el: ShapeEl = { ...makeShape("ellipse", 0, 0, ntreeNodeWidth(n.v), NODE, n.v), role: "ntree" };
      shapes.push(el);
      for (const k of n.kids) shapes.push(edge(el, walk(k), "none"));
      return el;
    };
    const rootEl = walk(root);
    // lay the tree out with its root at the origin, then slide it right of the previous tree in the forest
    let laid = layoutNTree(shapes, rootEl.id);
    const minX = Math.min(...laid.filter((e) => e.type === "ellipse").map((e) => e.x));
    const maxX = Math.max(...laid.filter((e): e is ShapeEl => e.type === "ellipse").map((e) => e.x + e.w));
    laid = laid.map((e) => (e.type === "ellipse" ? { ...e, x: e.x - minX + left, y: e.y + y } : e));
    out = out.concat(laid);
    left += maxX - minX + NTREE_GAP * 3;
  }
  return out;
}

/** Singly (or doubly with "<->") linked list: "1 -> 2 -> 3" or [1,2,3]. */
export function buildLinkedList(input: string, x: number, y: number, withNull = true): El[] {
  const doubly = input.includes("<->");
  const vals = parseList(input.replace(/<?->/g, ","))
    .map((v) => v.trim())
    .filter((v) => v !== "");
  const step = 56 + LIST_GAP;
  const nodes = vals.map((v, i): ShapeEl => ({ ...makeShape("rect", x + i * step, y, 56, 44, v), role: "list" }));
  const out: El[] = [...nodes];
  nodes.forEach((n, i) => {
    if (i > 0) out.push(edge(nodes[i - 1], n, doubly ? "both" : "end"));
  });
  if (withNull && nodes.length) {
    const nul = makeText(x + nodes.length * step - 4, y + 9, "null", 20, { stroke: "#868e96" });
    out.push(nul, makeArrow(0, 0, nul.x - 6, y + 22, { start: nodes[nodes.length - 1].id, end: nul.id }));
  }
  return out;
}

/**
 * Graph from an edge list, one edge per line or comma separated:
 *   "0-1"  undirected,  "0->1" directed,  "A-B:4" weighted,  "5" isolated node.
 */
export function buildGraph(input: string, x: number, y: number): El[] {
  const tokens = input.trim().startsWith("[[")
    ? parseGrid(input).map((r) => (r.length >= 3 ? `${r[0]}-${r[1]}:${r[2]}` : r.join("-")))
    : input
        .split(/[\n,;]+/)
        .map((t) => t.trim())
        .filter(Boolean);
  const names: string[] = [];
  const addName = (n: string) => !names.includes(n) && names.push(n);
  const edges: { a: string; b: string; directed: boolean; w: string }[] = [];
  for (const tok of tokens) {
    const m = tok.match(/^\[?\s*(.+?)\s*(->|—|-|\s)\s*([^:\]]+?)\s*\]?(?::\s*(.+))?$/);
    if (m) {
      addName(m[1]);
      addName(m[3]);
      edges.push({ a: m[1], b: m[3], directed: m[2] === "->", w: m[4] ?? "" });
    } else addName(tok.replace(/[\[\]]/g, ""));
  }
  const n = names.length;
  const R = Math.max(90, n * 22);
  const nodes = new Map<string, ShapeEl>();
  names.forEach((name, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    nodes.set(name, { ...makeShape("ellipse", x + R + R * Math.cos(a), y + R + R * Math.sin(a), NODE, NODE, name), role: "graph" });
  });
  const out: El[] = [...nodes.values()];
  for (const e of edges) out.push(edge(nodes.get(e.a)!, nodes.get(e.b)!, e.directed ? "end" : "none", e.w));
  return out;
}

export const DSA_PRESETS = {
  array: { title: "Array", placeholder: "[2, 7, 11, 15]   or   \"racecar\"", sample: "[2, 7, 11, 15]" },
  stack: { title: "Stack", placeholder: "[1, 2, 3]  (last = top)", sample: "[1, 2, 3]" },
  queue: { title: "Queue", placeholder: "[4, 5, 6]  (first = front)", sample: "[4, 5, 6]" },
  matrix: {
    title: "Grid / DP table",
    placeholder: "[[1,1,0],[0,1,1]]   or rows per line   or   4x5 0",
    sample: "1 1 0 0\n1 1 0 0\n0 0 1 0\n0 0 0 1",
  },
  tree: { title: "Binary tree", placeholder: "Level order: [3, 9, 20, null, null, 15, 7]", sample: "[3, 9, 20, null, null, 15, 7]" },
  ntree: {
    title: "Tree (N-ary)",
    placeholder: "Recursion trees, tries, N-ary trees: one node per line, indent the children — or LeetCode [1,null,3,2,4,null,5,6]",
    sample: "fib(4)\n  fib(3)\n    fib(2)\n      fib(1)\n      fib(0)\n    fib(1)\n  fib(2)\n    fib(1)\n    fib(0)",
  },
  list: { title: "Linked list", placeholder: "1 -> 2 -> 3   (use <-> for doubly)", sample: "1 -> 2 -> 3 -> 4" },
  graph: { title: "Graph", placeholder: "0-1, 1-2:4, 2->3  (- undirected, -> directed, :w weight)  or  [[0,1],[1,2]]", sample: "0-1\n0-2\n1-3\n2-3\n3-4" },
  table: { title: "Hash map / variables", placeholder: "key: value per line, or {\"a\": 1}", sample: "i: 0\nsum: 0\nans: -1" },
  code: { title: "Code", placeholder: "Paste your solution (Python, Java, C++, JS/TS or Go)", sample: "def twoSum(nums, target):\n    seen = {}\n    for i, x in enumerate(nums):\n        if target - x in seen:\n            return [seen[target - x], i]\n        seen[x] = i" },
} as const;

export type PresetKind = keyof typeof DSA_PRESETS;

/** Build the elements for an insert-dialog request with its top-left near (x, y). */
export function buildStructure(kind: PresetKind, input: string, label: string, x: number, y: number): El[] {
  switch (kind) {
    case "array":
      return [makeArray(x, y, parseList(input), { label })];
    case "stack":
      return [makeArray(x, y, parseList(input), { label: label || "stack", vertical: true, showIndex: false, cellW: 72, cellH: 40 })];
    case "queue":
      return [makeArray(x, y, parseList(input), { label: label || "queue", showIndex: false })];
    case "matrix":
      return [makeMatrix(x, y, parseGrid(input), { label })];
    case "tree":
      return withLabel(buildTree(input, x, y), label, x, y);
    case "ntree":
      return withLabel(buildNTree(input, x, y), label, x, y);
    case "list":
      return withLabel(buildLinkedList(input, x, y), label, x, y);
    case "graph":
      return withLabel(buildGraph(input, x, y), label, x, y);
    case "table":
      return [makeTable(x, y, label, parsePairs(input))];
    case "code":
      return [makeCode(x, y, input.replace(/\t/g, "    "))];
  }
}

const withLabel = (els: El[], label: string, x: number, y: number) =>
  label ? [makeText(x, y - 40, label, 22), ...els] : els;

// ---------- quick-insert pointer labels ----------

const POINTER_NAMES = ["i", "j", "k", "lo", "hi", "mid", "l", "r", "slow", "fast", "prev", "curr"];
export function nextPointerLabel(elements: El[]): string {
  const used = new Set(elements.filter((e) => e.type === "pointer").map((e) => (e as PointerEl).label));
  return POINTER_NAMES.find((n) => !used.has(n)) ?? "p";
}
