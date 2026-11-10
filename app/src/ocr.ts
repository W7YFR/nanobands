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

/** A part of the screen to read on its own, squared up (see screen-parts.ts). */
export interface Part {
  canvas: HTMLCanvasElement;
  /** One line of text, or text scattered over the part. */
  line: boolean;
  /** The characters it can hold. */
  chars: string;
}

/** Run OCR over sparse text scattered around a screen, and over each part
 *  cut out of it. One worker reads them all. */
export async function recognize(canvas: HTMLCanvasElement, parts: readonly Part[] = []): Promise<{ screen: OcrResult; parts: OcrResult[] }> {
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
    const screen = await read(canvas), out: OcrResult[] = [];
    for (const p of parts) {
      await worker.setParameters({ tessedit_pageseg_mode: p.line ? PSM.SINGLE_LINE : PSM.SPARSE_TEXT, tessedit_char_whitelist: p.chars });
      out.push(await read(p.canvas));
    }
    return { screen, parts: out };
  } finally {
    await worker.terminate();
  }
}
