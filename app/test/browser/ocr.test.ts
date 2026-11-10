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
 * START and STOP come from the row under the grid, read the same in every
 * browser. The rest comes from the whole photo, which a browser with a GPU
 * shrinks differently: those readings are from a browser without one, as on
 * CI.
 *
 * The 2 m photos are one antenna across 144–148 MHz on three SWR scales, one
 * of them at three angles, one with glare. The HF photo is a 6–50 MHz sweep
 * on a 1–100 scale.
 */

import { describe, expect, it } from "vitest";
import { mappingFor } from "@/geometry";
import { detectGrid } from "@/grid";
import { readScreen } from "@/read-screen";
import { axisLabels, fitScale } from "@/scale-text";
import { looksLikeScreen } from "@/sweep-text";
import { loadImage, photoFrom } from "@/ui/model";

const photos = import.meta.glob<string>("../data/*.jpg", { query: "?url", import: "default", eager: true });

/** What the page takes from a photo's text: `readScreen`, then the scale as `App`'s readSweep fits it. */
interface Reading {
  start: number | null;
  stop: number | null;
  /** SWR per division, from the header. */
  per: number | null;
  /** The SWR scale, from the axis labels and the header. */
  top: number | null;
  bot: number | null;
}

async function read(name: string): Promise<Reading & { text: string; screen: boolean }> {
  return readBlob(await (await fetch(photos[`../data/${name}`]!)).blob());
}

async function readBlob(blob: Blob): Promise<Reading & { text: string; screen: boolean }> {
  const photo = photoFrom(await loadImage(blob));
  const g = detectGrid(photo.px);
  const { text, words, sweep, per } = await readScreen(photo, g?.corners ?? null);
  const fit = g ? fitScale(axisLabels(words.flat(), mappingFor(g.corners).back), per) : null;
  // To six places, past the float noise of a unit conversion.
  const r = (x: number | null | undefined): number | null => (x == null ? null : +x.toFixed(6));
  const screen = looksLikeScreen(text, g?.horizontal ?? null);
  return { start: r(sweep?.start), stop: r(sweep?.stop), per: r(per), top: r(fit?.top), bot: r(fit?.bot), text, screen };
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
  { photo: "random-wire-3-55mhz-top-3.jpg", screen: { start: 3, stop: 55, per: 0.25, top: 3, bot: 1 } },
  { photo: "2m-144-148mhz-top-2.5.jpg", screen: { start: 144, stop: 148, per: 0.188, top: 2.5, bot: 1 }, misses: { top: null, bot: null } },
  { photo: "2m-144-148mhz-top-2.5-tilted.jpg", screen: { start: 144, stop: 148, per: 0.188, top: 2.5, bot: 1 }, misses: { top: null, bot: null } },
  { photo: "2m-144-148mhz-top-2.5-glare.jpg", screen: { start: 144, stop: 148, per: 0.188, top: 2.5, bot: 1 }, misses: { start: null, stop: null, per: null, top: null, bot: null } },
  { photo: "2m-144-148mhz-top-2.jpg", screen: { start: 144, stop: 148, per: 0.125, top: 2, bot: 1 }, misses: { per: null, top: null, bot: null } },
  { photo: "2m-144-148mhz-top-4.jpg", screen: { start: 144, stop: 148, per: 0.375, top: 4, bot: 1 } },
  { photo: "hf-6-50mhz-top-100.jpg", screen: { start: 6, stop: 50, per: 12.38, top: 100, bot: 1 }, misses: { per: 0.012367, top: null, bot: null } },
];

describe("OCR on real photos", () => {
  for (const c of CASES) {
    it(`reads ${c.photo}`, async () => {
      const got = await read(c.photo);
      const { text, screen, ...reading } = got;
      expect(reading, text).toEqual({ ...c.screen, ...c.misses });
      expect(screen, text).toBe(true);
    }, 60000);
  }
});

describe("a photo of something else", () => {
  it("is not taken for a NanoVNA: a spreadsheet, grid lines and all", async () => {
    const c = new OffscreenCanvas(1600, 1000), x = c.getContext("2d")!;
    x.fillStyle = "#fff";
    x.fillRect(0, 0, 1600, 1000);
    x.strokeStyle = "#9ab";
    x.lineWidth = 2;
    for (let y = 100; y <= 900; y += 50) { x.beginPath(); x.moveTo(100, y); x.lineTo(1500, y); x.stroke(); }
    for (let xx = 100; xx <= 1500; xx += 280) { x.beginPath(); x.moveTo(xx, 100); x.lineTo(xx, 900); x.stroke(); }
    x.fillStyle = "#222";
    x.font = "28px sans-serif";
    const rows = ["Quarter", "Revenue", "Costs", "Margin", "Headcount", "Region", "Total"];
    rows.forEach((t, i) => { x.fillText(t, 115, 138 + i * 50); x.fillText(String(1200 + i * 317), 400, 138 + i * 50); });
    const got = await readBlob(await c.convertToBlob({ type: "image/png" }));
    expect(got.screen, got.text).toBe(false);
  }, 60000);
});
