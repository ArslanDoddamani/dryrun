import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { setCellValue } from "../actions";
import {
  HAND_FONT,
  MONO_FONT,
  POINTER_FONT,
  byIdOf,
  cellBox,
  cellKeyOf,
  cellTextWidth,
  codeLayout,
  getBounds,
  measure,
  parseCellKey,
  pointerGeometry,
  resolveArrow,
  textLayout,
} from "../geometry";
import { currentElements, deleteElements, updateElement, useStore } from "../store";
import { setNodeText } from "../structureOps";
import { formatPairs, parseGrid, parseList, parsePairs } from "../structures";
import type { Box, El } from "../types";

interface Spec {
  value: string;
  box: Box; // world coords
  fontSize: number;
  mono?: boolean;
  multiline: boolean;
  enterCommits: boolean; // otherwise Enter inserts a newline and Ctrl/Cmd+Enter commits
  align: "left" | "center";
  grow?: boolean; // box grows with content (free text)
  padLeft?: number;
  pad?: number;
  lineH?: number;
  commit: (value: string) => void;
}

function specFor(el: El, cell: string | undefined, all: El[]): Spec | null {
  const byId = byIdOf(all);
  const center = (box: Box, value: string, fontSize: number, commit: (v: string) => void, multiline = false): Spec => ({
    value,
    box,
    fontSize,
    multiline,
    enterCommits: true,
    align: "center",
    commit,
  });

  if ((el.type === "array" || el.type === "matrix" || el.type === "table") && cell) {
    const box = cellBox(el, cell);
    if (!box) return null;
    const [r, c] = parseCellKey(cell);
    const value =
      el.type === "array" ? el.values[Number(cell)] ?? "" : el.type === "matrix" ? el.cells[r]?.[c] ?? "" : el.rows[r]?.[c] ?? "";
    const history = el.struck?.[cell] ?? [];
    // writing a replacement after a strike: keep the crossed-out value visible on the left
    const replacing = history.length > 0 && value === "";
    const keep = !replacing
      ? 0
      : el.type === "table"
        ? Math.min(box.w - 30, 11 + cellTextWidth("", history, 18, Infinity) + 6)
        : box.w / 2;
    // an empty replacement is fine: the cell then just shows the crossed-out value
    return center({ ...box, x: box.x + keep, w: box.w - keep }, value, el.type === "table" ? 18 : 20, (v) => {
      if (v !== value) setCellValue(el, cell, v);
    });
  }
  switch (el.type) {
    case "array":
      return {
        ...center(getBounds(el, byId), el.values.join(", "), 18, (v) => updateElement(el.id, { values: parseList(v) })),
        align: "left",
      };
    case "matrix":
      return {
        value: el.cells.map((r) => r.join(" ")).join("\n"),
        box: getBounds(el, byId),
        fontSize: 16,
        mono: true,
        multiline: true,
        enterCommits: false,
        align: "left",
        commit: (v) => updateElement(el.id, { cells: parseGrid(v) }),
      };
    case "rect":
    case "ellipse":
    case "diamond": {
      const b = getBounds(el, byId);
      // after a strike, type the new value to the right of the crossed-out one
      const keep = el.struck?.length && !el.text ? Math.max(0, b.w - 44) : 0;
      return center({ ...b, x: b.x + keep, w: b.w - keep }, el.text, 20, (v) => setNodeText(el.id, v), !keep);
    }
    case "text": {
      const { w, h } = textLayout(el);
      return {
        value: el.text,
        box: { x: el.x, y: el.y, w, h },
        fontSize: el.fontSize,
        multiline: true,
        enterCommits: false,
        align: "left",
        grow: true,
        lineH: el.fontSize * 1.25,
        commit: (v) => {
          if (!v.trim()) deleteElements([el.id]);
          else if (v !== el.text) updateElement(el.id, { text: v });
        },
      };
    }
    case "pointer": {
      const g = pointerGeometry(el, byId, 0, 1);
      const w = Math.max(60, g.labelW + 20);
      return center(
        { x: g.label[0] - w / 2, y: g.label[1] - 15, w, h: 30 },
        el.label,
        POINTER_FONT,
        (v) => v !== el.label && updateElement(el.id, { label: v.trim() || el.label }),
      );
    }
    case "arrow": {
      const [p1, p2] = resolveArrow(el, byId);
      const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      return center({ x: mid[0] - 60, y: mid[1] - 15, w: 120, h: 30 }, el.label, 18, (v) =>
        v !== el.label && updateElement(el.id, { label: v.trim() }),
      );
    }
    case "table": {
      const b = getBounds(el, byId);
      return {
        value: formatPairs(el.rows),
        box: { ...b, w: Math.max(b.w, 200), h: Math.max(b.h, 120) },
        fontSize: 17,
        multiline: true,
        enterCommits: false,
        align: "left",
        pad: 8,
        commit: (v) => updateElement(el.id, { rows: parsePairs(v) }),
      };
    }
    case "code": {
      const L = codeLayout(el);
      return {
        value: el.code,
        box: { x: el.x, y: el.y, w: L.w, h: L.h },
        fontSize: el.fontSize,
        mono: true,
        multiline: true,
        enterCommits: false,
        align: "left",
        grow: true,
        pad: L.pad,
        padLeft: L.pad + L.gutter,
        lineH: L.lineH,
        commit: (v) => v !== el.code && updateElement(el.id, { code: v.replace(/\t/g, "    ") }),
      };
    }
    default:
      return null;
  }
}

export function TextEditor() {
  const editing = useStore((s) => s.editing);
  if (!editing) return null;
  return <EditorField key={`${editing.id}|${editing.cell ?? ""}`} id={editing.id} cell={editing.cell} />;
}

function EditorField({ id, cell }: { id: string; cell?: string }) {
  const v = useStore((s) => s.viewport);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const [spec] = useState(() => {
    const all = currentElements();
    const el = all.find((e) => e.id === id);
    return el ? specFor(el, cell, all) : null;
  });
  const [value, setValueState] = useState(spec?.value ?? "");
  const latest = useRef(value);
  const setValue = (next: string) => {
    latest.current = next;
    setValueState(next);
  };

  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  // closing the editor from outside (tool change, step change) still commits
  useEffect(
    () => () => {
      if (!done.current && spec) {
        done.current = true;
        spec.commit(latest.current);
      }
    },
    [spec],
  );

  if (!spec) return null;

  const finish = (next?: { cell: string }) => {
    if (done.current) return;
    done.current = true;
    spec.commit(value);
    useStore.setState({ editing: next ? { id, cell: next.cell } : null, ...(next ? { cells: { id, keys: [next.cell] } } : {}) });
  };

  /** Tab moves to the next cell; in an array, tabbing past the end appends a cell. */
  const nextCell = (dir: 1 | -1): string | null => {
    const el = currentElements().find((e) => e.id === id);
    if (!cell || !el) return null;
    if (el.type === "array") {
      const i = Number(cell) + dir;
      if (i < 0) return null;
      if (i >= el.values.length) {
        updateElement(el.id, { values: [...el.values, ""] });
      }
      return String(i);
    }
    if (el.type === "matrix") {
      const [r, c] = parseCellKey(cell);
      const cols = el.cells[r]?.length ?? 0;
      let nr = r;
      let nc = c + dir;
      if (nc >= cols) [nr, nc] = [r + 1, 0];
      if (nc < 0) [nr, nc] = [r - 1, (el.cells[r - 1]?.length ?? 1) - 1];
      return el.cells[nr]?.[nc] !== undefined ? cellKeyOf(nr, nc) : null;
    }
    if (el.type === "table") {
      // key → value → next entry's key; tabbing past the last value adds an entry
      const [r, c] = parseCellKey(cell);
      const idx = r * 2 + c + dir;
      if (idx < 0) return null;
      const nr = Math.floor(idx / 2);
      if (nr >= el.rows.length) updateElement(el.id, { rows: [...el.rows, ["", ""]] });
      return cellKeyOf(nr, idx % 2);
    }
    return null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      finish();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      finish();
    } else if (e.key === "Enter" && spec.enterCommits && !e.shiftKey) {
      e.preventDefault();
      finish();
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (cell) {
        // commit current value before possibly appending a cell
        const target = (() => {
          done.current = true;
          spec.commit(value);
          return nextCell(e.shiftKey ? -1 : 1);
        })();
        useStore.setState({
          editing: target ? { id, cell: target } : null,
          ...(target ? { cells: { id, keys: [target] } } : {}),
        });
      } else if (spec.mono) {
        const ta = e.currentTarget;
        const { selectionStart: a, selectionEnd: b } = ta;
        const next = value.slice(0, a) + "    " + value.slice(b);
        setValue(next);
        requestAnimationFrame(() => ta.setSelectionRange(a + 4, a + 4));
      }
    }
  };

  const z = v.zoom;
  const lines = value.split("\n");
  const fs = spec.fontSize * z;
  const lineH = (spec.lineH ?? spec.fontSize * 1.25) * z;
  let width = spec.box.w * z;
  let height = spec.box.h * z;
  if (spec.grow) {
    const pad = ((spec.padLeft ?? 0) + (spec.pad ?? 0)) * z;
    width = Math.max(width, Math.max(...lines.map((l) => measure(l, spec.fontSize, spec.mono))) * z + pad + 24);
    height = Math.max(height, lines.length * lineH + (spec.pad ?? 0) * 2 * z);
  }
  const style: CSSProperties = {
    left: spec.box.x * z + v.x,
    top: spec.box.y * z + v.y,
    width,
    height,
    fontSize: fs,
    lineHeight: `${lineH}px`,
    fontFamily: spec.mono ? MONO_FONT : HAND_FONT,
    textAlign: spec.align,
    padding: spec.pad != null ? `${spec.pad * z}px ${spec.pad * z}px ${spec.pad * z}px ${(spec.padLeft ?? spec.pad) * z}px` : 0,
    paddingTop: !spec.multiline || spec.align === "center" ? Math.max(0, (height - lineH * lines.length) / 2) : undefined,
    background: spec.mono && spec.padLeft ? "#f8f9fa" : "#fff",
  };

  return (
    <textarea
      ref={ref}
      className="text-editor"
      style={style}
      value={value}
      spellCheck={false}
      onChange={(e) => setValue(spec.multiline ? e.target.value : e.target.value.replace(/\n/g, ""))}
      onKeyDown={onKeyDown}
      onBlur={() => finish()}
    />
  );
}
