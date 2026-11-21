/* What the Smith chart reads off S11: the impedance, the reactance as a
 * part, and the return loss. S11 between two points is the straight line
 * between them, as the chart draws it.
 */

import type { S11 } from "./touchstone";

/** S11 at f MHz, or null outside the sweep. */
export function s11At(g: S11, f: number): [number, number] | null {
  const n = g.f.length;
  if (!n || f < g.f[0]! || f > g.f[n - 1]!) return null;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (g.f[mid]! <= f) lo = mid; else hi = mid;
  }
  const span = g.f[hi]! - g.f[lo]!, t = span > 0 ? (f - g.f[lo]!) / span : 0;
  return [g.re[lo]! + t * (g.re[hi]! - g.re[lo]!), g.im[lo]! + t * (g.im[hi]! - g.im[lo]!)];
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
