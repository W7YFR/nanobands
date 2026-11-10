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

/** Run OCR over sparse text scattered around a screen. */
export async function recognize(canvas: HTMLCanvasElement): Promise<OcrResult> {
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker("eng", undefined, {
    workerPath: `${FILES}worker.min.js`,
    corePath: FILES,
    langPath: FILES,
  });
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  const { data } = await worker.recognize(canvas);
  await worker.terminate();
  return data;
}
