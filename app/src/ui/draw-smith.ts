/* The Smith chart: S11 of the sweep and the kept sweeps, over the frequencies
 * the chart shows.
 *
 * The grid is the circles of constant resistance and the arcs of constant
 * reactance, labeled in ohms at the sweep's reference impedance. The dashed
 * red circle is Max SWR: inside it, the SWR is at or under Max SWR. The sweep
 * takes the line chart's colors, and each kept sweep its color and dash. A
 * line runs from the first frequency in view to the last, and both ends are
 * labeled. The sweep's dip, the pins and the typed frequency are marked on
 * the sweep, and an arrow at its high end points the way the frequency rises. The top
 * half is inductive and the bottom half capacitive, and the chart says so.
 *
 * The sweep shows as the line, its readings, or both, as on the line chart.
 * A reading shows as a dot once it is READING_GAP px from the last dot; on
 * the Smith chart readings bunch where the impedance changes slowly, so the
 * gap is per reading, not an average.
 *
 * The chart zooms about a point: `zoom.k` times larger, with S11 `zoom.c` at
 * the middle. Zoomed in, the grid adds finer circles and arcs.
 */

import { fmtF } from "@/format";
import { s11At } from "@/smith";
import { swrFromGamma, type S11 } from "@/touchstone";
import { KEPT, KEPT_DASH, MATCH, PROBE, BAD, curveColor } from "./colors";
import { READING_GAP, type Readings } from "./draw-chart";
import { dipIn, type Settings } from "./model";

export interface SmithScene {
  settings: Settings;
  /** The frequencies shown, in MHz. */
  range: [number, number];
  /** The sweep, or null while its pill hides it. */
  latest: S11 | null;
  /** The kept sweeps shown, with their numbers. */
  kept: readonly { g: S11; n: number }[];
  manual: readonly number[];
  /** The frequency typed in the Analyze card, marked until Enter pins it. */
  probe?: number | null;
  hoverF: number | null;
  /** How the sweep shows; null or absent shows the line. */
  readings?: Readings | null;
  zoom?: Zoom | null;
}

/** How far the chart is zoomed in, and the S11 at its middle. */
export interface Zoom { k: number; c: [number, number] }
export const MAX_ZOOM = 40;

interface Box { l: number; r: number; t: number; b: number }

/** A drawn line, point by point, in CSS pixels. `dots`: only its points
 *  show, and the pointer reads them, not the line between. */
interface Drawn { f: number[]; x: number[]; y: number[]; dots?: boolean }

export interface SmithGeom {
  /** The sweep's line first, when it shows, then the kept sweeps'. */
  lines: Drawn[];
  pins: { f: number; x: number; y: number }[];
}

const FONT = "11px -apple-system,Segoe UI,sans-serif", BOLD = "600 11px -apple-system,Segoe UI,sans-serif";
/** The grid's resistances and reactances, as fractions of the reference impedance. */
const STEPS = [0.2, 0.5, 1, 2, 5];
/** The grid zoomed in. */
const FINE = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.5, 3, 4, 5, 10];
/** The zoom at which the grid turns fine. */
const FINE_AT = 2.5;

/** The chart's middle and its radius unzoomed, in CSS pixels, on a W × H canvas. */
export function smithFrame(W: number, H: number): { cx: number; cy: number; R: number } {
  return { cx: W / 2, cy: H / 2, R: Math.max(10, Math.min(W, H) / 2 - 30) };
}

/** `z` held to the unit circle and 1× to MAX_ZOOM×; at 1× the middle is the chart's. */
export function clampZoom(z: Zoom): Zoom | null {
  const k = Math.min(Math.max(z.k, 1), MAX_ZOOM);
  if (k <= 1.001) return null;
  const m = Math.hypot(z.c[0], z.c[1]);
  return { k, c: m > 1 ? [z.c[0] / m, z.c[1] / m] : z.c };
}

/** The SWR for S11 `re` + j`im`. */
const swrOf = (re: number, im: number): number => swrFromGamma(Math.hypot(re, im));

/** The points of `g` from lo to hi, with S11 at lo and hi added as the ends. */
function inRange(g: S11, lo: number, hi: number): { f: number[]; re: number[]; im: number[] } {
  const out = { f: [] as number[], re: [] as number[], im: [] as number[] };
  const add = (f: number, p: [number, number] | null): void => { if (p) { out.f.push(f); out.re.push(p[0]); out.im.push(p[1]); } };
  const a = Math.max(lo, g.f[0]!), b = Math.min(hi, g.f[g.f.length - 1]!);
  if (!(a < b)) return out;
  add(a, s11At(g, a));
  for (let i = 0; i < g.f.length; i++) if (g.f[i]! > a && g.f[i]! < b) add(g.f[i]!, [g.re[i]!, g.im[i]!]);
  add(b, s11At(g, b));
  return out;
}

/** Draw the Smith chart at W × H CSS pixels, centered. */
export function drawSmith(ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number, sc: SmithScene): SmithGeom {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#1a1f27"; ctx.fillRect(0, 0, W, H);
  const s = sc.settings, [lo, hi] = sc.range;
  const z0 = sc.latest?.z0 ?? sc.kept[0]?.g.z0 ?? 50;
  const { cx, cy, R: R1 } = smithFrame(W, H), zk = sc.zoom?.k ?? 1, [c0, c1] = sc.zoom?.c ?? [0, 0], R = R1 * zk;
  const X = (re: number): number => cx + (re - c0) * R, Y = (im: number): number => cy - (im - c1) * R;
  const unit = (): void => { ctx.beginPath(); ctx.arc(X(0), Y(0), R, 0, 2 * Math.PI); };
  const steps = zk >= FINE_AT ? FINE : STEPS;

  // The grid, inside the unit circle.
  ctx.save(); unit(); ctx.clip();
  ctx.strokeStyle = "#262d37"; ctx.lineWidth = 1;
  for (const r of steps) { ctx.beginPath(); ctx.arc(X(r / (1 + r)), Y(0), R / (1 + r), 0, 2 * Math.PI); ctx.stroke(); }
  for (const x of steps) for (const sign of [1, -1]) { ctx.beginPath(); ctx.arc(X(1), Y(sign / x), R / x, 0, 2 * Math.PI); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(X(-1), Y(0)); ctx.lineTo(X(1), Y(0)); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = "#4a5260"; ctx.lineWidth = 1.2; unit(); ctx.stroke();

  // Resistance along the middle line, reactance around the rim, each label
  // kept clear of the one before. The reference impedance says its unit.
  // The grid's labels, centered on (x, y). The tags keep clear of them.
  const grid: Box[] = [];
  const label = (txt: string, x: number, y: number): void => {
    const w = ctx.measureText(txt).width;
    ctx.fillText(txt, x, y);
    grid.push({ l: x - w / 2, r: x + w / 2, t: y - 7, b: y + 7 });
  };
  ctx.fillStyle = "#8b949e"; ctx.font = FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  let last = -Infinity;
  for (const r of [0, ...steps]) {
    const x = X((r - 1) / (r + 1)) + (r === 0 ? 8 : 0);
    if (x - last < 30 || x < 0 || x > W) continue;
    label(String(+(r * z0).toFixed(1)) + (r === 1 ? " Ω" : ""), x, Y(0) + 10);
    last = x;
  }
  const rim: [number, number][] = [];
  for (const x of steps) for (const sign of [1, -1]) {
    const d = x * x + 1, k = 1 + 16 / R, lx = X(((x * x - 1) / d) * k), ly = Y(((sign * 2 * x) / d) * k);
    if (lx < 0 || lx > W || ly < 0 || ly > H || rim.some(([a, b]) => Math.hypot(a - lx, b - ly) < 34)) continue;
    rim.push([lx, ly]);
    label(`${sign > 0 ? "+" : "−"}j${+(x * z0).toFixed(1)}`, lx, ly);
  }

  // The halves: inductive over the middle line, capacitive under it, named
  // to the left, where a sweep seldom goes. Zoomed into one half, its name
  // sits at the edge of the view.
  ctx.fillStyle = "#6e7681"; ctx.font = BOLD;
  const hx = Math.min(Math.max(X(-0.55), 50), W - 50);
  if (Y(0) > 40) label("Inductive", hx, Math.max(Y(0.68), 14));
  if (Y(0) < H - 40) label("Capacitive", hx, Math.min(Y(-0.68), H - 14));

  // Max SWR: a circle about the middle.
  const gm = (s.thr - 1) / (s.thr + 1);
  ctx.strokeStyle = BAD; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.arc(X(0), Y(0), gm * R, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = BAD; ctx.font = BOLD;
  const mw = ctx.measureText(`Max SWR ${s.thr}`).width;
  label(`Max SWR ${s.thr}`, Math.min(X(gm * Math.SQRT1_2) + 3 + mw / 2, W - mw / 2 - 3), Y(gm * Math.SQRT1_2) - 9);

  // Tags: beside the dot, on the first side clear of the other tags and the
  // grid's labels. With none clear of both, the first clear of the tags. A
  // dot out of view, zoomed in, has no tag.
  const placed: Box[] = [];
  const hits = (b: Box, set: Box[]): boolean => set.some((p) => b.l < p.r && b.r > p.l && b.t < p.b && b.b > p.t);
  const tag = (txt: string, x: number, y: number, color: string): void => {
    if (x < 0 || x > W || y < 0 || y > H) return;
    ctx.font = BOLD;
    const w = ctx.measureText(txt).width;
    const at = (l: number, t: number): Box => {
      const L = Math.min(Math.max(l, 3), W - w - 3), T = Math.min(Math.max(t, 0), H - 16);
      return { l: L - 3, r: L + w + 3, t: T, b: T + 16 };
    };
    const sides = [at(x + 8 + w + 4 > W ? x - 8 - w : x + 8, y - 8), at(x - 8 - w, y - 8), at(x + 6, y - 24), at(x + 6, y + 8)];
    const b = sides.find((c) => !hits(c, placed) && !hits(c, grid)) ?? sides.find((c) => !hits(c, placed));
    if (!b) return;
    placed.push(b);
    const l = b.l + 3, t = b.t;
    ctx.fillStyle = "rgba(26,31,39,.85)"; ctx.fillRect(l - 3, t, w + 6, 16);
    ctx.fillStyle = color; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(txt, l, t + 8);
  };
  const dot = (re: number, im: number, color: string, r = 3.5): void => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(X(re), Y(im), r, 0, 2 * Math.PI); ctx.fill();
  };

  /** An arrowhead at the end of a line, the way it last ran. */
  const arrow = (xs: number[], ys: number[], color: string): void => {
    const n = xs.length - 1, ax = xs[n]!, ay = ys[n]!;
    let i = n - 1;
    while (i > 0 && Math.hypot(ax - xs[i]!, ay - ys[i]!) < 4) i--;
    const a = Math.atan2(ay - ys[i]!, ax - xs[i]!), c = Math.cos(a), sn = Math.sin(a);
    const pt = (u: number, v: number): [number, number] => [ax + u * c - v * sn, ay + u * sn + v * c];
    ctx.fillStyle = color; ctx.strokeStyle = "#1a1f27"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(...pt(6, 0)); ctx.lineTo(...pt(-6, 5.5)); ctx.lineTo(...pt(-6, -5.5)); ctx.closePath(); ctx.fill(); ctx.stroke();
  };

  const lines: Drawn[] = [];
  const keep = (p: { f: number[]; re: number[]; im: number[] }): void => { lines.push({ f: p.f, x: p.re.map(X), y: p.im.map(Y) }); };

  // The kept sweeps, under the sweep.
  ctx.save(); unit(); ctx.clip();
  const kept = sc.kept.map((k) => ({ ...k, p: inRange(k.g, lo, hi) }));
  for (const k of kept) {
    if (k.p.f.length < 2) continue;
    ctx.strokeStyle = KEPT[k.n - 1] ?? MATCH; ctx.lineWidth = 1.5; ctx.setLineDash([...(KEPT_DASH[k.n - 1] ?? [])]);
    ctx.beginPath();
    k.p.f.forEach((_, i) => (i ? ctx.lineTo(X(k.p.re[i]!), Y(k.p.im[i]!)) : ctx.moveTo(X(k.p.re[i]!), Y(k.p.im[i]!))));
    ctx.stroke(); ctx.setLineDash([]);
  }
  // The sweep, piece by piece in the line chart's colors.
  const mode = sc.readings ?? "line";
  const p = sc.latest ? inRange(sc.latest, lo, hi) : null;
  const w = p ? p.re.map((re, i) => swrOf(re, p.im[i]!)) : [];
  if (p && mode !== "points") {
    ctx.lineWidth = 2;
    for (let i = 1; i < p.f.length; i++) {
      ctx.strokeStyle = curveColor(w[i]!, p.f[i]!, s);
      ctx.beginPath(); ctx.moveTo(X(p.re[i - 1]!), Y(p.im[i - 1]!)); ctx.lineTo(X(p.re[i]!), Y(p.im[i]!)); ctx.stroke();
    }
  }
  // The readings: a dot once it is far enough from the last dot. Points
  // draws the readings closer than that small, so the sweep still shows.
  const dots: Drawn = { f: [], x: [], y: [], dots: true };
  if (p && sc.latest && mode !== "line") {
    const g = sc.latest;
    let lx = -Infinity, ly = -Infinity;
    for (let i = 0; i < g.f.length; i++) {
      const f = g.f[i]!;
      if (f < lo || f > hi) continue;
      const x = X(g.re[i]!), y = Y(g.im[i]!);
      dots.f.push(f); dots.x.push(x); dots.y.push(y);
      ctx.fillStyle = curveColor(swrOf(g.re[i]!, g.im[i]!), f, s);
      if (Math.hypot(x - lx, y - ly) < READING_GAP) {
        if (mode === "points") { ctx.beginPath(); ctx.arc(x, y, 1.1, 0, 7); ctx.fill(); }
        continue;
      }
      ctx.strokeStyle = "#1a1f27"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fill(); ctx.stroke();
      lx = x; ly = y;
    }
  }
  ctx.restore();
  if (p && p.f.length >= 2) {
    if (mode === "points") { if (dots.f.length) lines.push(dots); } else keep(p);
  }
  for (const k of kept) if (k.p.f.length >= 2) keep(k.p);

  // The sweep's dip and its ends.
  const pins: SmithGeom["pins"] = [];
  if (p && p.f.length >= 2) {
    const d = dipIn(Float64Array.from(p.f), Float64Array.from(w), lo, hi);
    if (d) {
      const at = s11At(sc.latest!, d.f)!, col = curveColor(d.s, d.f, s);
      dot(at[0], at[1], col);
      tag(`${fmtF(d.f)} · ${d.s.toFixed(2)}`, X(at[0]), Y(at[1]), col);
    }
    // The low end a dot, the high end an arrowhead.
    const n = p.f.length - 1;
    dot(p.re[0]!, p.im[0]!, "#8b949e", 3);
    arrow(p.re.map(X), p.im.map(Y), "#8b949e");
    for (const i of [0, n]) tag(fmtF(p.f[i]!), X(p.re[i]!), Y(p.im[i]!), "#8b949e");
    // Pins: white dots, labeled in the sweep's color there.
    for (const m of sc.manual) {
      const at = m >= lo && m <= hi ? s11At(sc.latest!, m) : null;
      if (!at) continue;
      const v = swrOf(at[0], at[1]);
      dot(at[0], at[1], "#fff", 4);
      pins.push({ f: m, x: X(at[0]), y: Y(at[1]) });
      tag(`${fmtF(m)} · ${v.toFixed(2)}`, X(at[0]), Y(at[1]), curveColor(v, m, s));
    }
    const pr = sc.probe != null && sc.probe >= lo && sc.probe <= hi ? s11At(sc.latest!, sc.probe) : null;
    if (pr) {
      ctx.strokeStyle = PROBE; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(pr[0]), Y(pr[1]), 5, 0, 2 * Math.PI); ctx.stroke();
      tag(`${fmtF(sc.probe!)} · ${swrOf(pr[0], pr[1]).toFixed(2)}`, X(pr[0]), Y(pr[1]), PROBE);
    }
  }

  // The hover: a dot on each kept sweep, and a ringed dot on the sweep.
  const f = sc.hoverF;
  if (f !== null && f >= lo && f <= hi) {
    for (const k of kept) {
      const at = s11At(k.g, f);
      if (at) dot(at[0], at[1], KEPT[k.n - 1] ?? MATCH);
    }
    const at = sc.latest ? s11At(sc.latest, f) : null;
    if (at) {
      ctx.fillStyle = curveColor(swrOf(at[0], at[1]), f, s); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(at[0]), Y(at[1]), 5.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    }
  }
  return { lines, pins };
}

/** The frequency on a drawn line nearest (x, y), when one is within `max` px. */
export function nearestF(g: SmithGeom, x: number, y: number, max: number): number | null {
  let best: number | null = null, bd = max;
  for (const l of g.lines) {
    if (l.dots) {
      l.f.forEach((f, i) => { const d = Math.hypot(l.x[i]! - x, l.y[i]! - y); if (d < bd) { bd = d; best = f; } });
      continue;
    }
    for (let i = 1; i < l.f.length; i++) {
      const ax = l.x[i - 1]!, ay = l.y[i - 1]!, dx = l.x[i]! - ax, dy = l.y[i]! - ay, len = dx * dx + dy * dy;
      const t = len > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len)) : 0;
      const d = Math.hypot(ax + t * dx - x, ay + t * dy - y);
      if (d < bd) { bd = d; best = l.f[i - 1]! + t * (l.f[i]! - l.f[i - 1]!); }
    }
  }
  return best;
}

