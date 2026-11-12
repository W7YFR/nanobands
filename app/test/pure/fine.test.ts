/* Fine sweeps: which bands get one, and how one fills in the full sweep. The
 * ranges are the slots read from a NanoVNA-H4. */

import { describe, expect, it } from "vitest";
import { BANDS } from "@/bands";
import { fineCheck, fineFor, mergeScan } from "@/fine";
import type { Scan } from "@/vna";

const band = (name: string) => BANDS.find((b) => b.name === name)!;
const MHZ = 1e6;

describe("fineFor", () => {
  it("offers each HF band on a 3–55 MHz calibration", () => {
    const r = { start: 3 * MHZ, stop: 55 * MHZ, points: 401 };
    expect(fineFor(r, band("40m"))).toEqual({ band: "40m", start: 7 * MHZ, stop: 7.3 * MHZ });
    expect(fineFor(r, band("20m"))).toEqual({ band: "20m", start: 14 * MHZ, stop: 14.35 * MHZ });
    expect(fineFor(r, band("10m"))).not.toBeNull();
  });

  it("offers nothing on a slot calibrated for the band itself", () => {
    expect(fineFor({ start: 14 * MHZ, stop: 14.35 * MHZ, points: 101 }, band("20m"))).toBeNull();
    expect(fineFor({ start: 144 * MHZ, stop: 148 * MHZ, points: 101 }, band("2m"))).toBeNull();
  });

  it("offers a band when it at least doubles the band's readings", () => {
    // 13–15 MHz in 101 points: 18 readings in 20 m.
    expect(fineFor({ start: 13 * MHZ, stop: 15 * MHZ, points: 101 }, band("20m"))).not.toBeNull();
    // 14–14.7 MHz in 101 points: 51 readings in 20 m, short of half of 101.
    expect(fineFor({ start: 14 * MHZ, stop: 14.7 * MHZ, points: 101 }, band("20m"))).toBeNull();
  });

  it("offers nothing when the calibrated points are more than 1 MHz apart", () => {
    const wide = { start: 0.05 * MHZ, stop: 900 * MHZ, points: 101 };
    expect(fineFor(wide, band("2m"))).toBeNull();
    expect(fineFor(wide, band("40m"))).toBeNull();
    // 6–50 MHz in 101 points: 440 kHz apart.
    expect(fineFor({ start: 6 * MHZ, stop: 50 * MHZ, points: 101 }, band("40m"))).not.toBeNull();
  });

  it("sweeps only the part of a band inside the range, and nothing of a band outside it", () => {
    const r = { start: 3 * MHZ, stop: 52 * MHZ, points: 401 };
    expect(fineFor(r, band("6m"))).toEqual({ band: "6m", start: 50 * MHZ, stop: 52 * MHZ });
    expect(fineFor({ start: 3 * MHZ, stop: 30 * MHZ, points: 401 }, band("6m"))).toBeNull();
  });
});

describe("fineCheck", () => {
  it("says why a band gets no fine sweep", () => {
    expect(fineCheck({ start: 14 * MHZ, stop: 14.35 * MHZ, points: 101 }, band("20m"))).toBe("close");
    expect(fineCheck({ start: 0.05 * MHZ, stop: 900 * MHZ, points: 101 }, band("2m"))).toBe("coarse");
    expect(fineCheck({ start: 3 * MHZ, stop: 30 * MHZ, points: 401 }, band("6m"))).toBe("outside");
    expect(fineCheck({ start: 3 * MHZ, stop: 55 * MHZ, points: 401 }, band("40m"))).toEqual({ band: "40m", start: 7 * MHZ, stop: 7.3 * MHZ });
  });
});

describe("mergeScan", () => {
  const scan = (hz: number[], v: number): Scan => ({ hz, re: hz.map(() => v), im: hz.map(() => 0) });

  it("puts the fine readings in place of the full sweep's over the same span", () => {
    const got = mergeScan(scan([1, 2, 3, 4, 5, 6], 0), scan([2.5, 3, 3.5, 4, 4.5], 1));
    expect(got.hz).toEqual([1, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6]);
    expect(got.re).toEqual([0, 0, 1, 1, 1, 1, 1, 0, 0]);
  });

  it("fills in a span at either end of the full sweep", () => {
    expect(mergeScan(scan([1, 2, 3], 0), scan([0.5, 1, 1.5], 1)).hz).toEqual([0.5, 1, 1.5, 2, 3]);
    expect(mergeScan(scan([1, 2, 3], 0), scan([2.5, 3, 3.5], 1)).hz).toEqual([1, 2, 2.5, 3, 3.5]);
  });
});
