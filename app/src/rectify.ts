/* Straighten: a perspective-corrected copy of the photo, with the plot grid
 * squared up and a margin around it. Tracing always samples the original
 * photo through the homography, so this is only for showing it.
 */

import type { Point, Quad } from "./geometry";
import type { Pixels } from "./pixels";

export interface Rectified {
  data: Uint8ClampedArray;
  W: number;
  H: number;
  /** Where the plot sits inside the copy: its margins and size. */
  mx: number;
  my: number;
  pw: number;
  ph: number;
}

export function rectify(px: Pixels, fwd: (u: number, v: number) => Point, c: Quad, maxWidth = 3000): Rectified {
  const d = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const MX = 0.07, MY = 0.12;
  let pw = (d(c[0], c[1]) + d(c[3], c[2])) / 2, ph = (d(c[0], c[3]) + d(c[1], c[2])) / 2;
  const sc = Math.min(1, maxWidth / (pw * (1 + 2 * MX)));
  pw *= sc;
  ph *= sc;
  const W = Math.round(pw * (1 + 2 * MX)), H = Math.round(ph * (1 + 2 * MY)), mx = pw * MX, my = ph * MY;
  const o = new Uint8ClampedArray(W * H * 4), { width: iw, height: ih, data: pix } = px;
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5 - my) / ph;
    for (let x = 0; x < W; x++) {
      const [sx, sy] = fwd((x + 0.5 - mx) / pw, v), k = (y * W + x) * 4;
      const x0 = Math.floor(sx - 0.5), y0 = Math.floor(sy - 0.5), fx = sx - 0.5 - x0, fy = sy - 0.5 - y0;
      o[k + 3] = 255;
      if (!(x0 >= 0 && y0 >= 0 && x0 < iw - 1 && y0 < ih - 1)) continue;
      const i00 = (y0 * iw + x0) * 4, i01 = i00 + iw * 4;
      for (let ch = 0; ch < 3; ch++)
        o[k + ch] =
          (pix[i00 + ch]! * (1 - fx) + pix[i00 + 4 + ch]! * fx) * (1 - fy) +
          (pix[i01 + ch]! * (1 - fx) + pix[i01 + 4 + ch]! * fx) * fy;
    }
  }
  return { data: o, W, H, mx, my, pw, ph };
}
