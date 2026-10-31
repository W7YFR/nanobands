/* The chart, drawn: SWR against frequency, the band plan and the usable
 * stretches under it, the key points, pins, the zoom selection and the hover
 * readout.
 */

import { segUsable, type Analysis } from "@/analysis";
import { MODES, bandAt, bandsInRange, segsFor } from "@/bands";
import { fmtF, niceStep } from "@/format";
import { swrOn, type Curve, type Settings } from "./model";
import { BAD, OK } from "./colors";

/** Where the plot sits, for turning a pointer position into a frequency. */
export interface ChartGeom {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  lo: number;
  hi: number;
}

export const freqAt = (g: ChartGeom, x: number): number => g.lo + ((x - g.x0) / (g.x1 - g.x0)) * (g.hi - g.lo);

export interface ChartScene {
  settings: Settings;
  an: Analysis | null;
  curve: Curve | null;
  range: [number, number] | null;
  manual: readonly number[];
  hoverF: number | null;
  /** A zoom being dragged, in CSS pixels. */
  drag: { x0: number; x1: number } | null;
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

  // grid
  ctx.strokeStyle = "#262d37"; ctx.lineWidth = 1; ctx.fillStyle = "#8b949e"; ctx.font = "11px -apple-system,Segoe UI,sans-serif";
  const ys = yTop - yBot > 6 ? 1 : 0.5;
  ctx.textAlign = "right";
  for (let w = Math.ceil(yBot / ys) * ys; w <= yTop + 1e-9; w += ys) {
    ctx.beginPath(); ctx.moveTo(x0, Y(w)); ctx.lineTo(x1, Y(w)); ctx.stroke(); ctx.fillText(w.toFixed(1), x0 - 6, Y(w));
  }
  const step = niceStep((hi - lo) / Math.max(4, W / 110));
  ctx.textAlign = "center";
  for (let f = Math.ceil(lo / step) * step; f <= hi + 1e-9; f += step) {
    ctx.beginPath(); ctx.moveTo(X(f), y0); ctx.lineTo(X(f), y1); ctx.stroke();
    ctx.fillText(String(+f.toFixed(6)), X(f), y1 + 10);
  }
  ctx.fillText("MHz", x1 - 12, y1 + 10);

  // band plan: shading in the plot, and the usability strip
  ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, x1 - x0, Hh); ctx.clip();
  let lastLbl = -1e9;
  for (const b of bandsInRange(lo, hi)) {
    const segs = segsFor(b, s), bx0 = X(b.lo), bx1 = X(b.hi);
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
    const lx = (bx0 + bx1) / 2;
    ctx.font = "600 11px -apple-system,Segoe UI,sans-serif"; ctx.textAlign = "center";
    const lw = ctx.measureText(b.name).width;
    if (lx - lw / 2 > lastLbl + 4) { ctx.fillStyle = segs.length ? "#e6edf3" : "#6e7681"; ctx.fillText(b.name, lx, y0 - 12); lastLbl = lx + lw / 2; }
  }
  ctx.restore();
  ctx.fillStyle = "#8b949e"; ctx.font = "11px -apple-system,Segoe UI,sans-serif"; ctx.textAlign = "right";
  ctx.fillText("bands", x0 - 6, stripY + stripH / 2);

  // threshold
  ctx.strokeStyle = BAD; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x0, Y(s.thr)); ctx.lineTo(x1, Y(s.thr)); ctx.stroke(); ctx.setLineDash([]);

  // curve: yellow above the threshold, green at or under it
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
  ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.strokeStyle = "#e3c84a"; ctx.stroke(path);
  ctx.beginPath(); ctx.rect(x0, Y(s.thr), x1 - x0, y1 - Y(s.thr) + 2); ctx.clip();
  ctx.strokeStyle = OK; ctx.stroke(path);
  ctx.restore();

  const inView = (f: number): boolean => f >= lo && f <= hi;
  const tag = (txt: string, x: number, y: number, color: string): void => {
    ctx.font = "600 11px -apple-system,Segoe UI,sans-serif";
    const w = ctx.measureText(txt).width;
    x = Math.min(Math.max(x, x0 + w / 2 + 4), x1 - w / 2 - 4);
    ctx.fillStyle = "rgba(26,31,39,.85)"; ctx.fillRect(x - w / 2 - 3, y - 8, w + 6, 16);
    ctx.fillStyle = color; ctx.textAlign = "center"; ctx.fillText(txt, x, y);
  };
  // extrema
  for (const e of an.extrema) {
    if (!inView(e.f)) continue;
    const x = X(e.f), y = Y(e.s), col = e.type === "dip" ? OK : "#f2cc60";
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill();
    const val = e.clipped ? "≥" + s.top : e.s.toFixed(2);
    if (e.type === "dip") tag(`${fmtF(e.f)} · ${val}`, x, Math.min(y + 14, y1 - 8), col);
    else tag(`${fmtF(e.f)} · ${val}`, x, Math.max(y - 13, y0 + 12), col);
  }
  // crossings: dots on the threshold line
  ctx.fillStyle = BAD;
  for (const c of an.crossings) if (inView(c.f)) { ctx.beginPath(); ctx.arc(X(c.f), Y(s.thr), 3.5, 0, 7); ctx.fill(); }
  // stretches where SWR <= max: a bracket each with its start–end, staggered into two rows
  const rows: number[] = [];
  ctx.font = "600 11px -apple-system,Segoe UI,sans-serif";
  for (const [a, b] of an.usable) {
    if (b < lo || a > hi) continue;
    const xa = X(Math.max(a, lo)), xb = X(Math.min(b, hi)), txt = `${fmtF(a)}–${fmtF(b)}`, w = ctx.measureText(txt).width + 10;
    const cx = (xa + xb) / 2, left = Math.min(xa, cx - w / 2), right = Math.max(xb, cx + w / 2);
    let r = 0;
    while (r < 1 && rows[r] !== undefined && rows[r]! > left) r++;
    rows[r] = right;
    const by = stripY + stripH + 10 + r * 20;
    ctx.strokeStyle = OK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(xa, by - 4); ctx.lineTo(xa, by); ctx.lineTo(xb, by); ctx.lineTo(xb, by - 4); ctx.stroke();
    tag(txt, cx, by + 10, OK);
  }
  ctx.fillStyle = "#8b949e"; ctx.font = "11px -apple-system,Segoe UI,sans-serif"; ctx.textAlign = "right";
  ctx.fillText(`≤${s.thr}:1`, x0 - 6, stripY + stripH + 20);
  // pinned markers
  for (const m of sc.manual) {
    if (!inView(m)) continue;
    const w = swr(m);
    if (Number.isNaN(w)) continue;
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(X(m), Y(w), 4, 0, 7); ctx.fill();
    tag(`${fmtF(m)} · ${w.toFixed(2)}`, X(m), Math.max(Y(w) - 14, y0 + 12), "#fff");
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
    if (!Number.isNaN(w)) {
      ctx.fillStyle = w <= s.thr ? OK : "#e3c84a"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, Y(w), 5.5, 0, 7); ctx.fill(); ctx.stroke();
    }
    const band = bandAt(f);
    // Rides with the dot, above it, or below it where above would leave the plot.
    const ly = Number.isNaN(w) ? y0 + 10 : Y(w) - 18 >= y0 + 10 ? Y(w) - 18 : Math.min(Y(w) + 18, y1 - 10);
    tag(`${fmtF(f)} MHz · SWR ${Number.isNaN(w) ? "—" : w >= yTop ? "≥" + yTop : w.toFixed(2)}${band ? " · " + band.name : ""}`, x, ly, "#e6edf3");
  }
  return { x0, x1, y0, y1, lo, hi };
}
