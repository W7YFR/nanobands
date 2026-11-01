/* The photo view, drawn: the photo, the band plan over it, the traced curve,
 * its key points, the corner handles and the magnifier.
 */

import { atTop, segUsable, type Analysis } from "@/analysis";
import { MODES, bandsInRange, segsFor } from "@/bands";
import { fmtF, niceStep } from "@/format";
import type { Point, Quad } from "@/geometry";
import { calOK, swrOn, type Curve, type Settings, type Trace, type View } from "./model";
import { BAD, TRACE, curveColor } from "./colors";

export interface PhotoScene {
  view: View;
  corners: Quad;
  settings: Settings;
  an: Analysis | null;
  trace: Trace | null;
  curve: Curve | null;
  refs: readonly { u: number; f: number }[];
  manual: readonly number[];
  hoverF: number | null;
  dragCorner: number;
}

function quad(ctx: CanvasRenderingContext2D, vw: View, u0: number, u1: number, v0: number, v1: number): void {
  ctx.beginPath();
  ([[u0, v0], [u1, v0], [u1, v1], [u0, v1]] as const).forEach(([u, v], j) => {
    const [x, y] = vw.vf(u, v);
    if (j) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
}

function lineUV(ctx: CanvasRenderingContext2D, vw: View, u0: number, v0: number, u1: number, v1: number): void {
  const a = vw.vf(u0, v0), b = vw.vf(u1, v1);
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
}

function label(ctx: CanvasRenderingContext2D, txt: string, x: number, y: number, U: number, color: string,
  align: "center" | "right" | "left" = "center", bg = "rgba(13,17,23,.82)"): void {
  ctx.font = `600 ${12 * U}px -apple-system,Segoe UI,sans-serif`;
  const w = ctx.measureText(txt).width, pad = 3 * U, hgt = 16 * U;
  const x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x0 - pad, y - hgt / 2, w + 2 * pad, hgt, 3 * U); ctx.fill();
  ctx.fillStyle = color; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(txt, x0, y + 0.5 * U);
}

export function strokeTrace(ctx: CanvasRenderingContext2D, vw: View, t: Trace | null): void {
  if (!t || t.kind !== "photo") return;
  ctx.beginPath();
  let pen = false;
  for (let i = 0; i < t.N; i++) {
    if (Number.isNaN(t.v[i])) { pen = false; continue; }
    const [x, y] = vw.vf((i + 0.5) / t.N, t.v[i]!);
    if (pen) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
    pen = true;
  }
  ctx.stroke();
}

/** Draw in view pixels. U is view pixels per CSS pixel, so the overlay looks
 *  the same on screen and in the exported PNG. */
export function drawPhoto(ctx: CanvasRenderingContext2D, U: number, sc: PhotoScene, forExport: boolean): void {
  const { view: vw, settings: s, an } = sc;
  ctx.drawImage(vw.src, 0, 0);
  const cal = calOK(s), uOf = (f: number): number => (f - s.start) / (s.stop - s.start);
  const vT = (s.thr - s.top) / (s.bot - s.top);
  // band plan
  if (cal) {
    for (const b of bandsInRange(s.start, s.stop)) {
      for (const seg of segsFor(b, s)) {
        const u0 = Math.max(0, uOf(seg[0])), u1 = Math.min(1, uOf(seg[1]));
        if (u1 <= u0) continue;
        const minW = (1.5 * U) / (vw.vf(1, 0)[0] - vw.vf(0, 0)[0] || 1);
        const ua = (u0 + u1) / 2 - Math.max(u1 - u0, minW) / 2, ub = (u0 + u1) / 2 + Math.max(u1 - u0, minW) / 2;
        if (an) {
          ctx.fillStyle = "rgba(248,81,73,.22)"; quad(ctx, vw, ua, ub, 0, 1); ctx.fill();
          ctx.fillStyle = "rgba(63,185,80,.38)";
          for (const [a, c] of segUsable(seg, an).parts) {
            const pa = Math.max(0, uOf(a)), pb = Math.min(1, uOf(c));
            const w = Math.max(pb - pa, minW);
            quad(ctx, vw, (pa + pb) / 2 - w / 2, (pa + pb) / 2 + w / 2, 0, 1); ctx.fill();
          }
        } else {
          ctx.fillStyle = MODES[seg[2]].color + "40"; quad(ctx, vw, ua, ub, 0, 1); ctx.fill();
        }
      }
      const um = Math.min(1, Math.max(0, uOf((b.lo + b.hi) / 2)));
      const [x, y] = vw.vf(um, 0);
      label(ctx, b.name, x, y - 12 * U, U, segsFor(b, s).length ? "#e6edf3" : "#8b949e");
    }
    // frequency ticks, for checking calibration against the VNA's own grid
    const step = niceStep((s.stop - s.start) / 10);
    ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1 * U; ctx.setLineDash([3 * U, 4 * U]);
    for (let f = Math.ceil(s.start / step) * step; f <= s.stop + 1e-9; f += step) { lineUV(ctx, vw, uOf(f), 0, uOf(f), 1); ctx.stroke(); }
    ctx.setLineDash([]);
    for (let f = Math.ceil(s.start / step) * step; f <= s.stop + 1e-9; f += step) {
      const [x, y] = vw.vf(uOf(f), 1);
      label(ctx, String(+f.toFixed(6)), x, y + 12 * U, U, "#c9d1d9");
    }
  }
  // threshold line
  if (vT > 0 && vT < 1) {
    ctx.strokeStyle = BAD; ctx.lineWidth = 1.5 * U; ctx.setLineDash([6 * U, 4 * U]); lineUV(ctx, vw, 0, vT, 1, vT); ctx.stroke(); ctx.setLineDash([]);
    const [x, y] = vw.vf(1, vT);
    label(ctx, "SWR " + s.thr, x - 6 * U, y - 11 * U, U, BAD, "right");
  }
  // quad outline
  ctx.strokeStyle = "rgba(242,204,96,.7)"; ctx.lineWidth = 1 * U; quad(ctx, vw, 0, 1, 0, 1); ctx.stroke();
  // frequency references
  for (const r of sc.refs) {
    ctx.strokeStyle = "#ff7bd5"; ctx.lineWidth = 1.5 * U; lineUV(ctx, vw, r.u, 0, r.u, 1); ctx.stroke();
    const [x, y] = vw.vf(r.u, 0.5);
    label(ctx, r.f + " MHz", x, y, U, "#ff7bd5");
  }
  // traced curve
  ctx.strokeStyle = TRACE; ctx.lineWidth = 1.6 * U; strokeTrace(ctx, vw, sc.trace);
  // key points
  if (an && cal) {
    const swr = (f: number): number => swrOn(sc.curve, f);
    const pt = (f: number, sw: number): Point => vw.vf(uOf(f), Math.min(1, Math.max(0, (sw - s.top) / (s.bot - s.top))));
    for (const c of an.crossings) {
      const [x, y] = pt(c.f, s.thr);
      ctx.fillStyle = BAD; ctx.beginPath(); ctx.arc(x, y, 4 * U, 0, 7); ctx.fill();
    }
    for (const e of an.extrema) {
      const [x, y] = pt(e.f, e.s), col = e.type === "dip" ? curveColor(e.s, e.f, s) : "#f2cc60";
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 4.5 * U, 0, 7); ctx.fill();
      label(ctx, `${fmtF(e.f)} · ${e.clipped ? "≥" + s.top : e.s.toFixed(2)}`, x, y + (e.type === "dip" ? 16 : -16) * U, U, col);
    }
    // crossing labels, staggered so neighbours don't overlap
    const rows: number[] = [];
    ctx.font = `600 ${12 * U}px sans-serif`;
    for (const c of an.crossings) {
      const [x, y] = pt(c.f, s.thr), txt = fmtF(c.f), w = ctx.measureText(txt).width + 10 * U;
      let r = 0;
      while (rows[r] !== undefined && rows[r]! > x - w / 2) r++;
      rows[r] = x + w / 2;
      label(ctx, txt, x, y + (r % 2 ? -1 : 1) * (14 + 16 * Math.floor(r / 2)) * U, U, "#ff9a94");
    }
    for (const m of sc.manual) {
      const sw = swr(m);
      if (Number.isNaN(sw)) continue;
      const [x, y] = pt(m, sw);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, 4 * U, 0, 7); ctx.fill();
      label(ctx, `${fmtF(m)} · ${sw.toFixed(2)}`, x, y - 16 * U, U, "#fff");
    }
    if (!forExport && sc.hoverF !== null) {
      const u = uOf(sc.hoverF), sw = swr(sc.hoverF);
      ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1 * U; lineUV(ctx, vw, u, 0, u, 1); ctx.stroke();
      if (!Number.isNaN(sw)) {
        const [x, y] = pt(sc.hoverF, sw);
        ctx.fillStyle = curveColor(sw, sc.hoverF, s); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2 * U;
        ctx.beginPath(); ctx.arc(x, y, 6 * U, 0, 7); ctx.fill(); ctx.stroke();
        label(ctx, `${fmtF(sc.hoverF)} MHz · SWR ${atTop(sw, s) ? "≥" + s.top : sw.toFixed(2)}`, x, y - 20 * U, U, "#e6edf3");
      }
    }
  }
  if (forExport || vw.straight) return;
  drawHandles(ctx, U, sc.corners, sc.dragCorner);
}

function drawHandles(ctx: CanvasRenderingContext2D, U: number, corners: Quad, dragCorner: number): void {
  corners.forEach(([x, y], j) => {
    ctx.lineWidth = 2 * U; ctx.strokeStyle = j === dragCorner ? "#fff" : "#f2cc60";
    ctx.beginPath(); ctx.arc(x, y, 9 * U, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 4 * U, y); ctx.lineTo(x + 4 * U, y); ctx.moveTo(x, y - 4 * U); ctx.lineTo(x, y + 4 * U); ctx.stroke();
  });
}

/** While a corner is dragged, over the photo: the grid's outline and the
 *  handles, nothing that needs the corners settled. The overlay comes back
 *  on release. */
export function drawCornerDrag(ctx: CanvasRenderingContext2D, U: number, corners: Quad, dragCorner: number): void {
  ctx.strokeStyle = "rgba(242,204,96,.7)"; ctx.lineWidth = 1 * U;
  ctx.beginPath();
  corners.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath(); ctx.stroke();
  drawHandles(ctx, U, corners, dragCorner);
}

/** Size a canvas to w × h device pixels. Resizing throws its pixels away and
 *  costs a new buffer, so only when the size changes; otherwise clear it. */
export function fitCanvas(c: HTMLCanvasElement, ctx: CanvasRenderingContext2D, w: number, h: number): void {
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; return; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
}

/** A round magnifier near the pointer, for placing corners and drawing with
 *  the pen. In CSS pixels; k is CSS pixels per view pixel. */
/** The pen's full-screen view: the photo and its trace, nothing else, so
 *  nothing covers the curve. The photo is drawn at sx by sy CSS pixels per
 *  view pixel, with its top-left at (ox, oy); sx above sy stretches it wide. */
export function drawPenView(ctx: CanvasRenderingContext2D, dpr: number, sc: PhotoScene, sx: number, sy: number, ox: number, oy: number): void {
  ctx.setTransform(dpr * sx, 0, 0, dpr * sy, dpr * ox, dpr * oy);
  ctx.drawImage(sc.view.src, 0, 0);
  const t = sc.trace;
  if (t?.kind !== "photo") return;
  // In screen pixels, so the line keeps its width however the photo is stretched.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = TRACE; ctx.lineWidth = 2; ctx.lineJoin = "round";
  ctx.beginPath();
  let pen = false;
  for (let i = 0; i < t.N; i++) {
    if (Number.isNaN(t.v[i])) { pen = false; continue; }
    const [x, y] = sc.view.vf((i + 0.5) / t.N, t.v[i]!);
    if (pen) ctx.lineTo(ox + x * sx, oy + y * sy);
    else ctx.moveTo(ox + x * sx, oy + y * sy);
    pen = true;
  }
  ctx.stroke();
}

/** The magnifier, for a photo drawn at k CSS pixels per view pixel (kx across)
 *  with its top-left at (ox, oy) on a canvas cw CSS pixels wide. */
export function drawMagnifier(ctx: CanvasRenderingContext2D, dpr: number, k: number, sc: PhotoScene, hover: Point, ox = 0, oy = 0, cw = sc.view.w * k, kx = k): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const R = 64, Z = 4, d = sc.dragCorner;
  const hx = ox + hover[0] * kx, hy = oy + hover[1] * k;
  let cx: number, cy: number;
  if (d >= 0) {
    // Fixed per corner so it never jumps mid-drag: top corners look below, bottom corners above.
    cx = hx + (d === 0 || d === 3 ? 1.6 * R : -1.6 * R);
    cy = hy + (d <= 1 ? 1.6 * R : -1.6 * R);
  } else {
    cx = hx + (hx > cw - 2.6 * R ? -1.6 * R : 1.6 * R);
    cy = hy + (hy < 2.6 * R ? 1.6 * R : -1.6 * R);
  }
  const sw = (2 * R) / (k * Z);
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
  ctx.fillStyle = "#000"; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sc.view.src, hover[0] - sw / 2, hover[1] - sw / 2, sw, sw, cx - R, cy - R, 2 * R, 2 * R);
  // The trace too, at the same zoom, so Pen fix shows the line it is correcting
  // and the stroke going down as it is drawn.
  if (sc.trace?.kind === "photo") {
    const m = k * Z;
    ctx.save();
    ctx.setTransform(dpr * m, 0, 0, dpr * m, dpr * (cx - hover[0] * m), dpr * (cy - hover[1] * m));
    ctx.strokeStyle = TRACE; ctx.lineWidth = 2 / m; ctx.lineJoin = "round";
    strokeTrace(ctx, sc.view, sc.trace);
    ctx.restore();
  }
  ctx.strokeStyle = "#ff3b6b"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = "#f2cc60"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
}
