/* Which way up a photo of the screen is.
 *
 * A phone held flat over a bench guesses its orientation, and often guesses
 * wrong, so the browser can draw the screen on its side or upside down. The
 * plot grid is wider than tall, and the START/STOP row runs under it. Try each
 * quarter turn until both hold.
 */

import { detectGrid } from "./grid";
import type { Pixels } from "./pixels";

/** Clockwise quarter turns. */
export type Turns = 0 | 1 | 2 | 3;

/** `px` turned clockwise by `turns` quarter turns. */
export function rotatePixels(px: Pixels, turns: Turns): Pixels {
  if (turns === 0) return px;
  const { width: w, height: h, data: d } = px;
  const W = turns === 2 ? w : h, H = turns === 2 ? h : w;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [X, Y] = turns === 1 ? [h - 1 - y, x] : turns === 2 ? [w - 1 - x, h - 1 - y] : [y, w - 1 - x];
      const i = (y * w + x) * 4, j = (Y * W + X) * 4;
      out[j] = d[i]!; out[j + 1] = d[i + 1]!; out[j + 2] = d[i + 2]!; out[j + 3] = d[i + 3]!;
    }
  }
  return { width: W, height: H, data: out };
}

/** The share of bright pixels in a band beside the grid's top or bottom
 *  edge, outside the grid, across its width. */
export function textBeside(px: Pixels, c: readonly (readonly [number, number])[], below: boolean): number {
  const [tl, tr, br, bl] = c as [[number, number], [number, number], [number, number], [number, number]];
  const [a, b] = below ? [bl, br] : [tl, tr];
  // Outward, perpendicular to the edge, one unit per pixel.
  const ox = below ? bl[0] - tl[0] : tl[0] - bl[0], oy = below ? bl[1] - tl[1] : tl[1] - bl[1];
  const tall = Math.hypot(ox, oy), wide = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = ox / tall, uy = oy / tall;
  // The START/STOP row sits within a tenth of the grid's height of its edge.
  const from = Math.max(3, tall * 0.015), to = tall * 0.1;
  let n = 0, all = 0;
  for (let s = 0.05; s <= 0.95; s += 1 / wide) {
    const ex = a[0] + (b[0] - a[0]) * s, ey = a[1] + (b[1] - a[1]) * s;
    for (let k = from; k <= to; k += 1) {
      const x = Math.round(ex + ux * k), y = Math.round(ey + uy * k);
      all++;
      if (x < 0 || y < 0 || x >= px.width || y >= px.height) continue;
      const i = (y * px.width + x) * 4, d = px.data;
      if ((d[i]! + d[i + 1]!) / 2 > 170) n++;
    }
  }
  return all ? n / all : 0;
}

/** The quarter turns that stand the screen upright. Text under the grid and
 *  not over it settles which way up a grid wider than tall is. Without it, a
 *  photo cropped under the grid, say, keep the first turn that lays the grid
 *  wide, and never turn it upside down on a guess. */
export function uprightTurns(px: Pixels): Turns {
  let wide: Turns | null = null;
  for (const t of [0, 1, 3, 2] as const) {
    const p = rotatePixels(px, t), g = detectGrid(p);
    if (!g) continue;
    const [tl, tr, , bl] = g.corners;
    if (Math.hypot(tr[0] - tl[0], tr[1] - tl[1]) <= Math.hypot(bl[0] - tl[0], bl[1] - tl[1])) continue;
    const below = textBeside(p, g.corners, true), above = textBeside(p, g.corners, false);
    if (below >= ROW && below > 3 * above) return t;
    if (wide === null && t !== 2) wide = t;
  }
  return wide ?? 0;
}

/** The share of bright pixels in the band under the grid that marks the
 *  START/STOP row. The NanoVNA photos give 0.12 to 0.19 with the row, and
 *  under 0.01 without. */
const ROW = 0.05;
