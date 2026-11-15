import { ArrowDownToLine, ArrowUpToLine, CopyPlus, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  FILL_COLORS,
  MARK_COLORS,
  STROKE_COLORS,
  applyMark,
  arrayOp,
  swapCells,
  type ArrayOp,
} from "../actions";
import {
  addElements,
  currentElements,
  duplicate,
  reorderSelection,
  updateElement,
  updateSelected,
  useStore,
} from "../store";
import { parseCellKey } from "../geometry";
import {
  arrayToMatrix,
  clearNodeStruck,
  clearStruck,
  strikeCells,
  strikeNode,
  matrixAddCol,
  matrixAddRow,
  matrixRemoveCol,
  matrixRemoveRow,
  removeArrayCells,
  removeSelection,
  tableAddRow,
  tableRemoveRow,
} from "../structureOps";
import { parseList } from "../structures";
import type { ArrayEl, ArrowEl, CodeEl, El, MatrixEl, PointerEl, StyleDefaults, TableEl, TextEl } from "../types";

/** Text input that commits on Enter/blur (one undo entry per edit, not per keystroke). */
function Field({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => v !== value && onCommit(v);
  return (
    <input
      className="field"
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === "Escape") {
          setV(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section>
    <h4>{title}</h4>
    {children}
  </section>
);

function Swatches({ colors, value, onPick }: { colors: string[]; value?: string; onPick: (c: string) => void }) {
  return (
    <div className="swatches">
      {colors.map((c) => (
        <button
          key={c}
          className={`swatch${c === value ? " active" : ""}${c === "transparent" ? " none" : ""}`}
          style={{ background: c === "transparent" ? undefined : c }}
          title={c}
          onClick={() => onPick(c)}
        />
      ))}
      <input type="color" className="swatch-custom" title="Custom colour" value={value && value.startsWith("#") ? value : "#000000"} onChange={(e) => onPick(e.target.value)} />
    </div>
  );
}

function Segmented<T extends string | number>({ options, value, onPick }: { options: { v: T; label: ReactNode; title?: string }[]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={String(o.v)} className={o.v === value ? "active" : ""} title={o.title} onClick={() => onPick(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const SHAPES = new Set(["rect", "ellipse", "diamond"]);
const DRAW_TOOLS = new Set(["rect", "ellipse", "diamond", "arrow", "line", "pen", "text"]);

export function PropertiesPanel() {
  const s = useStore();
  const els = currentElements(s);
  const selected = els.filter((e) => s.selection.includes(e.id));
  if (s.presenting || (!selected.length && !DRAW_TOOLS.has(s.tool))) return null;

  const single = selected.length === 1 ? selected[0] : null;
  const first: Partial<El> = selected[0] ?? s.style;
  const setStyle = (patch: Partial<StyleDefaults>) => {
    if (selected.length) updateSelected(patch as Partial<El>);
    useStore.setState({ style: { ...s.style, ...patch } });
  };
  const showFill = selected.length ? selected.some((e) => SHAPES.has(e.type)) : ["rect", "ellipse", "diamond"].includes(s.tool);
  const cellsHere = s.cells && selected.some((e) => e.id === s.cells!.id) ? s.cells : null;

  return (
    <aside className="props island" onPointerDown={(e) => e.stopPropagation()}>
      {cellsHere && <CellsSection el={selected.find((e) => e.id === cellsHere.id) as ArrayEl | MatrixEl | TableEl} keys={cellsHere.keys} />}

      {single?.type === "array" && <ArraySection el={single} />}
      {single?.type === "matrix" && <MatrixSection el={single} />}
      {single?.type === "pointer" && <PointerSection el={single} />}
      {single?.type === "arrow" && <ArrowSection el={single} />}
      {single?.type === "table" && <TableSection el={single} />}
      {single?.type === "code" && <CodeSection el={single} />}
      {single?.type === "text" && <TextSection el={single} />}
      {single && "role" in single && single.role === "list" && (
        <Section title="List node">
          <div className="row">
            <button className="text-btn" title="Cross out the value and write the new one beside it" onClick={() => strikeNode(single.id)}>
              Strike &amp; replace <kbd>/</kbd>
            </button>
            {!!single.struck?.length && (
              <button className="text-btn" onClick={() => clearNodeStruck(single.id)}>
                Clear crossed-out
              </button>
            )}
          </div>
        </Section>
      )}
      {single && SHAPES.has(single.type) && (
        <p className="hint">
          Double-click to edit the node's value. Keys 1–6 colour it (visited, done…).
          {"role" in single && single.role === "tree" && " + adds a left/right child, × removes the node with its subtree."}
          {"role" in single && single.role === "ntree" && " + adds a child (any number), × removes the node with its subtree."}
          {"role" in single && single.role === "list" && " + inserts a node after it, × unlinks it (prev → next)."}
          {"role" in single && single.role === "graph" && " + adds a connected node, × removes it with its edges."}
        </p>
      )}

      <Section title={single?.type === "pointer" ? "Arrow colour" : "Stroke"}>
        <Swatches colors={STROKE_COLORS} value={first.stroke} onPick={(stroke) => setStyle({ stroke })} />
      </Section>
      {showFill && (
        <Section title="Background">
          <Swatches colors={FILL_COLORS} value={first.fill} onPick={(fill) => setStyle({ fill })} />
        </Section>
      )}
      {(!single || !["pointer", "table", "code", "text"].includes(single.type)) && (
        <Section title="Stroke width">
          <Segmented
            value={first.strokeWidth ?? 2}
            onPick={(strokeWidth) => setStyle({ strokeWidth })}
            options={[1, 2, 4].map((w) => ({
              v: w,
              title: `${w}px`,
              label: <span className="stroke-sample" style={{ height: w + 0.5 }} />,
            }))}
          />
        </Section>
      )}

      {selected.length > 0 && (
        <Section title="Actions">
          <div className="row">
            <button className="icon-btn" title="Send to back" onClick={() => reorderSelection(false)}>
              <ArrowDownToLine size={16} />
            </button>
            <button className="icon-btn" title="Bring to front" onClick={() => reorderSelection(true)}>
              <ArrowUpToLine size={16} />
            </button>
            <button className="icon-btn" title="Duplicate — Ctrl+D" onClick={() => addElements(duplicate(selected))}>
              <CopyPlus size={16} />
            </button>
            <button className="icon-btn danger" title="Delete — Del" onClick={removeSelection}>
              <Trash2 size={16} />
            </button>
          </div>
        </Section>
      )}
    </aside>
  );
}

/** Distinct rows (or columns) of the selected cells, highest first so removing one doesn't shift the next. */
const distinct = (keys: string[], part: 0 | 1) => [...new Set(keys.map((k) => parseCellKey(k)[part]))].sort((a, b) => b - a);

function CellsSection({ el, keys }: { el: ArrayEl | MatrixEl | TableEl; keys: string[] }) {
  return (
    <Section title={`${keys.length} cell${keys.length > 1 ? "s" : ""} selected`}>
      <div className="marks">
        {MARK_COLORS.map((m, i) => (
          <button key={m.color} className="mark" onClick={() => applyMark(m.color)} title={`${m.name} — key ${i + 1}`}>
            <span style={{ background: m.color }} />
            {m.name}
          </button>
        ))}
        <button className="mark" onClick={() => applyMark(null)} title="Clear — key 0">
          <span className="none" />
          Clear
        </button>
      </div>
      <div className="row">
        <button className="text-btn" onClick={() => useStore.setState({ editing: { id: el.id, cell: keys[0] } })}>
          Edit value ↵
        </button>
        <button className="text-btn" title="Cross out the value and write the new one beside it" onClick={() => strikeCells(el.id, keys)}>
          Strike &amp; replace <kbd>/</kbd>
        </button>
        {keys.some((k) => el.struck?.[k]?.length) && (
          <button className="text-btn" title="Remove the crossed-out values" onClick={() => clearStruck(el.id, keys)}>
            Clear crossed-out
          </button>
        )}
        {keys.length === 2 && el.type !== "table" && (
          <button className="text-btn" onClick={() => swapCells(el, keys[0], keys[1])}>
            Swap ⇄
          </button>
        )}
      </div>
      <div className="row">
        {el.type === "array" && el.values.length > 0 && (
          <button className="text-btn danger" title="Later elements shift left; colours and pointers follow them" onClick={() => removeArrayCells(el.id, keys)}>
            Remove {keys.length > 1 ? `${keys.length} elements` : "element"} ✕
          </button>
        )}
        {el.type === "matrix" && el.cells.length > 1 && (
          <button className="text-btn danger" onClick={() => distinct(keys, 0).forEach((r) => matrixRemoveRow(el.id, r))}>
            Remove row ✕
          </button>
        )}
        {el.type === "matrix" && Math.max(...el.cells.map((r) => r.length)) > 1 && (
          <button className="text-btn danger" onClick={() => distinct(keys, 1).forEach((c) => matrixRemoveCol(el.id, c))}>
            Remove column ✕
          </button>
        )}
        {el.type === "table" && el.rows.length > 0 && (
          <button className="text-btn danger" onClick={() => distinct(keys, 0).forEach((r) => tableRemoveRow(el.id, r))}>
            Remove entry ✕
          </button>
        )}
      </div>
      <p className="hint">Shift-click to select more cells · arrow keys move the cell cursor</p>
    </Section>
  );
}

function ArraySection({ el }: { el: ArrayEl }) {
  const [val, setVal] = useState("");
  const op = (o: ArrayOp) => {
    arrayOp(el, o, val);
    if (o === "push" || o === "unshift") setVal("");
  };
  return (
    <Section title={el.vertical ? "Stack / vertical array" : "Array"}>
      <label className="lbl">Label</label>
      <Field value={el.label} placeholder="nums" onCommit={(label) => updateElement(el.id, { label })} />
      <label className="lbl">Values</label>
      <Field value={el.values.join(", ")} onCommit={(v) => updateElement(el.id, { values: parseList(v) })} />
      <div className="row ops">
        <input className="field small" placeholder="val" value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") op("push");
        }} />
        <button className="text-btn" title="Append to the end (stack push)" onClick={() => op("push")}>push</button>
        <button className="text-btn" title="Remove last" onClick={() => op("pop")}>pop</button>
        <button className="text-btn" title="Insert at front" onClick={() => op("unshift")}>unshift</button>
        <button className="text-btn" title="Remove first (queue dequeue)" onClick={() => op("shift")}>shift</button>
      </div>
      <div className="row">
        <label className="check">
          <input type="checkbox" checked={el.vertical} onChange={(e) => updateElement(el.id, { vertical: e.target.checked })} /> Vertical
        </label>
        <label className="check">
          <input type="checkbox" checked={el.showIndex} onChange={(e) => updateElement(el.id, { showIndex: e.target.checked })} /> Indices
        </label>
        <button className="text-btn" onClick={() => updateElement(el.id, { marks: {} })}>Clear colours</button>
      </div>
      {!el.vertical && (
        <div className="row">
          <button className="text-btn" title="Adds a second row below this array" onClick={() => arrayToMatrix(el.id)}>
            Add row → grid
          </button>
        </div>
      )}
      <p className="hint">+ on the canvas adds an element; select cells to remove them — indices, colours and pointers shift with them.</p>
    </Section>
  );
}

function MatrixSection({ el }: { el: MatrixEl }) {
  return (
    <Section title="Grid / DP table">
      <label className="lbl">Label</label>
      <Field value={el.label} placeholder="dp" onCommit={(label) => updateElement(el.id, { label })} />
      <label className="lbl">Row headers <span className="hint">(e.g. "", a, b, c)</span></label>
      <Field value={el.rowLabels.join(", ")} placeholder="indices" onCommit={(v) => updateElement(el.id, { rowLabels: v.trim() ? v.split(",").map((x) => x.trim()) : [] })} />
      <label className="lbl">Column headers</label>
      <Field value={el.colLabels.join(", ")} placeholder="indices" onCommit={(v) => updateElement(el.id, { colLabels: v.trim() ? v.split(",").map((x) => x.trim()) : [] })} />
      <div className="row ops">
        <button className="text-btn" onClick={() => matrixAddRow(el.id)}>+ row</button>
        <button className="text-btn" title="Remove the last row" onClick={() => matrixRemoveRow(el.id, el.cells.length - 1)}>− row</button>
        <button className="text-btn" onClick={() => matrixAddCol(el.id)}>+ col</button>
        <button className="text-btn" title="Remove the last column" onClick={() => matrixRemoveCol(el.id, Math.max(...el.cells.map((r) => r.length)) - 1)}>− col</button>
      </div>
      <div className="row">
        <label className="check">
          <input type="checkbox" checked={el.showIndex} onChange={(e) => updateElement(el.id, { showIndex: e.target.checked })} /> Headers
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={el.showCoords !== false}
            onChange={(e) => updateElement(el.id, { showCoords: e.target.checked })}
          />{" "}
          Cell coordinates
        </label>
        <button className="text-btn" onClick={() => updateElement(el.id, { marks: {} })}>Clear colours</button>
      </div>
    </Section>
  );
}

function PointerSection({ el }: { el: PointerEl }) {
  return (
    <Section title="Pointer">
      <label className="lbl">Name</label>
      <Field value={el.label} onCommit={(label) => updateElement(el.id, { label: label || el.label })} />
      <label className="lbl">Name colour</label>
      <Swatches colors={STROKE_COLORS} value={el.labelColor ?? el.stroke} onPick={(labelColor) => updateElement(el.id, { labelColor })} />
      <label className="lbl">Points at the cell from</label>
      <Segmented
        value={el.side}
        onPick={(side) => updateElement(el.id, { side })}
        options={[
          { v: "bottom", label: "below" },
          { v: "top", label: "above" },
          { v: "left", label: "left" },
          { v: "right", label: "right" },
        ]}
      />
      <p className="hint">Drag onto another cell or node · ←/→ moves it one cell. To point at anything else, use an arrow (A).</p>
    </Section>
  );
}

function ArrowSection({ el }: { el: ArrowEl }) {
  return (
    <Section title="Arrow / edge">
      <label className="lbl">Arrowheads</label>
      <Segmented
        value={el.head}
        onPick={(head) => updateElement(el.id, { head })}
        options={[
          { v: "none", label: "—" },
          { v: "end", label: "→" },
          { v: "both", label: "↔" },
        ]}
      />
      <label className="lbl">Label / weight</label>
      <Field value={el.label} placeholder="e.g. 4" onCommit={(label) => updateElement(el.id, { label })} />
      <label className="check">
        <input type="checkbox" checked={el.dashed} onChange={(e) => updateElement(el.id, { dashed: e.target.checked })} /> Dashed
      </label>
    </Section>
  );
}

function TableSection({ el }: { el: TableEl }) {
  return (
    <Section title="Hash map / variables">
      <label className="lbl">Title</label>
      <Field value={el.title} placeholder="seen" onCommit={(title) => updateElement(el.id, { title })} />
      <div className="row">
        <button className="text-btn" onClick={() => tableAddRow(el.id)}>+ entry</button>
        <button className="text-btn" title='Edit all entries as "key: value" lines' onClick={() => useStore.setState({ editing: { id: el.id } })}>
          Edit all ↵
        </button>
      </div>
      <p className="hint">Double-click a key or value to edit it (Tab moves on). Select an entry to colour or remove it.</p>
    </Section>
  );
}

function CodeSection({ el }: { el: CodeEl }) {
  return (
    <Section title="Code">
      <div className="row">
        <button className="text-btn" onClick={() => updateElement(el.id, { fontSize: Math.max(10, el.fontSize - 1) })}>A−</button>
        <button className="text-btn" onClick={() => updateElement(el.id, { fontSize: el.fontSize + 1 })}>A+</button>
        <button className="text-btn" onClick={() => updateElement(el.id, { active: [] })}>Clear highlight</button>
      </div>
      <p className="hint">Click a line to highlight it · ↑/↓ moves the highlight · double-click to edit</p>
    </Section>
  );
}

function TextSection({ el }: { el: TextEl }) {
  return (
    <Section title="Font size">
      <Segmented
        value={el.fontSize}
        onPick={(fontSize) => updateElement(el.id, { fontSize })}
        options={[
          { v: 16, label: "S" },
          { v: 22, label: "M" },
          { v: 30, label: "L" },
          { v: 44, label: "XL" },
        ]}
      />
    </Section>
  );
}
