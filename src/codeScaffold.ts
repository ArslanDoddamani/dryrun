// Reads a solution's source and sets up the board it needs: parameters become structures filled with sample
// values, local collections start empty, index variables become pointers, and every scalar goes into a vars table.
// Pattern-based (no parser), aimed at interview-sized Python / Java / C++ / JS / TS / Go functions.

import { byIdOf, codeLayout, getBounds, unionBoxes } from "./geometry";
import {
  buildStructure,
  makeArray,
  makeCode,
  makeMatrix,
  makePointer,
  makeTable,
  parseGrid,
  parseList,
  translateEls,
  type PresetKind,
} from "./structures";
import type { El, ShapeEl } from "./types";

export type Kind =
  | "array"
  | "string"
  | "matrix"
  | "tree"
  | "ntree"
  | "list"
  | "graph"
  | "map"
  | "set"
  | "stack"
  | "queue"
  | "heap"
  | "scalar";

export interface Structure {
  name: string;
  kind: Exclude<Kind, "scalar">;
  /** builder input (same formats as the insert dialog) */
  input: string;
  rowLabels?: string[];
  colLabels?: string[];
}

export interface Pointer {
  label: string;
  on: string; // structure name
  index: number; // array cell, or n-th list node
}

export interface Analysis {
  structures: Structure[];
  vars: [string, string][];
  pointers: Pointer[];
}

type Lang = "python" | "go" | "js" | "c";

const KEYWORDS = new Set(
  (
    "if for while switch return else do catch new delete throw case sizeof print println printf elif with try " +
    "except finally assert yield await lambda def class struct import from using namespace package public private " +
    "protected static void goto break continue"
  ).split(" "),
);

// ---------- small helpers ----------

/** Split on `sep` at bracket depth 0 (so "Map<K, V> m, int x" splits once). */
function splitTop(s: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if ("([{<".includes(ch)) depth++;
    else if (")]}>".includes(ch)) depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((p) => p.trim()).filter(Boolean);
}

function detectLang(code: string): Lang {
  if (/^\s*def\s+\w+\s*\(/m.test(code)) return "python";
  if (/^\s*func\s/m.test(code)) return "go";
  if (/\bfunction\b|=>|^\s*(let|const|var)\s/m.test(code)) return "js";
  return "c";
}

const stripComment = (line: string, lang: Lang) =>
  lang === "python" ? line.replace(/\s#.*$|^#.*$/, "") : line.replace(/\/\/.*$/, "");

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------- classification ----------

const STACKY = /stack|stk|^st$/i;
const TWO_POINTER = /^(lo|hi|low|high|left|right|l|r|start|end|begin|slow|fast|i|j|p1|p2|ptr|idx|write|read)$/i;
const QUEUEY = /queue|^q$|^dq$|deque|bfs|frontier/i;
const HEAPY = /heap|^pq$|minh|maxh/i;

function collectionByName(name: string, fallback: Kind): Kind {
  if (STACKY.test(name)) return "stack";
  if (QUEUEY.test(name)) return "queue";
  if (HEAPY.test(name)) return "heap";
  return fallback;
}

function nameKind(name: string, code: string): Kind {
  const n = name.toLowerCase();
  if (/^(grid|matrix|board|mat|image|maze|obstaclegrid|intervals|points|triangle|accounts|queries)$/.test(n)) return "matrix";
  if (/^(root|tree|root1|root2)$/.test(n)) return /\.children\b/.test(code) ? "ntree" : "tree";
  if (/^(head|l1|l2|list1|list2|heada|headb)$/.test(n)) return "list";
  if (/^(graph|adj|edges|prerequisites|connections|flights|times)$/.test(n)) return "graph";
  if (/^(s|t|s1|s2|word|word1|word2|text|text1|text2|str|pattern|digits|num|haystack|needle|ransomnote|magazine)$/.test(n))
    return "string";
  if (
    /^(nums|arr|a|b|array|nums1|nums2|heights|height|prices|candidates|coins|stones|piles|temperatures|ratings|weights|values|cost|costs|citations|gas|dist|tasks|people|letters|words|strs|tokens|asteroids|cards|hand)$/.test(
      n,
    )
  )
    return "array";
  return "scalar";
}

function typeKind(type: string, name: string, code: string): Kind {
  const t = type.replace(/\s+/g, "");
  if (!t) return nameKind(name, code);
  if (/(\[\]){2}|List\[List|vector<vector|List<List|\[\]\[\]/.test(t)) return "matrix";
  if (/TreeNode/.test(t)) return "tree";
  if (/ListNode/.test(t)) return "list";
  if (/^(Optional\[)?['"]?Node\b/.test(t)) return /\.children\b/.test(code) ? "ntree" : /\.next\b/.test(code) ? "list" : "tree";
  if (/priority_queue|PriorityQueue/.test(t)) return "heap";
  if (/^(std::)?stack<|^Stack</.test(t)) return "stack";
  if (/^(std::)?queue<|^Queue<|^Deque<|deque/.test(t)) return collectionByName(name, "queue");
  if (/Dict|Map|map\[|map</.test(t)) return "map";
  if (/Set|set\[|set</.test(t)) return "set";
  if (/char\[\]|^\[\]byte$|^\[\]rune$/.test(t)) return "string";
  if (/^(str|String|string|std::string)$/.test(t)) return "string";
  if (/\[\]|List\[|vector<|Array<|ArrayList|List<|Sequence|Iterable/.test(t)) return collectionByName(name, "array");
  return nameKind(name, code) === "scalar" ? "scalar" : nameKind(name, code);
}

// ---------- sample values ----------

function sampleArray(name: string, code: string): string {
  const n = name.toLowerCase();
  const byName: Record<string, string> = {
    prices: "[7, 1, 5, 3, 6, 4]",
    heights: "[2, 1, 5, 6, 2, 3]",
    height: "[1, 8, 6, 2, 5, 4, 8, 3, 7]",
    temperatures: "[73, 74, 75, 71, 69, 72, 76, 73]",
    coins: "[1, 2, 5]",
    candidates: "[2, 3, 6, 7]",
    nums1: "[1, 3, 5]",
    nums2: "[2, 4, 6]",
    stones: "[2, 7, 4, 1, 8, 1]",
    piles: "[3, 6, 7, 11]",
    citations: "[3, 0, 6, 1, 5]",
    asteroids: "[5, 10, -5]",
    words: '["eat", "tea", "tan", "ate", "nat", "bat"]',
    strs: '["eat", "tea", "tan", "ate", "nat", "bat"]',
    tokens: '["2", "1", "+", "3", "*"]',
    letters: '["c", "f", "j"]',
  };
  if (byName[n]) return byName[n];
  if (/\bmid\b/.test(code)) return "[1, 3, 5, 7, 9, 11]"; // binary search wants sorted input
  return "[2, 7, 11, 15]";
}

function sampleString(name: string, code: string): string {
  const n = name.toLowerCase();
  const byName: Record<string, string> = {
    t: "abc",
    s1: "ab",
    s2: "eidbaooo",
    word1: "horse",
    word2: "ros",
    text1: "abcde",
    text2: "ace",
    digits: "23",
    num: "1432219",
    pattern: "abba",
    needle: "sad",
    haystack: "sadbutsad",
    ransomnote: "aa",
    magazine: "aab",
  };
  if (byName[n]) return byName[n];
  if (/palindrom/i.test(code)) return "racecar";
  if (/[([{]['"][)\]}]/.test(code) || /'\('|"\("/.test(code)) return "({[]})";
  return "abcabcbb";
}

function sampleMatrix(name: string, code: string): string {
  const n = name.toLowerCase();
  if (n === "intervals") return "[[1, 3], [2, 6], [8, 10], [15, 18]]";
  if (n === "points") return "[[1, 3], [-2, 2], [5, 8]]";
  if (n === "triangle") return "[[2], [3, 4], [6, 5, 7], [4, 1, 8, 3]]";
  if (n === "board") return "A B C E\nS F C S\nA D E E";
  if (/['"]1['"]/.test(code)) return "1 1 0 0 0\n1 1 0 0 0\n0 0 1 0 0\n0 0 0 1 1";
  if (n === "matrix") return "[[1, 2, 3], [4, 5, 6], [7, 8, 9]]";
  return "[[1, 3, 1], [1, 5, 1], [4, 2, 1]]";
}

function sampleFor(name: string, kind: Kind, code: string): string {
  switch (kind) {
    case "array":
      return sampleArray(name, code);
    case "string":
      return sampleString(name, code);
    case "matrix":
      return sampleMatrix(name, code);
    case "tree":
      return /\b(low|high|lo|hi|bst|BST|min_val|max_val)\b|isValidBST|Bst/.test(code)
        ? "[4, 2, 7, 1, 3, 6, 9]"
        : "[3, 9, 20, null, null, 15, 7]";
    case "ntree":
      return "[1, null, 3, 2, 4, null, 5, 6]";
    case "list":
      return name === "l1" || name === "list1" ? "1 -> 2 -> 4" : name === "l2" || name === "list2" ? "1 -> 3 -> 4" : "1 -> 2 -> 3 -> 4 -> 5";
    case "graph":
      return name.toLowerCase() === "prerequisites" ? "1->0, 2->0, 3->1, 3->2" : "0-1, 0-2, 1-3, 2-3, 3-4";
    default:
      return "";
  }
}

// ---------- values ----------

const INF = /^(float\(\s*['"]inf['"]\s*\)|math\.inf|Infinity|Number\.MAX_(SAFE_INTEGER|VALUE)|Integer\.MAX_VALUE|Long\.MAX_VALUE|INT_MAX|LLONG_MAX|sys\.maxsize|math\.MaxInt\w*)$/;
const NEG_INF = /^(-\s*float\(\s*['"]inf['"]\s*\)|float\(\s*['"]-inf['"]\s*\)|-math\.inf|-Infinity|Number\.MIN_SAFE_INTEGER|Integer\.MIN_VALUE|Long\.MIN_VALUE|INT_MIN|LLONG_MIN|-sys\.maxsize|math\.MinInt\w*)$/;

function literal(init: string): string | null {
  const s = init.trim().replace(/;$/, "");
  if (/^-?\d+(\.\d+)?[lLfF]?$/.test(s)) return s.replace(/[lLfF]$/, "");
  if (/^(True|true)$/.test(s)) return "true";
  if (/^(False|false)$/.test(s)) return "false";
  if (/^(None|null|nil|nullptr|NULL|undefined)$/.test(s)) return "null";
  if (INF.test(s)) return "∞";
  if (NEG_INF.test(s)) return "-∞";
  if (/^(["'`]).*\1$/.test(s)) return s;
  return null;
}

/** Evaluate small size/index expressions like `len(nums) - 1` or `(n + 1)` against the sample values. */
function evalExpr(expr: string, env: Map<string, number>, lens: Map<string, number>): number | null {
  const e = expr
    .trim()
    .replace(/len\(\s*(\w+)\s*\)/g, (m, n) => (lens.has(n) ? String(lens.get(n)) : m))
    .replace(/(\w+)\.(?:length|size)\b(?:\(\))?/g, (m, n) => (lens.has(n) ? String(lens.get(n)) : m))
    .replace(/\b[A-Za-z_]\w*\b/g, (m) => (env.has(m) ? String(env.get(m)) : m))
    .replace(/\/\//g, "/")
    .replace(/>>\s*1/g, "/2");
  if (!/^[\d\s+\-*/().]+$/.test(e)) return null;
  try {
    const v = Function(`"use strict"; return (${e});`)() as number;
    return Number.isFinite(v) ? Math.floor(v) : null;
  } catch {
    return null;
  }
}

/** `len(s) + 1` (or `n + 1` where n = len(s)) → "" followed by the characters of s, for DP-table headers. */
function headerFrom(expr: string, strings: Map<string, string>, aliases: Map<string, string>): string[] | undefined {
  const m = expr
    .trim()
    .match(/^\(?\s*(?:len\(\s*(\w+)\s*\)|(\w+)\.(?:length|size)\(?\)?|(\w+))\s*\+\s*1\s*\)?$/);
  const name = m && (m[1] ?? m[2] ?? aliases.get(m[3]));
  return name && strings.has(name) ? ["", ...strings.get(name)!] : undefined;
}

/** `len(s)` / `s.length` / `s.size()` → "s". */
const lengthOf = (expr: string) => expr.trim().match(/^(?:len\(\s*(\w+)\s*\)|(\w+)\.(?:length|size)\b(?:\(\))?)$/)?.slice(1).find(Boolean);

// ---------- the analysis ----------

interface Decl {
  name: string;
  type?: string;
  init?: string;
}

function signatureParams(code: string, lang: Lang): string[] {
  let m: RegExpMatchArray | null = null;
  if (lang === "python") m = code.match(/def\s+\w+\s*\(([^)]*)\)/);
  else if (lang === "go") m = code.match(/func\s+(?:\([^)]*\)\s*)?\w+\s*\(([^)]*)\)/);
  else if (lang === "js")
    m =
      code.match(/function\s*\w*\s*\(([^)]*)\)/) ??
      code.match(/\w+\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*[^=]+)?=>/) ??
      code.match(/^\s*(?:public\s+|private\s+|static\s+|async\s+)*\w+\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\{/m);
  if (!m && lang !== "python") {
    for (const c of code.matchAll(/\b(\w+)\s*\(([^()]*)\)\s*(?:const\s*)?(?:throws[^{]*)?\{/g)) {
      if (!KEYWORDS.has(c[1])) {
        m = [c[0], c[2]] as unknown as RegExpMatchArray;
        break;
      }
    }
  }
  return m ? splitTop(m[1]) : [];
}

function parseParam(p: string, lang: Lang): Decl | null {
  const s = p.replace(/\s*=\s*[^,]*$/, "").replace(/^\s*(final|const|readonly)\s+/, "").trim();
  if (!s) return null;
  let name: string;
  let type = "";
  if ((lang === "python" || lang === "js") && s.includes(":")) {
    [name, type] = [s.slice(0, s.indexOf(":")).trim(), s.slice(s.indexOf(":") + 1).trim()];
  } else if (lang === "python" || lang === "js") {
    name = s;
  } else if (lang === "go") {
    const parts = s.split(/\s+/);
    [name, type] = [parts[0], parts.slice(1).join(" ")];
  } else {
    const m = s.match(/^(.*?)([A-Za-z_]\w*)\s*((?:\[\s*\])*)$/);
    if (!m) return null;
    [type, name] = [m[1].replace(/[&*]/g, "").trim() + m[3], m[2]];
  }
  name = name.replace(/^[*.]+/, "").replace(/\?$/, "");
  if (!/^[A-Za-z_]\w*$/.test(name) || ["self", "this", "cls"].includes(name)) return null;
  return { name, type };
}

function localDecls(code: string, lang: Lang): Decl[] {
  const out: Decl[] = [];
  const push = (name: string, init?: string, type?: string) => {
    if (/^[A-Za-z_]\w*$/.test(name) && !KEYWORDS.has(name)) out.push({ name, init: init?.trim(), type });
  };
  for (const raw of code.split("\n")) {
    const line = stripComment(raw, lang);
    if (lang === "python") {
      if (/^\s*(def|class|for|while|if|elif|return|import|from)\b/.test(line)) continue;
      const ann = line.match(/^\s*([A-Za-z_]\w*)\s*:\s*([^=]+?)\s*=\s*(.+)$/);
      if (ann) {
        push(ann[1], ann[3], ann[2]);
        continue;
      }
      const m = line.match(/^\s*([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*=(?!=)\s*(.+)$/);
      if (!m) continue;
      const names = m[1].split(",").map((n) => n.trim());
      const vals = names.length > 1 ? splitTop(m[2]) : [m[2]];
      names.forEach((n, i) => push(n, vals.length === names.length ? vals[i] : undefined));
    } else if (lang === "go") {
      const short = line.match(/^\s*([A-Za-z_][\w\s,]*?)\s*:=\s*(.+)$/);
      if (short && !/^\s*(for|if|switch)\b/.test(line)) {
        const names = short[1].split(",").map((n) => n.trim());
        const vals = splitTop(short[2]);
        names.forEach((n, i) => push(n, vals.length === names.length ? vals[i] : undefined));
        continue;
      }
      const v = line.match(/^\s*var\s+(\w+)\s+([^=]+?)(?:\s*=\s*(.+))?$/);
      if (v) push(v[1], v[3], v[2]);
    } else if (lang === "js") {
      const m = line.match(/^\s*(?:let|const|var)\s+(.+?);?\s*$/);
      if (!m || /^\s*(?:let|const|var)\s+\w+\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>)/.test(line)) continue;
      for (const d of splitTop(m[1])) {
        const destr = d.match(/^\[([^\]]*)\]\s*=\s*\[(.*)\]$/);
        if (destr) {
          const names = destr[1].split(",").map((n) => n.trim());
          const vals = splitTop(destr[2]);
          names.forEach((n, i) => push(n, vals[i]));
          continue;
        }
        const one = d.match(/^([A-Za-z_$][\w$]*)\s*(?::\s*([^=]+))?(?:=\s*(.+))?$/);
        if (one) push(one[1], one[3], one[2]);
      }
    } else {
      const m = line.match(/^\s*(?:(?:final|static|const)\s+)*([A-Za-z_][\w:]*(?:\s*<.*>)?(?:\s*\[\s*\])*\s*[&*]?)\s+([A-Za-z_]\w*.*?);\s*$/);
      if (!m) continue;
      const type = m[1].trim();
      const first = type.split(/[\s<[]/)[0];
      if (KEYWORDS.has(first) || /\(.*\)\s*\{?$/.test(m[1])) continue;
      for (const d of splitTop(m[2])) {
        const one = d.match(/^([A-Za-z_]\w*)\s*((?:\[\s*\])*)\s*(?:=\s*(.+)|\((.*)\)|\{(.*)\})?$/);
        if (!one) continue;
        const init = one[3] ?? (one[4] !== undefined ? `CTOR(${one[4]})` : one[5] !== undefined ? `{${one[5]}}` : undefined);
        push(one[1], init, type + one[2]);
      }
    }
  }
  return out;
}

interface Loop {
  index?: string; // loop variable used as an index
  value?: string; // loop variable holding an element
  over?: string; // the collection being indexed / iterated
}

function loops(code: string, lang: Lang): Loop[] {
  const out: Loop[] = [];
  for (const raw of code.split("\n")) {
    const line = stripComment(raw, lang);
    if (lang === "python") {
      const m = line.match(/^\s*for\s+\(?\s*(\w+)(?:\s*,\s*(\w+))?\s*\)?\s+in\s+(.+?)\s*:/);
      if (!m) continue;
      const it = m[3];
      const en = it.match(/^enumerate\(\s*(\w+)/);
      if (en) out.push({ index: m[1], value: m[2], over: en[1] });
      else if (/^range\(/.test(it)) out.push({ index: m[1], over: it.match(/len\(\s*(\w+)\s*\)/)?.[1] });
      else {
        out.push({ value: m[1] });
        if (m[2]) out.push({ value: m[2] });
      }
    } else {
      const cfor = line.match(/for\s*\(?\s*(?:int|let|var|auto|long|size_t|unsigned|const)?\s*(\w+)\s*:?=\s*([^;]*);([^;]*);/);
      if (cfor) {
        const cond = cfor[3];
        out.push({ index: cfor[1], over: cond.match(/(\w+)\.(?:length|size)\b|len\(\s*(\w+)\s*\)/)?.slice(1).find(Boolean) });
        continue;
      }
      const goRange = line.match(/for\s+(\w+)(?:\s*,\s*(\w+))?\s*:=\s*range\s+(\w+)/);
      if (goRange) {
        if (goRange[2]) out.push({ index: goRange[1] === "_" ? undefined : goRange[1], value: goRange[2], over: goRange[3] });
        else out.push({ index: goRange[1], over: goRange[3] });
        continue;
      }
      const each = line.match(/for\s*\(\s*(?:final\s+)?(?:[\w<>[\]&:]+\s+)?(\w+)\s*(?::|\bof\b|\bin\b)\s*([^)]+)\)/);
      if (each) out.push({ value: each[1] });
    }
  }
  return out;
}

/** Kind (and sample input) from an initialiser, or null when it's a plain value. */
function initStructure(
  name: string,
  init: string,
  type: string | undefined,
  ctx: { env: Map<string, number>; lens: Map<string, number>; strings: Map<string, string>; aliases: Map<string, string>; rootVal?: string },
): Omit<Structure, "name"> | null {
  const s = init.replace(/\s+/g, " ").trim();
  const size = (e: string) => Math.max(1, Math.min(12, evalExpr(e, ctx.env, ctx.lens) ?? 6));
  const fillVal = (v: string | undefined) => {
    const lit = v ? literal(v) : "0";
    return lit === null ? "0" : lit === "true" ? "T" : lit === "false" ? "F" : lit.replace(/^["']|["']$/g, "");
  };
  const filled = (n: number, v: string) => `[${Array(n).fill(v || '""').join(", ")}]`;
  const items = (inner: string) => {
    const parts = splitTop(inner).map((p) => (p === "root" && ctx.rootVal ? ctx.rootVal : p.replace(/^["']|["']$/g, "")));
    return `[${parts.join(", ")}]`;
  };

  // 2-D: Python comprehension, Java new T[m][n], C++ vector<vector<T>>(m, vector<T>(n, v)), JS Array.from
  const py2 = s.match(/^\[\s*\[\s*(.*?)\s*\]\s*\*\s*(.+?)\s+for\s+\w+\s+in\s+range\(\s*(.+)\s*\)\s*\]$/);
  const java2 = s.match(/^new\s+(\w+)\s*\[(.+?)\]\s*\[(.+?)\]$/);
  const cpp2 = s.match(/^CTOR\(\s*(.+?)\s*,\s*vector<[^>]+>\s*\(\s*(.+?)\s*(?:,\s*(.+?))?\)\s*\)$/);
  const js2 = s.match(/^Array\.from\(\{\s*length:\s*(.+?)\s*\},\s*\(\)\s*=>\s*(?:new\s+)?Array\((.+?)\)\.fill\((.*?)\)\)$/);
  const grid = py2
    ? { rows: py2[3], cols: py2[2], fill: py2[1] }
    : java2
      ? { rows: java2[2], cols: java2[3], fill: java2[1] === "boolean" ? "false" : "0" }
      : cpp2
        ? { rows: cpp2[1], cols: cpp2[2], fill: cpp2[3] }
        : js2
          ? { rows: js2[1], cols: js2[2], fill: js2[3] }
          : null;
  if (grid) {
    const r = Math.min(8, size(grid.rows));
    const c = Math.min(10, size(grid.cols));
    const v = fillVal(grid.fill);
    return {
      kind: "matrix",
      input: Array.from({ length: r }, () => Array(c).fill(v || "0").join(" ")).join("\n"),
      rowLabels: headerFrom(grid.rows, ctx.strings, ctx.aliases),
      colLabels: headerFrom(grid.cols, ctx.strings, ctx.aliases),
    };
  }

  // 1-D sized arrays: [v] * n, new T[n], Array(n).fill(v), vector<T>(n, v), make([]T, n)
  const py1 = s.match(/^\[\s*([^\][]*?)\s*\]\s*\*\s*(.+)$/);
  const java1 = s.match(/^new\s+(\w+)\s*\[(.+?)\]$/);
  const js1 = s.match(/^(?:new\s+)?Array\((.+?)\)\.fill\((.*?)\)$/);
  const cpp1 = /vector</.test(type ?? "") ? s.match(/^CTOR\(\s*(.+?)\s*(?:,\s*(.+?))?\)$/) : null;
  const go1 = s.match(/^make\(\[\](\w+)\s*,\s*(.+?)\)$/);
  const sized = py1
    ? { n: py1[2], v: py1[1] }
    : java1
      ? { n: java1[2], v: java1[1] === "boolean" ? "false" : "0" }
      : js1
        ? { n: js1[1], v: js1[2] }
        : cpp1
          ? { n: cpp1[1], v: cpp1[2] }
          : go1
            ? { n: go1[2], v: go1[1] === "bool" ? "false" : "0" }
            : null;
  if (sized) return { kind: collectionByName(name, "array") as Structure["kind"], input: filled(size(sized.n), fillVal(sized.v)) };

  if (/^(\{\s*\}|dict\(|defaultdict\(|collections\.defaultdict|Counter\(|collections\.Counter|new\s+(Hash|Tree|LinkedHash)?Map\b|new\s+Map\(|make\(map|map\[)/.test(s))
    return { kind: "map", input: "" };
  if (/^(set\(|new\s+(Hash|Tree)?Set\b|new\s+Set\()/.test(s)) return { kind: "set", input: "" };
  if (/heapq|PriorityQueue|priority_queue/.test(s + (type ?? ""))) return { kind: "heap", input: "" };
  const dq = s.match(/^(?:collections\.)?deque\(\s*\[(.*)\]\s*\)$/);
  if (dq) return { kind: collectionByName(name, "queue") as Structure["kind"], input: items(dq[1]) };
  if (/^((collections\.)?deque\(|new\s+(ArrayDeque|LinkedList)|queue\.Queue|Queue\(|new\s+Stack)/.test(s))
    return { kind: collectionByName(name, /Stack/.test(s) ? "stack" : "queue") as Structure["kind"], input: "" };
  if (/^(\[\s*\]|list\(\)|new\s+ArrayList|new\s+Array\(\)|\[\]\w+\{\})$/.test(s))
    return { kind: collectionByName(name, "array") as Structure["kind"], input: "" };
  const lit = s.match(/^\[(.+)\]$/);
  if (lit && !/\bfor\b/.test(s)) {
    if (/^\s*\[/.test(lit[1])) return { kind: "matrix", input: s };
    return { kind: collectionByName(name, "array") as Structure["kind"], input: items(lit[1]) };
  }
  return null;
}

export function analyzeCode(code: string): Analysis {
  const lang = detectLang(code);
  const structures: Structure[] = [];
  const vars: [string, string][] = [];
  const pointers: Pointer[] = [];
  const env = new Map<string, number>();
  const lens = new Map<string, number>();
  const strings = new Map<string, string>();
  const aliases = new Map<string, string>(); // m → text1 when m = len(text1)
  const seen = new Set<string>();

  // 1. parameters → sample-filled structures and scalars
  const params = signatureParams(code, lang)
    .map((p) => parseParam(p, lang))
    .filter((p): p is Decl => !!p);
  // Go lets "a, b int" share a type
  for (let i = params.length - 2; i >= 0; i--) if (lang === "go" && !params[i].type) params[i].type = params[i + 1].type;

  const scalarParams: Decl[] = [];
  for (const p of params) {
    seen.add(p.name);
    const kind = typeKind(p.type ?? "", p.name, code);
    if (kind === "scalar") {
      scalarParams.push(p);
      continue;
    }
    const input = sampleFor(p.name, kind, code);
    structures.push({ name: p.name, kind: kind as Structure["kind"], input });
    if (kind === "array") lens.set(p.name, parseList(input).length);
    if (kind === "string") {
      strings.set(p.name, input);
      lens.set(p.name, input.length);
    }
    if (kind === "matrix") lens.set(p.name, parseGrid(input).length);
    if (kind === "graph") env.set("n", p.name.toLowerCase() === "prerequisites" ? 4 : 5);
  }
  const firstArray = structures.find((s) => s.kind === "array" || s.kind === "string");
  for (const p of scalarParams) {
    const n = p.name;
    let v = "1";
    if (/^target$/i.test(n) && firstArray?.kind === "array") {
      const xs = parseList(firstArray.input).map(Number);
      const ok = xs.length >= 2 && xs.every(Number.isFinite);
      // pair-sum code (target - x) gets an answerable sum; otherwise a value that is in the array (binary search…)
      if (!ok) v = "9";
      else if (/\btarget\s*-/.test(code)) v = String(xs[0] + xs[1]);
      else v = String(xs[Math.floor((xs.length * 2) / 3)]);
    } else if (/^target$/i.test(n)) v = "9";
    else if (/^k$/i.test(n)) v = "2";
    else if (/^(n|numcourses|size)$/i.test(n)) v = String(env.get("n") ?? (firstArray ? lens.get(firstArray.name) : 5) ?? 5);
    else if (/^m$/i.test(n)) v = "3";
    else if (/^amount$/i.test(n)) v = "11";
    else if (/^(x|val|key|num)$/i.test(n)) v = "3";
    else if (/str|string|char|word/i.test(p.type ?? "")) v = '"a"';
    else if (/bool/i.test(p.type ?? "")) v = "true";
    if (/^-?\d+$/.test(v)) env.set(n, Number(v));
    vars.push([n, v]);
  }
  if (!env.has("n") && firstArray) env.set("n", lens.get(firstArray.name)!);
  const rootVal = (() => {
    const tree = structures.find((s) => s.kind === "tree" || s.kind === "ntree");
    return tree ? parseList(tree.input)[0] : undefined;
  })();

  // 2. loop variables (an index into a collection becomes a pointer)
  const loopInfo = loops(code, lang);
  const indexOf = new Map<string, string | undefined>();
  for (const l of loopInfo) if (l.index) indexOf.set(l.index, l.over);

  // 3. locals → empty collections or scalars
  const listNames = structures.filter((s) => s.kind === "list").map((s) => s.name);
  const treeNames = structures.filter((s) => s.kind === "tree" || s.kind === "ntree").map((s) => s.name);
  for (const d of localDecls(code, lang)) {
    if (seen.has(d.name)) continue;
    seen.add(d.name);
    const st = d.init ? initStructure(d.name, d.init, d.type, { env, lens, strings, aliases, rootVal }) : null;
    const typed = !st && d.type ? typeKind(d.type, d.name, code) : "scalar";
    if (st) {
      structures.push({ name: d.name, ...st });
      if (st.kind === "array") lens.set(d.name, parseList(st.input).length);
      continue;
    }
    if (typed !== "scalar" && ["map", "set", "stack", "queue", "heap", "array", "matrix"].includes(typed)) {
      structures.push({ name: d.name, kind: typed as Structure["kind"], input: "" });
      continue;
    }
    // node pointers: curr = head, fast = head.next, node = root
    const nodeRef = d.init?.match(/^(\w+)((?:\.next)*)$/);
    if (nodeRef && listNames.includes(nodeRef[1])) {
      pointers.push({ label: d.name, on: nodeRef[1], index: nodeRef[2].split(".next").length - 1 });
      vars.push([d.name, "node"]);
      continue;
    }
    if (nodeRef && !nodeRef[2] && treeNames.includes(nodeRef[1])) {
      pointers.push({ label: d.name, on: nodeRef[1], index: 0 });
      vars.push([d.name, "node"]);
      continue;
    }
    const value = d.init ? (literal(d.init) ?? (() => {
      const n = evalExpr(d.init!, env, lens);
      return n === null ? "-" : String(n);
    })()) : "-";
    if (/^-?\d+$/.test(value)) env.set(d.name, Number(value));
    const of = d.init && lengthOf(d.init);
    if (of) aliases.set(d.name, of);
    vars.push([d.name, value]);
  }

  // 4. loop variables that weren't declared as locals
  for (const l of loopInfo) {
    for (const name of [l.index, l.value]) {
      if (!name || name === "_" || seen.has(name)) continue;
      seen.add(name);
      vars.push([name, name === l.index ? "0" : "-"]);
      if (name === l.index) env.set(name, 0);
    }
  }

  // 5. pointers: a non-parameter scalar that indexes an array/string (nums[mid], s.charAt(i)), is a loop index,
  //    or has a classic two-pointer name and starts at a position (hi = len(nums) - 1)
  const indexable = structures.filter((s) => s.kind === "array" || s.kind === "string");
  const paramNames = new Set(scalarParams.map((p) => p.name));
  const initOf = new Map(localDecls(code, lang).map((d) => [d.name, d.init ?? ""]));
  for (const [name] of vars) {
    if (paramNames.has(name) || pointers.some((p) => p.label === name)) continue;
    const indexes = (a: Structure) =>
      new RegExp(`\\b${esc(a.name)}\\s*\\[\\s*${esc(name)}\\b|\\b${esc(a.name)}\\.(?:charAt|get|at)\\(\\s*${esc(name)}\\b`).test(code);
    const sizedBy = (a: Structure) => lengthOf((initOf.get(name) ?? "").replace(/\s*-\s*1\s*$/, "")) === a.name;
    const twoPointerName = TWO_POINTER.test(name) && env.has(name);
    const target =
      indexable.find((a) => indexOf.get(name) === a.name) ??
      indexable.find(indexes) ??
      indexable.find(sizedBy) ??
      (indexOf.has(name) || twoPointerName ? indexable[0] : undefined);
    if (!target) continue;
    const len = lens.get(target.name) ?? 1;
    const at = env.get(name);
    pointers.push({ label: name, on: target.name, index: at !== undefined && at >= 0 && at < len ? at : 0 });
  }

  return { structures, vars, pointers };
}

// ---------- building the board ----------

const KIND_PRESET: Partial<Record<Kind, PresetKind>> = {
  array: "array",
  string: "array",
  matrix: "matrix",
  tree: "tree",
  ntree: "ntree",
  list: "list",
  graph: "graph",
  map: "table",
  stack: "stack",
  queue: "queue",
};

function buildOne(s: Structure): El[] {
  if (s.kind === "string") return [makeArray(0, 0, [...s.input], { label: s.name })];
  if (s.kind === "set") return [makeArray(0, 0, [], { label: `${s.name} (set)`, showIndex: false })];
  if (s.kind === "heap") return [makeArray(0, 0, parseList(s.input), { label: `${s.name} (heap)` })];
  if (s.kind === "matrix")
    return [makeMatrix(0, 0, parseGrid(s.input), { label: s.name, rowLabels: s.rowLabels ?? [], colLabels: s.colLabels ?? [] })];
  return buildStructure(KIND_PRESET[s.kind]!, s.input, s.name, 0, 0);
}

const boundsOf = (els: El[]) => {
  const byId = byIdOf(els);
  return unionBoxes(els.map((e) => getBounds(e, byId)));
};

/** The code block plus everything it works on, laid out as code | structures | tables, top-left at (x, y). */
export function buildCodeBoard(code: string, x: number, y: number): El[] {
  const codeEl = makeCode(x, y, code.replace(/\t/g, "    "));
  const a = analyzeCode(code);
  if (!a.structures.length && !a.vars.length) return [codeEl];

  const out: El[] = [codeEl];
  const placed = new Map<string, El[]>();
  const GAP_X = 90;
  const colX = x + codeLayout(codeEl).w + GAP_X;
  let cy = y;
  let colRight = colX;

  const tables = a.structures.filter((s) => s.kind === "map");
  for (const s of a.structures.filter((s) => s.kind !== "map")) {
    const els = buildOne(s);
    if (!els.length) continue;
    const b = boundsOf(els);
    const moved = translateEls(els, colX - b.x, cy - b.y);
    placed.set(s.name, moved);
    out.push(...moved);
    // leave room under arrays for their pointers
    cy += b.h + (a.pointers.some((p) => p.on === s.name) ? 84 : 48);
    colRight = Math.max(colRight, colX + b.w);
  }

  // pointers
  for (const p of a.pointers) {
    const els = placed.get(p.on);
    if (!els) continue;
    const arr = els.find((e) => e.type === "array");
    if (arr) {
      out.push(makePointer(p.label, { id: arr.id, cell: String(p.index) }, arr.type === "array" && arr.vertical ? "right" : "bottom"));
      continue;
    }
    // list / tree: n-th node in order (left-to-right for lists, the root for trees)
    const nodes = els.filter((e): e is ShapeEl => (e.type === "rect" || e.type === "ellipse") && !!e.role);
    const incoming = new Set(els.filter((e) => e.type === "arrow").map((e) => (e.type === "arrow" ? e.end : undefined)));
    const ordered = nodes[0]?.role === "list" ? [...nodes].sort((m, n) => m.x - n.x) : nodes.filter((n) => !incoming.has(n.id));
    const node = ordered[Math.min(p.index, ordered.length - 1)];
    if (node) out.push(makePointer(p.label, { id: node.id }, "bottom"));
  }

  // tables: vars first, then the hash maps
  const tx = (a.structures.length > tables.length ? colRight : colX - GAP_X) + GAP_X;
  let ty = y;
  if (a.vars.length) {
    const vars = makeTable(tx, ty, "vars", a.vars);
    out.push(vars);
    ty += boundsOf([vars]).h + 40;
  }
  for (const s of tables) {
    const t = makeTable(tx, ty, s.name, []);
    out.push(t);
    ty += boundsOf([t]).h + 40;
  }
  return out;
}

/** One-line description per detected item, for the insert dialog. */
export function describeAnalysis(a: Analysis): string[] {
  const label: Record<Kind, string> = {
    array: "array",
    string: "string",
    matrix: "grid",
    tree: "binary tree",
    ntree: "tree",
    list: "linked list",
    graph: "graph",
    map: "hash map",
    set: "set",
    stack: "stack",
    queue: "queue",
    heap: "heap",
    scalar: "value",
  };
  return [
    ...a.structures.map((s) => `${s.name} → ${label[s.kind]}`),
    ...a.pointers.map((p) => `${p.label} → pointer on ${p.on}`),
    ...(a.vars.length ? [`vars: ${a.vars.map(([k, v]) => (v === "-" ? k : `${k}=${v}`)).join(", ")}`] : []),
  ];
}
