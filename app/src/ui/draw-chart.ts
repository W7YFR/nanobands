/* The chart, drawn: SWR against frequency, the band plan and the usable
 * stretches under it, the key points, pins, the zoom selection and the hover
 * readout.
 */

import { segUsable, type Analysis } from "@/analysis";
import { MODES, bandAt, bandsInRange, inSegment, segsFor, type Band } from "@/bands";
import { fmtF, niceStep } from "@/format";
import { swrOn, type Curve, type Settings } from "./model";
import { BAD, HIGH, MATCH, OK, PROBE, curveColor } from "./colors";

/** Where the plot sits, for turning a pointer position into a frequency. */
export interface ChartGeom {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  lo: number;
  hi: number;
  /** The key points in view, where their dots sit, for the hover to snap to. */
  points: KeyPoint[];
  /** Each band's boxes in the strip and its name over the plot, for its tooltip. */
  bands: { band: Band; l: number; r: number; t: number; b: number }[];
}

/** `probe` is the frequency typed in the Analyze card, not pinned yet. */
export type KeyKind = "dip" | "peak" | "crossing" | "pin" | "probe";
export interface KeyPoint { kind: KeyKind; f: number; x: number; y: number }

export const freqAt = (g: ChartGeom, x: number): number => g.lo + ((x - g.x0) / (g.x1 - g.x0)) * (g.hi - g.lo);

export interface ChartScene {
  settings: Settings;
  an: Analysis | null;
  curve: Curve | null;
  range: [number, number] | null;
  manual: readonly number[];
  /** The frequency typed in the Analyze card, marked until Enter pins it. */
  probe?: number | null;
  hoverF: number | null;
  /** A zoom being dragged, in CSS pixels. */
  drag: { x0: number; x1: number } | null;
  /** The key point the hover snapped to, if any. */
  snap?: KeyKind | null;
  /** Added to the hover readout, such as how to unpin a snapped pin. */
  hoverNote?: string | undefined;
}

/** Draw the chart at W × H CSS pixels. Returns the plot's geometry, or null
 *  when there is nothing to plot. */
export function drawChart(ctx: CanvasRenderingContext2D, W: number, Hh: number, dpr: number, sc: ChartScene): ChartGeom | null {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#1a1f27"; ctx.fillRect(0, 0, W, Hh);
  const { an, settings: s, curve: t, range } = sc;
  const swr = (f: number): number => swrOn(t, f);
  ctx.font = "13px -apple-system,Segoe UI,sans-serif"; ctx.textBaseline = "middle";
  if (!an || !t || !range) {
    ctx.fillStyle = "#8b949e"; ctx.textAlign = "center";
    ctx.fillText(t ? "Enter sweep start/stop frequencies (step 2)." : "Load data and trace the curve to see the chart.", W / 2, Hh / 2);
    return null;
  }
  const [lo, hi] = range;
  const yTop = s.top, yBot = s.bot;
  const x0 = 46, x1 = W - 14, y0 = 30, y1 = Hh - 86;
  // The SWR scale stops short of the plot's edges, so a dip at the bottom or a
  // peak at the top still has room for its label without covering its dot.
  const py0 = y0 + 24, py1 = y1 - 22;
  const X = (f: number): number => x0 + ((f - lo) / (hi - lo)) * (x1 - x0);
  const Y = (w: number): number => py1 - ((Math.min(w, yTop) - yBot) / (yTop - yBot)) * (py1 - py0);
  const stripY = y1 + 22, stripH = 12;
  const points: KeyPoint[] = [], bandBoxes: ChartGeom["bands"] = [];

  // grid
  ctx.strokeStyle = "#262d37"; ctx.lineWidth = 1; ctx.fillStyle = "#8b949e"; ctx.font = "11px -apple-system,Segoe UI,sans-serif";
  const ys = yTop - yBot > 6 ? 1 : 0.5;
  ctx.textAlign = "right";
  for (let w = Math.ceil(yBot / ys) * ys; w <= yTop + 1e-9; w += ys) {
    ctx.beginPath(); ctx.moveTo(x0, Y(w)); ctx.lineTo(x1, Y(w)); ctx.stroke(); ctx.fillText(w.toFixed(1), x0 - 6, Y(w));
  }
  const step = niceStep((hi - lo) / Math.max(4, W / 110));
  // The unit sits in the left margin, with "bands" and the threshold under
  // it, so it never meets a tick's label. A label that would touch the one
  // before it, or the unit, is left out; its grid line stays.
  ctx.textAlign = "right"; ctx.fillText("MHz", x0 - 6, y1 + 10);
  let tickEnd = x0 - 6;
  ctx.textAlign = "center";
  for (let f = Math.ceil(lo / step) * step; f <= hi + 1e-9; f += step) {
    ctx.beginPath(); ctx.moveTo(X(f), y0); ctx.lineTo(X(f), y1); ctx.stroke();
    const txt = String(+f.toFixed(6)), w = ctx.measureText(txt).width;
    if (X(f) - w / 2 < tickEnd + 6) continue;
    ctx.fillText(txt, X(f), y1 + 10);
    tickEnd = X(f) + w / 2;
  }

  // band plan: shading in the plot, and the usability strip
  ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, x1 - x0, Hh); ctx.clip();
  let lastLbl = -1e9;
  for (const b of bandsInRange(lo, hi)) {
    const segs = segsFor(b, s), bx0 = X(b.lo), bx1 = X(b.hi);
    if (segs.length) {
      const sl = X(segs[0]![0]), sr = X(segs[segs.length - 1]![1]), sm = (sl + sr) / 2, sw = Math.max(8, sr - sl);
      bandBoxes.push({ band: b, l: Math.max(x0, sm - sw / 2), r: Math.min(x1, sm + sw / 2), t: stripY - 3, b: stripY + stripH + 3 });
    }
    ctx.fillStyle = "rgba(255,255,255,.035)"; ctx.fillRect(bx0, y0, Math.max(1.5, bx1 - bx0), y1 - y0);
    for (const seg of segs) {
      const a = X(seg[0]), c = X(seg[1]), w = Math.max(2, c - a), m = (a + c) / 2;
      ctx.fillStyle = MODES[seg[2]].color + "24"; ctx.fillRect(m - w / 2, y0, w, y1 - y0);
      ctx.fillStyle = MODES[seg[2]].color; ctx.fillRect(m - w / 2, y0, w, 3);
      const u = segUsable(seg, an);
      ctx.fillStyle = u.measured < 0.999 ? "#3a404a" : "rgba(248,81,73,.7)"; ctx.fillRect(m - w / 2, stripY, w, stripH);
      ctx.fillStyle = OK;
      for (const [p, q] of u.parts) {
        const pw = Math.max(1.5, X(q) - X(p));
        ctx.fillRect((X(p) + X(q)) / 2 - pw / 2, stripY, pw, stripH);
      }
    }
    ctx.font = "600 11px -apple-system,Segoe UI,sans-serif"; ctx.textAlign = "center";
    const lw = ctx.measureText(b.name).width;
    // Over the band, but inside the plot, so a band at the edge keeps its whole name.
    const lx = Math.min(Math.max((bx0 + bx1) / 2, x0 + lw / 2), x1 - lw / 2);
    if (lx - lw / 2 > lastLbl + 4) {
      ctx.fillStyle = segs.length ? "#e6edf3" : "#6e7681"; ctx.fillText(b.name, lx, y0 - 12); lastLbl = lx + lw / 2;
      if (segs.length) bandBoxes.push({ band: b, l: lx - lw / 2 - 3, r: lx + lw / 2 + 3, t: y0 - 22, b: y0 - 2 });
    }
  }
  ctx.restore();
  ctx.fillStyle = "#8b949e"; ctx.font = "11px -apple-system,Segoe UI,sans-serif"; ctx.textAlign = "right";
  ctx.fillText("bands", x0 - 6, stripY + stripH / 2);

  // threshold
  ctx.strokeStyle = BAD; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x0, Y(s.thr)); ctx.lineTo(x1, Y(s.thr)); ctx.stroke(); ctx.setLineDash([]);

  // curve: yellow above the threshold; under it, green inside your segments
  // and gray outside them, where a good match still does not let you transmit
  ctx.save(); ctx.beginPath(); ctx.rect(x0, y0 - 2, x1 - x0, y1 - y0 + 4); ctx.clip();
  const path = new Path2D();
  let pen = false;
  for (let i = 0; i < t.N; i++) {
    const fi = t.f[i]!, si = t.s[i]!;
    if (Number.isNaN(si) || Number.isNaN(fi)) { pen = false; continue; }
    if (fi < lo - (hi - lo) * 0.02 || fi > hi + (hi - lo) * 0.02) { pen = false; continue; }
    if (pen) path.lineTo(X(fi), Y(si));
    else path.moveTo(X(fi), Y(si));
    pen = true;
  }
  ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.strokeStyle = HIGH; ctx.stroke(path);
  ctx.beginPath(); ctx.rect(x0, Y(s.thr), x1 - x0, y1 - Y(s.thr) + 2); ctx.clip();
  ctx.strokeStyle = MATCH; ctx.stroke(path);
  ctx.beginPath();
  for (const b of bandsInRange(lo, hi)) for (const seg of segsFor(b, s)) ctx.rect(X(seg[0]), y0, Math.max(1, X(seg[1]) - X(seg[0])), y1 - y0);
  ctx.clip();
  ctx.strokeStyle = OK; ctx.stroke(path);
  ctx.restore();

  const inView = (f: number): boolean => f >= lo && f <= hi;
  // Each label drawn, as a box. On a narrow chart a dip's or peak's label
  // can land on another; it is then left out, and its dot and the Key points
  // table still show it.
  const placed: { l: number; r: number; t: number; b: number }[] = [];
  /** Whether a label at (x, y) would stay clear of every label drawn so far. */
  const clear = (txt: string, x: number, y: number): boolean => {
    ctx.font = "600 11px -apple-system,Segoe UI,sans-serif";
    const w = ctx.measureText(txt).width;
    x = Math.min(Math.max(x, x0 + w / 2 + 4), x1 - w / 2 - 4);
    const l = x - w / 2 - 3, r = x + w / 2 + 3;
    return !placed.some((p) => l < p.r + 4 && r > p.l - 4 && y - 8 < p.b && y + 8 > p.t);
  };
  const tag = (txt: string, x: number, y: number, color: string, optional = false): void => {
    if (optional && !clear(txt, x, y)) return;
    ctx.font = "600 11px -apple-system,Segoe UI,sans-serif";
    const w = ctx.measureText(txt).width;
    x = Math.min(Math.max(x, x0 + w / 2 + 4), x1 - w / 2 - 4);
    placed.push({ l: x - w / 2 - 3, r: x + w / 2 + 3, t: y - 8, b: y + 8 });
    ctx.fillStyle = "rgba(26,31,39,.85)"; ctx.fillRect(x - w / 2 - 3, y - 8, w + 6, 16);
    ctx.fillStyle = color; ctx.textAlign = "center"; ctx.fillText(txt, x, y);
  };
  // extrema
  for (const e of an.extrema) {
    if (!inView(e.f)) continue;
    const x = X(e.f), y = Y(e.s), col = e.type === "dip" ? curveColor(e.s, e.f, s) : "#f2cc60";
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill();
    points.push({ kind: e.type, f: e.f, x, y });
    const val = e.clipped ? "≥" + s.top : e.s.toFixed(2);
    if (e.type === "dip") tag(`${fmtF(e.f)} · ${val}`, x, Math.min(y + 14, y1 - 8), col, true);
    else tag(`${fmtF(e.f)} · ${val}`, x, Math.max(y - 13, y0 + 12), col, true);
  }
  // crossings: dots on the threshold line
  ctx.fillStyle = BAD;
  for (const c of an.crossings) {
    if (!inView(c.f)) continue;
    ctx.beginPath(); ctx.arc(X(c.f), Y(s.thr), 3.5, 0, 7); ctx.fill();
    points.push({ kind: "crossing", f: c.f, x: X(c.f), y: Y(s.thr) });
  }
  // stretches where SWR <= max: a bracket each with its start–end, staggered into two rows
  for (const [a, b] of an.usable) {
    if (b < lo || a > hi) continue;
    const xa = X(Math.max(a, lo)), xb = X(Math.min(b, hi)), txt = `${fmtF(a)}–${fmtF(b)}`, cx = (xa + xb) / 2;
    const rowY = (i: number): number => stripY + stripH + 10 + i * 20;
    // The first row whose text stays clear. With none, the bracket goes on
    // the first row without its text: on a narrow chart the strip and the
    // Band segments table still give the range.
    const r = [0, 1].find((i) => clear(txt, cx, rowY(i) + 10));
    const by = rowY(r ?? 0);
    // Gray, like the curve, outside your segments; green over the parts inside them.
    const inside: [number, number][] = [];
    for (const band of bandsInRange(a, b)) for (const [p, q] of segsFor(band, s)) if (Math.min(b, q) > Math.max(a, p)) inside.push([Math.max(a, p, lo), Math.min(b, q, hi)]);
    inside.sort((p, q) => p[0] - q[0]);
    ctx.lineWidth = 1.5;
    const piece = (p: number, q: number, col: string): void => {
      if (q <= p) return;
      ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(p, by); ctx.lineTo(q, by); ctx.stroke();
    };
    let at = xa;
    for (const [p, q] of inside) {
      const pa = Math.max(X(p), at), pb = Math.max(X(q), pa + 1.5);
      piece(at, pa, MATCH); piece(pa, Math.min(pb, xb), OK); at = Math.min(pb, xb);
    }
    piece(at, xb, MATCH);
    for (const [f, x] of [[Math.max(a, lo), xa], [Math.min(b, hi), xb]] as const) {
      ctx.strokeStyle = inSegment(f, s) ? OK : MATCH;
      ctx.beginPath(); ctx.moveTo(x, by - 4); ctx.lineTo(x, by); ctx.stroke();
    }
    if (r !== undefined) tag(txt, cx, by + 10, inside.length ? OK : MATCH);
  }
  ctx.fillStyle = "#8b949e"; ctx.font = "11px -apple-system,Segoe UI,sans-serif"; ctx.textAlign = "right";
  ctx.fillText(`≤${s.thr}:1`, x0 - 6, stripY + stripH + 20);
  // pinned markers
  for (const m of sc.manual) {
    if (!inView(m)) continue;
    const w = swr(m);
    if (Number.isNaN(w)) continue;
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(X(m), Y(w), 4, 0, 7); ctx.fill();
    points.push({ kind: "pin", f: m, x: X(m), y: Y(w) });
    tag(`${fmtF(m)} · ${w.toFixed(2)}`, X(m), Math.max(Y(w) - 14, y0 + 12), "#fff");
  }
  // the typed frequency: a dashed line, a ring on the curve and its readout
  if (sc.probe != null && inView(sc.probe)) {
    const f = sc.probe, x = X(f), w = swr(f);
    ctx.strokeStyle = PROBE; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); ctx.setLineDash([]);
    if (!Number.isNaN(w)) {
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, Y(w), 5, 0, 7); ctx.stroke();
      points.push({ kind: "probe", f, x, y: Y(w) });
    }
    const txt = `${fmtF(f)} · ${Number.isNaN(w) ? "—" : w >= yTop ? "≥" + yTop : w.toFixed(2)}`;
    // Above the ring, or below it where above is off the plot or taken.
    const up = Y(w) - 18, down = Math.min(Y(w) + 18, y1 - 10);
    const ly = Number.isNaN(w) ? y0 + 10 : up >= y0 + 10 && (clear(txt, x, up) || !clear(txt, x, down)) ? up : down;
    tag(txt, x, ly, PROBE);
  }
  // drag-zoom selection
  const d = sc.drag;
  if (d && Math.abs(d.x1 - d.x0) > 4) {
    ctx.fillStyle = "rgba(242,204,96,.12)";
    ctx.fillRect(Math.min(d.x0, d.x1), y0, Math.abs(d.x1 - d.x0), y1 - y0);
  }
  // hover: a line, a dot on the curve, and the readout
  if (sc.hoverF !== null && !d && sc.hoverF >= lo && sc.hoverF <= hi) {
    const f = sc.hoverF, x = X(f), w = swr(f);
    ctx.strokeStyle = "rgba(255,255,255,.3)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    // A snapped hover rings the key point itself.
    const snapped = sc.snap ? points.find((p) => p.f === f && p.kind === sc.snap) : undefined;
    if (snapped) {
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(snapped.x, snapped.y, 8, 0, 7); ctx.stroke();
    } else if (!Number.isNaN(w)) {
      ctx.fillStyle = curveColor(w, f, s); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, Y(w), 5.5, 0, 7); ctx.fill(); ctx.stroke();
    }
    const band = bandAt(f);
    // Rides with the dot, above it, or below it where above would leave the plot.
    const dy = snapped ? snapped.y : Y(w), off = snapped ? 22 : 18;
    const ly = Number.isNaN(dy) ? y0 + 10 : dy - off >= y0 + 10 ? dy - off : Math.min(dy + off, y1 - 10);
    tag(`${fmtF(f)} MHz · SWR ${Number.isNaN(w) ? "—" : w >= yTop ? "≥" + yTop : w.toFixed(2)}${band ? " · " + band.name : ""}${sc.hoverNote ? " · " + sc.hoverNote : ""}`, x, ly, "#e6edf3");
  }
  return { x0, x1, y0, y1, lo, hi, points, bands: bandBoxes };
}

/** What a band's tooltip says: its name, the lowest and highest SWR over
 *  your segments in it, and how much of them is usable. */
export function bandTip(b: Band, s: Settings, an: Analysis, t: Curve): { name: string; swr: string; usable: string; ok: "all" | "part" | "none" } {
  const segs = segsFor(b, s);
  let min = Infinity, max = -Infinity;
  const take = (w: number): void => { if (!Number.isNaN(w)) { min = Math.min(min, w); max = Math.max(max, w); } };
  for (const [lo, hi] of segs) {
    take(swrOn(t, lo)); take(swrOn(t, hi));
    for (let i = 0; i < t.N; i++) if (t.f[i]! >= lo && t.f[i]! <= hi) take(t.s[i]!);
  }
  const fmt = (w: number): string => (w >= s.top ? "≥" + s.top : w.toFixed(2));
  const total = segs.reduce((a, g) => a + g[1] - g[0], 0);
  const uses = segs.map((g) => segUsable(g, an));
  const frac = total ? uses.reduce((a, u, j) => a + u.frac * (segs[j]![1] - segs[j]![0]), 0) / total : 0;
  const measured = total ? uses.reduce((a, u, j) => a + u.measured * (segs[j]![1] - segs[j]![0]), 0) / total : 0;
  const ok = frac > 0.995 ? "all" : frac > 0.005 ? "part" : "none";
  const usable = (ok === "all" ? "All usable" : ok === "part" ? `Partial: ${Math.round(frac * 100)}% usable` : "None usable") +
    (measured < 0.999 ? " (partly outside sweep)" : "");
  return { name: b.name, swr: min <= max ? (min === max ? `SWR ${fmt(min)}` : `SWR ${fmt(min)}–${fmt(max)}`) : "SWR —", usable, ok };
}
