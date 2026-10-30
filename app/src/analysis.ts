/* What an SWR curve says: where it crosses the maximum, the stretches under
 * it, and its dips and peaks.
 */

import type { Segment } from "./bands";

export interface Crossing {
  f: number;
  /** `down` drops under the maximum, `up` rises over it. */
  dir: "down" | "up";
}

export interface Extremum {
  f: number;
  s: number;
  type: "dip" | "peak";
  /** A peak at the top of the screen's scale, so its real SWR is unknown. */
  clipped: boolean;
}

export interface Analysis {
  crossings: Crossing[];
  /** Stretches where SWR stays at or under the maximum, [lo, hi] in MHz. */
  usable: [number, number][];
  extrema: Extremum[];
  fmin: number;
  fmax: number;
}

export interface AnalysisOptions {
  /** The maximum SWR. */
  thr: number;
  /** Dips and peaks smaller than this are ignored. */
  prom: number;
  /** The top of the scale, for telling a clipped peak. */
  top: number;
}

/** Analyze SWR `w` at frequencies `f`. NaN in either marks a gap. */
export function analyze(f: ArrayLike<number>, w: ArrayLike<number>, o: AnalysisOptions): Analysis | null {
  const n = f.length, T = o.thr;
  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (!Number.isNaN(w[i]) && !Number.isNaN(f[i])) idx.push(i);
  if (!idx.length) return null;

  const crossings: Crossing[] = [], usable: [number, number][] = [];
  let open: number | null = null, pf: number | null = null, ps = 0;
  for (let i = 0; i < n; i++) {
    const fi = f[i]!, wi = w[i]!;
    if (Number.isNaN(wi) || Number.isNaN(fi)) {
      if (open !== null && pf !== null) { usable.push([open, pf]); open = null; }
      pf = null;
      continue;
    }
    const ok = wi <= T;
    if (pf === null) { if (ok) open = fi; }
    else if (ok !== (ps <= T)) {
      const fx = pf + ((T - ps) * (fi - pf)) / (wi - ps);
      crossings.push({ f: fx, dir: ok ? "down" : "up" });
      if (ok) open = fx;
      else { if (open !== null) usable.push([open, fx]); open = null; }
    }
    pf = fi; ps = wi;
  }
  if (open !== null && pf !== null) usable.push([open, pf]);

  // Dips and peaks: a zig-zag with hysteresis equal to the minimum prominence.
  const ext: { i: number; type: "dip" | "peak" }[] = [], h = o.prom;
  if (idx.length > 2) {
    let maxI = idx[0]!, minI = idx[0]!, trend = 0;
    for (const i of idx.slice(1)) {
      const x = w[i]!;
      if (trend === 0) {
        if (x > w[maxI]!) maxI = i;
        if (x < w[minI]!) minI = i;
        if (w[maxI]! - x >= h) { ext.push({ i: maxI, type: "peak" }); trend = -1; minI = i; }
        else if (x - w[minI]! >= h) { ext.push({ i: minI, type: "dip" }); trend = 1; maxI = i; }
      } else if (trend === 1) {
        if (x > w[maxI]!) maxI = i;
        else if (w[maxI]! - x >= h) { ext.push({ i: maxI, type: "peak" }); trend = -1; minI = i; }
      } else {
        if (x < w[minI]!) minI = i;
        else if (x - w[minI]! >= h) { ext.push({ i: minI, type: "dip" }); trend = 1; maxI = i; }
      }
    }
  }
  const first = idx[0]!, last = idx[idx.length - 1]!;
  const edge = Math.max(2, Math.round(n * 0.006));
  const extrema = ext
    .filter((e) => e.i > first + edge && e.i < last - edge)
    .map((e): Extremum => {
      // A flat-topped (clipped) peak reports the middle of its plateau.
      const we = w[e.i]!;
      let a = e.i, b = e.i;
      while (a > 0 && Math.abs(w[a - 1]! - we) < 1e-6) a--;
      while (b < n - 1 && Math.abs(w[b + 1]! - we) < 1e-6) b++;
      const i = Math.round((a + b) / 2);
      return { f: f[i]!, s: we, type: e.type, clipped: e.type === "peak" && we >= o.top - 0.03 };
    });
  return { crossings, usable, extrema, fmin: f[first]!, fmax: f[last]! };
}

/** SWR at `fq`, interpolated between the two nearest points. NaN outside. */
export function swrAt(f: ArrayLike<number>, s: ArrayLike<number>, fq: number): number {
  const n = f.length;
  if (!n || fq < f[0]! || fq > f[n - 1]!) return NaN;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (f[m]! <= fq) lo = m;
    else hi = m;
  }
  return s[lo]! + ((s[hi]! - s[lo]!) * (fq - f[lo]!)) / (f[hi]! - f[lo]! || 1);
}

export interface SegmentUse {
  /** The usable parts of the segment. */
  parts: [number, number][];
  /** How much of the segment is usable, 0..1. */
  frac: number;
  /** How much of the segment the sweep covers, 0..1. */
  measured: number;
}

export function segUsable(seg: Segment, an: Analysis): SegmentUse {
  const [lo, hi] = seg, parts: [number, number][] = [];
  for (const [a, b] of an.usable) {
    const x = Math.max(lo, a), y = Math.min(hi, b);
    if (y > x) parts.push([x, y]);
  }
  const measured = Math.max(0, Math.min(hi, an.fmax) - Math.max(lo, an.fmin));
  const len = parts.reduce((t, [a, b]) => t + b - a, 0);
  return { parts, frac: len / (hi - lo), measured: measured / (hi - lo) };
}
