/* The Smith chart: S11 of the sweep and the kept sweeps, over the frequencies
 * the chart shows.
 *
 * The grid is the circles of constant resistance and the arcs of constant
 * reactance, labeled in ohms at the sweep's reference impedance. The dashed
 * red circle is Max SWR: inside it, the SWR is at or under Max SWR. The sweep
 * takes the line chart's colors, and each kept sweep its color and dash. A
 * line runs from the first frequency in view to the last, and both ends are
 * labeled. The sweep's dip, the pins and the typed frequency are marked on
 * the sweep.
 */

import { fmtF } from "@/format";
import { s11At } from "@/smith";
import { swrFromGamma, type S11 } from "@/touchstone";
import { KEPT, KEPT_DASH, MATCH, PROBE, BAD, curveColor } from "./colors";
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
}

/** A drawn line, point by point, in CSS pixels. */
interface Drawn { f: number[]; x: number[]; y: number[] }

export interface SmithGeom {
  /** The sweep's line first, when it shows, then the kept sweeps'. */
  lines: Drawn[];
  pins: { f: number; x: number; y: number }[];
}

const FONT = "11px -apple-system,Segoe UI,sans-serif", BOLD = "600 11px -apple-system,Segoe UI,sans-serif";
/** The grid's resistances and reactances, as fractions of the reference impedance. */
const STEPS = [0.2, 0.5, 1, 2, 5];

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
  const R = Math.max(10, Math.min(W, H) / 2 - 30), cx = W / 2, cy = H / 2;
  const X = (re: number): number => cx + re * R, Y = (im: number): number => cy - im * R;
  const unit = (): void => { ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); };

  // The grid, inside the unit circle.
  ctx.save(); unit(); ctx.clip();
  ctx.strokeStyle = "#262d37"; ctx.lineWidth = 1;
  for (const r of STEPS) { ctx.beginPath(); ctx.arc(X(r / (1 + r)), cy, R / (1 + r), 0, 2 * Math.PI); ctx.stroke(); }
  for (const x of STEPS) for (const sign of [1, -1]) { ctx.beginPath(); ctx.arc(X(1), Y(sign / x), R / x, 0, 2 * Math.PI); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = "#4a5260"; ctx.lineWidth = 1.2; unit(); ctx.stroke();

  // Resistance along the middle line, reactance around the rim.
  ctx.fillStyle = "#8b949e"; ctx.font = FONT; ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const r of [0, ...STEPS]) ctx.fillText(String(+(r * z0).toFixed(1)), X((r - 1) / (r + 1)) + (r === 0 ? 8 : 0), cy + 3);
  ctx.textBaseline = "middle";
  for (const x of STEPS) for (const sign of [1, -1]) {
    const d = x * x + 1, k = 1 + 16 / R;
    ctx.fillText(`${sign > 0 ? "+" : "−"}j${+(x * z0).toFixed(1)}`, X(((x * x - 1) / d) * k), Y(((sign * 2 * x) / d) * k));
  }

  // Max SWR: a circle about the middle.
  const gm = (s.thr - 1) / (s.thr + 1);
  ctx.strokeStyle = BAD; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.arc(cx, cy, gm * R, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = BAD; ctx.font = BOLD; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
  ctx.fillText(`Max SWR ${s.thr}`, X(gm * Math.SQRT1_2) + 3, Y(gm * Math.SQRT1_2) - 2);

  // Labels, kept clear of each other and inside the canvas.
  const placed: { l: number; r: number; t: number; b: number }[] = [];
  const tag = (txt: string, x: number, y: number, color: string): void => {
    ctx.font = BOLD;
    const w = ctx.measureText(txt).width;
    let l = x + 8 + w + 4 > W ? x - 8 - w : x + 8;
    l = Math.min(Math.max(l, 3), W - w - 3);
    const t = Math.min(Math.max(y - 8, 0), H - 16);
    if (placed.some((p) => l - 3 < p.r && l + w + 3 > p.l && t < p.b && t + 16 > p.t)) return;
    placed.push({ l: l - 3, r: l + w + 3, t, b: t + 16 });
    ctx.fillStyle = "rgba(26,31,39,.85)"; ctx.fillRect(l - 3, t, w + 6, 16);
    ctx.fillStyle = color; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(txt, l, t + 8);
  };
  const dot = (re: number, im: number, color: string, r = 3.5): void => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(X(re), Y(im), r, 0, 2 * Math.PI); ctx.fill();
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
  const p = sc.latest ? inRange(sc.latest, lo, hi) : null;
  const w = p ? p.re.map((re, i) => swrOf(re, p.im[i]!)) : [];
  if (p) {
    ctx.lineWidth = 2;
    for (let i = 1; i < p.f.length; i++) {
      ctx.strokeStyle = curveColor(w[i]!, p.f[i]!, s);
      ctx.beginPath(); ctx.moveTo(X(p.re[i - 1]!), Y(p.im[i - 1]!)); ctx.lineTo(X(p.re[i]!), Y(p.im[i]!)); ctx.stroke();
    }
  }
  ctx.restore();
  if (p && p.f.length >= 2) keep(p);
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
    for (const i of [0, p.f.length - 1]) {
      dot(p.re[i]!, p.im[i]!, "#8b949e", 3);
      tag(fmtF(p.f[i]!), X(p.re[i]!), Y(p.im[i]!), "#8b949e");
    }
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
    for (let i = 1; i < l.f.length; i++) {
      const ax = l.x[i - 1]!, ay = l.y[i - 1]!, dx = l.x[i]! - ax, dy = l.y[i]! - ay, len = dx * dx + dy * dy;
      const t = len > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len)) : 0;
      const d = Math.hypot(ax + t * dx - x, ay + t * dy - y);
      if (d < bd) { bd = d; best = l.f[i - 1]! + t * (l.f[i]! - l.f[i - 1]!); }
    }
  }
  return best;
}

