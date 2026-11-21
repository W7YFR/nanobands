/* What the Smith chart reads off S11: the impedance, the reactance as a
 * part, and the return loss. S11 between two points is the straight line
 * between them, as the chart draws it. That is an estimate: `isEstimate`
 * says when it may be off by more than ESTIMATE_ERR.
 */

import type { S11 } from "./touchstone";

/** The readings around f: their indices and how far f is from the first,
 *  0 to 1. Null outside the sweep. */
function around(g: S11, f: number): { lo: number; hi: number; t: number } | null {
  const n = g.f.length;
  if (!n || f < g.f[0]! || f > g.f[n - 1]!) return null;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (g.f[mid]! <= f) lo = mid; else hi = mid;
  }
  const span = g.f[hi]! - g.f[lo]!;
  return { lo, hi, t: span > 0 ? (f - g.f[lo]!) / span : 0 };
}

/** S11 at f MHz, or null outside the sweep. */
export function s11At(g: S11, f: number): [number, number] | null {
  const a = around(g, f);
  if (!a) return null;
  const { lo, hi, t } = a;
  return [g.re[lo]! + t * (g.re[hi]! - g.re[lo]!), g.im[lo]! + t * (g.im[hi]! - g.im[lo]!)];
}

/** How far apart two estimates of the impedance may be, as a share of it,
 *  before the readout marks the value as an estimate. */
export const ESTIMATE_ERR = 0.01;

/** Whether the impedance at f is an estimate that may be off by more than
 *  ESTIMATE_ERR: f falls between two readings, and the straight line between
 *  them and a turn along the arc between them give impedances further apart
 *  than that. Their gap grows with the angle between the readings and with
 *  |S11|: at 10° it is 0.5% at |S11| 0.5 but 3.5% at 0.9. */
export function isEstimate(g: S11, f: number): boolean {
  const a = around(g, f);
  if (!a || a.t === 0 || a.t === 1) return false;
  const { lo, hi, t } = a;
  const ml = Math.hypot(g.re[lo]!, g.im[lo]!), mh = Math.hypot(g.re[hi]!, g.im[hi]!);
  const al = Math.atan2(g.im[lo]!, g.re[lo]!);
  let da = Math.atan2(g.im[hi]!, g.re[hi]!) - al;
  da -= 2 * Math.PI * Math.round(da / (2 * Math.PI));
  const m = ml + t * (mh - ml), an = al + t * da;
  const [r1, x1] = impedance(g.re[lo]! + t * (g.re[hi]! - g.re[lo]!), g.im[lo]! + t * (g.im[hi]! - g.im[lo]!), g.z0);
  const [r2, x2] = impedance(m * Math.cos(an), m * Math.sin(an), g.z0);
  if (!Number.isFinite(r1) || !Number.isFinite(r2)) return true;
  return Math.hypot(r1 - r2, x1 - x2) > ESTIMATE_ERR * Math.hypot(r1, x1);
}

/** `g` with its S11 measured against reference impedance z0 instead of its own. */
export function renormalize(g: S11, z0: number): S11 {
  if (g.z0 === z0) return g;
  const re: number[] = [], im: number[] = [];
  g.f.forEach((_, i) => {
    const [r, x] = impedance(g.re[i]!, g.im[i]!, g.z0);
    if (!Number.isFinite(r)) { re.push(1); im.push(0); return; }
    // S11 = (Z - z0) / (Z + z0).
    const d = (r + z0) ** 2 + x * x;
    re.push((r * r - z0 * z0 + x * x) / d); im.push((2 * z0 * x) / d);
  });
  return { f: g.f, re, im, z0 };
}

/** The impedance R + jX in ohms for S11 `re` + j`im`, at reference impedance z0. */
export function impedance(re: number, im: number, z0: number): [number, number] {
  const d = (1 - re) ** 2 + im ** 2;
  if (d === 0) return [Infinity, 0];
  return [(z0 * (1 - re * re - im * im)) / d, (z0 * 2 * im) / d];
}

/** Reactance X ohms at f MHz as the part that has it: an inductance in nH,
 *  or a capacitance in pF. */
export function reactancePart(x: number, f: number): { kind: "L" | "C"; value: number } {
  const w = 2 * Math.PI * f * 1e6;
  return x >= 0 ? { kind: "L", value: (x / w) * 1e9 } : { kind: "C", value: (-1 / (w * x)) * 1e12 };
}

/** The return loss in dB for |S11| `mag`. */
export const returnLoss = (mag: number): number => -20 * Math.log10(mag);
