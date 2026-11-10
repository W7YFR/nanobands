/* Reading text off the photo with Tesseract.js.
 *
 * Bundled with the page. The library is loaded the first time a photo is
 * opened. Its worker, its WebAssembly core and its English data are served
 * from the site under tesseract/<version>/ (see vite.config.ts), not from a
 * CDN.
 */

import { version } from "tesseract.js/package.json";
import type { OcrResult } from "./ocr-zeros";

/** Where the build puts the files the worker loads, beside the page. */
const FILES = `tesseract/${version}/`;

/** Black-on-white copy of `src` at most 2000 px wide, keeping only bright
 *  text (white or yellow). Ignoring blue suppresses the bluish grid. */
export function ocrCanvas(src: HTMLCanvasElement): { canvas: HTMLCanvasElement; scale: number } {
  const scale = Math.min(1, 2000 / src.width), w = Math.round(src.width * scale), h = Math.round(src.height * scale);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d")!;
  x.drawImage(src, 0, 0, w, h);
  const im = x.getImageData(0, 0, w, h), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (d[i]! + d[i + 1]!) / 2 > 185 ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  x.putImageData(im, 0, 0);
  return { canvas: c, scale };
}

/** The characters the START/STOP row can hold. */
const ROW_CHARS = "0123456789.STARTOPCENMHzkGBWp:/ ";

/** Run OCR over sparse text scattered around a screen, and over the
 *  START/STOP row cut out of it, when there is one, as a single line. One
 *  worker reads both. */
export async function recognize(canvas: HTMLCanvasElement, row: HTMLCanvasElement | null = null): Promise<{ screen: OcrResult; row: OcrResult | null }> {
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker("eng", undefined, {
    workerPath: `${FILES}worker.min.js`,
    corePath: FILES,
    langPath: FILES,
  });
  try {
    const read = async (c: HTMLCanvasElement): Promise<OcrResult> => {
      const { data } = await worker.recognize(c, {}, { text: true, blocks: true });
      // Lines with their words and glyph boxes. The blocks hold them in paragraphs.
      const lines = data.blocks?.flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
      return { text: data.text, lines: lines ?? null };
    };
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const screen = await read(canvas);
    if (!row) return { screen, row: null };
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: ROW_CHARS });
    return { screen, row: await read(row) };
  } finally {
    await worker.terminate();
  }
}
