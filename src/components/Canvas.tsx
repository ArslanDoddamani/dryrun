import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { toggleCodeLine } from "../actions";
import { HandleButtons, runHandle, structureHandles } from "./Handles";
import { eraseTargets, type EraseTarget } from "../structureOps";
import { boxContains, byIdOf, cellBox, defaultPointerSide, getBounds, isBindable, resolveArrow } from "../geometry";
import { Scene } from "../render/Scene";
import { spaceHeld } from "../shortcuts";
import {
  addElements,
  checkpoint,
  currentElements,
  deleteElements,
  previousElements,
  flashNotice,
  setElements,
  setTool,
  useStore,
  zoomAt,
} from "../store";
import { makeArrow, makeFreeDraw, makePointer, makeShape, makeText, nextPointerLabel } from "../structures";
import type { ArrowEl, Box, El, Point, PointerEl, ShapeEl } from "../types";

interface Hit {
  id: string;
  cell?: string;
  line?: number;
}

type Gesture =
  | { kind: "pan"; sx: number; sy: number; vx: number; vy: number }
  | {
      kind: "move";
      start: Point;
      origin: Map<string, El>;
      arrowPts: Map<string, [Point, Point]>;
      moved: boolean;
      clickLine?: { id: string; line: number; additive: boolean };
      /** a plain click (no drag) on one member of a multi-selection selects just that member */
      collapseTo?: string;
    }
  | { kind: "marquee"; start: Point; additive: boolean }
  | { kind: "create"; id: string; start: Point }
  | { kind: "arrow"; id: string }
  | { kind: "arrowEnd"; id: string; which: "start" | "end" }
  | { kind: "resize"; id: string; start: Point; orig: El; origBox: Box }
  | { kind: "pointerDrag"; id: string; moved: boolean }
  | { kind: "draw"; id: string }
  | { kind: "erase"; marked: Map<string, EraseTarget>; mode?: "values" | "items" }
  | { kind: "laser" };

const RESIZABLE = new Set(["rect", "ellipse", "diamond", "text", "array", "matrix", "code"]);
const LASER_MS = 1100;

/** What the eraser is over: the element, the cell, and the crossed-out value if the point is on one. */
function eraserTargetAt(x: number, y: number): (EraseTarget & { outlineNode?: Element }) | null {
  const nodes = document.elementsFromPoint(x, y);
  let target: (EraseTarget & { outlineNode?: Element }) | null = null;
  const inTarget = (n: Element) => n.closest("[data-id]")?.getAttribute("data-id") === target!.id;
  for (const n of nodes) {
    const g = n.closest?.("[data-id]");
    if (!g || !g.closest("svg.board")) continue;
    target = { id: g.getAttribute("data-id")!, cell: n.getAttribute("data-cell") ?? undefined };
    break;
  }
  if (!target) return null;
  // values sit under the cell's hit area, so look through the whole stack at this point:
  // a crossed-out value, else the current value, else the cell / element itself
  const struck = nodes.find((n) => n.hasAttribute("data-struck") && inTarget(n));
  if (struck) {
    target.struck = Number(struck.getAttribute("data-struck"));
    target.struckCell = struck.getAttribute("data-struck-cell") ?? undefined;
    target.outlineNode = struck;
    return target;
  }
  const value = nodes.find((n) => n.hasAttribute("data-value") && inTarget(n));
  if (value) {
    target.value = true;
    target.valueCell = value.getAttribute("data-value-cell") ?? undefined;
    target.outlineNode = value;
  }
  return target;
}

function hitAt(x: number, y: number, exclude: Set<string> = new Set()): Hit | null {
  for (const node of document.elementsFromPoint(x, y)) {
    const g = node.closest?.("[data-id]");
    if (!g || !g.closest("svg.board")) continue;
    const id = g.getAttribute("data-id")!;
    if (exclude.has(id)) continue;
    const cell = node.getAttribute("data-cell") ?? undefined;
    const line = node.getAttribute("data-line");
    return { id, cell, line: line != null ? Number(line) : undefined };
  }
  return null;
}

export function Canvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const s = useStore();
  const elements = currentElements(s);
  const prev = previousElements(s);
  const byId = useMemo(() => byIdOf(elements), [elements]);
  const v = s.viewport;

  const gesture = useRef<Gesture | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [hint, setHint] = useState<Hit | null>(null);
  const laser = useRef<{ x: number; y: number; t: number }[][]>([]);
  const [, setFrame] = useState(0);
  const [panning, setPanning] = useState(false);
  const [eraseHover, setEraseHover] = useState<Box | null>(null);
  const [erasePending, setErasePending] = useState<Box[]>([]);

  const toWorld = (cx: number, cy: number): Point => {
    const { viewport } = useStore.getState();
    return [(cx - viewport.x) / viewport.zoom, (cy - viewport.y) / viewport.zoom];
  };

  // wheel: pan, ctrl/cmd + wheel (or pinch): zoom
  useEffect(() => {
    const svg = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
      } else {
        const { viewport } = useStore.getState();
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        useStore.setState({ viewport: { ...viewport, x: viewport.x - dx, y: viewport.y - dy } });
      }
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  // laser trail fade loop
  const laserLoop = useRef(0);
  const kickLaser = () => {
    if (laserLoop.current) return;
    const tick = () => {
      const now = performance.now();
      laser.current = laser.current
        .map((trail) => trail.filter((p) => now - p.t < LASER_MS))
        .filter((trail) => trail.length > 0);
      setFrame((f) => f + 1);
      laserLoop.current = laser.current.length ? requestAnimationFrame(tick) : 0;
    };
    laserLoop.current = requestAnimationFrame(tick);
  };

  // A stroke only marks what it passes over (outlined in red); everything is erased together on release, so
  // removing one element never slides the next one under the pointer. Where the stroke starts sets what it erases:
  // starting on a value erases only values; starting on a cell / node / shape removes only whole things.
  const markErase = (cx: number, cy: number, g: Extract<Gesture, { kind: "erase" }>) => {
    const t = eraserTargetAt(cx, cy);
    if (!t) return;
    const mode = t.value || t.struck !== undefined ? "values" : "items";
    g.mode ??= mode;
    if (mode !== g.mode) return;
    const marked = g.marked;
    const key = `${t.id}|${t.cell ?? ""}|${t.struckCell ?? ""}|${t.struck ?? ""}|${t.value ? `v${t.valueCell ?? ""}` : ""}`;
    if (marked.has(key)) return;
    const { outlineNode: _node, ...target } = t;
    marked.set(key, target);
    const box = eraseBoxAt(cx, cy);
    if (box) setErasePending((p) => [...p, box]);
  };

  /** World-space box of what the eraser would remove at this point (for the hover outline). */
  const eraseBoxAt = (cx: number, cy: number): Box | null => {
    const t = eraserTargetAt(cx, cy);
    const { viewport: vp } = useStore.getState();
    const el = t && currentElements().find((e) => e.id === t.id);
    if (!t || !el) return null;
    if (t.outlineNode) {
      const r = t.outlineNode.getBoundingClientRect();
      return { x: (r.left - vp.x) / vp.zoom, y: (r.top - vp.y) / vp.zoom, w: r.width / vp.zoom, h: r.height / vp.zoom };
    }
    const all = byIdOf(currentElements());
    if (t.cell !== undefined && el.type === "table") {
      // a whole entry goes: outline key + value
      const k = cellBox(el, `${t.cell.split(",")[0]},0`);
      const v = cellBox(el, `${t.cell.split(",")[0]},1`);
      if (k && v) return { x: k.x, y: k.y, w: k.w + v.w, h: k.h };
    }
    return (t.cell !== undefined ? cellBox(el, t.cell) : null) ?? getBounds(el, all);
  };

  // The board manages focus itself (see onMouseDown): clicking it commits any open editor or panel field.
  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const st = useStore.getState();
    if (e.button === 2) return;
    svgRef.current!.setPointerCapture(e.pointerId);
    const w = toWorld(e.clientX, e.clientY);
    const els = currentElements(st);
    const ids = new Map(els.map((el) => [el.id, el]));

    if (e.button === 1 || st.tool === "hand" || spaceHeld.current) {
      gesture.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: st.viewport.x, vy: st.viewport.y };
      setPanning(true);
      return;
    }

    switch (st.tool) {
      case "laser":
        laser.current.push([{ x: w[0], y: w[1], t: performance.now() }]);
        gesture.current = { kind: "laser" };
        kickLaser();
        return;
      case "eraser": {
        const g: Gesture = { kind: "erase", marked: new Map() };
        gesture.current = g;
        setErasePending([]);
        markErase(e.clientX, e.clientY, g);
        return;
      }
      case "pen": {
        const el = makeFreeDraw(w[0], w[1], st.style);
        addElements([el], false);
        gesture.current = { kind: "draw", id: el.id };
        return;
      }
      case "rect":
      case "ellipse":
      case "diamond": {
        const el = makeShape(st.tool, w[0], w[1], 0, 0, "", st.style);
        addElements([el]);
        gesture.current = { kind: "create", id: el.id, start: w };
        return;
      }
      case "arrow":
      case "line": {
        const h = hitAt(e.clientX, e.clientY);
        const target = h && ids.get(h.id);
        const el = makeArrow(
          w[0],
          w[1],
          w[0],
          w[1],
          { start: target && isBindable(target) ? target.id : undefined, head: st.tool === "line" ? "none" : "end" },
          st.style,
        );
        addElements([el]);
        gesture.current = { kind: "arrow", id: el.id };
        return;
      }
      case "text": {
        const el = makeText(w[0], w[1] - 14, "", 22, st.style);
        addElements([el]);
        if (!st.toolLocked) setTool("select");
        useStore.setState({ editing: { id: el.id } });
        return;
      }
      case "pointer": {
        const h = hitAt(e.clientX, e.clientY);
        const target = h ? ids.get(h.id) : undefined;
        const attach = target && target.type !== "arrow" && target.type !== "pointer" && target.type !== "freedraw";
        if (!attach) {
          flashNotice("Click a cell or node to place a pointer — use an arrow (A) to point anywhere else");
          return;
        }
        const p = makePointer(
          nextPointerLabel(els),
          { id: target.id, cell: target.type === "array" || target.type === "matrix" ? h!.cell : undefined },
          defaultPointerSide(target),
          w[0],
          w[1],
        );
        addElements([p]);
        if (!st.toolLocked) setTool("select");
        useStore.setState({ selection: [p.id], editing: { id: p.id } });
        return;
      }
    }

    // ---- select tool ----
    const action = (e.target as Element).closest?.("[data-action]");
    if (action && st.selection.length === 1) {
      const el = ids.get(st.selection[0]);
      if (el) runHandle(el, action.getAttribute("data-action")!);
      return;
    }
    const handle = (e.target as Element).getAttribute("data-handle");
    if (handle && st.selection.length === 1) {
      const el = ids.get(st.selection[0])!;
      checkpoint();
      if (handle === "start" || handle === "end") gesture.current = { kind: "arrowEnd", id: el.id, which: handle };
      else gesture.current = { kind: "resize", id: el.id, start: w, orig: el, origBox: getBounds(el, ids) };
      return;
    }

    const h = hitAt(e.clientX, e.clientY);
    if (!h) {
      if (!e.shiftKey) useStore.setState({ selection: [], cells: null });
      gesture.current = { kind: "marquee", start: w, additive: e.shiftKey };
      return;
    }
    const el = ids.get(h.id)!;
    let selection = st.selection;
    let cells = st.cells;
    const wasSelected = selection.includes(h.id);
    if (e.shiftKey && !(h.cell && cells?.id === h.id)) {
      selection = wasSelected ? selection.filter((id) => id !== h.id) : [...selection, h.id];
    } else if (!wasSelected) {
      selection = [h.id];
    }
    if (h.cell && (el.type === "array" || el.type === "matrix" || el.type === "table")) {
      if (e.shiftKey && cells?.id === h.id) {
        const keys = cells.keys.includes(h.cell) ? cells.keys.filter((k) => k !== h.cell) : [...cells.keys, h.cell];
        cells = { id: h.id, keys };
      } else cells = { id: h.id, keys: [h.cell] };
    } else if (!e.shiftKey) cells = null;
    useStore.setState({ selection, cells });

    if (el.type === "pointer" && selection.length === 1) {
      gesture.current = { kind: "pointerDrag", id: el.id, moved: false };
      return;
    }
    const origin = new Map<string, El>();
    const arrowPts = new Map<string, [Point, Point]>();
    for (const id of selection) {
      const o = ids.get(id);
      if (!o) continue;
      origin.set(id, o);
      if (o.type === "arrow") arrowPts.set(id, resolveArrow(o, ids));
    }
    gesture.current = {
      kind: "move",
      start: w,
      origin,
      arrowPts,
      moved: false,
      clickLine:
        el.type === "code" && wasSelected && h.line !== undefined
          ? { id: el.id, line: h.line, additive: e.shiftKey }
          : undefined,
      collapseTo: wasSelected && !e.shiftKey && selection.length > 1 ? el.id : undefined,
    };
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g) {
      if (useStore.getState().tool === "eraser") setEraseHover(eraseBoxAt(e.clientX, e.clientY));
      return;
    }
    const st = useStore.getState();
    const w = toWorld(e.clientX, e.clientY);
    switch (g.kind) {
      case "pan":
        useStore.setState({ viewport: { ...st.viewport, x: g.vx + e.clientX - g.sx, y: g.vy + e.clientY - g.sy } });
        return;
      case "laser":
        laser.current[laser.current.length - 1]?.push({ x: w[0], y: w[1], t: performance.now() });
        kickLaser();
        return;
      case "erase":
        markErase(e.clientX, e.clientY, g);
        return;
      case "draw":
        setElements(
          (els) =>
            els.map((el) =>
              el.id === g.id && el.type === "freedraw"
                ? { ...el, points: [...el.points, [w[0] - el.x, w[1] - el.y] as Point] }
                : el,
            ),
          false,
        );
        return;
      case "create": {
        let dw = w[0] - g.start[0];
        let dh = w[1] - g.start[1];
        if (e.shiftKey) {
          const m = Math.max(Math.abs(dw), Math.abs(dh));
          dw = Math.sign(dw || 1) * m;
          dh = Math.sign(dh || 1) * m;
        }
        setElements((els) => els.map((el) => (el.id === g.id ? ({ ...el, w: dw, h: dh } as ShapeEl) : el)), false);
        return;
      }
      case "arrow":
      case "arrowEnd": {
        const which = g.kind === "arrow" ? "end" : g.which;
        const arrow = currentElements(st).find((el) => el.id === g.id) as ArrowEl;
        const h = hitAt(e.clientX, e.clientY, new Set([g.id]));
        const target = h && byIdOf(currentElements(st)).get(h.id);
        setHint(target && isBindable(target) ? { id: target.id } : null);
        const patch: Partial<ArrowEl> =
          which === "end" ? { x2: w[0], y2: w[1], end: undefined } : { x: w[0], y: w[1], start: undefined };
        // shift snaps to 15° increments
        if (e.shiftKey && which === "end") {
          const a = Math.round(Math.atan2(w[1] - arrow.y, w[0] - arrow.x) / (Math.PI / 12)) * (Math.PI / 12);
          const len = Math.hypot(w[0] - arrow.x, w[1] - arrow.y);
          patch.x2 = arrow.x + Math.cos(a) * len;
          patch.y2 = arrow.y + Math.sin(a) * len;
        }
        setElements((els) => els.map((el) => (el.id === g.id ? ({ ...el, ...patch } as ArrowEl) : el)), false);
        return;
      }
      case "resize": {
        const o = g.orig;
        const dx = w[0] - g.start[0];
        const dy = w[1] - g.start[1];
        const sx = Math.max(0.2, (g.origBox.w + dx) / Math.max(1, g.origBox.w));
        let next: El = o;
        switch (o.type) {
          case "rect":
          case "ellipse":
          case "diamond":
            next = { ...o, w: Math.max(10, o.w + dx), h: Math.max(10, o.h + dy) };
            if (e.shiftKey) next = { ...next, h: (next as ShapeEl).w } as ShapeEl;
            break;
          case "text":
          case "code":
            next = { ...o, fontSize: Math.max(8, Math.round(o.fontSize * sx * 10) / 10) };
            break;
          case "array": {
            const n = Math.max(1, o.values.length);
            next = {
              ...o,
              cellW: Math.max(24, o.cellW + dx / (o.vertical ? 1 : n)),
              cellH: Math.max(20, o.cellH + dy / (o.vertical ? n : 1)),
            };
            break;
          }
          case "matrix":
            next = {
              ...o,
              cellW: Math.max(20, o.cellW + dx / Math.max(1, ...o.cells.map((r) => r.length))),
              cellH: Math.max(18, o.cellH + dy / Math.max(1, o.cells.length)),
            };
            break;
        }
        setElements((els) => els.map((el) => (el.id === g.id ? next : el)), false);
        return;
      }
      case "pointerDrag": {
        if (!g.moved) {
          checkpoint();
          g.moved = true;
        }
        const els = currentElements(st);
        const h = hitAt(e.clientX, e.clientY, new Set([g.id]));
        const target = h ? els.find((el) => el.id === h.id) : undefined;
        const attachable = target && target.type !== "arrow" && target.type !== "pointer" && target.type !== "freedraw";
        setElements(
          (all) =>
            all.map((el) => {
              if (el.id !== g.id || el.type !== "pointer") return el;
              if (attachable) {
                const cell = target.type === "array" || target.type === "matrix" ? h!.cell : undefined;
                const side = el.target?.id === target.id ? el.side : defaultPointerSide(target);
                return { ...el, target: { id: target.id, cell }, side } as PointerEl;
              }
              // over empty space an attached pointer stays on its last cell (only legacy floating pointers move freely)
              return el.target ? el : ({ ...el, x: w[0], y: w[1] } as PointerEl);
            }),
          false,
        );
        return;
      }
      case "move": {
        const dx = w[0] - g.start[0];
        const dy = w[1] - g.start[1];
        if (!g.moved) {
          if (Math.hypot(dx, dy) * st.viewport.zoom < 3) return;
          checkpoint();
          g.moved = true;
        }
        const moving = g.origin;
        setElements(
          (els) =>
            els.map((el) => {
              const o = moving.get(el.id);
              if (!o) return el;
              if (o.type === "arrow") {
                const [p1, p2] = g.arrowPts.get(o.id)!;
                const keepS = !!o.start && moving.has(o.start);
                const keepE = !!o.end && moving.has(o.end);
                return {
                  ...o,
                  x: (keepS ? o.x : p1[0]) + dx,
                  y: (keepS ? o.y : p1[1]) + dy,
                  x2: (keepE ? o.x2 : p2[0]) + dx,
                  y2: (keepE ? o.y2 : p2[1]) + dy,
                  start: keepS ? o.start : undefined,
                  end: keepE ? o.end : undefined,
                };
              }
              if (o.type === "pointer" && o.target) return el;
              return { ...o, x: o.x + dx, y: o.y + dy };
            }),
          false,
        );
        return;
      }
      case "marquee": {
        const x = Math.min(g.start[0], w[0]);
        const y = Math.min(g.start[1], w[1]);
        setMarquee({ x, y, w: Math.abs(w[0] - g.start[0]), h: Math.abs(w[1] - g.start[1]) });
        return;
      }
    }
  };

  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    gesture.current = null;
    setHint(null);
    setPanning(false);
    if (!g) return;
    const st = useStore.getState();
    const els = currentElements(st);
    const finishTool = () => !st.toolLocked && setTool("select");
    switch (g.kind) {
      case "erase":
        eraseTargets([...g.marked.values()]);
        setErasePending([]);
        setEraseHover(eraseBoxAt(e.clientX, e.clientY));
        return;
      case "create": {
        setElements(
          (all) =>
            all.map((el) => {
              if (el.id !== g.id || (el.type !== "rect" && el.type !== "ellipse" && el.type !== "diamond")) return el;
              if (Math.abs(el.w) < 6 && Math.abs(el.h) < 6) {
                const size = el.type === "rect" ? [120, 70] : [90, 90];
                return { ...el, x: el.x - size[0] / 2, y: el.y - size[1] / 2, w: size[0], h: size[1] };
              }
              return {
                ...el,
                x: Math.min(el.x, el.x + el.w),
                y: Math.min(el.y, el.y + el.h),
                w: Math.abs(el.w),
                h: Math.abs(el.h),
              };
            }),
          false,
        );
        finishTool();
        return;
      }
      case "arrow":
      case "arrowEnd": {
        const which = g.kind === "arrow" ? "end" : g.which;
        const h = hitAt(e.clientX, e.clientY, new Set([g.id]));
        const target = h && els.find((el) => el.id === h.id);
        const arrow = els.find((el) => el.id === g.id) as ArrowEl | undefined;
        if (!arrow) return;
        const bind = target && isBindable(target) ? target.id : undefined;
        const next: ArrowEl = which === "end" ? { ...arrow, end: bind } : { ...arrow, start: bind };
        const [p1, p2] = resolveArrow(next, byIdOf(els));
        if (g.kind === "arrow" && Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) < 8 && !next.end) {
          deleteElements([g.id]);
        } else {
          setElements((all) => all.map((el) => (el.id === g.id ? next : el)), false);
        }
        if (g.kind === "arrow") finishTool();
        return;
      }
      case "move":
        if (!g.moved && g.collapseTo) useStore.setState({ selection: [g.collapseTo] });
        if (!g.moved && g.clickLine) {
          const code = els.find((el) => el.id === g.clickLine!.id);
          if (code?.type === "code") toggleCodeLine(code, g.clickLine.line, g.clickLine.additive);
        }
        return;
      case "marquee": {
        if (marquee && (marquee.w > 2 || marquee.h > 2)) {
          const map = byIdOf(els);
          const inside = els.filter((el) => boxContains(marquee, getBounds(el, map))).map((el) => el.id);
          useStore.setState({
            selection: g.additive ? [...new Set([...st.selection, ...inside])] : inside,
            cells: null,
          });
        }
        setMarquee(null);
        return;
      }
      case "draw": {
        const el = els.find((x) => x.id === g.id);
        if (el?.type === "freedraw" && el.points.length < 2) {
          setElements((all) => all.map((x) => (x.id === g.id ? { ...el, points: [[0, 0], [0.5, 0.5]] } : x)), false);
        }
        return;
      }
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const st = useStore.getState();
    if (st.tool !== "select") return;
    // a quick double press on a +/× button is two actions, not an edit
    if (document.elementsFromPoint(e.clientX, e.clientY).some((n) => n.closest(".handle.action"))) return;
    const h = hitAt(e.clientX, e.clientY);
    if (!h) {
      const w = toWorld(e.clientX, e.clientY);
      const el = makeText(w[0], w[1] - 14, "", 22, st.style);
      addElements([el]);
      useStore.setState({ editing: { id: el.id } });
      return;
    }
    const el = byId.get(h.id);
    if (!el || el.type === "freedraw") return;
    useStore.setState({ selection: [h.id], editing: { id: h.id, cell: h.cell } });
  };

  // ---------- overlay geometry ----------
  const selected = s.selection.map((id) => byId.get(id)).filter(Boolean) as El[];
  const px = 1 / v.zoom;
  const single = selected.length === 1 ? selected[0] : null;
  const now = performance.now();
  const hintBox = hint && byId.get(hint.id) ? getBounds(byId.get(hint.id)!, byId) : null;

  const cursor = panning
    ? "grabbing"
    : s.tool === "hand"
      ? "grab"
      : s.tool === "text"
        ? "text"
        : s.tool === "select"
          ? "default"
          : "crosshair";

  return (
    <svg
      ref={svgRef}
      className={`board${s.animating ? " animating" : ""}`}
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setEraseHover(null)}
      // stop the browser's mousedown focus change from blurring editors opened during pointerdown
      onMouseDown={(e) => e.preventDefault()}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <defs>
        <pattern
          id="grid"
          width={20 * v.zoom}
          height={20 * v.zoom}
          patternUnits="userSpaceOnUse"
          x={v.x % (20 * v.zoom)}
          y={v.y % (20 * v.zoom)}
        >
          <circle cx={1} cy={1} r={1} fill="#dee2e6" />
        </pattern>
      </defs>
      {!s.presenting && <rect width="100%" height="100%" fill="url(#grid)" />}
      <g transform={`translate(${v.x} ${v.y}) scale(${v.zoom})`}>
        <Scene elements={elements} prev={prev} sketchy={s.sketchy} showChanges={s.showChanges} />

        {/* ---- overlays (not exported) ---- */}
        <g className="overlay">
          {erasePending.map((b, i) => (
            <rect
              key={i}
              x={b.x - 2 * px}
              y={b.y - 2 * px}
              width={b.w + 4 * px}
              height={b.h + 4 * px}
              rx={3 * px}
              fill="rgba(224,49,49,0.28)"
              stroke="#e03131"
              strokeWidth={1.5 * px}
            />
          ))}
          {s.tool === "eraser" && eraseHover && !erasePending.length && (
            <rect
              x={eraseHover.x - 2 * px}
              y={eraseHover.y - 2 * px}
              width={eraseHover.w + 4 * px}
              height={eraseHover.h + 4 * px}
              rx={3 * px}
              fill="rgba(224,49,49,0.12)"
              stroke="#e03131"
              strokeWidth={1.5 * px}
              strokeDasharray={`${4 * px} ${3 * px}`}
            />
          )}
          {hintBox && (
            <rect
              x={hintBox.x - 6}
              y={hintBox.y - 6}
              width={hintBox.w + 12}
              height={hintBox.h + 12}
              rx={6}
              fill="rgba(105,101,219,0.08)"
              stroke="#6965db"
              strokeWidth={1.5 * px}
            />
          )}
          {!s.presenting &&
            selected.map((el) => {
              const b = getBounds(el, byId);
              return (
                <rect
                  key={el.id}
                  x={b.x - 6 * px}
                  y={b.y - 6 * px}
                  width={b.w + 12 * px}
                  height={b.h + 12 * px}
                  fill="none"
                  stroke="#6965db"
                  strokeWidth={px}
                  strokeDasharray={`${4 * px} ${3 * px}`}
                />
              );
            })}
          {!s.presenting &&
            s.cells &&
            byId.get(s.cells.id) &&
            s.cells.keys.map((k) => {
              const b = cellBox(byId.get(s.cells!.id)!, k);
              return b ? (
                <rect key={k} x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="#6965db" strokeWidth={3 * px} rx={2} />
              ) : null;
            })}
          {!s.presenting && single && RESIZABLE.has(single.type) && !s.editing && (() => {
            const b = getBounds(single, byId);
            return (
              <rect
                data-handle="se"
                className="handle"
                x={b.x + b.w + 6 * px - 5 * px}
                y={b.y + b.h + 6 * px - 5 * px}
                width={10 * px}
                height={10 * px}
                rx={2 * px}
                fill="#fff"
                stroke="#6965db"
                strokeWidth={1.5 * px}
                style={{ cursor: "nwse-resize" }}
              />
            );
          })()}
          {!s.presenting &&
            single?.type === "arrow" &&
            resolveArrow(single, byId).map((p, i) => (
              <circle
                key={i}
                data-handle={i === 0 ? "start" : "end"}
                className="handle"
                cx={p[0]}
                cy={p[1]}
                r={5.5 * px}
                fill="#fff"
                stroke="#6965db"
                strokeWidth={1.5 * px}
                style={{ cursor: "move" }}
              />
            ))}
          {!s.presenting && single && s.tool === "select" && !s.editing && (
            <HandleButtons handles={structureHandles(single, s.cells, elements, px)} px={px} />
          )}
          {marquee && (
            <rect
              x={marquee.x}
              y={marquee.y}
              width={marquee.w}
              height={marquee.h}
              fill="rgba(105,101,219,0.06)"
              stroke="#6965db"
              strokeWidth={px}
            />
          )}
          {laser.current.map((trail, ti) =>
            trail.slice(1).map((p, i) => {
              const a = trail[i];
              const life = 1 - (now - p.t) / LASER_MS;
              if (life <= 0) return null;
              return (
                <line
                  key={`${ti}-${i}`}
                  x1={a.x}
                  y1={a.y}
                  x2={p.x}
                  y2={p.y}
                  stroke="#ff2d2d"
                  strokeOpacity={Math.min(1, life * 1.4)}
                  strokeWidth={(2 + 4 * life) * px}
                  strokeLinecap="round"
                />
              );
            }),
          )}
        </g>
      </g>
    </svg>
  );
}
