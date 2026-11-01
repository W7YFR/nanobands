/* The page's data: what is loaded, what was done to it, and the settings it is
 * read with. Plain types and functions, no React, so the drawing modules and
 * the components share one description of it.
 */

import { analyze, swrAt, type Analysis } from "@/analysis";
import { MODE_NAMES, bandAt, segmentAt, type Band, type LicenseClass, type OperatingMode, type Segment } from "@/bands";
import { mappingFor, type Mapping, type Point, type Quad } from "@/geometry";
import type { Pixels } from "@/pixels";
import { rectify, type Rectified } from "@/rectify";

/** A loaded photo: a working copy at most 4000 px on its long side, and its pixels. */
export interface Photo {
  src: HTMLCanvasElement;
  px: Pixels;
  w: number;
  h: number;
}

/** The curve. A photo's is a position down the plot per column; a file's or a
 *  sweep's is frequency and SWR per point. */
export type Trace =
  | { kind: "photo"; N: number; v: Float32Array; auto: boolean; edited: boolean }
  | { kind: "data"; N: number; f: Float64Array; s: Float64Array };

/** What the text recognition said about the sweep. */
export type OcrNote =
  | { kind: "looking" }
  | { kind: "read"; start: number; stop: number; raw: string; scale?: { top: number; bot: number } }
  | { kind: "offer"; start: number; stop: number; raw: string }
  | { kind: "none" }
  | { kind: "failed" };

export type GridNote = { kind: "found"; horizontal: number; vertical: number } | { kind: "missing" };

/** The calibration fields, as typed. They belong to the loaded file. */
export interface Fields {
  start: string;
  stop: string;
  top: string;
  bot: string;
  sens: string;
}

export const DEFAULT_FIELDS: Fields = { start: "", stop: "", top: "5", bot: "1", sens: "70" };

/** How the curve is read, and how the page shows it. These outlive a file: they survive Clear. */
export interface Prefs {
  thr: string;
  cls: LicenseClass;
  mode: OperatingMode;
  prom: string;
  /** The frequency to check, in MHz. */
  freq: string;
  /** Whether the Key points table is open. It starts closed. */
  points: boolean;
  /** Which bands the Band segments table lists: all of them, or only those with a usable part. */
  bands: "all" | "usable";
}

export const DEFAULT_PREFS: Prefs = { thr: "3", cls: "G", mode: "any", prom: "0.2", freq: "", points: false, bands: "all" };

/** Everything about the loaded file. Clear resets it to EMPTY_DOC. */
export interface Doc {
  source: "image" | "s1p" | "vna" | null;
  fileName: string | null;
  photo: Photo | null;
  corners: Quad | null;
  straight: boolean;
  trace: Trace | null;
  /** The Touchstone text behind the data, for the .s1p export. */
  s1p: { text: string; name: string } | null;
  /** Points of known frequency on the photo, to solve the sweep from. */
  refs: { u: number; f: number }[];
  /** Pinned frequencies. */
  manual: number[];
  /** Chart zoom, [lo, hi] in MHz. */
  view: [number, number] | null;
  collapsed: boolean;
  /** The user typed the sweep, so text recognition offers its reading instead of using it. */
  sweepTyped: boolean;
  /** The corners moved after a hand-edited trace, so a new trace is suggested. */
  retrace: boolean;
  fields: Fields;
  grid: GridNote | null;
  ocr: OcrNote | null;
}

export const EMPTY_DOC: Doc = {
  source: null, fileName: null, photo: null, corners: null, straight: false, trace: null, s1p: null,
  refs: [], manual: [], view: null, collapsed: false, sweepTyped: false, retrace: false,
  fields: DEFAULT_FIELDS, grid: null, ocr: null,
};

/** The numbers the drawing and the analysis work with. */
export interface Settings {
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

export function settingsOf(f: Fields, p: Prefs): Settings {
  return {
    start: parseFloat(f.start), stop: parseFloat(f.stop),
    top: parseFloat(f.top) || 5, bot: parseFloat(f.bot) || 1,
    thr: parseFloat(p.thr) || 3, cls: p.cls, mode: p.mode,
    prom: Math.max(0.01, parseFloat(p.prom) || 0.2), sens: +f.sens,
  };
}

export const calOK = (s: Settings): boolean => Number.isFinite(s.start) && Number.isFinite(s.stop) && s.stop > s.start;

/** Frequency and SWR per point. A photo's come from the sweep and scale settings. */
export interface Curve {
  N: number;
  f: Float64Array;
  s: Float64Array;
}

export function curveOf(t: Trace | null, s: Settings): Curve | null {
  if (!t) return null;
  if (t.kind === "data") return t;
  const f = new Float64Array(t.N), w = new Float64Array(t.N);
  for (let i = 0; i < t.N; i++) {
    f[i] = calOK(s) ? s.start + ((i + 0.5) / t.N) * (s.stop - s.start) : NaN;
    w[i] = Number.isNaN(t.v[i]) ? NaN : s.top + t.v[i]! * (s.bot - s.top);
  }
  return { N: t.N, f, s: w };
}

export function analysisOf(c: Curve | null, s: Settings): Analysis | null {
  if (!c || !calOK(s)) return null;
  return analyze(c.f, c.s, { thr: s.thr, prom: s.prom, top: s.top });
}

export const swrOn = (c: Curve | null, fq: number): number => (c ? swrAt(c.f, c.s, fq) : NaN);

/** A chart view of lo–hi, kept inside the sweep and no narrower than a
 *  2000th of it. The whole sweep is no zoom at all, so null. */
export function fitView(an: Analysis, lo: number, hi: number): [number, number] | null {
  const full = an.fmax - an.fmin, span = Math.max(hi - lo, full / 2000);
  if (span >= full * 0.999) return null;
  const a = Math.min(Math.max(lo, an.fmin), an.fmax - span);
  return [a, a + span];
}

/** Whether two chart views are the same. null is the full sweep. */
export function sameView(a: [number, number] | null, b: [number, number] | null): boolean {
  return (!a && !b) || !!(a && b && Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9);
}

/** A chart view of one band: the band with 35% of its width on each side.
 *  A band chip and a row of the Band segments table show it. */
export function bandView(an: Analysis, b: Band): [number, number] {
  const pad = Math.max((b.hi - b.lo) * 0.35, 0.02);
  return [Math.max(an.fmin, b.lo - pad), Math.min(an.fmax, b.hi + pad)];
}

/** A band picked from the Band segments table: its view, and the view before it. */
export interface Picked { view: [number, number]; before: [number, number] | null }

/** A click on a band's row. The chart shows the band, and keeps the view
 *  from before it. A click on the band the chart shows goes back to that
 *  view, or to the full sweep when no row picked the band. */
export function pickBand(view: [number, number] | null, picked: Picked | null, bv: [number, number]): { view: [number, number] | null; picked: Picked | null } {
  if (sameView(view, bv)) return { view: picked && sameView(picked.view, bv) ? picked.before : null, picked: null };
  // From one picked band to the next, the view before stays the first one's.
  const before = picked && sameView(view, picked.view) ? picked.before : view;
  return { view: bv, picked: { view: bv, before } };
}

/** A segment's bar, piece by piece: usable or not, low to high. */
export function barPieces(lo: number, hi: number, parts: readonly (readonly [number, number])[]): { lo: number; hi: number; ok: boolean }[] {
  const out: { lo: number; hi: number; ok: boolean }[] = [];
  let at = lo;
  for (const [a, b] of [...parts].sort((x, y) => x[0] - y[0])) {
    if (a > at) out.push({ lo: at, hi: a, ok: false });
    out.push({ lo: a, hi: b, ok: true });
    at = b;
  }
  if (hi > at) out.push({ lo: at, hi, ok: false });
  return out;
}

/** A chart view around f: its band with a quarter of the band's width on
 *  each side, or a 20th of the sweep centered on f outside the bands. */
export function viewAround(an: Analysis, f: number): [number, number] | null {
  const b = bandAt(f);
  if (b) {
    const pad = (b.hi - b.lo) / 4;
    return fitView(an, b.lo - pad, b.hi + pad);
  }
  const half = (an.fmax - an.fmin) / 40;
  return fitView(an, f - half, f + half);
}

/** What the curve and the band plan say about one frequency. */
export interface FreqCheck {
  f: number;
  /** The SWR at f. NaN where the sweep has no reading. */
  swr: number;
  /** The SWR is at the top of the scale, so its real value is unknown. */
  clipped: boolean;
  band: Band | undefined;
  /** The segment at f that the license class may use in the mode. */
  seg: Segment | undefined;
  /** Why the band plan rules f out. Null when it allows f. */
  why: string | null;
  /** The SWR is known and at or under Max SWR, and f is in a segment. */
  ok: boolean;
}

export function checkAt(c: Curve | null, s: Settings, f: number): FreqCheck {
  const swr = calOK(s) ? swrOn(c, f) : NaN;
  const band = bandAt(f), seg = segmentAt(f, s);
  const licensed = !!band?.priv[s.cls].some((g) => f >= g[0] && f <= g[1]);
  const why = seg ? null
    : !band ? "Not in an amateur band"
    : licensed ? `No ${MODE_NAMES[s.mode]} privileges here for this license class`
    : "No privileges here for this license class";
  return { f, swr, clipped: swr >= s.top - 0.03, band, seg, why, ok: !!seg && swr <= s.thr };
}

/* ---------------- The photo's views ---------------- */

/** The straightened copy, as a canvas. */
export interface Rect extends Rectified {
  cv: HTMLCanvasElement;
}

export function rectOf(photo: Photo, corners: Quad): Rect {
  const r = rectify(photo.px, mappingFor(corners).fwd, corners);
  const cv = document.createElement("canvas");
  cv.width = r.W;
  cv.height = r.H;
  cv.getContext("2d")!.putImageData(new ImageData(r.data as Uint8ClampedArray<ArrayBuffer>, r.W, r.H), 0, 0);
  return { ...r, cv };
}

/** The photo as it is shown: as taken, or straightened. `vf` takes plot
 *  coordinates (u across, v down, 0 to 1) to view pixels; `vb` goes back. */
export interface View {
  src: HTMLCanvasElement;
  w: number;
  h: number;
  straight: boolean;
  vf(u: number, v: number): Point;
  vb(x: number, y: number): Point;
}

export function viewOf(photo: Photo, map: Mapping | null, rect: Rect | null): View {
  if (rect) {
    return {
      src: rect.cv, w: rect.W, h: rect.H, straight: true,
      vf: (u, v) => [rect.mx + u * rect.pw, rect.my + v * rect.ph],
      vb: (x, y) => [(x - rect.mx) / rect.pw, (y - rect.my) / rect.ph],
    };
  }
  return {
    src: photo.src, w: photo.w, h: photo.h, straight: false,
    vf: (u, v) => (map ? map.fwd(u, v) : [u * photo.w, v * photo.h]),
    vb: (x, y) => (map ? map.back(x, y) : [x / photo.w, y / photo.h]),
  };
}

/** The four corners a new photo starts with, before the grid is found. */
export const defaultCorners = (w: number, h: number): Quad =>
  [[w * 0.1, h * 0.1], [w * 0.9, h * 0.1], [w * 0.9, h * 0.9], [w * 0.1, h * 0.9]];

/** Draw an image into a working copy and read its pixels. */
export function photoFrom(im: HTMLImageElement): Photo {
  const sc = Math.min(1, 4000 / Math.max(im.naturalWidth, im.naturalHeight));
  const w = Math.round(im.naturalWidth * sc), h = Math.round(im.naturalHeight * sc);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(im, 0, 0, w, h);
  return { src: c, px: x.getImageData(0, 0, w, h), w, h };
}

export function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = URL.createObjectURL(blob);
  });
}
