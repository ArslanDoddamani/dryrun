import { createElement } from "react";
import fontUrl from "@fontsource/patrick-hand/files/patrick-hand-latin-400-normal.woff2?url";
import { byIdOf, getBounds, measure, unionBoxes } from "./geometry";
import { Scene } from "./render/Scene";
import { loadDoc, useStore, zoomToFit } from "./store";
import type { Doc, El, Step } from "./types";

const FILE_TAG = "dryrun";
const LEGACY_FILE_TAGS = ["dsa-tracer"]; // files saved before the rename still open

function download(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

// ---------- JSON ----------

export function saveFile() {
  const { doc } = useStore.getState();
  const blob = new Blob([JSON.stringify({ type: FILE_TAG, version: 1, doc }, null, 2)], { type: "application/json" });
  download(URL.createObjectURL(blob), `trace-${slug()}.dryrun.json`);
}

export function openFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const doc: Doc | undefined = [FILE_TAG, ...LEGACY_FILE_TAGS].includes(data?.type) ? data.doc : undefined;
      if (!doc?.steps?.length) throw new Error("not a trace file");
      loadDoc({ ...doc, current: 0 });
      requestAnimationFrame(() => zoomToFit());
    } catch (err) {
      alert(`Could not open file: ${(err as Error).message}`);
    }
  };
  input.click();
}

// ---------- PNG ----------

let fontCss: Promise<string> | null = null;
function embeddedFont(): Promise<string> {
  fontCss ??= fetch(fontUrl)
    .then((r) => r.blob())
    .then(
      (blob) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(`@font-face{font-family:"Patrick Hand";src:url(${reader.result}) format("woff2");}`);
          reader.readAsDataURL(blob);
        }),
    )
    .catch(() => "");
  return fontCss;
}

// react-dom/server is only needed for export, so it is loaded on demand
let renderer: Promise<typeof import("react-dom/server")> | null = null;

async function sceneMarkup(elements: El[], prev: El[] | null) {
  const { renderToStaticMarkup } = await (renderer ??= import("react-dom/server"));
  const { sketchy, showChanges } = useStore.getState();
  return renderToStaticMarkup(createElement(Scene, { elements, prev, sketchy, showChanges, staticMode: true }));
}

const escapeXml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

async function svgToPngBlob(svg: string, w: number, h: number): Promise<Blob> {
  const scale = Math.min(2, 16000 / Math.max(w, h));
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}

const svgDoc = (w: number, h: number, font: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><style>${font}</style>` +
  `<rect width="100%" height="100%" fill="#ffffff"/>${body}</svg>`;

const stepBounds = (steps: Step[]) =>
  unionBoxes(
    steps.flatMap((s) => {
      const byId = byIdOf(s.elements);
      return s.elements.map((e) => getBounds(e, byId));
    }),
  );

/** PNG of the current step. */
export async function exportCurrentPng() {
  const { doc } = useStore.getState();
  const step = doc.steps[doc.current];
  if (!step.elements.length) return alert("Nothing to export on this step.");
  const pad = 32;
  const b = stepBounds([step]);
  const w = Math.ceil(b.w + pad * 2);
  const h = Math.ceil(b.h + pad * 2);
  const prev = doc.current > 0 ? doc.steps[doc.current - 1].elements : null;
  const body = `<g transform="translate(${pad - b.x} ${pad - b.y})">${await sceneMarkup(step.elements, prev)}</g>`;
  const blob = await svgToPngBlob(svgDoc(w, h, await embeddedFont(), body), w, h);
  download(URL.createObjectURL(blob), `step-${doc.current + 1}-${slug()}.png`);
}

/** One image with every step laid out in a grid, each with its number and note — a shareable trace sheet. */
export async function exportTraceSheet() {
  const { doc } = useStore.getState();
  const steps = doc.steps;
  if (!steps.some((s) => s.elements.length)) return alert("Nothing to export yet.");
  const b = stepBounds(steps); // shared frame so positions line up between steps
  const pad = 28;
  const cols = steps.length <= 2 ? steps.length : steps.length <= 4 ? 2 : 3;
  const cellW = Math.ceil(b.w + pad * 2);
  const wrapAt = Math.max(20, Math.floor((cellW - 2 * pad) / 9));
  const notes = steps.map((s) => wrap(s.note, wrapAt));
  const noteH = Math.max(...notes.map((n) => n.length)) * 22;
  const cellH = Math.ceil(b.h + pad * 2 + 40 + noteH);
  const rows = Math.ceil(steps.length / cols);
  const gap = 16;
  const W = cols * cellW + (cols + 1) * gap;
  const H = rows * cellH + (rows + 1) * gap;
  let body = "";
  for (const [i, step] of steps.entries()) {
    const ox = gap + (i % cols) * (cellW + gap);
    const oy = gap + Math.floor(i / cols) * (cellH + gap);
    const title = `Step ${i + 1}`;
    body += `<g transform="translate(${ox} ${oy})">`;
    body += `<rect width="${cellW}" height="${cellH}" rx="10" fill="#fff" stroke="#dee2e6" stroke-width="1.5"/>`;
    body += `<rect x="14" y="12" width="${measure(title, 18) + 20}" height="26" rx="13" fill="#6965db"/>`;
    body += `<text x="24" y="25" font-size="18" font-family="Patrick Hand, cursive" fill="#fff" dominant-baseline="central">${title}</text>`;
    notes[i].forEach((line, j) => {
      body += `<text x="${pad}" y="${cellH - noteH - 6 + j * 22 + 11}" font-size="17" font-family="Patrick Hand, cursive" fill="#495057" dominant-baseline="central">${escapeXml(line)}</text>`;
    });
    body += `<g transform="translate(${pad - b.x} ${pad + 34 - b.y})">${await sceneMarkup(step.elements, i > 0 ? steps[i - 1].elements : null)}</g>`;
    body += `</g>`;
  }
  const svg = svgDoc(W, H, await embeddedFont(), `<rect width="100%" height="100%" fill="#f1f3f5"/>${body}`);
  const blob = await svgToPngBlob(svg, W, H);
  download(URL.createObjectURL(blob), `trace-sheet-${slug()}.png`);
}

function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      if (line && (line + " " + word).length > max) {
        out.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) out.push(line);
  }
  return out;
}
