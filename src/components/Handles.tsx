import { arrayLayout, cellBox, matrixLayout, parseCellKey, tableLayout } from "../geometry";
import {
  addGraphNeighbor,
  addNTreeChild,
  addTreeChild,
  appendArrayCell,
  arrayToMatrix,
  insertListNodeAfter,
  matrixAddCol,
  matrixAddRow,
  matrixRemoveCol,
  matrixRemoveRow,
  removeArrayCells,
  cellValue,
  strikeCells,
  strikeNode,
  removeListNode,
  removeTreeSubtree,
  tableAddRow,
  tableRemoveRow,
  treeChildren,
} from "../structureOps";
import { deleteElements } from "../store";
import type { CellSelection, El } from "../types";

interface Handle {
  x: number;
  y: number;
  kind: "add" | "remove" | "strike";
  action: string;
  title: string;
}

/** +/× buttons around the selected structure. `px` is one screen pixel in world units. */
export function structureHandles(el: El, cells: CellSelection | null, elements: El[], px: number): Handle[] {
  const out: Handle[] = [];
  const add = (x: number, y: number, action: string, title: string) => out.push({ x, y, kind: "add", action, title });
  const remove = (x: number, y: number, action: string, title: string) => out.push({ x, y, kind: "remove", action, title });
  const myCells = cells?.id === el.id ? cells.keys : [];
  const gap = 18 * px;
  const beside = 24 * px; // spacing between neighbouring buttons
  // One "/" for the selected cells (it crosses out all of them). It always sits outside the cells, next to the
  // first cell's × button, so it never covers a value or the grid coordinates.
  const strikeAt = (x: number, y: number) => {
    if ((el.type === "array" || el.type === "matrix" || el.type === "table") && myCells.some((k) => cellValue(el, k)))
      out.push({ x, y, kind: "strike", action: `strike:${myCells.join("|")}`, title: "Cross out & write a new value — /" });
  };

  switch (el.type) {
    case "array": {
      const { n } = arrayLayout(el);
      if (el.vertical) {
        add(el.x + el.cellW / 2, el.y - gap, "append", "Push on top");
      } else {
        add(el.x + n * el.cellW + gap, el.y + el.cellH / 2, "append", "Add element at the end");
        // sits on the middle of the bottom edge, clear of pointers hanging below the cells
        add(el.x + (n * el.cellW) / 2, el.y + el.cellH, "toMatrix", "Add a row (turns the array into a grid)");
      }
      if (!el.values.length) break;
      const left = arrayLayout(el).bounds.x - 12 * px;
      const above = (b: { y: number }) => b.y - (el.showIndex ? 18 : 0) - 12 * px;
      myCells.forEach((k, i) => {
        const b = cellBox(el, k);
        if (!b) return;
        if (el.vertical) {
          remove(left, b.y + b.h / 2, `removeCell:${k}`, `Remove element ${k}`);
          if (i === 0) strikeAt(left - beside, b.y + b.h / 2);
        } else {
          remove(b.x + b.w / 2, above(b), `removeCell:${k}`, `Remove element ${k}`);
          if (i === 0) strikeAt(b.x + b.w / 2 + beside, above(b));
        }
      });
      break;
    }
    case "matrix": {
      const L = matrixLayout(el);
      add(el.x + L.cols * el.cellW, el.y + (L.rows * el.cellH) / 2, "addCol", "Add a column");
      add(el.x + (L.cols * el.cellW) / 2, el.y + L.rows * el.cellH, "addRow", "Add a row");
      const rows = [...new Set(myCells.map((k) => parseCellKey(k)[0]))];
      const cols = [...new Set(myCells.map((k) => parseCellKey(k)[1]))];
      if (L.rows > 1)
        rows.forEach((r) => remove(L.bounds.x - 12 * px, el.y + r * el.cellH + el.cellH / 2, `removeRow:${r}`, `Remove row ${r}`));
      const top = el.y - L.colHeadH - 12 * px;
      if (L.cols > 1)
        cols.forEach((c) => remove(el.x + c * el.cellW + el.cellW / 2, top, `removeCol:${c}`, `Remove column ${c}`));
      if (myCells.length) strikeAt(el.x + parseCellKey(myCells[0])[1] * el.cellW + el.cellW / 2 + beside, top);
      break;
    }
    case "table": {
      const L = tableLayout(el);
      add(el.x + L.w / 2, el.y + L.h + gap, "tableAdd", "Add an entry");
      if (!el.rows.length) break;
      // right of the table: "/" first, then ×
      const rowY = (r: number) => el.y + L.headerH + r * L.rowH + L.rowH / 2;
      [...new Set(myCells.map((k) => parseCellKey(k)[0]))].forEach((r) =>
        remove(el.x + L.w + gap + beside, rowY(r), `tableRemove:${r}`, "Remove this entry"),
      );
      if (myCells.length) strikeAt(el.x + L.w + gap, rowY(parseCellKey(myCells[0])[0]));
      break;
    }
    case "rect":
    case "ellipse":
    case "diamond": {
      if (!el.role) break;
      const corner = 4 * px;
      const isTree = el.role === "tree" || el.role === "ntree";
      remove(el.x + el.w + corner, el.y - corner, "removeNode", isTree ? "Remove node and its subtree" : "Remove node");
      if (el.role === "ntree") {
        add(el.x + el.w / 2, el.y + el.h + 12 * px, "nchild", "Add a child");
      } else if (el.role === "tree") {
        const kids = treeChildren(elements, el.id);
        if (!kids.left) add(el.x - corner, el.y + el.h + 10 * px, "child:left", "Add left child");
        if (!kids.right) add(el.x + el.w + corner, el.y + el.h + 10 * px, "child:right", "Add right child");
      } else if (el.role === "list") {
        add(el.x + el.w + gap, el.y + el.h / 2, "listAfter", "Insert a node after this one");
        // just outside the bottom-right corner, clear of the value and the next-arrow
        if (el.text)
          out.push({ x: el.x + el.w + 6 * px, y: el.y + el.h + 12 * px, kind: "strike", action: "strikeNode", title: "Cross out & write a new value — /" });
      } else {
        add(el.x + el.w + gap, el.y + el.h / 2, "graphAdd", "Add a connected node");
      }
      break;
    }
  }
  return out;
}

export function runHandle(el: El, action: string) {
  const [name, arg] = action.split(":");
  switch (name) {
    case "append":
      return appendArrayCell(el.id);
    case "toMatrix":
      return arrayToMatrix(el.id);
    case "strike":
      return strikeCells(el.id, arg.split("|"));
    case "strikeNode":
      return strikeNode(el.id);
    case "removeCell":
      return removeArrayCells(el.id, [arg]);
    case "addRow":
      return matrixAddRow(el.id);
    case "addCol":
      return matrixAddCol(el.id);
    case "removeRow":
      return matrixRemoveRow(el.id, Number(arg));
    case "removeCol":
      return matrixRemoveCol(el.id, Number(arg));
    case "tableAdd":
      return tableAddRow(el.id);
    case "tableRemove":
      return tableRemoveRow(el.id, Number(arg));
    case "child":
      return addTreeChild(el.id, arg as "left" | "right");
    case "nchild":
      return addNTreeChild(el.id);
    case "listAfter":
      return insertListNodeAfter(el.id);
    case "graphAdd":
      return addGraphNeighbor(el.id);
    case "removeNode": {
      const role = "role" in el ? el.role : undefined;
      if (role === "tree" || role === "ntree") return removeTreeSubtree(el.id);
      if (role === "list") return removeListNode(el.id);
      return deleteElements([el.id]);
    }
  }
}

export function HandleButtons({ handles, px }: { handles: Handle[]; px: number }) {
  const r = 10 * px;
  const arm = 4 * px;
  return (
    <>
      {handles.map((h) => (
        <g key={h.action} className="handle action" data-action={h.action} transform={`translate(${h.x} ${h.y})`}>
          <title>{h.title}</title>
          {h.kind === "add" ? (
            <>
              <circle r={r} fill="#6965db" stroke="#fff" strokeWidth={1.5 * px} />
              <path d={`M${-arm},0 H${arm} M0,${-arm} V${arm}`} stroke="#fff" strokeWidth={2 * px} strokeLinecap="round" />
            </>
          ) : h.kind === "strike" ? (
            <>
              <circle r={r * 0.9} fill="#fff" stroke="#6965db" strokeWidth={1.5 * px} />
              <path d={`M${-arm * 0.6},${arm * 0.95} L${arm * 0.6},${-arm * 0.95}`} stroke="#e03131" strokeWidth={2.2 * px} strokeLinecap="round" />
            </>
          ) : (
            <>
              <circle r={r * 0.9} fill="#fff" stroke="#e03131" strokeWidth={1.5 * px} />
              <path
                d={`M${-arm * 0.75},${-arm * 0.75} L${arm * 0.75},${arm * 0.75} M${arm * 0.75},${-arm * 0.75} L${-arm * 0.75},${arm * 0.75}`}
                stroke="#e03131"
                strokeWidth={2 * px}
                strokeLinecap="round"
              />
            </>
          )}
        </g>
      ))}
    </>
  );
}

