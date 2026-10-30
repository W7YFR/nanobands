/* The photo pipeline on real photos of a NanoVNA-H4.
 *
 * Both are the same 3–55 MHz sweep of a random wire. The first shows START and
 * STOP; the second was cropped above them. The expected numbers are what the
 * page has given since v1.0.0 and what the NanoVNA's own marker agrees with:
 * M1 read SWR 2.970 at 4.690 MHz, just inside the first crossing at 4.64.
 *
 * The second photo is the one the text filter exists for: without it, the
 * trace follows the yellow `S11 SWR` header across the top left and loses the
 * first two crossings.
 */

import { describe, expect, it } from "vitest";
import { analyze } from "@/analysis";
import { mappingFor } from "@/geometry";
import { detectGrid } from "@/grid";
import type { Pixels } from "@/pixels";
import { autoTrace } from "@/trace";
import labeled from "../data/random-wire-3-55mhz.jpg?url";
import unlabeled from "../data/random-wire-3-55mhz-no-labels.jpg?url";

/** Decode a photo the way the page does: at most 4000 px on its long side. */
async function load(url: string): Promise<Pixels> {
  const bmp = await createImageBitmap(await (await fetch(url)).blob());
  const sc = Math.min(1, 4000 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * sc), h = Math.round(bmp.height * sc);
  const c = new OffscreenCanvas(w, h), x = c.getContext("2d")!;
  x.drawImage(bmp, 0, 0, w, h);
  return x.getImageData(0, 0, w, h);
}

/** Grid, trace and analysis for a 3–55 MHz sweep on a 1–5 SWR scale. */
async function run(url: string) {
  const px = await load(url);
  const grid = detectGrid(px);
  if (!grid) throw new Error("no grid found");
  const { N, v } = autoTrace(px, mappingFor(grid.corners).fwd, grid.corners, 70);
  const f = Array.from({ length: N }, (_, i) => 3 + ((i + 0.5) / N) * 52);
  const s = Array.from(v, (y) => 5 + y * (1 - 5));
  return { grid, an: analyze(f, s, { thr: 3, prom: 0.2, top: 5 })! };
}

const CROSSINGS = [4.64, 6.539, 13.204, 22.044, 26.359, 34.804, 39.31, 45.643, 51.985];
const DIPS = [5.871, 15.361, 31.134, 42.422];

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
