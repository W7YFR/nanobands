/* Real OCR on real photos of a NanoVNA-H4: what the page reads off each
 * screen, run through the same steps as the page. Tesseract.js runs for
 * real here, from the files the build ships, so this is the test that holds
 * an upgrade of it to account.
 *
 * Each photo lists what its screen says. A reading the current Tesseract
 * gets wrong is listed under `misses`, with what it reads instead, so a
 * change that fixes it fails here too and gets noticed. A null is a reading
 * the page did not get at all.
 *
 * The readings are Chromium's, not the headless shell's: the shell scales
 * the photo differently and reads START on the 3–55 MHz photo as 0.003.
 *
 * The 2 m photos are one antenna across 144–148 MHz on three SWR scales, one
 * of them at three angles, one with glare. The HF photo is a 6–50 MHz sweep
 * on a 1–100 scale.
 */

import { describe, expect, it } from "vitest";
import { mappingFor } from "@/geometry";
import { detectGrid } from "@/grid";
import { ocrCanvas, recognize } from "@/ocr";
import { fixedWords } from "@/ocr-zeros";
import { axisLabels, fitScale, parsePerDivision } from "@/scale-text";
import { parseSweepText } from "@/sweep-text";
import { loadImage, photoFrom } from "@/ui/model";

const photos = import.meta.glob<string>("../data/*.jpg", { query: "?url", import: "default", eager: true });

/** What the page takes from a photo's text, as `App`'s readSweep does. */
interface Reading {
  start: number | null;
  stop: number | null;
  /** SWR per division, from the header. */
  per: number | null;
  /** The SWR scale, from the axis labels and the header. */
  top: number | null;
  bot: number | null;
}

async function read(name: string): Promise<Reading & { text: string }> {
  const photo = photoFrom(await loadImage(await (await fetch(photos[`../data/${name}`]!)).blob()));
  const g = detectGrid(photo.px);
  const { canvas, scale } = ocrCanvas(photo.src);
  const data = await recognize(canvas);
  const words = fixedWords(data, photo.px, scale);
  const text = data.lines?.length ? words.map((l) => l.map((w) => w.text).join(" ")).join("\n") : data.text;
  const sweep = parseSweepText(text), per = parsePerDivision(text);
  const fit = g ? fitScale(axisLabels(words.flat(), mappingFor(g.corners).back), per) : null;
  return { start: sweep?.start ?? null, stop: sweep?.stop ?? null, per, top: fit?.top ?? null, bot: fit?.bot ?? null, text };
}

interface Case {
  photo: string;
  /** What the screen says. */
  screen: Reading;
  /** What the current Tesseract reads instead, where it is wrong. */
  misses?: Partial<Reading>;
}

const CASES: Case[] = [
  { photo: "random-wire-3-55mhz.jpg", screen: { start: 3, stop: 55, per: 0.5, top: 5, bot: 1 } },
  { photo: "random-wire-3-55mhz-no-labels.jpg", screen: { start: null, stop: null, per: 0.5, top: 5, bot: 1 } },
  { photo: "random-wire-3-55mhz-top-3.jpg", screen: { start: 3, stop: 55, per: 0.25, top: 3, bot: 1 }, misses: { stop: 65 } },
  { photo: "2m-144-148mhz-top-2.5.jpg", screen: { start: 144, stop: 148, per: 0.188, top: 2.5, bot: 1 }, misses: { start: null, stop: null, top: null, bot: null } },
  { photo: "2m-144-148mhz-top-2.5-tilted.jpg", screen: { start: 144, stop: 148, per: 0.188, top: 2.5, bot: 1 }, misses: { start: 144.0006, stop: 148.080809, top: null, bot: null } },
  { photo: "2m-144-148mhz-top-2.5-glare.jpg", screen: { start: 144, stop: 148, per: 0.188, top: 2.5, bot: 1 }, misses: { start: null, stop: null, per: null, top: null, bot: null } },
  { photo: "2m-144-148mhz-top-2.jpg", screen: { start: 144, stop: 148, per: 0.125, top: 2, bot: 1 }, misses: { start: null, stop: null, top: null, bot: null } },
  { photo: "2m-144-148mhz-top-4.jpg", screen: { start: 144, stop: 148, per: 0.375, top: 4, bot: 1 }, misses: { start: null, stop: null } },
  { photo: "hf-6-50mhz-top-100.jpg", screen: { start: 6, stop: 50, per: 12.38, top: 100, bot: 1 }, misses: { start: 6.60088, stop: 50.9086, per: 0.012387, top: null, bot: null } },
];

describe("OCR on real photos", () => {
  for (const c of CASES) {
    it(`reads ${c.photo}`, async () => {
      const got = await read(c.photo);
      const { text, ...reading } = got;
      expect(reading, text).toEqual({ ...c.screen, ...c.misses });
    }, 60000);
  }
});
