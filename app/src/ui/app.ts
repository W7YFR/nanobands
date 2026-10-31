/* The page: the photo view, the chart, the tables, and the controls that drive
 * them. The work itself lives in the modules beside this one; this file holds
 * the state they share and draws it.
 */

import { analyze, segUsable, swrAt, type Analysis } from "@/analysis";
import { MODES, MODE_NAMES, bandAt, bandsInRange, segsFor, type LicenseClass, type OperatingMode } from "@/bands";
import { APP_VERSION } from "@/build-info";
import { fmtF, niceStep } from "@/format";
import { mappingFor, solveRefs, type Mapping, type Point, type Quad } from "@/geometry";
import { detectGrid } from "@/grid";
import { fixSlashedZeros } from "@/ocr-zeros";
import { ocrCanvas, recognize } from "@/ocr";
import type { Pixels } from "@/pixels";
import { rectify, type Rectified } from "@/rectify";
import { openStore } from "@/store";
import { parseSweepText, type SweepRange } from "@/sweep-text";
import { isTouchstone, parseTouchstone } from "@/touchstone";
import { autoTrace as traceCurve } from "@/trace";
import { NanoVNA, toTouchstone, VnaError, type Range } from "@/vna";
import { connectPort, serialApi, type SerialLike } from "@/vna-serial";

const OK = "#3fb950", BAD = "#f85149", TRACE = "#4dd0ff";

function $<T extends HTMLElement = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`no ${sel} in the page`);
  return el;
}
/** An input or a select: both have a value and can be disabled. */
const fld = (sel: string): HTMLInputElement => $<HTMLInputElement>(sel);

/* ---------------- State ---------------- */

interface TraceState {
  N: number;
  /** Position down the plot per column, for a photo; null for a file. */
  v: Float32Array | null;
  /** Frequency (MHz) and SWR per point. */
  f: Float64Array;
  s: Float64Array;
  /** Traced automatically, and not edited since. */
  auto: boolean;
  edited: boolean;
}

interface Rect extends Rectified {
  cv: HTMLCanvasElement;
}

interface State {
  /** The working copy of the photo, and its pixels. */
  src: HTMLCanvasElement | null;
  px: Pixels | null;
  iw: number;
  ih: number;
  corners: Quad | null;
  refs: { u: number; f: number }[];
  trace: TraceState | null;
  /** A photo, a Touchstone file, or a sweep from a connected NanoVNA. */
  source: "image" | "s1p" | "vna" | null;
  /** The Touchstone text behind the data, for Save .s1p. */
  s1p: { text: string; name: string } | null;
  /** Pinned frequencies. */
  manual: number[];
  mode: "idle" | "pen" | "ref";
  /** Chart zoom, [lo, hi] in MHz. */
  view: [number, number] | null;
  an: Analysis | null;
  /** CSS pixels per photo pixel. */
  k: number;
  straight: boolean;
  rect: Rect | null;
  photoCollapsed: boolean;
  /** The user typed the sweep, so OCR offers its reading instead of using it. */
  sweepTyped: boolean;
  ocrText: string;
}

const state: State = {
  src: null, px: null, iw: 0, ih: 0, corners: null, refs: [], trace: null, source: null, s1p: null, manual: [],
  mode: "idle", view: null, an: null, k: 1, straight: false, rect: null, photoCollapsed: false,
  sweepTyped: false, ocrText: "",
};

interface Settings {
  start: number;
  stop: number;
  top: number;
  bot: number;
  thr: number;
  cls: LicenseClass;
  mode: OperatingMode;
  prom: number;
  sens: number;
}

function S(): Settings {
  return {
    start: parseFloat(fld("#fStart").value), stop: parseFloat(fld("#fStop").value),
    top: parseFloat(fld("#swrTop").value) || 5, bot: parseFloat(fld("#swrBot").value) || 1,
    thr: parseFloat(fld("#thr").value) || 3,
    cls: fld("#cls").value as LicenseClass, mode: fld("#mode").value as OperatingMode,
    prom: Math.max(0.01, parseFloat(fld("#prom").value) || 0.2), sens: +fld("#sens").value,
  };
}
const calOK = (s: Settings): boolean => Number.isFinite(s.start) && Number.isFinite(s.stop) && s.stop > s.start;

/* ---------------- Homography ---------------- */

let map: Mapping | null = null;
function updateH(): void { if (state.corners) map = mappingFor(state.corners); }
const fwd = (u: number, v: number): Point => map!.fwd(u, v);
const back = (x: number, y: number): Point => map!.back(x, y);

/* ---------------- Loading ---------------- */

function loadImageEl(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = url;
  });
}

function setImage(im: HTMLImageElement, saved?: Snapshot | null): void {
  const sc = Math.min(1, 4000 / Math.max(im.naturalWidth, im.naturalHeight));
  const w = Math.round(im.naturalWidth * sc), h = Math.round(im.naturalHeight * sc);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(im, 0, 0, w, h);
  Object.assign(state, {
    src: c, iw: w, ih: h, px: x.getImageData(0, 0, w, h),
    corners: [[w * 0.1, h * 0.1], [w * 0.9, h * 0.1], [w * 0.9, h * 0.9], [w * 0.1, h * 0.9]],
    trace: null, refs: [], manual: [], source: "image", view: null, mode: "idle", straight: false, rect: null, photoCollapsed: false,
  } satisfies Partial<State>);
  syncStraightBtn();
  for (const s of ["#fStart", "#fStop"]) fld(s).disabled = false;
  for (const s of ["#calCard", "#traceCard", "#photoCard"]) $(s).classList.remove("hidden");
  updateH(); syncModeButtons(); layoutPhoto();
  state.sweepTyped = false;
  if (saved) { applySnapshot(saved); return; }
  refresh();
  if (findGrid()) {
    autoTrace();
    state.straight = true; buildRect(); syncStraightBtn(); layoutPhoto(); refresh();
  }
  void readSweepFromPhoto();
}

/* ---------------- Grid ---------------- */

function gridNote(html: string): void { const el = $("#gridNote"); el.innerHTML = html; el.classList.toggle("hidden", !html); }

function findGrid(): boolean {
  const r = state.px ? detectGrid(state.px) : null;
  if (!r) { gridNote("Couldn't find the grid automatically, so drag the corners into place."); return false; }
  state.corners = r.corners;
  updateH();
  gridNote(`✓ Grid found (${r.horizontal} horizontal, ${r.vertical} vertical lines). Photo straightened; <b>Edit corners</b> to adjust.`);
  return true;
}

/* ---------------- Read START/STOP (or CENTER/SPAN) off the photo ---------------- */

let ocrJob = 0;
function ocrNote(html: string): void { const el = $("#ocrNote"); el.innerHTML = html; el.classList.toggle("hidden", !html); }

async function readSweepFromPhoto(): Promise<void> {
  const job = ++ocrJob;
  ocrNote("Looking for START/STOP text in the photo…");
  try {
    if (!state.src || !state.px) return;
    const px = state.px, { canvas, scale } = ocrCanvas(state.src);
    const data = await recognize(canvas);
    if (job !== ocrJob) return;
    state.ocrText = fixSlashedZeros(data, px, scale);
    const r = parseSweepText(state.ocrText);
    if (!r) { ocrNote("No START/STOP text found in the photo, so enter the sweep below."); return; }
    const fmt = (f: number): number => +f.toFixed(6);
    if (state.sweepTyped) {
      ocrNote(`Photo says ${fmt(r.start)}–${fmt(r.stop)} MHz. <a href="#" id="ocrUse">Use it</a>`);
      $("#ocrUse").onclick = (e) => { e.preventDefault(); applySweep(r); };
    } else applySweep(r);
  } catch {
    if (job === ocrJob) ocrNote("Couldn't run text recognition (offline?), so enter the sweep below.");
  }
}

function applySweep(r: SweepRange): void {
  fld("#fStart").value = String(+r.start.toFixed(6));
  fld("#fStop").value = String(+r.stop.toFixed(6));
  state.view = null;
  state.sweepTyped = false;
  ocrNote(`✓ Read from photo: <b>${+r.start.toFixed(6)}–${+r.stop.toFixed(6)} MHz</b>. Check it against the screen (OCR saw “${r.raw}”).`);
  refresh();
}

/** Show Touchstone data. A repeat sweep of the same range keeps the pins and the zoom. */
function setTouchstone(text: string, name: string, source: "s1p" | "vna" = "s1p", repeat = false): void {
  const { f, s } = parseTouchstone(text);
  if (f.length < 2) { alert("Couldn't find S11 data in that file."); return; }
  Object.assign(state, {
    source, s1p: { text, name }, trace: { N: f.length, v: null, f: Float64Array.from(f), s: Float64Array.from(s), auto: false, edited: false },
    src: null, px: null, corners: null, refs: [],
    ...(repeat ? {} : { manual: [], view: null }), mode: "idle",
  } satisfies Partial<State>);
  fld("#fStart").value = String(+f[0]!.toFixed(4));
  fld("#fStop").value = String(+f[f.length - 1]!.toFixed(4));
  for (const sel of ["#fStart", "#fStop"]) fld(sel).disabled = true;
  for (const sel of ["#calCard", "#traceCard", "#photoCard"]) $(sel).classList.add("hidden");
  refresh();
}

function showFileName(name: string): void {
  drop.innerHTML = '<b class="fname"></b><br><u>choose another…</u>';
  drop.querySelector(".fname")!.textContent = name;
}

function handleFile(file: File | null | undefined): void {
  if (!file) return;
  const name = file.name || "pasted image";
  showFileName(name);
  // A new file starts a new session: keep the file, forget what was done to the last one.
  saveFile(file, name);
  if (isTouchstone(name)) { void file.text().then((t) => setTouchstone(t, name)); return; }
  loadImageEl(URL.createObjectURL(file)).then((im) => setImage(im)).catch(() => alert("Couldn't read that image."));
}

/* ---------------- Saved session ---------------- */

const store = openStore();
const SAVED_FIELDS = ["#fStart", "#fStop", "#swrTop", "#swrBot", "#sens"];
let restoring = false, saveTimer: ReturnType<typeof setTimeout> | undefined;

interface Snapshot {
  fields: Record<string, string>;
  corners: Quad | null;
  refs: { u: number; f: number }[];
  manual: number[];
  view: [number, number] | null;
  straight: boolean;
  sweepTyped: boolean;
  collapsed: boolean;
  trace: { N: number; v: Float32Array; auto: boolean; edited: boolean } | null;
  notes: { ocr: string; grid: string };
}

function saveFile(file: Blob, name: string): void {
  void store.del("session");
  void store.set("file", { blob: file, name });
}

function snapshot(): Snapshot {
  const t = state.trace;
  // A note with a live link is not restorable.
  const plain = (html: string): string => (html.includes("<a") ? "" : html);
  return {
    fields: Object.fromEntries(SAVED_FIELDS.map((f) => [f, fld(f).value])),
    corners: state.corners, refs: state.refs, manual: state.manual, view: state.view,
    straight: state.straight, sweepTyped: state.sweepTyped, collapsed: state.photoCollapsed,
    trace: t && t.v ? { N: t.N, v: t.v.slice(), auto: t.auto, edited: t.edited } : null,
    notes: { ocr: plain($("#ocrNote").innerHTML), grid: plain($("#gridNote").innerHTML) },
  };
}

function applySnapshot(sv: Partial<Snapshot>): void {
  for (const [f, v] of Object.entries(sv.fields ?? {})) if (!fld(f).disabled) fld(f).value = v;
  if (state.source === "image") {
    if (sv.corners) { state.corners = sv.corners; updateH(); }
    if (sv.trace) {
      const N = sv.trace.N;
      state.trace = { N, v: Float32Array.from(sv.trace.v), f: new Float64Array(N), s: new Float64Array(N), auto: sv.trace.auto, edited: sv.trace.edited };
    } else if (sv.corners) autoTrace();
    if (sv.straight) { state.straight = true; buildRect(); syncStraightBtn(); layoutPhoto(); }
    state.photoCollapsed = !!sv.collapsed;
    ocrNote(sv.notes?.ocr ?? "");
    gridNote(sv.notes?.grid ?? "");
  }
  Object.assign(state, { refs: sv.refs ?? [], manual: sv.manual ?? [], view: sv.view ?? null, sweepTyped: !!sv.sweepTyped });
  refresh();
}

function scheduleSave(): void {
  if (restoring || !state.source) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { if (state.source) void store.set("session", snapshot()); }, 400);
}

async function restoreSession(): Promise<void> {
  const f = await store.get<{ blob: Blob; name: string }>("file");
  if (!f) return;
  const sv = await store.get<Snapshot>("session");
  restoring = true;
  try {
    showFileName(f.name);
    if (isTouchstone(f.name)) { setTouchstone(await f.blob.text(), f.name); if (sv) applySnapshot(sv); }
    else setImage(await loadImageEl(URL.createObjectURL(f.blob)), sv ?? null);
  } catch {
    clearAll();
  } finally {
    restoring = false;
    refresh();
  }
}

function clearAll(): void {
  ocrJob++; // a reading still in flight lands nowhere
  live = false;
  clearTimeout(saveTimer);
  Object.assign(state, {
    src: null, px: null, iw: 0, ih: 0, corners: null, refs: [], trace: null, source: null, s1p: null, manual: [],
    mode: "idle", view: null, an: null, straight: false, rect: null, sweepTyped: false, photoCollapsed: false,
  } satisfies Partial<State>);
  map = null; dragCorner = -1; hover = null;
  for (const f of ["#fStart", "#fStop"]) { fld(f).value = ""; fld(f).disabled = false; }
  fld("#swrTop").value = "5"; fld("#swrBot").value = "1"; fld("#sens").value = "70";
  ocrNote(""); gridNote(""); $("#retraceHint").classList.add("hidden");
  for (const c of ["#calCard", "#traceCard", "#photoCard"]) $(c).classList.remove("hidden");
  drop.innerHTML = DROP_HTML;
  fileIn.value = "";
  syncModeButtons(); syncStraightBtn(); syncVna();
  void store.del("file"); void store.del("session");
  refresh();
}

/* ---------------- Trace and analysis ---------------- */

function autoTrace(): void {
  if (!state.px || !state.corners) return;
  const { N, v } = traceCurve(state.px, fwd, state.corners, S().sens);
  state.trace = { N, v, f: new Float64Array(N), s: new Float64Array(N), auto: true, edited: false };
  $("#retraceHint").classList.add("hidden");
  refresh();
}

/** A photo's trace, as frequency and SWR, from the sweep and scale settings. */
function recompute(): void {
  const t = state.trace, s = S();
  if (!t || !t.v) return;
  for (let i = 0; i < t.N; i++) {
    t.f[i] = calOK(s) ? s.start + ((i + 0.5) / t.N) * (s.stop - s.start) : NaN;
    t.s[i] = Number.isNaN(t.v[i]) ? NaN : s.top + t.v[i]! * (s.bot - s.top);
  }
}

function runAnalysis(): Analysis | null {
  const t = state.trace, s = S();
  if (!t || !calOK(s)) return null;
  return analyze(t.f, t.s, { thr: s.thr, prom: s.prom, top: s.top });
}

const swrHere = (fq: number): number => (state.trace ? swrAt(state.trace.f, state.trace.s, fq) : NaN);

/* ---------------- Photo view ---------------- */

const photo = $<HTMLCanvasElement>("#photo"), pctx = photo.getContext("2d")!;
let hover: Point | null = null, dragCorner = -1, penLast: [number, number] | null = null;
// The frequency under the cursor, in either view. Both draw a dot on the curve
// there, so moving across one shows the same point in the other.
let hoverF: number | null = null;

function buildRect(): void {
  if (!state.px || !state.corners) return;
  const r = rectify(state.px, fwd, state.corners);
  const cv = document.createElement("canvas");
  cv.width = r.W;
  cv.height = r.H;
  cv.getContext("2d")!.putImageData(new ImageData(r.data as Uint8ClampedArray<ArrayBuffer>, r.W, r.H), 0, 0);
  state.rect = { ...r, cv };
}
const straightOn = (): boolean => !!(state.straight && state.rect);
const view = (): { src: HTMLCanvasElement; w: number; h: number } =>
  straightOn() ? { src: state.rect!.cv, w: state.rect!.W, h: state.rect!.H } : { src: state.src!, w: state.iw, h: state.ih };
/** Plot (u, v) to view pixels, and back, in whichever view is showing. */
const vf = (u: number, v: number): Point => {
  if (!straightOn()) return fwd(u, v);
  const r = state.rect!;
  return [r.mx + u * r.pw, r.my + v * r.ph];
};
const vb = (x: number, y: number): Point => {
  if (!straightOn()) return back(x, y);
  const r = state.rect!;
  return [(x - r.mx) / r.pw, (y - r.my) / r.ph];
};

function syncStraightBtn(): void { $("#straightBtn").textContent = state.straight ? "Edit corners" : "Straighten"; }

function layoutPhoto(): void {
  if (!state.src) return;
  const vw = view(), W = $("#photoWrap").clientWidth, maxH = window.innerHeight * 0.72;
  state.k = Math.min(W / vw.w, maxH / vw.h);
  photo.style.width = vw.w * state.k + "px";
  photo.style.height = vw.h * state.k + "px";
  const dpr = window.devicePixelRatio || 1;
  photo.width = Math.round(vw.w * state.k * dpr);
  photo.height = Math.round(vw.h * state.k * dpr);
}

function quad(ctx: CanvasRenderingContext2D, u0: number, u1: number, v0: number, v1: number): void {
  ctx.beginPath();
  ([[u0, v0], [u1, v0], [u1, v1], [u0, v1]] as const).forEach(([u, v], j) => {
    const [x, y] = vf(u, v);
    if (j) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
}
function lineUV(ctx: CanvasRenderingContext2D, u0: number, v0: number, u1: number, v1: number): void {
  const a = vf(u0, v0), b = vf(u1, v1);
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
}
function label(ctx: CanvasRenderingContext2D, txt: string, x: number, y: number, U: number, color: string,
  align: "center" | "right" | "left" = "center", bg = "rgba(13,17,23,.82)"): void {
  ctx.font = `600 ${12 * U}px -apple-system,Segoe UI,sans-serif`;
  const w = ctx.measureText(txt).width, pad = 3 * U, hgt = 16 * U;
  const x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x0 - pad, y - hgt / 2, w + 2 * pad, hgt, 3 * U); ctx.fill();
  ctx.fillStyle = color; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(txt, x0, y + 0.5 * U);
}
function strokeTrace(ctx: CanvasRenderingContext2D, t: TraceState): void {
  if (!t.v) return;
  ctx.beginPath();
  let pen = false;
  for (let i = 0; i < t.N; i++) {
    if (Number.isNaN(t.v[i])) { pen = false; continue; }
    const [x, y] = vf((i + 0.5) / t.N, t.v[i]!);
    if (pen) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
    pen = true;
  }
  ctx.stroke();
}

// Draws in view pixels; U = view px per CSS px, so overlays look the same on screen and in export.
function drawPhoto(ctx: CanvasRenderingContext2D, U: number, forExport: boolean): void {
  ctx.drawImage(view().src, 0, 0);
  if (!state.corners) return;
  const s = S(), an = state.an, cal = calOK(s), uOf = (f: number): number => (f - s.start) / (s.stop - s.start);
  const vT = (s.thr - s.top) / (s.bot - s.top);
  // band plan
  if (cal) {
    for (const b of bandsInRange(s.start, s.stop)) {
      for (const seg of segsFor(b, s)) {
        const u0 = Math.max(0, uOf(seg[0])), u1 = Math.min(1, uOf(seg[1]));
        if (u1 <= u0) continue;
        const minW = (1.5 * U) / (vf(1, 0)[0] - vf(0, 0)[0] || 1);
        const ua = (u0 + u1) / 2 - Math.max(u1 - u0, minW) / 2, ub = (u0 + u1) / 2 + Math.max(u1 - u0, minW) / 2;
        if (an) {
          ctx.fillStyle = "rgba(248,81,73,.22)"; quad(ctx, ua, ub, 0, 1); ctx.fill();
          ctx.fillStyle = "rgba(63,185,80,.38)";
          for (const [a, c] of segUsable(seg, an).parts) {
            const pa = Math.max(0, uOf(a)), pb = Math.min(1, uOf(c));
            const w = Math.max(pb - pa, minW);
            quad(ctx, (pa + pb) / 2 - w / 2, (pa + pb) / 2 + w / 2, 0, 1); ctx.fill();
          }
        } else {
          ctx.fillStyle = MODES[seg[2]].color + "40"; quad(ctx, ua, ub, 0, 1); ctx.fill();
        }
      }
      const um = Math.min(1, Math.max(0, uOf((b.lo + b.hi) / 2)));
      const [x, y] = vf(um, 0);
      label(ctx, b.name, x, y - 12 * U, U, segsFor(b, s).length ? "#e6edf3" : "#8b949e");
    }
    // frequency ticks, for checking calibration against the VNA's own grid
    const step = niceStep((s.stop - s.start) / 10);
    ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1 * U; ctx.setLineDash([3 * U, 4 * U]);
    for (let f = Math.ceil(s.start / step) * step; f <= s.stop + 1e-9; f += step) { lineUV(ctx, uOf(f), 0, uOf(f), 1); ctx.stroke(); }
    ctx.setLineDash([]);
    for (let f = Math.ceil(s.start / step) * step; f <= s.stop + 1e-9; f += step) {
      const [x, y] = vf(uOf(f), 1);
      label(ctx, String(+f.toFixed(6)), x, y + 12 * U, U, "#c9d1d9");
    }
  }
  // threshold line
  if (vT > 0 && vT < 1) {
    ctx.strokeStyle = BAD; ctx.lineWidth = 1.5 * U; ctx.setLineDash([6 * U, 4 * U]); lineUV(ctx, 0, vT, 1, vT); ctx.stroke(); ctx.setLineDash([]);
    const [x, y] = vf(1, vT);
    label(ctx, "SWR " + s.thr, x - 6 * U, y - 11 * U, U, BAD, "right");
  }
  // quad outline
  ctx.strokeStyle = "rgba(242,204,96,.7)"; ctx.lineWidth = 1 * U; quad(ctx, 0, 1, 0, 1); ctx.stroke();
  // frequency references
  for (const r of state.refs) {
    ctx.strokeStyle = "#ff7bd5"; ctx.lineWidth = 1.5 * U; lineUV(ctx, r.u, 0, r.u, 1); ctx.stroke();
    const [x, y] = vf(r.u, 0.5);
    label(ctx, r.f + " MHz", x, y, U, "#ff7bd5");
  }
  // traced curve
  if (state.trace) { ctx.strokeStyle = TRACE; ctx.lineWidth = 1.6 * U; strokeTrace(ctx, state.trace); }
  // key points
  if (an && cal) {
    const pt = (f: number, sw: number): Point => vf(uOf(f), Math.min(1, Math.max(0, (sw - s.top) / (s.bot - s.top))));
    for (const c of an.crossings) {
      const [x, y] = pt(c.f, s.thr);
      ctx.fillStyle = BAD; ctx.beginPath(); ctx.arc(x, y, 4 * U, 0, 7); ctx.fill();
    }
    for (const e of an.extrema) {
      const [x, y] = pt(e.f, e.s), col = e.type === "dip" ? OK : "#f2cc60";
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 4.5 * U, 0, 7); ctx.fill();
      label(ctx, `${fmtF(e.f)} · ${e.clipped ? "≥" + s.top : e.s.toFixed(2)}`, x, y + (e.type === "dip" ? 16 : -16) * U, U, col);
    }
    // crossing labels, staggered so neighbours don't overlap
    const rows: number[] = [];
    ctx.font = `600 ${12 * U}px sans-serif`;
    for (const c of an.crossings) {
      const [x, y] = pt(c.f, s.thr), txt = fmtF(c.f), w = ctx.measureText(txt).width + 10 * U;
      let r = 0;
      while (rows[r] !== undefined && rows[r]! > x - w / 2) r++;
      rows[r] = x + w / 2;
      label(ctx, txt, x, y + (r % 2 ? -1 : 1) * (14 + 16 * Math.floor(r / 2)) * U, U, "#ff9a94");
    }
    for (const m of state.manual) {
      const sw = swrHere(m);
      if (Number.isNaN(sw)) continue;
      const [x, y] = pt(m, sw);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, 4 * U, 0, 7); ctx.fill();
      label(ctx, `${fmtF(m)} · ${sw.toFixed(2)}`, x, y - 16 * U, U, "#fff");
    }
    if (!forExport && hoverF !== null) {
      const u = uOf(hoverF), sw = swrHere(hoverF);
      ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1 * U; lineUV(ctx, u, 0, u, 1); ctx.stroke();
      if (!Number.isNaN(sw)) {
        const [x, y] = pt(hoverF, sw);
        ctx.fillStyle = sw <= s.thr ? OK : "#e3c84a"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2 * U;
        ctx.beginPath(); ctx.arc(x, y, 6 * U, 0, 7); ctx.fill(); ctx.stroke();
        label(ctx, `${fmtF(hoverF)} MHz · SWR ${sw >= s.top ? "≥" + s.top : sw.toFixed(2)}`, x, y - 20 * U, U, "#e6edf3");
      }
    }
  }
  if (forExport || straightOn()) return;
  // corner handles
  state.corners.forEach(([x, y], j) => {
    ctx.lineWidth = 2 * U; ctx.strokeStyle = j === dragCorner ? "#fff" : "#f2cc60";
    ctx.beginPath(); ctx.arc(x, y, 9 * U, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 4 * U, y); ctx.lineTo(x + 4 * U, y); ctx.moveTo(x, y - 4 * U); ctx.lineTo(x, y + 4 * U); ctx.stroke();
  });
}

function renderPhoto(): void {
  if (!state.src || state.photoCollapsed) return;
  const dpr = window.devicePixelRatio || 1, k = state.k;
  pctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
  drawPhoto(pctx, 1 / k, false);
  // magnifier
  if (hover && (dragCorner >= 0 || state.mode !== "idle")) {
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const R = 64, Z = 4, cw = view().w * k;
    const hx = hover[0] * k, hy = hover[1] * k;
    let cx: number, cy: number;
    if (dragCorner >= 0) {
      // Fixed per corner so it never jumps mid-drag: top corners look below, bottom corners above.
      cx = hx + (dragCorner === 0 || dragCorner === 3 ? 1.6 * R : -1.6 * R);
      cy = hy + (dragCorner <= 1 ? 1.6 * R : -1.6 * R);
    } else {
      cx = hx + (hx > cw - 2.6 * R ? -1.6 * R : 1.6 * R);
      cy = hy + (hy < 2.6 * R ? 1.6 * R : -1.6 * R);
    }
    const sw = (2 * R) / (k * Z);
    pctx.save(); pctx.beginPath(); pctx.arc(cx, cy, R, 0, 7); pctx.clip();
    pctx.fillStyle = "#000"; pctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    pctx.imageSmoothingEnabled = false;
    pctx.drawImage(view().src, hover[0] - sw / 2, hover[1] - sw / 2, sw, sw, cx - R, cy - R, 2 * R, 2 * R);
    // The trace too, at the same zoom, so Pen fix shows the line it is correcting
    // and the stroke going down as it is drawn.
    if (state.trace?.v) {
      const m = k * Z;
      pctx.save();
      pctx.setTransform(dpr * m, 0, 0, dpr * m, dpr * (cx - hover[0] * m), dpr * (cy - hover[1] * m));
      pctx.strokeStyle = TRACE; pctx.lineWidth = 2 / m; pctx.lineJoin = "round";
      strokeTrace(pctx, state.trace);
      pctx.restore();
    }
    pctx.strokeStyle = "#ff3b6b"; pctx.lineWidth = 1;
    pctx.beginPath(); pctx.moveTo(cx - R, cy); pctx.lineTo(cx + R, cy); pctx.moveTo(cx, cy - R); pctx.lineTo(cx, cy + R); pctx.stroke();
    pctx.restore();
    pctx.strokeStyle = "#f2cc60"; pctx.lineWidth = 2; pctx.beginPath(); pctx.arc(cx, cy, R, 0, 7); pctx.stroke();
  }
}

function evImg(e: PointerEvent): Point {
  const r = photo.getBoundingClientRect();
  return [(e.clientX - r.left) / state.k, (e.clientY - r.top) / state.k];
}

function penApply(x: number, y: number): void {
  if (!state.trace?.v) {
    const N = 1200;
    state.trace = { N, v: new Float32Array(N).fill(NaN), f: new Float64Array(N), s: new Float64Array(N), auto: false, edited: true };
  }
  const t = state.trace, tv = t.v!, [u, v0] = vb(x, y), v = Math.max(0, Math.min(1, v0));
  const i = Math.floor(u * t.N);
  if (i < 0 || i >= t.N) { penLast = null; return; }
  if (penLast) {
    const [i0, w0] = penLast, a = Math.min(i0, i), b = Math.max(i0, i);
    for (let j = a; j <= b; j++) tv[j] = i === i0 ? v : w0 + ((v - w0) * (j - i0)) / (i - i0);
  } else tv[i] = v;
  t.edited = true;
  penLast = [i, v];
}

const nearCorner = (x: number, y: number): number =>
  straightOn() || !state.corners ? -1 : state.corners.findIndex(([cx, cy]) => Math.hypot(cx - x, cy - y) * state.k < 14);

function applyRefs(): void {
  const r = solveRefs(state.refs);
  if (!r) return;
  fld("#fStart").value = String(+r.start.toFixed(4));
  fld("#fStop").value = String(+r.stop.toFixed(4));
}

/* ---------------- Chart view ---------------- */

const chart = $<HTMLCanvasElement>("#chart"), cctx = chart.getContext("2d")!;
interface ChartGeom { x0: number; x1: number; y0: number; y1: number; lo: number; hi: number; X(f: number): number; Y(w: number): number }
let chDrag: { x0: number; x1: number } | null = null, chGeom: ChartGeom | null = null;

function viewRange(): [number, number] | null {
  const an = state.an;
  if (!an) return null;
  return state.view ?? [an.fmin, an.fmax];
}

function renderChart(): void {
  const dpr = window.devicePixelRatio || 1, W = chart.clientWidth, Hh = chart.clientHeight;
  chart.width = W * dpr;
  chart.height = Hh * dpr;
  drawChart(cctx, W, Hh, dpr);
}

function drawChart(ctx: CanvasRenderingContext2D, W: number, Hh: number, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#1a1f27"; ctx.fillRect(0, 0, W, Hh);
  const an = state.an, s = S(), t = state.trace, range = viewRange();
  ctx.font = "13px -apple-system,Segoe UI,sans-serif"; ctx.textBaseline = "middle";
  if (!an || !t || !range) {
    ctx.fillStyle = "#8b949e"; ctx.textAlign = "center";
    ctx.fillText(state.trace ? "Enter sweep start/stop frequencies (step 2)." : "Load data and trace the curve to see the chart.", W / 2, Hh / 2);
    chGeom = null;
    return;
  }
  const [lo, hi] = range;
  const yTop = s.top, yBot = s.bot;
  const x0 = 46, x1 = W - 14, y0 = 30, y1 = Hh - 86;
  // The SWR scale stops short of the plot's edges, so a dip at the bottom or a
  // peak at the top still has room for its label without covering its dot.
  const py0 = y0 + 24, py1 = y1 - 22;
  const X = (f: number): number => x0 + ((f - lo) / (hi - lo)) * (x1 - x0);
  const Y = (w: number): number => py1 - ((Math.min(w, yTop) - yBot) / (yTop - yBot)) * (py1 - py0);
  chGeom = { x0, x1, y0, y1, lo, hi, X, Y };
  const stripY = y1 + 22, stripH = 12;

  // grid
  ctx.strokeStyle = "#262d37"; ctx.lineWidth = 1; ctx.fillStyle = "#8b949e"; ctx.font = "11px -apple-system,Segoe UI,sans-serif";
  const ys = yTop - yBot > 6 ? 1 : 0.5;
  ctx.textAlign = "right";
  for (let w = Math.ceil(yBot / ys) * ys; w <= yTop + 1e-9; w += ys) {
    ctx.beginPath(); ctx.moveTo(x0, Y(w)); ctx.lineTo(x1, Y(w)); ctx.stroke(); ctx.fillText(w.toFixed(1), x0 - 6, Y(w));
  }
  const step = niceStep((hi - lo) / Math.max(4, W / 110));
  ctx.textAlign = "center";
  for (let f = Math.ceil(lo / step) * step; f <= hi + 1e-9; f += step) {
    ctx.beginPath(); ctx.moveTo(X(f), y0); ctx.lineTo(X(f), y1); ctx.stroke();
    ctx.fillText(String(+f.toFixed(6)), X(f), y1 + 10);
  }
  ctx.fillText("MHz", x1 - 12, y1 + 10);

  // band plan: shading in the plot, and the usability strip
  ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, x1 - x0, Hh); ctx.clip();
  let lastLbl = -1e9;
  for (const b of bandsInRange(lo, hi)) {
    const segs = segsFor(b, s), bx0 = X(b.lo), bx1 = X(b.hi);
    ctx.fillStyle = "rgba(255,255,255,.035)"; ctx.fillRect(bx0, y0, Math.max(1.5, bx1 - bx0), y1 - y0);
    for (const seg of segs) {
      const a = X(seg[0]), c = X(seg[1]), w = Math.max(2, c - a), m = (a + c) / 2;
      ctx.fillStyle = MODES[seg[2]].color + "24"; ctx.fillRect(m - w / 2, y0, w, y1 - y0);
      ctx.fillStyle = MODES[seg[2]].color; ctx.fillRect(m - w / 2, y0, w, 3);
      const u = segUsable(seg, an);
      ctx.fillStyle = u.measured < 0.999 ? "#3a404a" : "rgba(248,81,73,.7)"; ctx.fillRect(m - w / 2, stripY, w, stripH);
      ctx.fillStyle = OK;
      for (const [p, q] of u.parts) {
        const pw = Math.max(1.5, X(q) - X(p));
        ctx.fillRect((X(p) + X(q)) / 2 - pw / 2, stripY, pw, stripH);
      }
    }
    const lx = (bx0 + bx1) / 2;
    ctx.font = "600 11px -apple-system,Segoe UI,sans-serif"; ctx.textAlign = "center";
    const lw = ctx.measureText(b.name).width;
    if (lx - lw / 2 > lastLbl + 4) { ctx.fillStyle = segs.length ? "#e6edf3" : "#6e7681"; ctx.fillText(b.name, lx, y0 - 12); lastLbl = lx + lw / 2; }
  }
  ctx.restore();
  ctx.fillStyle = "#8b949e"; ctx.font = "11px -apple-system,Segoe UI,sans-serif"; ctx.textAlign = "right";
  ctx.fillText("bands", x0 - 6, stripY + stripH / 2);

  // threshold
  ctx.strokeStyle = BAD; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x0, Y(s.thr)); ctx.lineTo(x1, Y(s.thr)); ctx.stroke(); ctx.setLineDash([]);

  // curve: yellow above the threshold, green at or under it
  ctx.save(); ctx.beginPath(); ctx.rect(x0, y0 - 2, x1 - x0, y1 - y0 + 4); ctx.clip();
  const path = new Path2D();
  let pen = false;
  for (let i = 0; i < t.N; i++) {
    const fi = t.f[i]!, si = t.s[i]!;
    if (Number.isNaN(si) || Number.isNaN(fi)) { pen = false; continue; }
    if (fi < lo - (hi - lo) * 0.02 || fi > hi + (hi - lo) * 0.02) { pen = false; continue; }
    if (pen) path.lineTo(X(fi), Y(si));
    else path.moveTo(X(fi), Y(si));
    pen = true;
  }
  ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.strokeStyle = "#e3c84a"; ctx.stroke(path);
  ctx.beginPath(); ctx.rect(x0, Y(s.thr), x1 - x0, y1 - Y(s.thr) + 2); ctx.clip();
  ctx.strokeStyle = OK; ctx.stroke(path);
  ctx.restore();

  const inView = (f: number): boolean => f >= lo && f <= hi;
  const tag = (txt: string, x: number, y: number, color: string): void => {
    ctx.font = "600 11px -apple-system,Segoe UI,sans-serif";
    const w = ctx.measureText(txt).width;
    x = Math.min(Math.max(x, x0 + w / 2 + 4), x1 - w / 2 - 4);
    ctx.fillStyle = "rgba(26,31,39,.85)"; ctx.fillRect(x - w / 2 - 3, y - 8, w + 6, 16);
    ctx.fillStyle = color; ctx.textAlign = "center"; ctx.fillText(txt, x, y);
  };
  // extrema
  for (const e of an.extrema) {
    if (!inView(e.f)) continue;
    const x = X(e.f), y = Y(e.s), col = e.type === "dip" ? OK : "#f2cc60";
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill();
    const val = e.clipped ? "≥" + s.top : e.s.toFixed(2);
    if (e.type === "dip") tag(`${fmtF(e.f)} · ${val}`, x, Math.min(y + 14, y1 - 8), col);
    else tag(`${fmtF(e.f)} · ${val}`, x, Math.max(y - 13, y0 + 12), col);
  }
  // crossings: dots on the threshold line
  ctx.fillStyle = BAD;
  for (const c of an.crossings) if (inView(c.f)) { ctx.beginPath(); ctx.arc(X(c.f), Y(s.thr), 3.5, 0, 7); ctx.fill(); }
  // stretches where SWR <= max: a bracket each with its start–end, staggered into two rows
  const rows: number[] = [];
  ctx.font = "600 11px -apple-system,Segoe UI,sans-serif";
  for (const [a, b] of an.usable) {
    if (b < lo || a > hi) continue;
    const xa = X(Math.max(a, lo)), xb = X(Math.min(b, hi)), txt = `${fmtF(a)}–${fmtF(b)}`, w = ctx.measureText(txt).width + 10;
    const cx = (xa + xb) / 2, left = Math.min(xa, cx - w / 2), right = Math.max(xb, cx + w / 2);
    let r = 0;
    while (r < 1 && rows[r] !== undefined && rows[r]! > left) r++;
    rows[r] = right;
    const by = stripY + stripH + 10 + r * 20;
    ctx.strokeStyle = OK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(xa, by - 4); ctx.lineTo(xa, by); ctx.lineTo(xb, by); ctx.lineTo(xb, by - 4); ctx.stroke();
    tag(txt, cx, by + 10, OK);
  }
  ctx.fillStyle = "#8b949e"; ctx.font = "11px -apple-system,Segoe UI,sans-serif"; ctx.textAlign = "right";
  ctx.fillText(`≤${s.thr}:1`, x0 - 6, stripY + stripH + 20);
  // pinned markers
  for (const m of state.manual) {
    if (!inView(m)) continue;
    const w = swrHere(m);
    if (Number.isNaN(w)) continue;
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(X(m), Y(w), 4, 0, 7); ctx.fill();
    tag(`${fmtF(m)} · ${w.toFixed(2)}`, X(m), Math.max(Y(w) - 14, y0 + 12), "#fff");
  }
  // drag-zoom selection
  if (chDrag && Math.abs(chDrag.x1 - chDrag.x0) > 4) {
    ctx.fillStyle = "rgba(242,204,96,.12)";
    ctx.fillRect(Math.min(chDrag.x0, chDrag.x1), y0, Math.abs(chDrag.x1 - chDrag.x0), y1 - y0);
  }
  // hover: a line, a dot on the curve, and the readout
  if (hoverF !== null && !chDrag && hoverF >= lo && hoverF <= hi) {
    const f = hoverF, x = X(f), w = swrHere(f);
    ctx.strokeStyle = "rgba(255,255,255,.3)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    if (!Number.isNaN(w)) {
      ctx.fillStyle = w <= s.thr ? OK : "#e3c84a"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, Y(w), 5.5, 0, 7); ctx.fill(); ctx.stroke();
    }
    const band = bandAt(f);
    // Rides with the dot, above it, or below it where above would leave the plot.
    const ly = Number.isNaN(w) ? y0 + 10 : Y(w) - 18 >= y0 + 10 ? Y(w) - 18 : Math.min(Y(w) + 18, y1 - 10);
    tag(`${fmtF(f)} MHz · SWR ${Number.isNaN(w) ? "—" : w >= yTop ? "≥" + yTop : w.toFixed(2)}${band ? " · " + band.name : ""}`, x, ly, "#e6edf3");
  }
}

const chX = (e: PointerEvent): number => e.clientX - chart.getBoundingClientRect().left;
const chF = (g: ChartGeom, x: number): number => g.lo + ((x - g.x0) / (g.x1 - g.x0)) * (g.hi - g.lo);

/* ---------------- Tables and chips ---------------- */

function renderChips(): void {
  const an = state.an, el = $("#chips");
  el.innerHTML = "";
  if (!an) return;
  const mk = (txt: string, v: [number, number] | null): void => {
    const b = document.createElement("button");
    b.textContent = txt;
    const cur = state.view;
    if ((!v && !cur) || (v && cur && Math.abs(v[0] - cur[0]) < 1e-9 && Math.abs(v[1] - cur[1]) < 1e-9)) b.classList.add("on");
    b.onclick = () => { state.view = v; refresh(); };
    el.appendChild(b);
  };
  mk("Full sweep", null);
  for (const b of bandsInRange(an.fmin, an.fmax)) {
    const pad = Math.max((b.hi - b.lo) * 0.35, 0.02);
    mk(b.name, [Math.max(an.fmin, b.lo - pad), Math.min(an.fmax, b.hi + pad)]);
  }
}

function renderTables(): void {
  const an = state.an, s = S(), t = state.trace;
  if (!an || !t) {
    $("#bandTable").innerHTML = $("#ptTable").innerHTML = '<div class="empty">No data yet.</div>';
    $("#resNote").textContent = "";
    return;
  }
  const res = ((an.fmax - an.fmin) / t.N) * 1000;
  $("#resNote").textContent = state.source === "image"
    ? `· traced resolution ≈ ${res < 10 ? res.toFixed(1) : Math.round(res)} kHz per point`
    : `· ${t.N} points from ${state.source === "vna" ? "the NanoVNA" : "file"}`;
  let h = "<table><tr><th>Band</th><th>Segment</th><th>Range (MHz)</th><th>Usable at SWR ≤ " + s.thr + '</th><th style="width:22%"></th></tr>';
  const bands = bandsInRange(an.fmin, an.fmax);
  if (!bands.length) h += '<tr><td colspan="5" class="empty">No amateur bands inside this sweep.</td></tr>';
  for (const b of bands) {
    const segs = segsFor(b, s);
    if (!segs.length) {
      const why = b.priv[s.cls].length ? `No ${MODE_NAMES[s.mode]} privileges here for this license class` : "No privileges for this license class";
      h += `<tr><td><b>${b.name}</b></td><td colspan="4" style="color:var(--muted)">${why}</td></tr>`;
      continue;
    }
    const tot = segs.map((g) => segUsable(g, an));
    const avg = tot.reduce((a, u, j) => a + u.frac * (segs[j]![1] - segs[j]![0]), 0) / segs.reduce((a, g) => a + g[1] - g[0], 0);
    const pill = avg > 0.995 ? '<span class="pill ok">all usable</span>' : avg > 0.005 ? '<span class="pill part">partial</span>' : '<span class="pill no">none</span>';
    const meas = Math.min(...tot.map((u) => u.measured));
    const is60 = b.name === "60m";
    const f60 = (g: readonly [number, number, ...unknown[]]): string =>
      g[1] - g[0] < 0.005 ? ((g[0] + g[1]) / 2).toFixed(4) : `${g[0].toFixed(4)}–${g[1].toFixed(4)}`;
    const ok60 = segs.filter((_, j) => tot[j]!.frac > 0.995);
    const showSegs = is60 ? [[segs[0]![0], segs[segs.length - 1]![1], "chan"] as const] : segs;
    showSegs.forEach((g, j) => {
      const u = is60 ? { parts: segs.flatMap((c) => segUsable(c, an).parts), frac: avg, measured: meas } : tot[j]!;
      const parts = is60
        ? ok60.length ? ok60.map(f60).join(", ") : "—"
        : u.parts.length ? u.parts.map(([a, c]) => `${fmtF(a)}–${fmtF(c)}`).join(", ") : "—";
      const span = g[1] - g[0];
      const bar = u.measured < 0.999
        ? '<div class="bar na" title="Partly outside the sweep"></div>'
        : is60
          ? `<div class="bar na">${segs.map((c, i) => `<span style="left:${((c[0] - g[0]) / span) * 100}%;width:${Math.max(1.5, ((c[1] - c[0]) / span) * 100)}%;background:${tot[i]!.frac > 0.995 ? OK : BAD}"></span>`).join("")}</div>`
          : `<div class="bar">${u.parts.map(([a, c]) => `<span style="left:${((a - g[0]) / span) * 100}%;width:${Math.max(1, ((c - a) / span) * 100)}%"></span>`).join("")}</div>`;
      const lbl = is60 ? `4 channels + 1 segment (${ok60.length}/${segs.length} usable)` : MODES[g[2]].label;
      h += `<tr>${j === 0 ? `<td rowspan="${showSegs.length}"><b>${b.name}</b><br>${pill}</td>` : ""}<td><span style="color:${MODES[g[2]].color}">■</span> ${lbl}</td>
        <td class="num">${is60 ? `${g[0].toFixed(4)}–${g[1].toFixed(4)}` : `${fmtF(g[0])}–${fmtF(g[1])}`}</td><td class="num">${parts}${u.measured < 0.999 ? ' <span class="warn">(partly outside sweep)</span>' : ""}</td><td>${bar}</td></tr>`;
    });
  }
  $("#bandTable").innerHTML = h + "</table>";

  interface Row { f: number; s: number; kind: string; col: string; clipped?: boolean; manual?: boolean }
  const pts: Row[] = [
    ...an.crossings.map((c): Row => ({ f: c.f, s: s.thr, kind: c.dir === "down" ? `Drops below ${s.thr}` : `Rises above ${s.thr}`, col: "#ff9a94" })),
    ...an.extrema.map((e): Row => ({ f: e.f, s: e.s, kind: e.type === "dip" ? "Dip (best match)" : "Peak", col: e.type === "dip" ? OK : "#f2cc60", clipped: e.clipped })),
    ...state.manual.map((m): Row => ({ f: m, s: swrHere(m), kind: "Pinned", col: "#fff", manual: true })),
  ].sort((a, b) => a.f - b.f);
  let p = '<table class="pts"><tr><th>Frequency (MHz)</th><th>SWR</th><th>Point</th><th>Band</th><th></th></tr>';
  for (const q of pts) {
    const band = bandAt(q.f);
    p += `<tr><td class="num">${fmtF(q.f)}</td><td class="num">${q.clipped ? "≥ " + s.top : q.s.toFixed(2)}</td><td style="color:${q.col}">${q.kind}</td><td>${band ? band.name : ""}</td>
      <td>${q.manual ? `<button data-del="${q.f}">remove</button>` : ""}</td></tr>`;
  }
  $("#ptTable").innerHTML = p + "</table>";
  $("#ptTable").querySelectorAll<HTMLButtonElement>("[data-del]").forEach((b) => {
    b.onclick = () => { state.manual = state.manual.filter((m) => m !== +b.dataset["del"]!); refresh(); };
  });
}

function renderRefs(): void {
  $("#refs").innerHTML = state.refs.map((r, j) => `<span>${r.f} MHz <i data-j="${j}">×</i></span>`).join("") +
    (state.refs.length === 1 ? ' <span style="border:none;background:none">add one more…</span>' : "");
  $("#refs").querySelectorAll<HTMLElement>("i").forEach((el) => {
    el.onclick = () => { state.refs.splice(+el.dataset["j"]!, 1); applyRefs(); refresh(); };
  });
}

/* ---------------- NanoVNA ---------------- */

let serial: SerialLike | string = "";
let vna: NanoVNA | null = null, vnaRange: Range | null = null, live = false, sweeping = false;
const mhz = (hz: number): number => +(hz / 1e6).toFixed(6);

function vnaNote(text: string): void {
  for (const sel of ["#vnaNote", "#landNote"]) { const el = $(sel); el.textContent = text; el.classList.toggle("hidden", !text); }
}

function syncVna(): void {
  $("#vnaBtn").textContent = vna ? "Disconnect" : "Connect NanoVNA";
  $("#vnaBtn").classList.toggle("wide", !vna);
  for (const sel of ["#vnaPanel", "#sweepBtn", "#liveBtn"]) $(sel).classList.toggle("hidden", !vna);
  syncLanding();
  $("#liveBtn").textContent = live ? "Hold" : "Live";
  $("#liveBtn").classList.toggle("on", live);
  $<HTMLButtonElement>("#sweepBtn").disabled = live;
  if (vna && vnaRange) {
    const r = vnaRange;
    $("#vnaInfo").textContent = `${vna.info.board} · firmware ${vna.info.version} · ${mhz(r.start)}–${mhz(r.stop)} MHz, ${r.points} points`;
  }
}

async function connectVna(): Promise<void> {
  if (typeof serial === "string") { vnaNote(serial); return; }
  try {
    const link = await connectPort(serial);
    if (!link) return;
    vna = await NanoVNA.open(link, (line) => console.info("[NanoVNA]", line));
    console.info("[NanoVNA]", vna.info);
    vnaRange = await vna.range();
    const slot = $<HTMLSelectElement>("#vnaSlot");
    slot.innerHTML = '<option value="">As set</option>' +
      Array.from({ length: vna.info.slots }, (_, i) => `<option value="${i}">Slot ${i}</option>`).join("");
    vnaNote("");
    syncVna();
    await sweepOnce();
  } catch (e) {
    vnaFail(e);
  }
}

async function disconnectVna(): Promise<void> {
  live = false;
  const v = vna;
  vna = vnaRange = null;
  syncVna();
  await v?.close();
}

function vnaFail(e: unknown): void {
  live = false;
  console.error("[NanoVNA]", e);
  vnaNote(e instanceof Error ? e.message : String(e));
  if (!(e instanceof VnaError) || e.closed) void disconnectVna();
  syncVna();
}

/** Sweep the device's range once and show it. */
async function sweepOnce(): Promise<void> {
  if (!vna || !vnaRange) return;
  const dev = vna, r = vnaRange, scan = await dev.scan(r);
  // Disconnected, or a recall changed the range, while it swept.
  if (vna !== dev || vnaRange !== r) return;
  if (scan.hz.length < 2) throw new VnaError("The sweep came back empty.");
  const name = `nanovna-${mhz(r.start)}-${mhz(r.stop)}mhz.s1p`, text = toTouchstone(scan, dev.info.board);
  const repeat = state.source === "vna" && state.s1p?.name === name;
  const blob = new Blob([text], { type: "text/plain" });
  if (repeat) void store.set("file", { blob, name });
  else { showFileName(name); saveFile(blob, name); }
  setTouchstone(text, name, "vna", repeat);
}

async function runLive(): Promise<void> {
  live = true;
  syncVna();
  try {
    while (live && vna) {
      await sweepOnce();
      // Let the page draw and take clicks between sweeps, even when a reply arrives at once.
      await new Promise((r) => setTimeout(r, 0));
    }
  } catch (e) {
    vnaFail(e);
  }
  live = false;
  syncVna();
}

/* ---------------- Glue ---------------- */

/** Nothing loaded and no NanoVNA connected: show the landing instead of the page. */
function syncLanding(): void {
  const empty = !state.source && !vna, body = document.body;
  if (empty === body.classList.contains("no-data")) return;
  const hero = $("#hero"), name = $("header h1 .art");
  // The name flies between the hero and the header: measure where it is,
  // switch, measure where it lands, and play the move back from the start.
  const from = (empty ? name : hero).getBoundingClientRect();
  body.classList.toggle("no-data", empty);
  flyFrom(empty ? hero : name, from);
  if (!empty) {
    $("header .sub").animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], { duration: FLY_MS });
    // The page was not laid out while hidden.
    requestAnimationFrame(() => { layoutPhoto(); renderPhoto(); renderChart(); });
  }
}

const FLY_MS = 550;

/** Animate an element from where `from` was to where it is now. */
function flyFrom(el: HTMLElement, from: DOMRect): void {
  const to = el.getBoundingClientRect();
  if (document.body.classList.contains("booting") || !from.width || !to.width) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const s = from.width / to.width;
  el.animate(
    [{ transformOrigin: "0 0", transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${s})` },
     { transformOrigin: "0 0", transform: "none" }],
    { duration: FLY_MS, easing: "cubic-bezier(.2,.7,.2,1)" },
  );
}

function refresh(): void {
  recompute();
  syncLanding();
  state.an = runAnalysis();
  $("#photoEmpty").classList.toggle("hidden", !!state.src);
  photo.classList.toggle("hidden", !state.src);
  $("#straightBtn").classList.toggle("hidden", !state.src || state.photoCollapsed);
  $("#collapseBtn").classList.toggle("hidden", !state.src);
  $("#photoCard").classList.toggle("collapsed", !!(state.src && state.photoCollapsed));
  $("#collapseBtn").textContent = state.photoCollapsed ? "Expand" : "Collapse";
  $("#clearAll").classList.toggle("hidden", !state.source);
  $("#expS1p").classList.toggle("hidden", !state.s1p);
  $("#traceBtn").classList.toggle("primary", state.source === "image" && !state.trace?.v);
  renderPhoto(); renderChart(); renderChips(); renderTables(); renderRefs();
  // Preferences outlive a file: they survive Clear and apply to the next one.
  try {
    localStorage.setItem("swrfit", JSON.stringify({ cls: fld("#cls").value, thr: fld("#thr").value, mode: fld("#mode").value, prom: fld("#prom").value }));
  } catch { /* storage blocked: preferences are not remembered */ }
  scheduleSave();
}

function syncModeButtons(): void {
  $("#penBtn").classList.toggle("on", state.mode === "pen");
  $("#refBtn").classList.toggle("on", state.mode === "ref");
}

function setCollapsed(c: boolean): void {
  state.photoCollapsed = c;
  if (c) { state.mode = "idle"; syncModeButtons(); dragCorner = -1; hover = null; hoverF = null; }
  // Shown before it is measured: a collapsed card has no width to size the photo to.
  else { $("#photoCard").classList.remove("collapsed"); layoutPhoto(); }
  refresh();
}

function download(name: string, url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

const drop = $("#drop"), fileIn = $<HTMLInputElement>("#file"), DROP_HTML = drop.innerHTML;

/** Wire the page up and restore the last session. */
export function start(): void {
  // The scrollbar's reserved room, for the CSS that takes it out of the
  // right padding. Kept current across zoom and resize.
  const measureScrollbar = (): void =>
    document.documentElement.style.setProperty("--sb", `${window.innerWidth - document.documentElement.clientWidth}px`);
  measureScrollbar();
  window.addEventListener("resize", measureScrollbar);
  $("#version").textContent = APP_VERSION;
  $("#hero").textContent = $("header h1 .art").textContent;
  $("#lead").textContent = $("header .sub").textContent;
  $("#year").textContent = String(new Date().getFullYear());

  photo.addEventListener("pointerdown", (e) => {
    if (!state.src) return;
    const [x, y] = evImg(e);
    hover = [x, y];
    const hit = nearCorner(x, y);
    if (hit >= 0) { dragCorner = hit; photo.setPointerCapture(e.pointerId); renderPhoto(); return; }
    if (state.mode === "pen") { penLast = null; penApply(x, y); photo.setPointerCapture(e.pointerId); refresh(); return; }
    if (state.mode === "ref") {
      const [u] = vb(x, y);
      const f = parseFloat(prompt("Frequency at this point (MHz):") ?? "");
      if (Number.isFinite(f)) { state.refs.push({ u, f }); applyRefs(); }
      state.mode = "idle"; syncModeButtons(); refresh();
    }
  });
  photo.addEventListener("pointermove", (e) => {
    if (!state.src) return;
    const [x, y] = evImg(e);
    hover = [x, y];
    if (dragCorner >= 0 && state.corners) { state.corners[dragCorner] = [x, y]; updateH(); if (state.trace?.v) recompute(); state.an = runAnalysis(); }
    else if (state.mode === "pen" && e.buttons & 1 && penLast) { penApply(x, y); refresh(); return; }
    photo.style.cursor = nearCorner(x, y) >= 0 ? "grab" : "crosshair";
    const s = S();
    if (dragCorner < 0 && calOK(s) && state.trace) {
      const [u] = vb(x, y);
      hoverF = u >= 0 && u <= 1 ? s.start + u * (s.stop - s.start) : null;
    } else hoverF = null;
    renderPhoto(); renderChart();
  });
  photo.addEventListener("pointerup", () => {
    if (dragCorner >= 0) {
      dragCorner = -1;
      if (state.trace && state.trace.auto && !state.trace.edited) autoTrace();
      else if (state.trace) $("#retraceHint").classList.remove("hidden");
      refresh();
    }
    penLast = null;
  });
  photo.addEventListener("pointerleave", () => { if (dragCorner < 0) { hover = null; hoverF = null; renderPhoto(); renderChart(); } });

  chart.addEventListener("pointerdown", (e) => { if (!chGeom) return; chDrag = { x0: chX(e), x1: chX(e) }; chart.setPointerCapture(e.pointerId); });
  chart.addEventListener("pointermove", (e) => {
    const x = chX(e);
    hoverF = chGeom && x >= chGeom.x0 && x <= chGeom.x1 ? chF(chGeom, x) : null;
    if (chDrag) chDrag.x1 = x;
    renderChart(); renderPhoto();
  });
  chart.addEventListener("pointerup", () => {
    const g = chGeom;
    if (!chDrag || !g) return;
    const { x0, x1 } = chDrag;
    chDrag = null;
    if (Math.abs(x1 - x0) > 6) state.view = [chF(g, Math.min(x0, x1)), chF(g, Math.max(x0, x1))];
    else if (x0 >= g.x0 && x0 <= g.x1) {
      const f = chF(g, x0), tol = (6 * (g.hi - g.lo)) / (g.x1 - g.x0);
      const hit = state.manual.findIndex((m) => Math.abs(m - f) < tol);
      if (hit >= 0) state.manual.splice(hit, 1);
      else if (!Number.isNaN(swrHere(f))) state.manual.push(f);
    }
    refresh();
  });
  chart.addEventListener("pointerleave", () => { hoverF = null; renderChart(); renderPhoto(); });
  chart.addEventListener("dblclick", () => { state.view = null; refresh(); });

  $("#straightBtn").onclick = () => {
    if (!state.corners) return;
    state.straight = !state.straight;
    if (state.straight) buildRect();
    dragCorner = -1; hover = null; syncStraightBtn(); layoutPhoto(); refresh();
  };
  $("#gridBtn").onclick = () => {
    if (!state.src) return;
    const found = findGrid();
    if (found && state.straight) { buildRect(); layoutPhoto(); }
    if (found) {
      if (!state.trace || (state.trace.auto && !state.trace.edited)) autoTrace();
      else { $("#retraceHint").classList.remove("hidden"); refresh(); }
    } else refresh();
  };
  $("#collapseBtn").onclick = () => setCollapsed(!state.photoCollapsed);
  // Both work on the photo, so they bring it back if it was collapsed.
  $("#refBtn").onclick = () => {
    if (!state.src) return;
    if (state.photoCollapsed) setCollapsed(false);
    state.mode = state.mode === "ref" ? "idle" : "ref"; syncModeButtons();
  };
  $("#penBtn").onclick = () => {
    if (!state.src) return;
    if (state.photoCollapsed) setCollapsed(false);
    state.mode = state.mode === "pen" ? "idle" : "pen"; syncModeButtons();
  };
  $("#traceBtn").onclick = autoTrace;
  $("#clearBtn").onclick = () => { if (state.source === "image") { state.trace = null; refresh(); } };
  let sensTimer: ReturnType<typeof setTimeout> | undefined;
  fld("#sens").oninput = () => {
    clearTimeout(sensTimer);
    sensTimer = setTimeout(() => { if (state.trace && state.trace.auto && !state.trace.edited) autoTrace(); }, 150);
  };
  for (const sel of ["#fStart", "#fStop", "#swrTop", "#swrBot", "#thr", "#cls", "#mode", "#prom"]) {
    fld(sel).addEventListener("input", () => {
      if (sel === "#fStart" || sel === "#fStop") { state.view = null; state.sweepTyped = true; }
      refresh();
    });
  }

  $("#clearAll").onclick = clearAll;

  serial = serialApi();
  if (typeof serial === "string") {
    for (const sel of ["#vnaBtn", "#landConnect"]) $<HTMLButtonElement>(sel).disabled = true;
    vnaNote(serial);
  }
  // `make dev` at ?fake: a stand-in NanoVNA, for work without the device.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("fake")) {
    void import("@/vna-fake").then(({ FakeNanoVNA }) => {
      serial = new FakeNanoVNA({ noise: 0.004 }).serial();
      for (const sel of ["#vnaBtn", "#landConnect"]) $<HTMLButtonElement>(sel).disabled = false;
      vnaNote("");
    });
  }
  $("#vnaBtn").onclick = () => void (vna ? disconnectVna() : connectVna());
  $("#landConnect").onclick = () => void connectVna();
  $("#landOpen").onclick = () => fileIn.click();
  $("#sweepBtn").onclick = async () => {
    if (sweeping || live) return;
    sweeping = true;
    try { await sweepOnce(); } catch (e) { vnaFail(e); } finally { sweeping = false; }
  };
  $("#liveBtn").onclick = () => { if (live) { live = false; syncVna(); } else void runLive(); };
  fld("#vnaSlot").onchange = async () => {
    const v = fld("#vnaSlot").value;
    if (!vna || v === "") return;
    try {
      vnaRange = await vna.recall(+v);
      syncVna();
      if (!live) await sweepOnce();
    } catch (e) { vnaFail(e); }
  };
  window.addEventListener("pagehide", () => {
    if (state.source && !restoring) { clearTimeout(saveTimer); void store.set("session", snapshot()); }
  });
  drop.onclick = () => fileIn.click();
  fileIn.onchange = () => handleFile(fileIn.files?.[0]);
  for (const ev of ["dragenter", "dragover"]) document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); });
  for (const ev of ["dragleave", "drop"]) document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); });
  document.addEventListener("drop", (e) => handleFile(e.dataTransfer?.files[0]));
  document.addEventListener("paste", (e) => {
    const it = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
    if (it) handleFile(it.getAsFile());
  });
  window.addEventListener("resize", () => { layoutPhoto(); refresh(); });

  $("#expPhoto").onclick = () => {
    if (!state.src) return;
    const c = document.createElement("canvas");
    c.width = view().w;
    c.height = view().h;
    drawPhoto(c.getContext("2d")!, 1 / state.k, true);
    download("swr-overlay.png", c.toDataURL("image/png"));
  };
  $("#expChart").onclick = () => {
    const W = chart.clientWidth, Hh = chart.clientHeight, c = document.createElement("canvas");
    c.width = W * 2;
    c.height = Hh * 2;
    const saved = hoverF;
    hoverF = null;
    drawChart(c.getContext("2d")!, W, Hh, 2);
    hoverF = saved;
    download("swr-chart.png", c.toDataURL("image/png"));
  };
  $("#expS1p").onclick = () => {
    if (!state.s1p) return;
    download(state.s1p.name, URL.createObjectURL(new Blob([state.s1p.text], { type: "text/plain" })));
  };
  $("#expCsv").onclick = () => {
    const t = state.trace;
    if (!t) return;
    let csv = "freq_mhz,swr\n";
    for (let i = 0; i < t.N; i++) if (!Number.isNaN(t.s[i]) && !Number.isNaN(t.f[i])) csv += `${t.f[i]!.toFixed(6)},${t.s[i]!.toFixed(3)}\n`;
    download("swr-trace.csv", URL.createObjectURL(new Blob([csv], { type: "text/csv" })));
  };

  try {
    const p = JSON.parse(localStorage.getItem("swrfit") ?? "{}") as Record<string, string | undefined>;
    if (p["cls"]) fld("#cls").value = p["cls"];
    if (p["thr"]) fld("#thr").value = p["thr"];
    if (p["mode"]) fld("#mode").value = p["mode"];
    if (p["prom"]) fld("#prom").value = p["prom"];
  } catch { /* storage blocked: defaults stand */ }
  refresh();
  void restoreSession().finally(() => {
    document.body.classList.remove("booting");
    // Laid out while hidden, so lay it out again now it shows.
    layoutPhoto(); refresh();
  });
}

