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
  // The unit letter can be lost. No scale is 10 or more per division, so a
  // number that large is in thousandths.
  const per = m[2] || n >= 10 ? n / 1000 : n;
  return per >= 0.001 && per <= 10 ? per : null;
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
    const n = cleanFreq(t);
    out.push({ values: t.includes(".") || t.length < 2 ? [n] : [n, n / 10, n / 100], v });
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
  const r = (x: number): number => +x.toFixed(4);
  return { top: r(best.a), bot: r(best.a + DIVISIONS * best.d) };
}
