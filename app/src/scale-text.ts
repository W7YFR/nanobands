/* The SWR scale, out of the text OCR read off the screen.
 *
 * The NanoVNA's plot is eight divisions tall, and its scale and reference
 * line are both set on the device, so neither end is fixed. Two things on the
 * screen give the scale:
 *
 * - The labels down the right edge of the plot, such as `3`, `2.75` … `1.25`.
 *   Each sits by a grid line, so labels on two or more lines give the SWR at
 *   the top and the bottom.
 * - The header, such as `S11 SWR 250m/`: SWR per division, without where the
 *   scale starts. OCR reads SWR as `SUR` or `TSWR`, and `m/` as `n/`, `mn/`,
 *   `ms` or `m`.
 *
 * OCR misreads some labels, so a fit keeps the labels that agree on one
 * scale and drops the rest.
 */

import { cleanFreq } from "./sweep-text";

export const DIVISIONS = 8;

/** A number OCR read by the plot, and its height on the plot: 0 at the top line, 1 at the bottom. */
export interface AxisLabel {
  /** What it may say. OCR can drop a decimal point, so `45` may be 4.5 or 0.45. */
  values: number[];
  v: number;
}

/** The SWR at the top and the bottom line of the plot. */
export interface SwrScale {
  top: number;
  bot: number;
}

/** SWR per division from the header, or null when the header was not read. */
export function parsePerDivision(text: string): number | null {
  const m = text.toUpperCase().match(/S[WU]R\W*([0-9OQDAB@Ø][0-9OQDAB@Ø.]*)\s*([MN]*)/);
  if (!m?.[1]) return null;
  const n = cleanFreq(m[1]);
  // The unit letter can be lost. A whole number of 10 or more is in
  // thousandths, as 125 for 125m; a 1–100 scale shows 12.38, with a point.
  const per = m[2] || (n >= 10 && !m[1].includes(".")) ? n / 1000 : n;
  return per >= 0.001 && per <= 20 ? per : null;
}

/** What a label may say. OCR can drop its point: `2125` may be 2.125. */
function labelValues(t: string): number[] {
  const n = cleanFreq(t);
  if (t.includes(".") || t.length < 2) return [n];
  return t.length < 4 ? [n, n / 10, n / 100] : [n, n / 10, n / 100, n / 1000];
}

/** The labels OCR read in the label column, squared up (see screen-parts.ts):
 *  `top` and `bottom` are the plot heights of the column's first and last
 *  rows, and `height` its height in pixels. */
export function columnLabels(
  words: readonly { symbols: readonly { text: string; bbox: { y0: number; y1: number } }[] }[],
  top: number, bottom: number, height: number,
): AxisLabel[] {
  const out: AxisLabel[] = [];
  for (const w of words) {
    const t = w.symbols.map((y) => y.text).join("");
    if (!/^\d+(\.\d+)?$/.test(t)) continue;
    const y = w.symbols.reduce((a, b) => a + (b.bbox.y0 + b.bbox.y1) / 2, 0) / w.symbols.length;
    out.push({ v: top + ((bottom - top) * y) / height, values: labelValues(t) });
  }
  return out;
}

/** The scale from labels that sit a fixed way off their grid lines. The
 *  NanoVNA draws each label a little under its line; the offset is learned
 *  from the labels themselves, then each is put back on its line. */
export function fitColumn(labels: readonly AxisLabel[], per: number | null): SwrScale | null {
  if (!labels.length) return null;
  let c = 0, s = 0;
  for (const l of labels) {
    const a = 2 * Math.PI * l.v * DIVISIONS;
    c += Math.cos(a);
    s += Math.sin(a);
  }
  const off = Math.atan2(s, c) / (2 * Math.PI) / DIVISIONS;
  return fitScale(labels.map((l) => ({ ...l, v: l.v - off })), per);
}

/** The words that read as numbers by the plot's right edge, with their heights.
 *  `back` takes a photo point to the plot, where u runs 0 to 1 left to right. */
export function axisLabels(
  words: readonly { text: string; box: { x0: number; y0: number; x1: number; y1: number } }[],
  back: (x: number, y: number) => [number, number],
): AxisLabel[] {
  const out: AxisLabel[] = [];
  for (const w of words) {
    const t = w.text.replace(/[,:;]/g, ".");
    if (!/^[0-9OQD]+(\.[0-9OQD]+)?$/i.test(t)) continue;
    const [u, v] = back((w.box.x0 + w.box.x1) / 2, (w.box.y0 + w.box.y1) / 2);
    if (u < 0.8 || u > 1.1 || v < -0.06 || v > 1.06) continue;
    out.push({ v, values: labelValues(t) });
  }
  return out;
}

/** The scale most labels agree on. A label belongs to the grid line nearest
 *  it. Two labels on different lines give a scale; the one that labels on
 *  the most lines fit wins, and the header's SWR per division breaks a tie.
 *  It needs labels on three lines to agree, or on two that agree with the
 *  header. */
export function fitScale(labels: readonly AxisLabel[], per: number | null): SwrScale | null {
  const on = labels
    .map((l) => ({ values: l.values.filter((x) => x > 0), n: Math.round(l.v * DIVISIONS), off: Math.abs(l.v * DIVISIONS - Math.round(l.v * DIVISIONS)) }))
    .filter((l) => l.off < 0.4 && l.values.length);
  const near = (x: number, y: number): boolean => Math.abs(x - y) <= 0.005 * Math.max(1, Math.abs(y));
  const fits = (a: number, d: number, l: { values: number[]; n: number }): boolean => l.values.some((x) => near(a + l.n * d, x));
  const agrees = (d: number): boolean => per !== null && near(-d, per);
  let best: { a: number; d: number; lines: number; agrees: boolean } | null = null;
  for (const p of on) {
    for (const q of on) {
      if (q.n <= p.n) continue;
      for (const pv of p.values) {
        for (const qv of q.values) {
          const d = (qv - pv) / (q.n - p.n), a = pv - p.n * d;
          // SWR falls from the top line to the bottom.
          if (d >= 0) continue;
          const c = { a, d, lines: new Set(on.filter((l) => fits(a, d, l)).map((l) => l.n)).size, agrees: agrees(d) };
          if (!best || c.lines > best.lines || (c.lines === best.lines && c.agrees && !best.agrees)) best = c;
        }
      }
    }
  }
  if (!best) return null;
  if (best.lines < 3 && !(best.lines === 2 && best.agrees)) return null;
  // The screen rounds its labels, 2.313 for 2.3125, so fit a line through
  // every label that agrees, not just the two that found the scale.
  const b = best, pts: [number, number][] = [];
  for (const l of on) {
    const x = l.values.find((x) => near(b.a + l.n * b.d, x));
    if (x !== undefined) pts.push([l.n, x]);
  }
  let { a, d } = best;
  if (pts.length >= 2) {
    const mn = pts.reduce((s, p) => s + p[0], 0) / pts.length, mx = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    let sxy = 0, sxx = 0;
    for (const [n, x] of pts) { sxy += (n - mn) * (x - mx); sxx += (n - mn) ** 2; }
    if (sxx > 0) { d = sxy / sxx; a = mx - d * mn; }
  }
  // To what the labels can tell: two decimals on a span near 1, one near 100.
  const top = a, bot = a + DIVISIONS * d, places = Math.max(0, 2 - Math.floor(Math.log10(top - bot)));
  const r = (x: number): number => +x.toFixed(places);
  return { top: r(top), bot: r(bot) };
}
