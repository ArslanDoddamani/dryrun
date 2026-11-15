import {
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Eye,
  EyeOff,
  FilePlus,
  FolderOpen,
  Image,
  Images,
  Menu,
  Moon,
  Presentation,
  Redo2,
  Save,
  Scan,
  Sparkles,
  Spline,
  Sun,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { twoSumExample } from "../examples";
import { exportCurrentPng, exportTraceSheet, openFile, saveFile } from "../exporter";
import { togglePresent } from "../shortcuts";
import { gotoStep, loadDoc, redo, resetDoc, toggleTheme, undo, useStore, zoomAt, zoomToFit } from "../store";

export function MainMenu() {
  const [open, setOpen] = useState(false);
  const sketchy = useStore((s) => s.sketchy);
  const showChanges = useStore((s) => s.showChanges);
  const theme = useStore((s) => s.theme);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const item = (icon: React.ReactNode, label: string, run: () => void, hint?: string) => (
    <button
      className="menu-item"
      onClick={() => {
        setOpen(false);
        run();
      }}
    >
      {icon}
      <span>{label}</span>
      {hint && <kbd>{hint}</kbd>}
    </button>
  );

  return (
    <div className="main-menu" ref={ref}>
      <button className={`icon-btn island-btn${open ? " active" : ""}`} title="Menu" onClick={() => setOpen(!open)}>
        <Menu size={18} />
      </button>
      {open && (
        <div className="menu island">
          {item(<FolderOpen size={16} />, "Open…", openFile)}
          {item(<Save size={16} />, "Save to file", saveFile, "Ctrl+S")}
          {item(<Image size={16} />, "Export step as PNG", exportCurrentPng)}
          {item(<Images size={16} />, "Export all steps (trace sheet)", exportTraceSheet)}
          <hr />
          {item(theme === "dark" ? <Sun size={16} /> : <Moon size={16} />, theme === "dark" ? "Light mode" : "Dark mode", toggleTheme, "Alt+⇧+D")}
          {item(sketchy ? <Spline size={16} /> : <Sparkles size={16} />, sketchy ? "Clean lines" : "Hand-drawn style", () =>
            useStore.setState({ sketchy: !sketchy }),
          )}
          {item(showChanges ? <EyeOff size={16} /> : <Eye size={16} />, showChanges ? "Hide change dots" : "Show change dots", () =>
            useStore.setState({ showChanges: !showChanges }),
          )}
          <hr />
          {item(<Sparkles size={16} />, "Load example (Two Sum)", () => {
            loadDoc(twoSumExample());
            requestAnimationFrame(() => zoomToFit());
          })}
          {item(<FilePlus size={16} />, "New board", () => {
            if (confirm("Start a new board? The current one is replaced (undo still works).")) resetDoc();
          })}
          {item(<CircleHelp size={16} />, "Shortcuts & help", () => useStore.setState({ helpOpen: true }), "?")}
        </div>
      )}
    </div>
  );
}

export const REPO_URL = "https://github.com/ArslanDoddamani/dryrun";
const AUTHOR = { name: "Arslan Doddamani", url: "https://github.com/ArslanDoddamani" };

/** GitHub's mark (lucide has no brand icons). */
const GitHubMark = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

/** Small author credit in the bottom-right corner. */
export function Credit() {
  return (
    <a className="credit" href={AUTHOR.url} target="_blank" rel="noreferrer">
      {AUTHOR.name}
    </a>
  );
}

export function TopRight() {
  const theme = useStore((s) => s.theme);
  return (
    <div className="top-right">
      <a className="icon-btn island-btn" href={REPO_URL} target="_blank" rel="noreferrer" title="dryrun on GitHub">
        <GitHubMark />
      </a>
      <button className="icon-btn island-btn" title={`${theme === "dark" ? "Light" : "Dark"} mode — Alt+Shift+D`} onClick={toggleTheme}>
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <button className="primary-btn" title="Present the trace step by step — Shift+P" onClick={() => togglePresent(true)}>
        <Presentation size={16} /> Present
      </button>
      <button className="icon-btn island-btn" title="Help — ?" onClick={() => useStore.setState({ helpOpen: true })}>
        <CircleHelp size={18} />
      </button>
    </div>
  );
}

export function ZoomControls() {
  const zoom = useStore((s) => s.viewport.zoom);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  return (
    <div className="bottom-left">
      <div className="island group">
        <button className="icon-btn" title="Zoom out" onClick={() => zoomAt(1 / 1.2)}>
          <ZoomOut size={16} />
        </button>
        <button className="zoom-label" title="Reset zoom" onClick={() => zoomAt(1 / zoom)}>
          {Math.round(zoom * 100)}%
        </button>
        <button className="icon-btn" title="Zoom in" onClick={() => zoomAt(1.2)}>
          <ZoomIn size={16} />
        </button>
        <button className="icon-btn" title="Zoom to fit — Shift+1" onClick={() => zoomToFit()}>
          <Scan size={16} />
        </button>
      </div>
      <div className="island group">
        <button className="icon-btn" title="Undo — Ctrl+Z" disabled={!canUndo} onClick={undo}>
          <Undo2 size={16} />
        </button>
        <button className="icon-btn" title="Redo — Ctrl+Shift+Z" disabled={!canRedo} onClick={redo}>
          <Redo2 size={16} />
        </button>
      </div>
    </div>
  );
}

export function Welcome() {
  return (
    <div className="welcome">
      <h1>Trace your solution, step by step</h1>
      <ol>
        <li>
          <b>Insert a data structure</b> (S) — array, grid/DP table, binary or N-ary tree, linked list, graph, hash map, code.
        </li>
        <li>
          <b>Add pointers</b> (I) like <code>i</code>, <code>lo</code>, <code>slow</code>, colour cells with keys <kbd>1</kbd>–<kbd>6</kbd>.
        </li>
        <li>
          Press <b>Next step</b> (N) to snapshot, then change the board for the next iteration.
        </li>
        <li>
          <b>Present</b> (Shift+P) and walk the interviewer through with ← → and the laser.
        </li>
      </ol>
      <div className="welcome-actions">
        <button className="primary-btn" onClick={() => useStore.setState({ insert: "array" })}>
          Insert data structure
        </button>
        <button
          className="text-btn"
          onClick={() => {
            loadDoc(twoSumExample());
            requestAnimationFrame(() => zoomToFit());
          }}
        >
          Open Two Sum example
        </button>
      </div>
    </div>
  );
}

export function PresentOverlay() {
  const doc = useStore((s) => s.doc);
  const step = doc.steps[doc.current];
  return (
    <>
      <div className="present-hint">← → step · drag = laser · F fit · Esc exit</div>
      <div className="present-bar island">
        <button className="icon-btn" disabled={doc.current === 0} onClick={() => gotoStep(doc.current - 1)}>
          <ChevronLeft size={22} />
        </button>
        <div className="present-caption">
          <span className="present-step">
            Step {doc.current + 1} / {doc.steps.length}
          </span>
          {step.note && <p>{step.note}</p>}
        </div>
        <button className="icon-btn" disabled={doc.current === doc.steps.length - 1} onClick={() => gotoStep(doc.current + 1)}>
          <ChevronRight size={22} />
        </button>
        <button className="icon-btn" title="Exit — Esc" onClick={() => togglePresent(false)}>
          <X size={18} />
        </button>
      </div>
    </>
  );
}

const HELP: [string, [string, string][]][] = [
  [
    "Tracing",
    [
      ["N", "Snapshot board as next step"],
      ["[  ]", "Previous / next step"],
      ["I", "Pointer tool — click a cell"],
      ["← →", "Move selected pointer one cell"],
      ["↑ ↓", "Move highlighted code line"],
      ["1 – 6, 0", "Colour cells / nodes, 0 clears"],
      ["Shift + click", "Select several cells"],
      ["+ / ×", "Add / remove elements, rows, nodes (select the structure)"],
      ["Enter / dbl-click", "Edit value (Tab → next cell)"],
      ["/", "Cross out a cell's value, write the new one"],
      ["Shift + P", "Present (laser on)"],
    ],
  ],
  [
    "Drawing",
    [
      ["V H", "Select · Hand"],
      ["R O D", "Rectangle · Ellipse · Diamond"],
      ["A L", "Arrow · Line (connect shapes)"],
      ["P T", "Freehand · Text"],
      ["E K", "Eraser (one value / cell / node) · Laser"],
      ["S", "Insert data structure"],
    ],
  ],
  [
    "Editing & view",
    [
      ["Ctrl Z / Ctrl ⇧ Z", "Undo / redo"],
      ["Ctrl D, C, V", "Duplicate, copy, paste"],
      ["Del", "Delete selection"],
      ["Space + drag", "Pan"],
      ["Ctrl + wheel", "Zoom"],
      ["Shift + 1", "Zoom to fit"],
      ["Alt ⇧ D", "Dark / light mode"],
    ],
  ],
];

export function HelpDialog() {
  const open = useStore((s) => s.helpOpen);
  if (!open) return null;
  const close = () => useStore.setState({ helpOpen: false });
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()} onKeyDown={(e) => e.key === "Escape" && close()}>
      <div className="modal help" tabIndex={-1} ref={(n) => n?.focus()}>
        <div className="modal-head">
          <h2>Keyboard shortcuts</h2>
          <button className="icon-btn" onClick={close}>
            <X size={18} />
          </button>
        </div>
        <p className="hint">
          Workflow: insert structures → add pointers and colours → <b>Next step</b> after every iteration (each step is a snapshot you
          keep editing) → write a one-line note per step → <b>Present</b>. Orange dots mark values that changed since the previous step.
        </p>
        <div className="help-cols">
          {HELP.map(([title, rows]) => (
            <div key={title}>
              <h4>{title}</h4>
              {rows.map(([k, d]) => (
                <div className="help-row" key={k}>
                  <kbd>{k}</kbd>
                  <span>{d}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
