/* Synthetic NanoVNA screens, for testing the grid finder and the tracer
 * without a browser or a photo: a dark field, a bluish-white plot grid, a
 * yellow curve, and blocks of yellow text-like clutter.
 */

import type { Pixels } from "@/pixels";

export const GRID: readonly [number, number, number] = [200, 210, 240];
export const YELLOW: readonly [number, number, number] = [230, 220, 40];

export interface Canvas extends Pixels {
  data: Uint8ClampedArray;
  dot(x: number, y: number, rgb: readonly [number, number, number], r?: number): void;
  line(x0: number, y0: number, x1: number, y1: number, rgb: readonly [number, number, number], r?: number): void;
}

export function blank(width: number, height: number): Canvas {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = 18; data[i + 1] = 21; data[i + 2] = 40; data[i + 3] = 255; }
  const dot = (x: number, y: number, rgb: readonly [number, number, number], r = 1): void => {
    for (let yy = Math.round(y - r); yy <= Math.round(y + r); yy++)
      for (let xx = Math.round(x - r); xx <= Math.round(x + r); xx++) {
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const i = (yy * width + xx) * 4;
        data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2];
      }
  };
  const line = (x0: number, y0: number, x1: number, y1: number, rgb: readonly [number, number, number], r = 1): void => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
    for (let k = 0; k <= n; k++) dot(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, rgb, r);
  };
  return { width, height, data, dot, line };
}

export interface Screen {
  px: Canvas;
  /** The plot's true corners: top left, top right, bottom right, bottom left. */
  corners: [[number, number], [number, number], [number, number], [number, number]];
  /** The curve's true position down the plot, 0..1, at u = 0..1. */
  curve(u: number): number;
}

/** A plot grid of `cols` × `rows` cells with a curve through it. `skew` tilts
 *  the grid the way a photo taken off axis does: the right edge drops by that
 *  many pixels and the bottom shifts right by half of it. */
export function screen(opts: { skew?: number; clutter?: boolean } = {}): Screen {
  const px = blank(1200, 900);
  const skew = opts.skew ?? 0;
  const corners: Screen["corners"] = [[100, 80], [1100, 80 + skew], [1100 + skew / 2, 820 + skew], [100 + skew / 2, 820]];
  const [tl, tr, br, bl] = corners;
  // Bilinear is exact for the parallelograms used here.
  const at = (u: number, v: number): [number, number] => [
    tl[0] + (tr[0] - tl[0]) * u + (bl[0] - tl[0]) * v + (tl[0] - tr[0] + br[0] - bl[0]) * u * v,
    tl[1] + (tr[1] - tl[1]) * u + (bl[1] - tl[1]) * v + (tl[1] - tr[1] + br[1] - bl[1]) * u * v,
  ];
  for (let c = 0; c <= 10; c++) { const [a, b] = [at(c / 10, 0), at(c / 10, 1)]; px.line(a[0], a[1], b[0], b[1], GRID, 1); }
  for (let r = 0; r <= 8; r++) { const [a, b] = [at(0, r / 8), at(1, r / 8)]; px.line(a[0], a[1], b[0], b[1], GRID, 1); }
  const curve = (u: number): number => 0.5 + 0.32 * Math.sin(2 * Math.PI * 2 * u);
  let prev = at(0, curve(0));
  for (let k = 1; k <= 2000; k++) {
    const u = k / 2000, p = at(u, curve(u));
    px.line(prev[0], prev[1], p[0], p[1], YELLOW, 1.5);
    prev = p;
  }
  if (opts.clutter) {
    // A row of "characters" over the curve's second peak, like the NanoVNA's
    // `S11 SWR 500m/ 2.970` header lying across the trace: narrow yellow
    // strokes with dark gaps, standing above and below the curve.
    for (let ch = 0; ch < 8; ch++) {
      const [x, y] = at(0.3 + ch * 0.018, 0.12);
      for (let s = 0; s < 3; s++) px.line(x + s * 5, y, x + s * 5, y + 60, YELLOW, 1);
    }
  }
  return { px, corners, curve };
}
