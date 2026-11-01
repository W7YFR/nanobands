/** An RGBA image, row major, four bytes per pixel: the shape of ImageData,
 *  without needing a browser to make one. */
export interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray | Uint8Array;
}

/** Whether a pixel is part of the screen's yellow trace. `sens` is how much
 *  more red and green than blue it needs: the Color sensitivity slider. */
export function isYellowAt(px: Pixels, x: number, y: number, sens: number): boolean {
  if (x < 0 || y < 0 || x >= px.width || y >= px.height) return false;
  const i = ((y | 0) * px.width + (x | 0)) * 4, d = px.data;
  const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!, m = Math.min(r, g);
  // A bright trace clips toward white at its core: red and green saturate
  // and blue climbs after them. Ask less of blue there.
  const need = m >= 245 ? sens * 0.6 : sens;
  return m > 100 && m - b > need && Math.abs(r - g) < 90;
}

/** Whether a pixel is part of the screen's bluish-white plot grid. */
export function isGridAt(px: Pixels, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= px.width || y >= px.height) return false;
  const i = ((y | 0) * px.width + (x | 0)) * 4, d = px.data;
  const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!;
  return b > 150 && b >= r && b >= g - 5 && Math.min(r, g) > 100;
}
