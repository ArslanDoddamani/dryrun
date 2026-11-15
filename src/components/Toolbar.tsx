import {
  ArrowUpFromDot,
  Blocks,
  Circle,
  Diamond,
  Eraser,
  Hand,
  Lock,
  LockOpen,
  Minus,
  MousePointer2,
  MoveRight,
  Pencil,
  Square,
  Type,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { setTool, useStore } from "../store";
import type { Tool } from "../types";

const TOOLS: { tool: Tool; icon: LucideIcon; label: string; key: string }[] = [
  { tool: "hand", icon: Hand, label: "Hand (pan)", key: "H" },
  { tool: "select", icon: MousePointer2, label: "Select", key: "V" },
  { tool: "rect", icon: Square, label: "Rectangle / list node", key: "R" },
  { tool: "ellipse", icon: Circle, label: "Ellipse / tree node", key: "O" },
  { tool: "diamond", icon: Diamond, label: "Diamond", key: "D" },
  { tool: "arrow", icon: MoveRight, label: "Arrow (drag between shapes to connect)", key: "A" },
  { tool: "line", icon: Minus, label: "Line / tree edge", key: "L" },
  { tool: "pen", icon: Pencil, label: "Freehand", key: "P" },
  { tool: "text", icon: Type, label: "Text", key: "T" },
  { tool: "pointer", icon: ArrowUpFromDot, label: "Index pointer (i, j, lo, hi…) — click a cell", key: "I" },
  { tool: "eraser", icon: Eraser, label: "Eraser — click a value to clear it, or the cell / node around it to remove that", key: "E" },
  { tool: "laser", icon: Zap, label: "Laser pointer", key: "K" },
];

export function Toolbar() {
  const tool = useStore((s) => s.tool);
  const locked = useStore((s) => s.toolLocked);
  return (
    <div className="toolbar island">
      <button
        className={`icon-btn${locked ? " active" : ""}`}
        title="Keep selected tool active after drawing"
        onClick={() => useStore.setState({ toolLocked: !locked })}
      >
        {locked ? <Lock size={16} /> : <LockOpen size={16} />}
      </button>
      <span className="divider" />
      {TOOLS.map(({ tool: t, icon: Icon, label, key }) => (
        <button
          key={t}
          className={`icon-btn tool${tool === t ? " active" : ""}`}
          title={`${label} — ${key}`}
          onClick={() => setTool(t)}
        >
          <Icon size={17} strokeWidth={tool === t ? 2.4 : 2} />
          <span className="key">{key}</span>
        </button>
      ))}
      <span className="divider" />
      <button className="primary-btn" title="Insert array, tree, graph, grid… — S" onClick={() => useStore.setState({ insert: "array" })}>
        <Blocks size={16} /> Data structure
      </button>
    </div>
  );
}
