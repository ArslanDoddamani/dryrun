import { memo, useMemo, type CSSProperties } from "react";
import {
  CELL_FONT,
  HAND_FONT,
  INDEX_FONT,
  LABEL_FONT,
  MONO_FONT,
  POINTER_FONT,
  STRUCK_SCALE,
  TABLE_FONT,
  TOKEN_GAP,
  cellTextWidth,
  shownStruck,
  arrayLayout,
  byIdOf,
  cellKeyOf,
  codeLayout,
  matrixLayout,
  measure,
  pointerGeometry,
  pointerSlots,
  resolveArrow,
  tableLayout,
  textLayout,
  type ById,
} from "../geometry";
import type { ArrayEl, ArrowEl, CodeEl, El, FreeDrawEl, MatrixEl, Point, PointerEl, ShapeEl, TableEl, TextEl } from "../types";
import { TOKEN_COLORS, tokenize } from "./highlight";
import { Sketch, arrowHead, smoothPath } from "./primitives";

export const CHANGED_COLOR = "#f08c00";
const MUTED = "#868e96";

interface Ctx {
  sketchy: boolean;
  staticMode: boolean;
}

interface SceneProps {
  elements: El[];
  /** Elements of the previous step; values that differ get a "changed" dot. */
  prev: El[] | null;
  sketchy: boolean;
  showChanges: boolean;
  /** Use transform attributes instead of CSS (for exported, standalone SVG). */
  staticMode?: boolean;
}

export function Scene({ elements, prev, sketchy, showChanges, staticMode = false }: SceneProps) {
  const byId = useMemo(() => byIdOf(elements), [elements]);
  const prevById = useMemo(() => (prev && showChanges ? byIdOf(prev) : null), [prev, showChanges]);
  const slots = useMemo(() => pointerSlots(elements), [elements]);
  const ctx: Ctx = { sketchy, staticMode };
  return (
    <>
      {elements.map((el) => {
        switch (el.type) {
          case "arrow":
            return <ArrowView key={el.id} el={el} pts={resolveArrow(el, byId)} ctx={ctx} />;
          case "pointer": {
            const [slot, n] = slots.get(el.id) ?? [0, 1];
            return <PointerView key={el.id} el={el} byId={byId} slot={slot} slots={n} ctx={ctx} />;
          }
          default:
            return <ElementView key={el.id} el={el} prev={prevById?.get(el.id)} ctx={ctx} />;
        }
      })}
    </>
  );
}

// ---------- helpers ----------

const place = (x: number, y: number, ctx: Ctx): { transform?: string; style?: CSSProperties } =>
  ctx.staticMode ? { transform: `translate(${x} ${y})` } : { style: { transform: `translate(${x}px, ${y}px)` } };

const fit = (text: string, maxW: number, base: number) => {
  const w = measure(text, base);
  return w > maxW ? Math.max(9, (base * maxW) / w) : base;
};

function Label({
  x,
  y,
  text,
  size,
  color,
  anchor = "middle",
  halo = false,
  mono = false,
}: {
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
  anchor?: "start" | "middle" | "end";
  halo?: boolean;
  mono?: boolean;
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fontFamily={mono ? MONO_FONT : HAND_FONT}
      fill={color}
      textAnchor={anchor}
      dominantBaseline="central"
      {...(halo ? { stroke: "#fff", strokeWidth: 5, paintOrder: "stroke", strokeLinejoin: "round" as const } : {})}
    >
      {text}
    </text>
  );
}

function Lines({ cx, cy, text, size, color }: { cx: number; cy: number; text: string; size: number; color: string }) {
  const lines = text.split("\n");
  const lh = size * 1.2;
  const top = cy - (lines.length * lh) / 2 + lh / 2;
  const w = Math.max(...lines.map((l) => measure(l, size)));
  return (
    <>
      {lines.map((l, i) => (
        <Label key={i} x={cx} y={top + i * lh} text={l} size={size} color={color} />
      ))}
      <ValueHit left={cx - w / 2} y={cy} w={w} h={lines.length * lh} />
    </>
  );
}

/**
 * Invisible box around a current value so the eraser can clear just the value (clicking elsewhere in the cell
 * removes the cell). It sits under the cell's own hit area; the eraser looks through the whole stack.
 */
const ValueHit = ({ left, y, w, h, cellKey }: { left: number; y: number; w: number; h: number; cellKey?: string }) => (
  <rect data-value="" data-value-cell={cellKey} x={left - 3} y={y - h / 2} width={w + 6} height={h} fill="transparent" />
);

export const STRIKE_COLOR = "#e03131";

/**
 * A cell's value, preceded by its crossed-out earlier values ("5̸ 3"), shrunk to fit `maxW`.
 * `align="start"` lays the tokens out from `x`; otherwise they're centred on `x`.
 */
function CellValue({
  x,
  y,
  maxW,
  value,
  struck,
  size,
  color,
  align = "middle",
  limit,
  cellKey,
  erasable = true,
}: {
  x: number;
  y: number;
  maxW: number;
  value: string;
  struck?: string[];
  size: number;
  color: string;
  align?: "start" | "middle";
  /** how many crossed-out values to show (default: the last 3) */
  limit?: number;
  /** the cell these values belong to; lets the eraser target a single crossed-out value */
  cellKey?: string;
  /** whether the eraser can clear just the current value (hash-map keys erase the whole entry instead) */
  erasable?: boolean;
}) {
  const old = shownStruck(struck, limit);
  const offset = (struck?.length ?? 0) - old.length; // index of the first shown value in the full history
  if (!old.length) {
    if (!value) return null;
    const fs = align === "start" ? size : fit(value, maxW, size);
    const w = measure(value, fs);
    return (
      <>
        <Label x={x} y={y} text={value} size={fs} color={color} anchor={align} />
        {erasable && <ValueHit left={align === "start" ? x : x - w / 2} y={y} w={w} h={fs * 1.3} cellKey={cellKey} />}
      </>
    );
  }
  const natural = cellTextWidth(value, old, size, Infinity);
  const f = natural > maxW ? Math.max(8, (size * maxW) / natural) : size;
  let cursor = align === "start" ? x : x - cellTextWidth(value, old, f, Infinity) / 2;
  const tokens = [...old.map((t) => ({ t, struck: true })), ...(value ? [{ t: value, struck: false }] : [])];
  return (
    <>
      {tokens.map(({ t, struck: isOld }, i) => {
        const fs = isOld ? f * STRUCK_SCALE : f;
        const w = measure(t, fs);
        const left = cursor;
        cursor += w + TOKEN_GAP;
        return (
          <g key={i}>
            <Label x={left} y={y} text={t} size={fs} color={isOld ? MUTED : color} anchor="start" />
            {!isOld && erasable && <ValueHit left={left} y={y} w={w} h={fs * 1.3} cellKey={cellKey} />}
            {isOld && (
              <rect
                data-struck={offset + i}
                data-struck-cell={cellKey}
                x={left - 2}
                y={y - fs * 0.65}
                width={w + 4}
                height={fs * 1.3}
                fill="transparent"
              />
            )}
            {isOld && (
              <line
                x1={left - 2}
                y1={y + fs * 0.42}
                x2={left + w + 2}
                y2={y - fs * 0.42}
                stroke={STRIKE_COLOR}
                strokeWidth={1.6}
                strokeLinecap="round"
              />
            )}
          </g>
        );
      })}
    </>
  );
}

const ChangedDot = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={4} fill={CHANGED_COLOR} />;

const hit = { fill: "transparent", stroke: "none" } as const;

// ---------- element views ----------

const ElementView = memo(function ElementView({ el, prev, ctx }: { el: El; prev?: El; ctx: Ctx }) {
  switch (el.type) {
    case "rect":
    case "ellipse":
    case "diamond":
      return <ShapeView el={el} ctx={ctx} />;
    case "text":
      return <TextView el={el} ctx={ctx} />;
    case "freedraw":
      return <FreeDrawView el={el} ctx={ctx} />;
    case "array":
      return <ArrayView el={el} prev={prev?.type === "array" ? prev : undefined} ctx={ctx} />;
    case "matrix":
      return <MatrixView el={el} prev={prev?.type === "matrix" ? prev : undefined} ctx={ctx} />;
    case "table":
      return <TableView el={el} prev={prev?.type === "table" ? prev : undefined} ctx={ctx} />;
    case "code":
      return <CodeView el={el} ctx={ctx} />;
    default:
      return null;
  }
});

function ShapeView({ el, ctx }: { el: ShapeEl; ctx: Ctx }) {
  const x = Math.min(0, el.w);
  const y = Math.min(0, el.h);
  return (
    <g data-id={el.id} className="el" {...place(el.x, el.y, ctx)}>
      <Sketch
        prim={{ k: el.type, x: 0, y: 0, w: el.w, h: el.h }}
        stroke={el.stroke}
        fill={el.fill}
        sw={el.strokeWidth}
        seed={el.seed}
        sketchy={ctx.sketchy}
      />
      {el.struck?.length ? (
        <CellValue x={el.w / 2} y={el.h / 2} maxW={Math.abs(el.w) - 12} value={el.text} struck={el.struck} size={20} color={el.stroke} />
      ) : el.text && (
        <Lines
          cx={el.w / 2}
          cy={el.h / 2}
          text={el.text}
          size={fit(el.text.split("\n").reduce((a, b) => (a.length > b.length ? a : b)), Math.abs(el.w) - 10, 20)}
          color={el.stroke}
        />
      )}
      {el.type === "ellipse" ? (
        <ellipse cx={el.w / 2} cy={el.h / 2} rx={Math.abs(el.w) / 2} ry={Math.abs(el.h) / 2} {...hit} />
      ) : (
        <rect x={x} y={y} width={Math.abs(el.w)} height={Math.abs(el.h)} {...hit} />
      )}
    </g>
  );
}

function TextView({ el, ctx }: { el: TextEl; ctx: Ctx }) {
  const { lines, lineH, w, h } = textLayout(el);
  return (
    <g data-id={el.id} className="el" {...place(el.x, el.y, ctx)}>
      {lines.map((l, i) => (
        <Label key={i} x={0} y={i * lineH + lineH / 2} text={l} size={el.fontSize} color={el.stroke} anchor="start" />
      ))}
      <rect x={0} y={0} width={w} height={h} {...hit} />
    </g>
  );
}

function FreeDrawView({ el, ctx }: { el: FreeDrawEl; ctx: Ctx }) {
  const d = smoothPath(el.points);
  return (
    <g data-id={el.id} className="el" {...place(el.x, el.y, ctx)}>
      <path d={d} stroke={el.stroke} strokeWidth={el.strokeWidth + 0.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} stroke="transparent" strokeWidth={Math.max(14, el.strokeWidth * 4)} fill="none" pointerEvents="stroke" />
    </g>
  );
}

function ArrowView({ el, pts, ctx }: { el: ArrowEl; pts: [Point, Point]; ctx: Ctx }) {
  const [p1, p2] = pts;
  const size = 10 + el.strokeWidth * 2;
  const common = { stroke: el.stroke, sw: el.strokeWidth, seed: el.seed, sketchy: ctx.sketchy };
  const mid: Point = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  return (
    <g data-id={el.id} className="el-arrow">
      <Sketch prim={{ k: "line", pts: [p1, p2] }} dashed={el.dashed} {...common} />
      {el.head !== "none" && <Sketch prim={{ k: "line", pts: arrowHead(p1, p2, size) }} {...common} />}
      {el.head === "both" && <Sketch prim={{ k: "line", pts: arrowHead(p2, p1, size) }} {...common} />}
      {el.label && <Label x={mid[0]} y={mid[1]} text={el.label} size={18} color={el.stroke} halo />}
      <path
        d={`M${p1[0]},${p1[1]} L${p2[0]},${p2[1]}`}
        stroke="transparent"
        strokeWidth={16}
        pointerEvents="stroke"
      />
    </g>
  );
}

function PointerView({ el, byId, slot, slots, ctx }: { el: PointerEl; byId: ById; slot: number; slots: number; ctx: Ctx }) {
  const g = pointerGeometry(el, byId, slot, slots);
  const rel = (p: Point): Point => [p[0] - g.tip[0], p[1] - g.tip[1]];
  const tail = rel(g.tail);
  const label = rel(g.label);
  const common = { stroke: el.stroke, sw: 2, seed: el.seed, sketchy: ctx.sketchy, roughness: 0.7 };
  return (
    <g data-id={el.id} className="el" {...place(g.tip[0], g.tip[1], ctx)}>
      <Sketch prim={{ k: "line", pts: [tail, [0, 0]] }} {...common} />
      <Sketch prim={{ k: "line", pts: arrowHead(tail, [0, 0], 10) }} {...common} />
      <Label x={label[0]} y={label[1]} text={el.label || "?"} size={POINTER_FONT} color={el.labelColor ?? el.stroke} halo />
      <rect x={label[0] - g.labelW / 2} y={label[1] - 13} width={g.labelW} height={26} {...hit} />
      <path d={`M${tail[0]},${tail[1]} L0,0`} stroke="transparent" strokeWidth={12} pointerEvents="stroke" />
    </g>
  );
}

function GridLines({
  w,
  h,
  xs,
  ys,
  el,
  ctx,
  dashed,
}: {
  w: number;
  h: number;
  xs: number[];
  ys: number[];
  el: El;
  ctx: Ctx;
  dashed?: boolean;
}) {
  const common = { stroke: el.stroke, sw: el.strokeWidth, seed: el.seed, sketchy: ctx.sketchy, roughness: 0.6 };
  return (
    <>
      <Sketch prim={{ k: "rect", x: 0, y: 0, w, h }} dashed={dashed} {...common} />
      {xs.map((x, i) => (
        <Sketch key={`x${i}`} prim={{ k: "line", pts: [[x, 0], [x, h]] }} {...common} seed={el.seed + i + 1} />
      ))}
      {ys.map((y, i) => (
        <Sketch key={`y${i}`} prim={{ k: "line", pts: [[0, y], [w, y]] }} {...common} seed={el.seed + 101 + i} />
      ))}
    </>
  );
}

function ArrayView({ el, prev, ctx }: { el: ArrayEl; prev?: ArrayEl; ctx: Ctx }) {
  const { n } = arrayLayout(el);
  const { cellW: cw, cellH: ch, vertical } = el;
  const box = (i: number) => (vertical ? { x: 0, y: (n - 1 - i) * ch } : { x: i * cw, y: 0 });
  const W = vertical ? cw : n * cw;
  const H = vertical ? n * ch : ch;
  const cells = Array.from({ length: n }, (_, i) => i);
  const empty = el.values.length === 0;
  return (
    <g data-id={el.id} className="el" {...place(el.x, el.y, ctx)}>
      {cells.map((i) => {
        const m = el.marks[String(i)];
        if (!m || empty) return null;
        const b = box(i);
        return <rect key={`m${i}`} x={b.x + 1.5} y={b.y + 1.5} width={cw - 3} height={ch - 3} fill={m} rx={2} />;
      })}
      <GridLines
        w={W}
        h={H}
        xs={vertical ? [] : cells.slice(1).map((i) => i * cw)}
        ys={vertical ? cells.slice(1).map((i) => i * ch) : []}
        el={el}
        ctx={ctx}
        dashed={empty}
      />
      {!empty &&
        cells.map((i) => {
          const b = box(i);
          return (
            <CellValue
              key={`v${i}`}
              x={b.x + cw / 2}
              y={b.y + ch / 2}
              maxW={cw - 8}
              value={el.values[i]}
              struck={el.struck?.[String(i)]}
              cellKey={String(i)}
              size={CELL_FONT}
              color={el.stroke}
            />
          );
        })}
      {el.showIndex &&
        !empty &&
        cells.map((i) => {
          const b = box(i);
          return vertical ? (
            <Label key={`i${i}`} x={-8} y={b.y + ch / 2} text={String(i)} size={INDEX_FONT} color={MUTED} anchor="end" />
          ) : (
            <Label key={`i${i}`} x={b.x + cw / 2} y={-9} text={String(i)} size={INDEX_FONT} color={MUTED} />
          );
        })}
      {el.label &&
        (vertical ? (
          <Label x={cw / 2} y={H + 16} text={el.label} size={LABEL_FONT} color={el.stroke} />
        ) : (
          <Label x={-12} y={ch / 2} text={el.label} size={LABEL_FONT} color={el.stroke} anchor="end" />
        ))}
      {prev &&
        !empty &&
        cells.map((i) => {
          if (prev.values[i] === el.values[i]) return null;
          const b = box(i);
          return <ChangedDot key={`c${i}`} x={b.x + cw - 7} y={b.y + 7} />;
        })}
      {cells.map((i) => {
        const b = box(i);
        return <rect key={`h${i}`} data-cell={String(i)} x={b.x} y={b.y} width={cw} height={ch} {...hit} />;
      })}
    </g>
  );
}

function MatrixView({ el, prev, ctx }: { el: MatrixEl; prev?: MatrixEl; ctx: Ctx }) {
  const { rows, cols, hasColHead, hasRowHead, colHeadH } = matrixLayout(el);
  const { cellW: cw, cellH: ch } = el;
  const W = cols * cw;
  const H = rows * ch;
  const R = Array.from({ length: rows }, (_, i) => i);
  const C = Array.from({ length: cols }, (_, i) => i);
  const coords = el.showCoords !== false;
  return (
    <g data-id={el.id} className="el" {...place(el.x, el.y, ctx)}>
      {R.flatMap((r) =>
        C.map((c) => {
          const m = el.marks[cellKeyOf(r, c)];
          return m ? <rect key={`m${r},${c}`} x={c * cw + 1.5} y={r * ch + 1.5} width={cw - 3} height={ch - 3} fill={m} rx={2} /> : null;
        }),
      )}
      <GridLines w={W} h={H} xs={C.slice(1).map((c) => c * cw)} ys={R.slice(1).map((r) => r * ch)} el={el} ctx={ctx} />
      {R.flatMap((r) =>
        C.map((c) => {
          const k = cellKeyOf(r, c);
          return (
            <CellValue
              key={`v${k}`}
              x={c * cw + cw / 2}
              y={r * ch + ch / 2 + (coords ? 3 : 0)}
              maxW={cw - 6}
              value={el.cells[r]?.[c] ?? ""}
              struck={el.struck?.[k]}
              cellKey={k}
              size={18}
              color={el.stroke}
            />
          );
        }),
      )}
      {coords &&
        R.flatMap((r) =>
          C.map((c) => (
            <text
              key={`rc${r},${c}`}
              x={c * cw + 3.5}
              y={r * ch + 8}
              fontSize={8.5}
              fontFamily={MONO_FONT}
              fill={MUTED}
              dominantBaseline="central"
            >
              {r},{c}
            </text>
          )),
        )}
      {hasColHead &&
        C.map((c) => (
          <Label key={`ch${c}`} x={c * cw + cw / 2} y={-10} text={el.colLabels[c] || String(c)} size={15} color={MUTED} />
        ))}
      {hasRowHead &&
        R.map((r) => (
          <Label key={`rh${r}`} x={-8} y={r * ch + ch / 2} text={el.rowLabels[r] || String(r)} size={15} color={MUTED} anchor="end" />
        ))}
      {el.label && <Label x={0} y={-colHeadH - 14} text={el.label} size={LABEL_FONT} color={el.stroke} anchor="start" />}
      {prev &&
        R.flatMap((r) =>
          C.map((c) =>
            (prev.cells[r]?.[c] ?? "") !== (el.cells[r]?.[c] ?? "") ? (
              <ChangedDot key={`c${r},${c}`} x={c * cw + cw - 6} y={r * ch + 6} />
            ) : null,
          ),
        )}
      {R.flatMap((r) =>
        C.map((c) => <rect key={`h${r},${c}`} data-cell={cellKeyOf(r, c)} x={c * cw} y={r * ch} width={cw} height={ch} {...hit} />),
      )}
    </g>
  );
}

function TableView({ el, prev, ctx }: { el: TableEl; prev?: TableEl; ctx: Ctx }) {
  const L = tableLayout(el);
  const prevMap = prev ? new Map(prev.rows) : null;
  const thin = { stroke: el.stroke, sw: 1, seed: el.seed, sketchy: ctx.sketchy, roughness: 0.5 };
  const bodyH = L.h - L.headerH;
  return (
    <g data-id={el.id} className="el" {...place(el.x, el.y, ctx)}>
      {el.title && <rect x={1} y={1} width={L.w - 2} height={L.headerH - 1} fill="#f1f3f5" />}
      {Object.entries(el.marks ?? {}).map(([k, color]) => {
        const [r, c] = k.split(",").map(Number);
        if (r >= L.rows.length) return null;
        const y = L.headerH + r * L.rowH;
        return <rect key={`m${k}`} x={(c ? L.keyW : 0) + 1.5} y={y + 1.5} width={(c ? L.valW : L.keyW) - 3} height={L.rowH - 3} fill={color} rx={2} />;
      })}
      <Sketch prim={{ k: "rect", x: 0, y: 0, w: L.w, h: L.h }} stroke={el.stroke} fill="none" sw={el.strokeWidth} seed={el.seed} sketchy={ctx.sketchy} roughness={0.6} />
      {el.title && (
        <>
          <Sketch prim={{ k: "line", pts: [[0, L.headerH], [L.w, L.headerH]] }} {...thin} />
          <Label x={L.w / 2} y={L.headerH / 2} text={el.title} size={TABLE_FONT} color={el.stroke} />
        </>
      )}
      <Sketch prim={{ k: "line", pts: [[L.keyW, L.headerH], [L.keyW, L.headerH + bodyH]] }} {...thin} />
      {L.rows.map(([k, v], i) => {
        const y = L.headerH + i * L.rowH;
        const changed = prevMap && el.rows.length > 0 && prevMap.get(k) !== v;
        return (
          <g key={i}>
            {i > 0 && <line x1={0} x2={L.w} y1={y} y2={y} stroke="#ced4da" strokeWidth={1} />}
            <CellValue x={11} y={y + L.rowH / 2} maxW={L.keyW - 22} value={k} struck={el.struck?.[`${i},0`]} cellKey={`${i},0`} size={TABLE_FONT} color={MUTED} align="start" limit={Infinity} erasable={false} />
            <CellValue x={L.keyW + 11} y={y + L.rowH / 2} maxW={L.valW - 22} value={v} struck={el.struck?.[`${i},1`]} cellKey={`${i},1`} size={TABLE_FONT} color={el.stroke} align="start" limit={Infinity} />
            {changed && <ChangedDot x={L.w - 8} y={y + 8} />}
          </g>
        );
      })}
      {el.title && <rect x={0} y={0} width={L.w} height={L.headerH} {...hit} />}
      {L.rows.flatMap((_, r) =>
        [0, 1].map((c) => (
          <rect
            key={`h${r},${c}`}
            data-cell={`${r},${c}`}
            x={c ? L.keyW : 0}
            y={L.headerH + r * L.rowH}
            width={c ? L.valW : L.keyW}
            height={L.rowH}
            {...hit}
          />
        )),
      )}
    </g>
  );
}

function CodeView({ el, ctx }: { el: CodeEl; ctx: Ctx }) {
  const L = codeLayout(el);
  const active = new Set(el.active);
  const textX = L.pad + L.gutter;
  return (
    <g data-id={el.id} className="el" {...place(el.x, el.y, ctx)}>
      <rect x={0} y={0} width={L.w} height={L.h} rx={8} fill="#f8f9fa" stroke="#dee2e6" strokeWidth={1.5} />
      {L.lines.map((_, i) =>
        active.has(i) ? (
          <g key={`a${i}`}>
            <rect x={1} y={L.pad + i * L.lineH} width={L.w - 2} height={L.lineH} fill="#fff3bf" />
            <rect x={1} y={L.pad + i * L.lineH} width={4} height={L.lineH} fill="#fab005" />
          </g>
        ) : null,
      )}
      {L.lines.map((line, i) => {
        const y = L.pad + i * L.lineH + L.lineH / 2;
        return (
          <g key={i}>
            <text x={textX - 14} y={y} fontSize={el.fontSize * 0.85} fontFamily={MONO_FONT} fill="#adb5bd" textAnchor="end" dominantBaseline="central">
              {i + 1}
            </text>
            <text x={textX} y={y} fontSize={el.fontSize} fontFamily={MONO_FONT} dominantBaseline="central" xmlSpace="preserve" style={{ whiteSpace: "pre" }}>
              {tokenize(line).map((t, j) => (
                <tspan key={j} fill={TOKEN_COLORS[t.kind]} fontStyle={t.kind === "com" ? "italic" : undefined}>
                  {t.text}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
      {L.lines.map((_, i) => (
        <rect key={`h${i}`} data-line={i} x={0} y={L.pad + i * L.lineH} width={L.w} height={L.lineH} {...hit} />
      ))}
      <rect x={0} y={0} width={L.w} height={L.pad} {...hit} />
      <rect x={0} y={L.h - L.pad} width={L.w} height={L.pad} {...hit} />
    </g>
  );
}
