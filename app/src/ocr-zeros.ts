/* The NanoVNA's font draws 0 with a slash, which OCR reads as 8, 6, 9 or B.
 *
 * A genuine 8, 6, 9 or B has a crossbar row that is solid ink from wall to
 * wall; a slashed 0 never does. Each such symbol is checked against the
 * full-resolution photo and turned back into 0 when it has no crossbar.
 */

import type { Pixels } from "./pixels";

/** The parts of a Tesseract result this reads. */
export interface OcrSymbol {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}
export interface OcrResult {
  text: string;
  lines?: { words: { symbols: OcrSymbol[] }[] }[] | null;
}

/** Whether a glyph box (in photo pixels) holds a slashed 0 rather than an 8. */
export function isSlashedZero(px: Pixels, box: OcrSymbol["bbox"]): boolean {
  const { width: iw, height: ih, data: pix } = px;
  const ink = (x: number, y: number): boolean => {
    const i = (y * iw + x) * 4;
    return (pix[i]! + pix[i + 1]!) / 2 > 200;
  };
  const x0 = Math.round(box.x0), x1 = Math.round(box.x1), w = x1 - x0;
  const by0 = Math.round(box.y0), by1 = Math.round(box.y1);
  if (w < 4 || by1 - by0 < 8 || x1 >= iw || by1 >= ih) return false;
  // OCR boxes can take in a nearby grid line, so fit the box to the glyph:
  // the longest run of rows with ink in them.
  let top = 0, bot = -1, start = -1;
  for (let y = by0; y <= by1 + 1; y++) {
    let any = false;
    if (y <= by1) for (let x = x0; x <= x1 && !any; x++) any = ink(x, y);
    if (any) { if (start < 0) start = y; }
    else if (start >= 0) {
      if (y - start > bot - top) { top = start; bot = y - 1; }
      start = -1;
    }
  }
  const h = bot - top;
  if (h < 8) return false;
  for (let y = Math.round(top + h * 0.3); y <= top + h * 0.7; y++) {
    let bg = 0, n = 0;
    for (let x = Math.round(x0 + w * 0.3); x <= x0 + w * 0.7; x++) { n++; if (!ink(x, y)) bg++; }
    if (bg <= n * 0.06) return false; // a solid crossbar: a genuine 8, 6, 9 or B
  }
  return true;
}

/** The OCR text with slashed zeros put back. `scale` is OCR image pixels per
 *  photo pixel: OCR runs on a smaller copy. */
export function fixSlashedZeros(data: OcrResult, px: Pixels, scale: number): string {
  if (!data.lines?.length) return data.text;
  const k = 1 / scale;
  return data.lines
    .map((l) =>
      l.words
        .map((w) =>
          w.symbols
            .map((s) => {
              const b = { x0: s.bbox.x0 * k, y0: s.bbox.y0 * k, x1: s.bbox.x1 * k, y1: s.bbox.y1 * k };
              return "869B".includes(s.text) && isSlashedZero(px, b) ? "0" : s.text;
            })
            .join(""),
        )
        .join(" "),
    )
    .join("\n");
}
