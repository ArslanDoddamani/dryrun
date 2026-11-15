import { MARK_COLORS } from "./actions";
import { makeArray, makeCode, makePointer, makeTable, makeText, uid } from "./structures";
import type { ArrayEl, CodeEl, Doc, El, PointerEl, TableEl } from "./types";

const [CURRENT, VISITED, DONE] = MARK_COLORS.map((m) => m.color);

/** A short, fully traced Two Sum walkthrough that shows off steps, pointers, marks and the code cursor. */
export function twoSumExample(): Doc {
  const title = makeText(-470, -270, "Two Sum — one pass with a hash map", 30);
  const code = makeCode(
    -470,
    -200,
    [
      "def twoSum(nums, target):",
      "    seen = {}               # value -> index",
      "    for i, x in enumerate(nums):",
      "        if target - x in seen:",
      "            return [seen[target - x], i]",
      "        seen[x] = i",
    ].join("\n"),
  );
  const target = makeText(80, -200, "target = 9", 24);
  const nums = makeArray(130, -120, ["2", "7", "11", "15"], { label: "nums" });
  const seen = makeTable(420, -160, "seen  (value → index)", []);
  const vars = makeTable(420, -30, "vars", [
    ["i", "-"],
    ["x", "-"],
    ["need", "-"],
  ]);
  const i = makePointer("i", { id: nums.id, cell: "0" }, "bottom");
  const result = makeText(80, 40, "return [0, 1]  ✓  O(n) time, O(n) space", 24, { stroke: "#2f9e44" });

  const frame = (
    patch: {
      line: number;
      marks?: ArrayEl["marks"];
      seen?: TableEl["rows"];
      vars?: [string, string, string];
      at?: string;
      done?: boolean;
    },
  ): El[] => {
    const out: El[] = [
      title,
      { ...code, active: [patch.line] } as CodeEl,
      target,
      { ...nums, marks: patch.marks ?? {} } as ArrayEl,
      { ...seen, rows: patch.seen ?? [] } as TableEl,
      {
        ...vars,
        rows: patch.vars
          ? [
              ["i", patch.vars[0]],
              ["x", patch.vars[1]],
              ["need", patch.vars[2]],
            ]
          : vars.rows,
      } as TableEl,
    ];
    if (patch.at) out.push({ ...i, target: { id: nums.id, cell: patch.at } } as PointerEl);
    if (patch.done) out.push(result);
    return out;
  };

  const steps = [
    {
      note: "Goal: return the indices of two numbers that add up to target. Brute force tries every pair — O(n²). Instead, walk once and remember every value we've seen in a hash map.",
      elements: frame({ line: 1 }),
    },
    {
      note: "i = 0, x = 2 → we need 9 − 2 = 7. Is 7 in seen? No (seen is empty).",
      elements: frame({ line: 3, at: "0", marks: { 0: CURRENT }, vars: ["0", "2", "7"] }),
    },
    {
      note: "Not found, so record seen[2] = 0 and move on.",
      elements: frame({ line: 5, at: "0", marks: { 0: VISITED }, vars: ["0", "2", "7"], seen: [["2", "0"]] }),
    },
    {
      note: "i = 1, x = 7 → we need 9 − 7 = 2. Is 2 in seen? Yes — at index 0!",
      elements: frame({ line: 3, at: "1", marks: { 0: VISITED, 1: CURRENT }, vars: ["1", "7", "2"], seen: [["2", "0"]] }),
    },
    {
      note: "Return [seen[2], i] = [0, 1]. Each element is visited once and map lookups are O(1) → O(n) time, O(n) extra space.",
      elements: frame({
        line: 4,
        at: "1",
        marks: { 0: DONE, 1: DONE },
        vars: ["1", "7", "2"],
        seen: [["2", "0"]],
        done: true,
      }),
    },
  ];
  return { steps: steps.map((s) => ({ id: uid(), ...s })), current: 0 };
}
