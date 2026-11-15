import { create } from "zustand";
import { byIdOf, getBounds, unionBoxes } from "./geometry";
import { uid } from "./structures";
import type { Box, CellSelection, Doc, El, Step, StyleDefaults, Tool, Viewport } from "./types";
import type { PresetKind } from "./structures";

export interface Editing {
  id: string;
  cell?: string;
}

interface State {
  doc: Doc;
  past: Doc[];
  future: Doc[];
  selection: string[];
  cells: CellSelection | null;
  tool: Tool;
  toolLocked: boolean;
  viewport: Viewport;
  sketchy: boolean;
  showChanges: boolean;
  theme: "light" | "dark";
  style: StyleDefaults;
  editing: Editing | null;
  presenting: boolean;
  animating: boolean;
  insert: PresetKind | null;
  helpOpen: boolean;
  clipboard: El[];
  notice: string | null; // short message shown above the steps bar
}

const HISTORY_LIMIT = 200;

const emptyDoc = (): Doc => ({ steps: [{ id: uid(), note: "", elements: [] }], current: 0 });

export const useStore = create<State>(() => ({
  doc: emptyDoc(),
  past: [],
  future: [],
  selection: [],
  cells: null,
  tool: "select",
  toolLocked: false,
  viewport: { x: 0, y: 0, zoom: 1 },
  sketchy: true,
  showChanges: true,
  theme: "dark",
  style: { stroke: "#1e1e1e", fill: "transparent", strokeWidth: 2 },
  editing: null,
  presenting: false,
  animating: false,
  insert: null,
  helpOpen: false,
  clipboard: [],
  notice: null,
}));

const get = useStore.getState;
const set = useStore.setState;

// ---------- selectors ----------

export const currentStep = (s: State = get()): Step => s.doc.steps[s.doc.current];
export const currentElements = (s: State = get()): El[] => currentStep(s).elements;
export const previousElements = (s: State = get()): El[] | null =>
  s.doc.current > 0 ? s.doc.steps[s.doc.current - 1].elements : null;

/** Commit an open inline editor (it commits on blur) before the document changes under it. */
export function flushEditor() {
  if (get().editing) (document.activeElement as HTMLElement | null)?.blur?.();
}

// ---------- history ----------

/** Record the current document so the next mutation can be undone. */
export function checkpoint() {
  const { doc, past } = get();
  set({ past: [...past.slice(-HISTORY_LIMIT + 1), doc], future: [] });
}

export function undo() {
  flushEditor();
  const { past, doc, future } = get();
  if (!past.length) return;
  set({ doc: past[past.length - 1], past: past.slice(0, -1), future: [doc, ...future], editing: null });
  pruneSelection();
}

export function redo() {
  flushEditor();
  const { past, doc, future } = get();
  if (!future.length) return;
  set({ doc: future[0], future: future.slice(1), past: [...past, doc], editing: null });
  pruneSelection();
}

function pruneSelection() {
  const ids = new Set(currentElements().map((e) => e.id));
  const { selection, cells } = get();
  set({
    selection: selection.filter((id) => ids.has(id)),
    cells: cells && ids.has(cells.id) ? cells : null,
  });
}

// ---------- element mutations ----------

function writeElements(elements: El[]) {
  const { doc } = get();
  const steps = doc.steps.slice();
  steps[doc.current] = { ...steps[doc.current], elements };
  set({ doc: { ...doc, steps } });
}

export function setElements(fn: (els: El[]) => El[], record = true) {
  if (record) checkpoint();
  writeElements(fn(currentElements()));
}

export function updateElement<T extends El = El>(id: string, patch: Partial<T> | ((el: T) => T), record = true) {
  setElements(
    (els) =>
      els.map((e) =>
        e.id === id ? (typeof patch === "function" ? patch(e as T) : ({ ...e, ...patch } as El)) : e,
      ),
    record,
  );
}

export function updateSelected(patch: Partial<El> | ((el: El) => El)) {
  const ids = new Set(get().selection);
  setElements((els) =>
    els.map((e) => (ids.has(e.id) ? (typeof patch === "function" ? patch(e) : ({ ...e, ...patch } as El)) : e)),
  );
}

export function addElements(els: El[], select = true) {
  setElements((cur) => [...cur, ...els]);
  if (select) set({ selection: els.map((e) => e.id), cells: null });
}

/** Delete elements; arrows bound to them and pointers aimed at them go too (a pointer always points at something). */
export function deleteElements(ids: string[], record = true) {
  if (!ids.length) return;
  const gone = new Set(ids);
  setElements(
    (els) =>
      els.filter(
        (e) =>
          !gone.has(e.id) &&
          !(e.type === "arrow" && ((e.start && gone.has(e.start)) || (e.end && gone.has(e.end)))) &&
          !(e.type === "pointer" && e.target && gone.has(e.target.id)),
      ),
    record,
  );
  set({ selection: [], cells: null, editing: null });
}

export const deleteSelection = () => deleteElements(get().selection);

export function duplicate(els: El[], offset = 24): El[] {
  const map = new Map(els.map((e) => [e.id, uid()]));
  return els.map((e) => {
    const c = { ...e, id: map.get(e.id)!, x: e.x + offset, y: e.y + offset } as El;
    if (c.type === "arrow") {
      c.x2 += offset;
      c.y2 += offset;
      c.start = c.start && map.get(c.start);
      c.end = c.end && map.get(c.end);
    }
    if (c.type === "pointer" && c.target) {
      const t = map.get(c.target.id);
      c.target = t ? { ...c.target, id: t } : c.target;
    }
    return c;
  });
}

export function copySelection() {
  const ids = new Set(get().selection);
  set({ clipboard: currentElements().filter((e) => ids.has(e.id)) });
}

export function paste() {
  const { clipboard } = get();
  if (!clipboard.length) return;
  const copies = duplicate(clipboard);
  addElements(copies);
  set({ clipboard: copies });
}

export function reorderSelection(toFront: boolean) {
  const ids = new Set(get().selection);
  setElements((els) => {
    const picked = els.filter((e) => ids.has(e.id));
    const rest = els.filter((e) => !ids.has(e.id));
    return toFront ? [...rest, ...picked] : [...picked, ...rest];
  });
}

// ---------- steps (the trace timeline) ----------

function animateStep() {
  set({ animating: true });
  window.setTimeout(() => set({ animating: false }), 420);
}

/** Capture the current board as a new step right after the current one. */
export function addStep() {
  flushEditor();
  checkpoint();
  const { doc } = get();
  const cur = doc.steps[doc.current];
  const steps = doc.steps.slice();
  steps.splice(doc.current + 1, 0, { id: uid(), note: "", elements: cur.elements });
  set({ doc: { steps, current: doc.current + 1 }, editing: null });
}

export function deleteStep(index = get().doc.current) {
  const { doc } = get();
  if (doc.steps.length <= 1) return;
  checkpoint();
  const steps = doc.steps.filter((_, i) => i !== index);
  set({ doc: { steps, current: Math.min(doc.current, steps.length - 1) }, editing: null });
  pruneSelection();
}

export function moveStep(from: number, to: number) {
  const { doc } = get();
  if (to < 0 || to >= doc.steps.length || from === to) return;
  checkpoint();
  const steps = doc.steps.slice();
  const [s] = steps.splice(from, 1);
  steps.splice(to, 0, s);
  set({ doc: { steps, current: to } });
}

export function gotoStep(index: number) {
  flushEditor();
  const { doc } = get();
  const i = Math.max(0, Math.min(doc.steps.length - 1, index));
  if (i === doc.current) return;
  set({ doc: { ...doc, current: i }, editing: null });
  animateStep();
  pruneSelection();
}

export function setNote(note: string) {
  const { doc } = get();
  const steps = doc.steps.slice();
  steps[doc.current] = { ...steps[doc.current], note };
  set({ doc: { ...doc, steps } });
}

export function loadDoc(doc: Doc) {
  checkpoint();
  set({ doc, selection: [], cells: null, editing: null });
}

export function resetDoc() {
  loadDoc(emptyDoc());
}

// ---------- viewport ----------

export function zoomAt(factor: number, sx = window.innerWidth / 2, sy = window.innerHeight / 2) {
  const { viewport: v } = get();
  const zoom = Math.min(5, Math.max(0.1, v.zoom * factor));
  const k = zoom / v.zoom;
  set({ viewport: { zoom, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k } });
}

export function zoomToFit(elements = currentElements(), padding = 80) {
  if (!elements.length) {
    set({ viewport: { x: window.innerWidth / 2, y: window.innerHeight / 2, zoom: 1 } });
    return;
  }
  const byId = byIdOf(elements);
  const b = unionBoxes(elements.map((e) => getBounds(e, byId)));
  const W = window.innerWidth;
  const H = window.innerHeight - (get().presenting ? 80 : 140);
  const zoom = Math.min(2, Math.max(0.1, Math.min((W - padding * 2) / b.w, (H - padding * 2) / b.h)));
  set({
    viewport: { zoom, x: W / 2 - (b.x + b.w / 2) * zoom, y: (get().presenting ? 0 : 50) + H / 2 - (b.y + b.h / 2) * zoom },
  });
}

/** Pan (without zooming) so that a world-space box is on screen. */
export function ensureVisible(b: Box, margin = 120, bottomMargin = 190 /* steps bar + room for the +/× handles */) {
  const { viewport: v } = get();
  const left = b.x * v.zoom + v.x;
  const top = b.y * v.zoom + v.y;
  const right = left + b.w * v.zoom;
  const bottom = top + b.h * v.zoom;
  let dx = 0;
  let dy = 0;
  if (bottom > window.innerHeight - bottomMargin) dy = window.innerHeight - bottomMargin - bottom;
  if (top + dy < margin) dy = margin - top;
  if (right > window.innerWidth - 40) dx = window.innerWidth - 40 - right;
  if (left + dx < 260) dx = 260 - left;
  if (dx || dy) set({ viewport: { ...v, x: v.x + dx, y: v.y + dy } });
}

let noticeTimer = 0;
/** Show a short message for a couple of seconds. */
export function flashNotice(message: string) {
  set({ notice: message });
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => set({ notice: null }), 2600);
}

export const toggleTheme = () => set({ theme: get().theme === "dark" ? "light" : "dark" });

export function setTool(tool: Tool) {
  set({ tool, editing: null, ...(tool !== "select" ? { cells: null } : {}) });
}

// ---------- persistence ----------

const STORAGE_KEY = "dsa-tracer:v1";

export function loadSaved(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data?.doc?.steps?.length) return false;
    set({ doc: data.doc, sketchy: data.sketchy ?? true, showChanges: data.showChanges ?? true, theme: data.theme ?? "dark" });
    return true;
  } catch {
    return false;
  }
}

function save() {
  const s = get();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ doc: s.doc, sketchy: s.sketchy, showChanges: s.showChanges, theme: s.theme }));
  } catch {
    /* storage full or unavailable — ignore */
  }
}

let saveTimer = 0;
useStore.subscribe((s, prev) => {
  if (s.doc === prev.doc && s.sketchy === prev.sketchy && s.showChanges === prev.showChanges && s.theme === prev.theme) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, 400);
});
// don't lose the last edit if the tab closes inside the debounce window
window.addEventListener("pagehide", () => {
  if (!saveTimer) return;
  window.clearTimeout(saveTimer);
  save();
});
