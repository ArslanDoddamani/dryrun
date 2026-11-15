import { memo, useMemo } from "react";
import rough from "roughjs";
import type { Point } from "../types";

const gen = rough.generator();

export type Prim =
  | { k: "rect"; x: number; y: number; w: number; h: number }
  | { k: "ellipse"; x: number; y: number; w: number; h: number }
  | { k: "diamond"; x: number; y: number; w: number; h: number }
  | { k: "line"; pts: Point[] };

interface Props {
  prim: Prim;
  stroke: string;
  fill?: string;
  sw: number;
  seed: number;
  sketchy: boolean;
  dashed?: boolean;
  roughness?: number;
}

const isFilled = (fill?: string) => !!fill && fill !== "transparent" && fill !== "none";

const diamondPts = (x: number, y: number, w: number, h: number): Point[] => [
  [x + w / 2, y],
  [x + w, y + h / 2],
  [x + w / 2, y + h],
  [x, y + h / 2],
];

/** One drawable primitive, either crisp SVG or a stable rough.js "hand-drawn" version. */
export const Sketch = memo(function Sketch({ prim, stroke, fill, sw, seed, sketchy, dashed, roughness = 1 }: Props) {
  const key = JSON.stringify(prim);
  const paths = useMemo(() => {
    if (!sketchy) return null;
    const opts = {
      seed,
      roughness,
      stroke,
      strokeWidth: sw,
      fill: isFilled(fill) ? fill : undefined,
      fillStyle: "solid",
      strokeLineDash: dashed ? [8, 8] : undefined,
      preserveVertices: true,
    };
    let d;
    switch (prim.k) {
      case "rect":
        d = gen.rectangle(prim.x, prim.y, prim.w, prim.h, opts);
        break;
      case "ellipse":
        d = gen.ellipse(prim.x + prim.w / 2, prim.y + prim.h / 2, Math.abs(prim.w), Math.abs(prim.h), opts);
        break;
      case "diamond":
        d = gen.polygon(diamondPts(prim.x, prim.y, prim.w, prim.h), opts);
        break;
      case "line":
        d = prim.pts.length === 2
          ? gen.line(prim.pts[0][0], prim.pts[0][1], prim.pts[1][0], prim.pts[1][1], opts)
          : gen.linearPath(prim.pts, opts);
        break;
    }
    return gen.toPaths(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, stroke, fill, sw, seed, sketchy, dashed, roughness]);

  if (paths) {
    return (
      <>
        {paths.map((p, i) => (
          <path
            key={i}
            d={p.d}
            stroke={p.stroke === "none" ? "none" : p.stroke}
            strokeWidth={p.strokeWidth}
            fill={p.fill ?? "none"}
            strokeDasharray={dashed && p.stroke !== "none" && !p.fill ? "8 8" : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </>
    );
  }

  const common = {
    stroke,
    strokeWidth: sw,
    fill: isFilled(fill) ? fill : "none",
    strokeDasharray: dashed ? "8 8" : undefined,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (prim.k) {
    case "rect":
      return (
        <rect
          x={Math.min(prim.x, prim.x + prim.w)}
          y={Math.min(prim.y, prim.y + prim.h)}
          width={Math.abs(prim.w)}
          height={Math.abs(prim.h)}
          rx={3}
          {...common}
        />
      );
    case "ellipse":
      return (
        <ellipse
          cx={prim.x + prim.w / 2}
          cy={prim.y + prim.h / 2}
          rx={Math.abs(prim.w) / 2}
          ry={Math.abs(prim.h) / 2}
          {...common}
        />
      );
    case "diamond":
      return <polygon points={diamondPts(prim.x, prim.y, prim.w, prim.h).join(" ")} {...common} />;
    case "line":
      return <polyline points={prim.pts.join(" ")} {...common} fill="none" />;
  }
});

/** The two short strokes of an arrow head at `tip`, pointing away from `from`. */
export function arrowHead(from: Point, tip: Point, size: number): Point[] {
  const a = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const spread = Math.PI / 7;
  return [
    [tip[0] - size * Math.cos(a - spread), tip[1] - size * Math.sin(a - spread)],
    tip,
    [tip[0] - size * Math.cos(a + spread), tip[1] - size * Math.sin(a + spread)],
  ];
}

/** Smooth SVG path through freehand points. */
export function smoothPath(pts: Point[]): string {
  if (!pts.length) return "";
  if (pts.length < 3) return `M${pts[0][0]},${pts[0][1]} ` + pts.map((p) => `L${p[0]},${p[1]}`).join(" ");
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q${pts[i][0]},${pts[i][1]} ${mx},${my}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L${last[0]},${last[1]}`;
}
