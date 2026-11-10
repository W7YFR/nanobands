/* Trace the yellow SWR curve inside the plot grid.
 *
 * The plot is sampled on an N × M lattice through the grid's homography, so
 * the trace is one SWR position per column however skewed the photo is.
 *
 * 1. In each column, collect the vertical runs of yellow as candidates.
 * 2. Drop candidates that look like text: along a row, text flips between
 *    yellow and dark many times in a short span, where the curve crosses a
 *    row once or twice.
 * 3. Pick one candidate per column by dynamic programming, so the path is as
 *    continuous as possible. It may skip columns where a grid line hides the
 *    curve, at a cost per column, so it never detours through text that
 *    happens to fill the gap.
 * 4. Grow each end of the path through candidates that touch it, text or
 *    not: a jagged curve can look like text to step 2.
 * 5. Fill short gaps and smooth with a 3-point median.
 */

import type { Point, Quad } from "./geometry";
import { isYellowAt, type Pixels } from "./pixels";

export interface Trace {
  /** Columns across the plot. */
  N: number;
  /** Position down the plot per column, 0 (top) to 1 (bottom); NaN where the
   *  curve was not found. */
  v: Float32Array;
}

export function autoTrace(px: Pixels, fwd: (u: number, v: number) => Point, corners: Quad, sens: number): Trace {
  const c = corners;
  const d = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const N = Math.max(300, Math.min(2400, Math.round((d(c[0], c[1]) + d(c[3], c[2])) / 2)));
  const M = Math.max(200, Math.min(1800, Math.round((d(c[0], c[3]) + d(c[1], c[2])) / 2)));
  const isYellow = (x: number, y: number): boolean => isYellowAt(px, x, y, sens);

  // 1. Candidates.
  const cand: [number, number][][] = new Array(N);
  for (let i = 0; i < N; i++) {
    const u = (i + 0.5) / N, runs: [number, number][] = [];
    let a = -1, last = -10;
    for (let j = 0; j < M; j++) {
      const [x, y] = fwd(u, (j + 0.5) / M);
      if (isYellow(x, y)) {
        if (a < 0 || j - last > 3) { if (a >= 0) runs.push([a, last]); a = j; }
        last = j;
      }
    }
    if (a >= 0) runs.push([a, last]);
    cand[i] = runs;
  }

  // 2. Text. Every candidate is kept aside for step 4.
  const every = cand.slice();
  const TW = Math.max(16, Math.round(N * 0.035));
  for (let i = 0; i < N; i++) {
    cand[i] = cand[i]!.filter(([a, b]) => {
      const v = ((a + b) / 2 + 0.5) / M;
      let flips = 0, prev: boolean | null = null;
      for (let dd = -TW; dd <= TW; dd++) {
        const ii = i + dd;
        if (ii < 0 || ii >= N) continue;
        const [x, y] = fwd((ii + 0.5) / N, v), yel = isYellow(x, y);
        if (prev !== null && yel !== prev) flips++;
        prev = yel;
      }
      return flips <= 6;
    });
  }

  // 3. The path.
  const K = Math.max(8, Math.round(N * 0.04)), SKIP = 5;
  const cost: (Float64Array | undefined)[] = new Array(N);
  const from: [number, number][][] = new Array(N);
  let bestEnd = Infinity, endI = -1, endK = -1;
  for (let i = 0; i < N; i++) {
    const R = cand[i]!;
    if (!R.length) continue;
    const ci = new Float64Array(R.length), fi: [number, number][] = new Array(R.length);
    for (let k = 0; k < R.length; k++) {
      const rk = R[k]!, ck = (rk[0] + rk[1]) / 2;
      let best = SKIP * i, bj = -1, bq = -1; // start the path here
      for (let j = Math.max(0, i - K); j < i; j++) {
        const pc = cost[j];
        if (!pc) continue;
        const P = cand[j]!, sk = SKIP * (i - j - 1);
        for (let q = 0; q < P.length; q++) {
          const pq = P[q]!;
          const gap = Math.max(0, rk[0] - pq[1], pq[0] - rk[1]);
          const val = pc[q]! + sk + gap + 0.03 * Math.abs(ck - (pq[0] + pq[1]) / 2);
          if (val < best) { best = val; bj = j; bq = q; }
        }
      }
      ci[k] = best;
      fi[k] = [bj, bq];
      const end = best + SKIP * (N - 1 - i);
      if (end < bestEnd) { bestEnd = end; endI = i; endK = k; }
    }
    cost[i] = ci;
    from[i] = fi;
  }
  const v = new Float32Array(N).fill(NaN);
  let startI = -1, startRun: [number, number] | null = null;
  for (let i = endI, k = endK; i >= 0;) {
    const r = cand[i]![k]!;
    v[i] = ((r[0] + r[1]) / 2 + 0.5) / M;
    startI = i;
    startRun = r;
    [i, k] = from[i]![k]!;
  }

  // 4. The ends. A jagged curve crosses its own row as often as text does,
  // so the text filter can take a stretch of it. Grow the path from each end
  // through any candidate, text or not, that touches where it left off.
  const grow = (i: number, run: [number, number], dir: 1 | -1): void => {
    for (;;) {
      let next = -1, nextRun: [number, number] | null = null;
      for (let s = 1; s <= K && next < 0; s++) {
        const j = i + dir * s;
        if (j < 0 || j >= N) return;
        let gap = Infinity;
        for (const r of every[j]!) {
          const g = Math.max(0, r[0] - run[1], run[0] - r[1]);
          if (g <= 3 && g < gap) { gap = g; next = j; nextRun = r; }
        }
      }
      if (!nextRun) return;
      v[next] = ((nextRun[0] + nextRun[1]) / 2 + 0.5) / M;
      i = next;
      run = nextRun;
    }
  };
  if (startRun) grow(startI, startRun, -1);
  if (endI >= 0) grow(endI, cand[endI]![endK]!, 1);

  // 5. Gaps and smoothing.
  let lastI = -1;
  for (let i = 0; i < N; i++) {
    if (Number.isNaN(v[i])) continue;
    if (lastI >= 0 && i - lastI > 1 && i - lastI <= K + 1)
      for (let j = lastI + 1; j < i; j++) v[j] = v[lastI]! + ((v[i]! - v[lastI]!) * (j - lastI)) / (i - lastI);
    lastI = i;
  }
  const out = Float32Array.from(v);
  for (let i = 1; i < N - 1; i++) {
    const t = [v[i - 1]!, v[i]!, v[i + 1]!];
    if (!t.some(Number.isNaN)) out[i] = t.sort((a, b) => a - b)[1]!;
  }
  return { N, v: out };
}

/** The share of columns where the curve was found. */
export function coverage(t: Trace): number {
  let n = 0;
  for (const v of t.v) if (!Number.isNaN(v)) n++;
  return n / t.N;
}

/** Lower sensitivities to try in turn when a trace finds less than `ENOUGH`
 *  of the curve. Some screens draw it pale: on the 2 m photos, most columns
 *  hold no yellow at the default. */
const PALE = [50, 35, 20] as const;
const ENOUGH = 0.9;

/** Trace at `sens`, and with `pale`, at lower sensitivities too when the
 *  curve is mostly missed. The trace that finds the most, and its
 *  sensitivity. */
export function traceBest(px: Pixels, fwd: (u: number, v: number) => Point, corners: Quad, sens: number, pale: boolean): { trace: Trace; sens: number } {
  let best = { trace: autoTrace(px, fwd, corners, sens), sens };
  if (!pale) return best;
  for (const s of PALE) {
    if (coverage(best.trace) >= ENOUGH) break;
    const t = autoTrace(px, fwd, corners, s);
    if (coverage(t) > coverage(best.trace)) best = { trace: t, sens: s };
  }
  return best;
}
