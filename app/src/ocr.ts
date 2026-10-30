/* Reading text off the photo with Tesseract.js.
 *
 * Loaded from a CDN the first time a photo is opened, pinned to one version
 * and checked against a subresource integrity hash. Not a package dependency:
 * the library fetches its worker, its WebAssembly core and its language data
 * from the same CDN anyway, so bundling the entry point would save nothing.
 */

import type { OcrResult } from "./ocr-zeros";

const TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const TESSERACT_SRI = "sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F";

interface TesseractWorker {
  setParameters(p: Record<string, string>): Promise<unknown>;
  recognize(image: HTMLCanvasElement): Promise<{ data: OcrResult }>;
  terminate(): Promise<unknown>;
}
declare global {
  interface Window {
    Tesseract?: { createWorker(lang: string): Promise<TesseractWorker> };
  }
}

function loadScript(src: string, integrity: string): Promise<void> {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.integrity = integrity;
    s.crossOrigin = "anonymous";
    s.onload = () => res();
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

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
  if (!window.Tesseract) await loadScript(TESSERACT, TESSERACT_SRI);
  const worker = await window.Tesseract!.createWorker("eng");
  await worker.setParameters({ tessedit_pageseg_mode: "11" });
  const { data } = await worker.recognize(canvas);
  await worker.terminate();
  return data;
}
