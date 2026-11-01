/* Find the plot grid's outer border in a photo.
 *
 * Grid lines are long, straight and bluish-white. Vote for near-horizontal and
 * near-vertical lines, each allowed its own small tilt since photos are
 * skewed. Refine each at full resolution, drop rows of text (their strokes are
 * far thicker than a grid line), and keep the outermost on each side. Past
 * each, look for a border too dim to vote. Intersect the four for the
 * corners.
 */

import type { Quad } from "./geometry";
import { isGridAt, type Pixels } from "./pixels";

export interface GridResult {
  corners: Quad;
  horizontal: number;
  vertical: number;
}

interface Line {
  /** Horizontal: y = off + x·t. Vertical: x = off + y·t. */
  off: number;
  t: number;
}

interface Refined extends Line {
  /** The 75th-percentile thickness across the line. */
  thick: number;
  /** How many samples along it found grid. */
  n: number;
}

export function detectGrid(px: Pixels): GridResult | null {
  const iw = px.width, ih = px.height;
  const isGrid = (x: number, y: number): boolean => isGridAt(px, x, y);
  const sc = Math.min(1, 1000 / iw), w = Math.round(iw * sc), h = Math.round(ih * sc);
  const pts: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isGrid(x / sc, y / sc)) pts.push(x, y);
  const T: number[] = [];
  for (let a = -4; a <= 4.001; a += 0.25) T.push(Math.tan((a * Math.PI) / 180));

  // Votes in low-resolution coordinates.
  const vote = (horiz: boolean): Line[] => {
    const L = horiz ? h : w, pad = Math.ceil(0.08 * Math.max(w, h)), N = L + 2 * pad;
    const acc = new Float32Array(T.length * N);
    for (let k = 0; k < pts.length; k += 2) {
      const p = horiz ? pts[k + 1]! : pts[k]!, q = horiz ? pts[k]! : pts[k + 1]!;
      for (let j = 0; j < T.length; j++) {
        const o = Math.round(p - q * T[j]!) + pad;
        if (o >= 0 && o < N) acc[j * N + o]!++;
      }
    }
    const best = new Float32Array(N), bestJ = new Int32Array(N);
    for (let o = 0; o < N; o++) for (let j = 0; j < T.length; j++) if (acc[j * N + o]! > best[o]!) { best[o] = acc[j * N + o]!; bestJ[o] = j; }
    let max = 0;
    for (const v of best) max = Math.max(max, v);
    const peaks: Line[] = [];
    for (let o = 0; o < N; o++) {
      if (best[o]! < 0.45 * max) continue;
      let top = true;
      for (let d = -5; d <= 5 && top; d++) {
        const oo = o + d;
        if (d && oo >= 0 && oo < N && (best[oo]! > best[o]! || (d < 0 && best[oo] === best[o]))) top = false;
      }
      // To full resolution: the offset scales, the slope does not.
      if (top) peaks.push({ off: (o - pad) / sc, t: T[bestJ[o]!]! });
    }
    return peaks;
  };

  const refine = (ln: Line, horiz: boolean): Refined => {
    const along = horiz ? iw : ih, xs: number[] = [], ys: number[] = [], thick: number[] = [];
    const on = (q: number, p: number): boolean => (horiz ? isGrid(q, p) : isGrid(p, q));
    for (let q = 0; q < along; q += 3) {
      const p0 = ln.off + q * ln.t;
      let sum = 0, n = 0;
      for (let d = -8; d <= 8; d++) {
        const p = Math.round(p0 + d);
        if (on(q, p)) { sum += p; n++; }
      }
      if (!n) continue;
      xs.push(q); ys.push(sum / n);
      const c = Math.round(sum / n);
      let a = c, b = c;
      while (c - a < 80 && (on(q, a - 1) || on(q, a - 2))) a--;
      while (b - c < 80 && (on(q, b + 1) || on(q, b + 2))) b++;
      thick.push(b - a + 1);
    }
    thick.sort((a, b) => a - b);
    const t75 = thick.length ? thick[Math.floor(thick.length * 0.75)]! : Infinity;
    let m = ln.t, b = ln.off;
    for (let pass = 0; pass < 3; pass++) {
      let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (let i = 0; i < xs.length; i++) {
        const x = xs[i]!, y = ys[i]!;
        if (pass && Math.abs(y - (b + m * x)) > 2.5) continue;
        n++; sx += x; sy += y; sxx += x * x; sxy += x * y;
      }
      if (n < 10) break;
      m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
      b = (sy - m * sx) / n;
    }
    return { off: b, t: m, thick: t75, n: xs.length };
  };

  const Hraw = vote(true), Vraw = vote(false);
  if (Hraw.length < 2 || Vraw.length < 2) return null;
  const at = (ln: Line, q: number): number => ln.off + q * ln.t;
  const maxThick = Math.max(14, iw * 0.005);
  const keep = (lines: Line[], horiz: boolean): Refined[] => {
    const r = lines.map((l) => refine(l, horiz)), most = Math.max(...r.map((l) => l.n));
    const mid = horiz ? iw / 2 : ih / 2;
    return r.filter((l) => l.thick <= maxThick && l.n >= most * 0.4).sort((a, b) => at(a, mid) - at(b, mid));
  };
  const Hs = keep(Hraw, true), Vs = keep(Vraw, false);
  if (Hs.length < 2 || Vs.length < 2) return null;
  const meet = (hl: Line, vl: Line): [number, number] => {
    const x = (vl.off + vl.t * hl.off) / (1 - vl.t * hl.t);
    return [x, hl.off + hl.t * x];
  };

  /* A border too dim to pass the color test. A screen seen at an angle fades
     toward one side, and the NanoVNA draws its frequency lines at round
     frequencies, so the last line found is not always the border. Look past
     each outermost line for a fainter line that runs the length of the plot:
     up to the widest spacing for a frequency line, and about one spacing for
     an SWR line, since those are evenly spaced. */
  const lum = (x: number, y: number): number => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= iw || y >= ih) return 0;
    const i = (y * iw + x) * 4, d = px.data;
    return (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
  };
  const bluish = (x: number, y: number): boolean => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= iw || y >= ih) return false;
    const i = (y * iw + x) * 4, d = px.data;
    return d[i + 2]! >= d[i]! && d[i + 2]! + 10 >= d[i + 1]!;
  };
  const side = Math.max(4, Math.round(iw * 0.004));
  const beyond = (lines: Refined[], horiz: boolean, dir: 1 | -1, ends: [number, number]): Line | null => {
    const mid = horiz ? iw / 2 : ih / 2, pos = lines.map((l) => at(l, mid));
    const outer = dir > 0 ? lines[lines.length - 1]! : lines[0]!, p0 = at(outer, mid);
    let far = 0;
    for (let k = 1; k < pos.length; k++) far = Math.max(far, pos[k]! - pos[k - 1]!);
    const step = dir > 0 ? pos[pos.length - 1]! - pos[pos.length - 2]! : pos[1]! - pos[0]!;
    const [near, reach] = horiz ? [0.85 * step, 1.15 * step] : [2 * maxThick, far];
    // Slope changes across a photo with perspective: extrapolate it.
    const first = lines[0]!, last = lines[lines.length - 1]!, span = pos[pos.length - 1]! - pos[0]!;
    const tAt = (p: number): number => first.t + ((last.t - first.t) * (p - pos[0]!)) / (span || 1);
    const pt = (q: number, p: number): [number, number] => (horiz ? [q, p] : [p, q]);
    const len = ends[1] - ends[0], q0 = ends[0] + len * 0.03, q1 = ends[1] - len * 0.03;
    let best: Line | null = null, bestScore = 0.5;
    for (let dp = Math.round(near); dp <= reach; dp++) {
      const pm = p0 + dir * dp, tp = tAt(pm);
      for (let k = -3; k <= 3; k++) {
        const t = tp + k * 0.002, off = pm - mid * t;
        let hits = 0, n = 0;
        for (let q = q0; q < q1; q += 8) {
          const p = off + q * t, c = lum(...pt(q, p));
          n++;
          if (c > 30 && bluish(...pt(q, p)) && c > 1.5 * Math.max(lum(...pt(q, p - side)), lum(...pt(q, p + side)))) hits++;
        }
        if (n && hits / n > bestScore) { bestScore = hits / n; best = { off, t }; }
      }
    }
    return best;
  };
  let top: Line = Hs[0]!, bot: Line = Hs[Hs.length - 1]!, lft: Line = Vs[0]!, rgt: Line = Vs[Vs.length - 1]!;
  const qs = (a: [number, number], b: [number, number], horiz: boolean): [number, number] =>
    horiz ? [Math.min(a[0], b[0]), Math.max(a[0], b[0])] : [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  const newL = beyond(Vs, false, -1, qs(meet(top, lft), meet(bot, lft), false));
  const newR = beyond(Vs, false, 1, qs(meet(top, rgt), meet(bot, rgt), false));
  const newT = beyond(Hs, true, -1, qs(meet(top, lft), meet(top, rgt), true));
  const newB = beyond(Hs, true, 1, qs(meet(bot, lft), meet(bot, rgt), true));
  lft = newL ?? lft; rgt = newR ?? rgt; top = newT ?? top; bot = newB ?? bot;
  const corners: Quad = [meet(top, lft), meet(top, rgt), meet(bot, rgt), meet(bot, lft)];
  const area = Math.abs((corners[1][0] - corners[0][0]) * (corners[3][1] - corners[0][1]));
  if (!corners.flat().every(Number.isFinite) || area < 0.12 * iw * ih) return null;
  return { corners, horizontal: Hs.length + (newT ? 1 : 0) + (newB ? 1 : 0), vertical: Vs.length + (newL ? 1 : 0) + (newR ? 1 : 0) };
}
