/* The photo pipeline on real photos of a NanoVNA-H4.
 *
 * The first two are the same 3–55 MHz sweep of a random wire. The first shows
 * START and STOP; the second was cropped above them. The expected numbers
 * agree with the NanoVNA's own marker, M1 at SWR 2.970 and 4.690 MHz, just
 * inside the first crossing at 4.64, and with where the curve crosses the grid
 * lines in the photo.
 *
 * The second photo is the one the text filter exists for: without it, the
 * trace follows the yellow `S11 SWR` header across the top left and loses the
 * first two crossings.
 *
 * The third is the same random wire on a 1–3 SWR scale. Its screen fades
 * toward the right, so the border past the 50 MHz line is too dim for the
 * grid's color test, and its dips are narrow and deep, with the M1 marker's
 * box on the side of the first.
 */

import { describe, expect, it } from "vitest";
import { analyze } from "@/analysis";
import { mappingFor } from "@/geometry";
import { detectGrid } from "@/grid";
import type { Pixels } from "@/pixels";
import { autoTrace } from "@/trace";
import labeled from "../data/random-wire-3-55mhz.jpg?url";
import unlabeled from "../data/random-wire-3-55mhz-no-labels.jpg?url";
import topThree from "../data/random-wire-3-55mhz-top-3.jpg?url";

/** Decode a photo the way the page does: at most 4000 px on its long side. */
async function load(url: string): Promise<Pixels> {
  const bmp = await createImageBitmap(await (await fetch(url)).blob());
  const sc = Math.min(1, 4000 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * sc), h = Math.round(bmp.height * sc);
  const c = new OffscreenCanvas(w, h), x = c.getContext("2d")!;
  x.drawImage(bmp, 0, 0, w, h);
  return x.getImageData(0, 0, w, h);
}

/** Grid, trace and analysis for a 3–55 MHz sweep on a 1 to `top` SWR scale,
 *  with a maximum SWR of `thr`. */
async function run(url: string, top = 5, thr = 3) {
  const px = await load(url);
  const grid = detectGrid(px);
  if (!grid) throw new Error("no grid found");
  const { N, v } = autoTrace(px, mappingFor(grid.corners).fwd, grid.corners, 70);
  const f = Array.from({ length: N }, (_, i) => 3 + ((i + 0.5) / N) * 52);
  const s = Array.from(v, (y) => top + y * (1 - top));
  return { grid, v, an: analyze(f, s, { thr, prom: 0.2, top })! };
}

const CROSSINGS = [4.64, 6.54, 13.17, 22.06, 26.41, 34.76, 39.26, 45.61, 51.985];
// The dip at 20.65 MHz is shallow: SWR 2.52 under a 2.73 peak.
const DIPS = [5.871, 15.35, 20.65, 31.134, 42.43];

const within = (got: number[], want: number[], tol: number): void => {
  expect(got).toHaveLength(want.length);
  got.forEach((g, i) => expect(Math.abs(g - want[i]!), `${g} vs ${want[i]}`).toBeLessThan(tol));
};

describe.each([
  ["with START/STOP", labeled],
  ["cropped above START/STOP", unlabeled],
])("a photo %s", (_, url) => {
  it("finds the whole plot grid: 9 SWR lines and 7 frequency lines", async () => {
    const { grid } = await run(url);
    expect(grid.horizontal).toBe(9);
    expect(grid.vertical).toBe(7);
  });

  it("finds every 3:1 crossing", async () => {
    within((await run(url)).an.crossings.map((c) => c.f), CROSSINGS, 0.05);
  });

  it("finds every dip", async () => {
    within((await run(url)).an.extrema.filter((e) => e.type === "dip").map((e) => e.f), DIPS, 0.05);
  });

  it("marks the peak at the top of the screen as clipped", async () => {
    const peaks = (await run(url)).an.extrema.filter((e) => e.type === "peak");
    expect(peaks.filter((p) => p.clipped)).toHaveLength(1);
    expect(peaks.find((p) => p.clipped)!.f).toBeGreaterThan(48);
  });
});

describe("a photo whose screen fades toward the right", () => {
  it("finds the dim border past the 50 MHz line", async () => {
    const { grid } = await run(topThree, 3, 2);
    expect(grid.horizontal).toBe(9);
    expect(grid.vertical).toBe(7);
  });

  it("traces to the right edge", async () => {
    const { v } = await run(topThree, 3, 2);
    // SWR 1.8 at 55 MHz, past the 2.0 line at v = 0.5.
    expect(v[v.length - 1]).toBeGreaterThan(0.55);
  });

  it("follows each narrow dip to its bottom", async () => {
    const dips = (await run(topThree, 3, 2)).an.extrema.filter((e) => e.type === "dip");
    within(dips.map((e) => e.f), [5.74, 15.21, 19.93, 30.61, 41.79], 0.1);
    within(dips.map((e) => e.s), [1.44, 1.28, 2.43, 1.16, 1.12], 0.05);
  });

  it("counts none of the flat line along the top as usable, with Max SWR at the top", async () => {
    const { usable } = (await run(topThree, 3, 3)).an;
    // The curve runs flat along the top at these frequencies.
    for (const f of [3.3, 10, 24, 36, 47.5]) expect(usable.some(([a, b]) => f >= a && f <= b), `${f} MHz`).toBe(false);
    // Each dip is usable at its bottom.
    for (const f of [5.74, 15.21, 19.93, 30.61, 41.79]) expect(usable.some(([a, b]) => f >= a && f <= b), `${f} MHz`).toBe(true);
  });
});
