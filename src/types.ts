export type Point = [number, number];

export type Tool =
  | "select"
  | "hand"
  | "rect"
  | "ellipse"
  | "diamond"
  | "arrow"
  | "line"
  | "pen"
  | "text"
  | "pointer"
  | "eraser"
  | "laser";

interface Base {
  id: string;
  x: number;
  y: number;
  stroke: string;
  fill: string; // "transparent" for no fill
  strokeWidth: number;
  seed: number; // keeps the sketchy look stable between renders
}

export interface ShapeEl extends Base {
  type: "rect" | "ellipse" | "diamond";
  w: number;
  h: number;
  text: string;
  /** Set on nodes created as part of a structure; enables the structure's +/× handles. */
  role?: "tree" | "ntree" | "list" | "graph";
  struck?: string[]; // crossed-out earlier values (linked-list nodes)
}

export interface TextEl extends Base {
  type: "text";
  text: string;
  fontSize: number;
}

export interface FreeDrawEl extends Base {
  type: "freedraw";
  points: Point[]; // relative to x,y
}

export interface ArrowEl extends Base {
  type: "arrow";
  // x,y is the start; x2,y2 the end. Bound ends are resolved from the bound element at render time.
  x2: number;
  y2: number;
  start?: string;
  end?: string;
  head: "none" | "end" | "both";
  label: string;
  dashed: boolean;
}

/** Cell highlight colours keyed by cell key ("3" for arrays, "1,2" for matrices). */
export type Marks = Record<string, string>;

/** Crossed-out earlier values per cell (oldest first), keyed like Marks; the cell's value is the current one. */
export type Struck = Record<string, string[]>;

export interface ArrayEl extends Base {
  type: "array";
  values: string[];
  cellW: number;
  cellH: number;
  vertical: boolean; // vertical arrays render index 0 at the bottom (stack)
  showIndex: boolean;
  label: string;
  marks: Marks;
  struck?: Struck;
}

export interface MatrixEl extends Base {
  type: "matrix";
  cells: string[][];
  cellW: number;
  cellH: number;
  showIndex: boolean;
  rowLabels: string[]; // optional headers (e.g. DP over strings); falls back to indices
  showCoords?: boolean; // "r,c" in each cell's corner; undefined = shown
  colLabels: string[];
  label: string;
  marks: Marks;
  struck?: Struck;
}

export interface PointerTarget {
  id: string;
  cell?: string; // cell key inside an array/matrix; absent = whole element
}

export interface PointerEl extends Base {
  type: "pointer";
  label: string;
  target: PointerTarget | null; // when null the pointer floats at x,y
  labelColor?: string; // colour of the name; the arrow uses `stroke` (undefined = same as the arrow)
  side: "top" | "bottom" | "left" | "right";
}

export interface TableEl extends Base {
  type: "table";
  title: string;
  rows: [string, string][];
  marks?: Marks; // keyed "row,col" like a matrix
  struck?: Struck;
}

export interface CodeEl extends Base {
  type: "code";
  code: string;
  fontSize: number;
  active: number[]; // highlighted line indices
}

export type El =
  | ShapeEl
  | TextEl
  | FreeDrawEl
  | ArrowEl
  | ArrayEl
  | MatrixEl
  | PointerEl
  | TableEl
  | CodeEl;

export type ElType = El["type"];

export interface Step {
  id: string;
  note: string;
  elements: El[];
}

export interface Doc {
  steps: Step[];
  current: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Viewport {
  x: number; // screen offset of world origin
  y: number;
  zoom: number;
}

/** Cells selected inside a single array/matrix element. */
export interface CellSelection {
  id: string;
  keys: string[];
}

export interface StyleDefaults {
  stroke: string;
  fill: string;
  strokeWidth: number;
}
