/* A part of the screen, cut out of the photo and squared up, for OCR to read
 * on its own: the START/STOP row, the SWR labels, the header.
 *
 * The part is placed in plot units, from the grid's corners, so it is found
 * however the photo is framed or tilted, and sampled at about the photo's own
 * resolution. Brightness is red and green: the text is white or yellow.
 */

import { mappingFor, type Quad } from "./geometry";
import type { Pixels } from "./pixels";

/** A squared-up part: brightness 0..255, row major. */
export interface Strip {
  gray: Float32Array;
  width: number;
  height: number;
  /** The background and the brightest text, for cuts between them. */
  lo: number;
  hi: number;
}

/** Where a part lies, in plot units: u across, v down from the top line. */
export interface Area {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

/** The part of the photo in `area`, squared up. `dropLines` blanks rows and
 *  columns bright across most of the part: grid lines through it. */
export function squareUp(px: Pixels, corners: Quad, area: Area, dropLines = false): Strip | null {
  const { u0, u1, v0, v1 } = area;
  const [tl, tr, , bl] = corners;
  const gw = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]), gh = Math.hypot(bl[0] - tl[0], bl[1] - tl[1]);
  const height = Math.round((v1 - v0) * gh), width = Math.round((u1 - u0) * gw);
  if (height < 12 || width < 12) return null;
  const fwd = mappingFor(corners).fwd, { width: iw, height: ih, data: d } = px;
  const gray = new Float32Array(width * height);
  for (let j = 0; j < height; j++) {
    const v = v0 + ((v1 - v0) * (j + 0.5)) / height;
    for (let i = 0; i < width; i++) {
      const [sx, sy] = fwd(u0 + ((u1 - u0) * (i + 0.5)) / width, v);
      const x = Math.floor(sx), y = Math.floor(sy);
      if (x < 0 || y < 0 || x >= iw - 1 || y >= ih - 1) continue;
      const fx = sx - x, fy = sy - y, a = (y * iw + x) * 4, b = a + iw * 4;
      const at = (k: number): number => (d[k]! + d[k + 1]!) / 2;
      gray[j * width + i] = (at(a) * (1 - fx) + at(a + 4) * fx) * (1 - fy) + (at(b) * (1 - fx) + at(b + 4) * fx) * fy;
    }
  }
  const sorted = Float32Array.from(gray).sort();
  const lo = sorted[Math.floor(sorted.length * 0.5)]!, hi = sorted[Math.floor(sorted.length * 0.985)]!;
  if (hi - lo < 30) return null;
  const strip = { gray, width, height, lo, hi };
  if (dropLines) blankLines(strip);
  return strip;
}

/** Blank rows and columns more than half bright: grid lines, not text. */
function blankLines(s: Strip): void {
  const cut = (s.lo + s.hi) / 2, { gray, width: w, height: h } = s;
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (gray[y * w + x]! > cut) n++;
    if (n > w / 2) for (let x = 0; x < w; x++) gray[y * w + x] = s.lo;
  }
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = 0; y < h; y++) if (gray[y * w + x]! > cut) n++;
    if (n > h / 2) for (let y = 0; y < h; y++) gray[y * w + x] = s.lo;
  }
}

/** The part as black text on white, RGBA, for OCR. `cut` is how far from
 *  background to the brightest text a pixel must be to count as text. */
export function stripImage(s: Strip, cut: number): Uint8ClampedArray<ArrayBuffer> {
  const t = s.lo + (s.hi - s.lo) * cut, out = new Uint8ClampedArray(s.gray.length * 4);
  for (let k = 0; k < s.gray.length; k++) {
    const v = s.gray[k]! > t ? 0 : 255;
    out[k * 4] = out[k * 4 + 1] = out[k * 4 + 2] = v;
    out[k * 4 + 3] = 255;
  }
  return out;
}
