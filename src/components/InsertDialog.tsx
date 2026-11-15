import { Brackets, Code, FolderTree, Grid3x3, Layers, Link, ListOrdered, Network, Table2, Workflow, X, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { analyzeCode, buildCodeBoard, describeAnalysis } from "../codeScaffold";
import { boxesIntersect, byIdOf, getBounds, unionBoxes } from "../geometry";
import { Scene } from "../render/Scene";
import { addElements, currentElements, ensureVisible, setTool, useStore } from "../store";
import { DSA_PRESETS, buildStructure, translateEls, type PresetKind } from "../structures";

const ICONS: Record<PresetKind, LucideIcon> = {
  array: Brackets,
  stack: Layers,
  queue: ListOrdered,
  matrix: Grid3x3,
  tree: Network,
  ntree: FolderTree,
  list: Link,
  graph: Workflow,
  table: Table2,
  code: Code,
};

const LABEL_HINT: Partial<Record<PresetKind, string>> = {
  array: "nums",
  matrix: "dp",
  table: "seen",
  tree: "root",
  ntree: "",
  list: "head",
  graph: "",
};

export function InsertDialog() {
  const kind = useStore((s) => s.insert);
  if (!kind) return null;
  return <Dialog initial={kind} />;
}

function Dialog({ initial }: { initial: PresetKind }) {
  const [kind, setKind] = useState<PresetKind>(initial);
  const [inputs, setInputs] = useState<Partial<Record<PresetKind, string>>>({});
  const [label, setLabel] = useState("");
  // for code: also build the structures and variables the code works on
  const [scaffold, setScaffold] = useState(true);
  const sketchy = useStore((s) => s.sketchy);
  const preset = DSA_PRESETS[kind];
  const input = inputs[kind] ?? preset.sample;

  const preview = useMemo(() => {
    try {
      const els = kind === "code" && scaffold ? buildCodeBoard(input, 0, 0) : buildStructure(kind, input, label, 0, 0);
      if (!els.length) return null;
      const byId = byIdOf(els);
      return { els, box: unionBoxes(els.map((e) => getBounds(e, byId))) };
    } catch {
      return null;
    }
  }, [kind, input, label, scaffold]);
  const detected = useMemo(() => (kind === "code" ? describeAnalysis(analyzeCode(input)) : []), [kind, input]);

  const close = () => useStore.setState({ insert: null });

  const insert = () => {
    if (!preview) return;
    const { viewport: v } = useStore.getState();
    const cx = (window.innerWidth / 2 - v.x) / v.zoom;
    const cy = (window.innerHeight / 2 - v.y) / v.zoom;
    const { box } = preview;
    // start at the screen centre, then slide down past anything already there
    const existing = currentElements();
    const byId = byIdOf(existing);
    const taken = existing.map((e) => getBounds(e, byId));
    const gap = 36;
    const dx = Math.round(cx - box.x - box.w / 2);
    let dy = Math.round(cy - box.y - box.h / 2);
    for (let k = 0; k < 100; k++) {
      const probe = { x: box.x + dx - gap, y: box.y + dy - gap, w: box.w + gap * 2, h: box.h + gap * 2 };
      const blocker = taken.find((t) => boxesIntersect(t, probe));
      if (!blocker) break;
      dy = Math.ceil(blocker.y + blocker.h + gap - box.y);
    }
    addElements(translateEls(preview.els, dx, dy));
    ensureVisible({ ...box, x: box.x + dx, y: box.y + dy });
    setTool("select");
    close();
  };

  const pad = 24;
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div
        className="modal insert-dialog"
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) insert();
        }}
      >
        <div className="modal-head">
          <h2>Insert data structure</h2>
          <button className="icon-btn" onClick={close} title="Close">
            <X size={18} />
          </button>
        </div>
        <div className="insert-body">
          <nav className="kind-list">
            {(Object.keys(DSA_PRESETS) as PresetKind[]).map((k) => {
              const Icon = ICONS[k];
              return (
                <button key={k} className={k === kind ? "active" : ""} onClick={() => setKind(k)}>
                  <Icon size={16} /> {DSA_PRESETS[k].title}
                </button>
              );
            })}
          </nav>
          <div className="insert-form">
            <label>
              Input
              <textarea
                autoFocus
                className={kind === "code" || kind === "matrix" ? "mono" : ""}
                rows={kind === "code" ? 9 : kind === "matrix" || kind === "graph" || kind === "table" ? 5 : 2}
                value={input}
                placeholder={preset.placeholder}
                spellCheck={false}
                onChange={(e) => setInputs({ ...inputs, [kind]: e.target.value })}
              />
              <span className="hint">{preset.placeholder}</span>
            </label>
            {kind === "code" && (
              <div className="scaffold">
                <label className="check">
                  <input type="checkbox" checked={scaffold} onChange={(e) => setScaffold(e.target.checked)} />
                  Also create the data structures &amp; variables it uses, with sample values
                </label>
                {scaffold && (
                  <div className="tags">
                    {detected.length ? (
                      detected.map((d) => (
                        <span key={d} className="tag">
                          {d}
                        </span>
                      ))
                    ) : (
                      <span className="hint">Nothing detected yet — paste a function with its signature.</span>
                    )}
                  </div>
                )}
              </div>
            )}
            {kind !== "code" && (
              <label>
                <span>
                  {kind === "table" ? "Title" : "Label"} <span className="hint">(optional)</span>
                </span>
                <input value={label} placeholder={LABEL_HINT[kind] ?? ""} onChange={(e) => setLabel(e.target.value)} />
              </label>
            )}
            <div className="preview">
              {preview ? (
                <svg viewBox={`${preview.box.x - pad} ${preview.box.y - pad} ${preview.box.w + pad * 2} ${preview.box.h + pad * 2}`}>
                  <Scene elements={preview.els} prev={null} sketchy={sketchy} showChanges={false} staticMode />
                </svg>
              ) : (
                <span className="hint">Nothing to preview — check the input format.</span>
              )}
            </div>
            <div className="modal-actions">
              <span className="hint">Ctrl/⌘ + Enter to insert</span>
              <button className="primary-btn" disabled={!preview} onClick={insert}>
                Insert
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
