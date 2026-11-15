import { useEffect } from "react";
import { MARK_COLORS, applyMark, stepCellSelection, stepCodeLine, stepPointer } from "./actions";
import { saveFile } from "./exporter";
import { removeSelection, strikeCells, strikeNode } from "./structureOps";
import {
  addStep,
  copySelection,
  currentElements,
  duplicate,
  addElements,
  gotoStep,
  paste,
  redo,
  setElements,
  setTool,
  toggleTheme,
  undo,
  useStore,
  zoomAt,
  zoomToFit,
} from "./store";
import type { Tool } from "./types";

/** True while the space bar is held (temporary hand tool). */
export const spaceHeld = { current: false };

const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  h: "hand",
  r: "rect",
  o: "ellipse",
  d: "diamond",
  a: "arrow",
  l: "line",
  p: "pen",
  t: "text",
  i: "pointer",
  e: "eraser",
  k: "laser",
};

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

export function togglePresent(on = !useStore.getState().presenting) {
  useStore.setState({
    presenting: on,
    tool: on ? "laser" : "select",
    selection: [],
    cells: null,
    editing: null,
  });
  requestAnimationFrame(() => zoomToFit());
  if (on) document.documentElement.requestFullscreen?.().catch(() => {});
  else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const s = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (e.key === " " && !e.repeat) {
        spaceHeld.current = true;
        e.preventDefault();
      }

      // ---- presentation ----
      if (s.presenting) {
        if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) gotoStep(s.doc.current + 1);
        else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) gotoStep(s.doc.current - 1);
        else if (e.key === "Escape") togglePresent(false);
        else if (key === "f") zoomToFit();
        else return;
        e.preventDefault();
        return;
      }
      if (s.insert || s.helpOpen) return;

      // ---- modifier shortcuts ----
      if (mod) {
        if (key === "z") e.shiftKey ? redo() : undo();
        else if (key === "y") redo();
        else if (key === "c") copySelection();
        else if (key === "v") paste();
        else if (key === "d") {
          const ids = new Set(s.selection);
          addElements(duplicate(currentElements().filter((el) => ids.has(el.id))));
        } else if (key === "a") useStore.setState({ selection: currentElements().map((el) => el.id), cells: null });
        else if (key === "s") saveFile();
        else if (key === "=" || key === "+") zoomAt(1.2);
        else if (key === "-") zoomAt(1 / 1.2);
        else if (key === "0") useStore.setState({ viewport: { ...s.viewport, zoom: 1 } });
        else return;
        e.preventDefault();
        return;
      }

      // ---- arrows: pointer / code line / cell cursor / nudge ----
      const arrow = ARROWS[e.key];
      if (arrow) {
        e.preventDefault();
        const els = currentElements();
        const sel = els.filter((el) => s.selection.includes(el.id));
        const single = sel.length === 1 ? sel[0] : null;
        if (single?.type === "pointer" && stepPointer(single, arrow[0], arrow[1])) return;
        if (single?.type === "code" && arrow[0] !== 0) return stepCodeLine(single, arrow[0]);
        if (stepCellSelection(arrow[0], arrow[1])) return;
        if (!sel.length) return;
        const d = e.shiftKey ? 10 : 1;
        const ids = new Set(s.selection);
        setElements((all) =>
          all.map((el) => {
            if (!ids.has(el.id)) return el;
            if (el.type === "arrow") {
              return { ...el, x: el.x + arrow[1] * d, y: el.y + arrow[0] * d, x2: el.x2 + arrow[1] * d, y2: el.y2 + arrow[0] * d };
            }
            return { ...el, x: el.x + arrow[1] * d, y: el.y + arrow[0] * d };
          }),
        );
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        removeSelection();
        e.preventDefault();
        return;
      }
      if (e.key === "Escape") {
        useStore.setState({ selection: [], cells: null, tool: "select" });
        return;
      }
      if (e.key === "Enter" && s.selection.length === 1) {
        const cell = s.cells?.id === s.selection[0] ? s.cells.keys[0] : undefined;
        useStore.setState({ editing: { id: s.selection[0], cell } });
        e.preventDefault();
        return;
      }

      // digits colour the selected cells (or shape fills): 1 current, 2 visited, 3 done, 4 removed, 5 window, 6 ignored, 0 clear
      if (/^[0-6]$/.test(e.key) && (s.cells?.keys.length || s.selection.length) && !e.shiftKey) {
        applyMark(e.key === "0" ? null : MARK_COLORS[Number(e.key) - 1].color);
        return;
      }
      if (e.key === "!" || (e.shiftKey && e.code === "Digit1")) return zoomToFit();
      if (e.key === "/") {
        const one = s.selection.length === 1 ? currentElements().find((el) => el.id === s.selection[0]) : undefined;
        if (s.cells?.keys.length) {
          e.preventDefault(); // the editor that opens must not receive the "/"
          return strikeCells(s.cells.id, s.cells.keys);
        }
        if (one && "role" in one && one.role === "list") {
          e.preventDefault();
          return strikeNode(one.id);
        }
      }
      if (e.altKey && e.shiftKey && e.code === "KeyD") return toggleTheme();

      if (key === "n") return addStep();
      if (e.key === "[" || e.key === ",") return gotoStep(s.doc.current - 1);
      if (e.key === "]" || e.key === ".") return gotoStep(s.doc.current + 1);
      if (e.key === "?") return useStore.setState({ helpOpen: true });
      if (key === "s") {
        e.preventDefault(); // the dialog autofocuses its input; don't type the "s" into it
        return useStore.setState({ insert: "array" });
      }
      if (e.shiftKey && key === "p") return togglePresent(true);
      if (TOOL_KEYS[key] && !e.shiftKey) setTool(TOOL_KEYS[key]);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") spaceHeld.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);
}
