/* The photo's plot grid as a projective map.
 *
 * The grid is a rectangle on the NanoVNA's screen and a skewed quadrilateral
 * in a photo of it. A homography maps the unit square onto that quadrilateral,
 * so a point on the plot is (u, v) with u = 0..1 left to right (frequency) and
 * v = 0..1 top to bottom (SWR), wherever it lands in the photo.
 */

export type Point = [x: number, y: number];
/** Corners in photo pixels: top left, top right, bottom right, bottom left. */
export type Quad = [Point, Point, Point, Point];
/** A 3×3 matrix, row major. */
export type Mat3 = readonly number[];

/** The homography that takes the unit square onto `q`. */
export function squareToQuad(q: Quad): Mat3 {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den;
    h = (dx1 * sy - sx * dy1) / den;
  }
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}

export function inv3(m: Mat3): Mat3 {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0, i = 0] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  ];
}

export function apply(m: Mat3, x: number, y: number): Point {
  const w = m[6]! * x + m[7]! * y + m[8]!;
  return [(m[0]! * x + m[1]! * y + m[2]!) / w, (m[3]! * x + m[4]! * y + m[5]!) / w];
}

/** Both directions at once: plot → photo and photo → plot. */
export interface Mapping {
  fwd(u: number, v: number): Point;
  back(x: number, y: number): Point;
}

export function mappingFor(q: Quad): Mapping {
  const H = squareToQuad(q), Hi = inv3(H);
  return { fwd: (u, v) => apply(H, u, v), back: (x, y) => apply(Hi, x, y) };
}

/** The sweep's start and stop from two or more points of known frequency:
 *  a least-squares line through (u, f), read at u = 0 and u = 1. */
export function solveRefs(refs: readonly { u: number; f: number }[]): { start: number; stop: number } | null {
  if (refs.length < 2) return null;
  const n = refs.length;
  const mu = refs.reduce((a, p) => a + p.u, 0) / n, mf = refs.reduce((a, p) => a + p.f, 0) / n;
  let sxy = 0, sxx = 0;
  for (const p of refs) { sxy += (p.u - mu) * (p.f - mf); sxx += (p.u - mu) ** 2; }
  if (sxx < 1e-12) return null;
  const b = sxy / sxx, a = mf - b * mu;
  return { start: a, stop: a + b };
}
