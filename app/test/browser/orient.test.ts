/* Standing a photo upright. Each real photo is turned a quarter, a half and
 * three quarters, as a phone that guessed its orientation wrong saves it,
 * and the page must stand each back up. */

import { describe, expect, it } from "vitest";
import { detectGrid } from "@/grid";
import { uprightTurns } from "@/orient";
import { loadImage, photoFrom } from "@/ui/model";

const photos = import.meta.glob<string>("../data/*.jpg", { query: "?url", import: "default", eager: true });
/* Glare washes out half of this photo's grid, so the grid is not found even
   upright, and which way up it is cannot be told from it. */
const GRID_NOT_FOUND = ["2m-144-148mhz-top-2.5-glare.jpg"];
/* Cropped under the grid: with no START/STOP row, the page lays the grid wide
   but cannot tell upright from upside down. */
const NO_ROW = ["random-wire-3-55mhz-no-labels.jpg"];

/** The photo at `url` as it is, at most `max` px on its long side. */
async function pixels(url: string, max = 4000): Promise<ImageData> {
  const bmp = await createImageBitmap(await (await fetch(url)).blob());
  const sc = Math.min(1, max / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * sc), h = Math.round(bmp.height * sc);
  const c = new OffscreenCanvas(w, h), x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(bmp, 0, 0, w, h);
  return x.getImageData(0, 0, w, h);
}

/** The photo at `url`, turned clockwise by `turns` quarter turns, as a JPEG. */
async function turned(url: string, turns: number): Promise<Blob> {
  const bmp = await createImageBitmap(await (await fetch(url)).blob());
  const [w, h] = turns % 2 ? [bmp.height, bmp.width] : [bmp.width, bmp.height];
  const c = new OffscreenCanvas(w, h), x = c.getContext("2d")!;
  x.translate(w / 2, h / 2);
  x.rotate((turns * Math.PI) / 2);
  x.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  return c.convertToBlob({ type: "image/jpeg", quality: 0.92 });
}

describe("a photo on its side or upside down", () => {
  for (const [path, url] of Object.entries(photos)) {
    const name = path.replace("../data/", "");
    if (GRID_NOT_FOUND.includes(name)) continue;
    for (const turns of [0, 1, 2, 3]) {
      it(`stands ${name} upright from ${turns * 90}°`, async () => {
        const upright = detectGrid(await pixels(url));
        const photo = photoFrom(await loadImage(await turned(url, turns)));
        const g = detectGrid(photo.px);
        expect(g).not.toBeNull();
        if (NO_ROW.includes(name)) {
          expect(photo.w).toBeGreaterThan(photo.h);
          return;
        }
        // The same corners as the upright photo, give or take a few pixels.
        for (let i = 0; i < 4; i++) {
          expect(Math.abs(g!.corners[i]![0] - upright!.corners[i]![0])).toBeLessThan(12);
          expect(Math.abs(g!.corners[i]![1] - upright!.corners[i]![1])).toBeLessThan(12);
        }
      }, 30000);
    }
  }
});

describe("an upright photo", () => {
  it("is left as it is, every one of them", async () => {
    for (const [path, url] of Object.entries(photos)) expect(uprightTurns(await pixels(url, 1200)), path).toBe(0);
  }, 60000);
});
