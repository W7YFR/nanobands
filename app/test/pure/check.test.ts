/* The frequency check: the SWR at one frequency, and whether the band plan
 * and Max SWR let you transmit there.
 */

import { describe, expect, it } from "vitest";
import { BANDS, segmentAt } from "@/bands";
import { analyze } from "@/analysis";
import { DEFAULT_FIELDS, DEFAULT_PREFS, bandView, barPieces, checkAt, fitView, pickBand, sameView, settingsOf, viewAround, type Curve, type Prefs } from "@/ui/model";

/** A V-shaped dip at 14.2 MHz across 3–30 MHz, with a gap at 20–21 MHz. */
function vCurve(): Curve {
  const N = 541, f = new Float64Array(N), s = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    f[i] = 3 + (27 * i) / (N - 1);
    s[i] = f[i]! > 20 && f[i]! < 21 ? NaN : Math.min(5, 1.1 + 0.6 * Math.abs(f[i]! - 14.2));
  }
  return { N, f, s };
}
const at = (p: Partial<Prefs> = {}) => settingsOf({ ...DEFAULT_FIELDS, start: "3", stop: "30" }, { ...DEFAULT_PREFS, ...p });

describe("segmentAt", () => {
  it("finds the segment a class may use in a mode", () => {
    expect(segmentAt(14.3, { cls: "G", mode: "phone" })).toEqual([14.225, 14.35, "phone"]);
    expect(segmentAt(14.2, { cls: "G", mode: "phone" })).toBeUndefined();
    expect(segmentAt(14.2, { cls: "G", mode: "cw" })).toBeUndefined();
    expect(segmentAt(14.1, { cls: "G", mode: "cw" })).toEqual([14.025, 14.15, "data"]);
    expect(segmentAt(12, { cls: "E", mode: "any" })).toBeUndefined();
  });
});

describe("checkAt", () => {
  const c = vCurve();

  it("lets you transmit in your segment under Max SWR", () => {
    const r = checkAt(c, at(), 14.3);
    expect(r.swr).toBeCloseTo(1.16, 2);
    expect(r.band?.name).toBe("20m");
    expect(r.seg?.[2]).toBe("phone");
    expect(r.why).toBeNull();
    expect(r.ok).toBe(true);
  });

  it("stops you over Max SWR", () => {
    const r = checkAt(c, at(), 18.1);
    expect(r.swr).toBeGreaterThan(3);
    expect(r.seg).toBeDefined();
    expect(r.ok).toBe(false);
  });

  it("says why the band plan rules a frequency out", () => {
    expect(checkAt(c, at(), 12).why).toBe("Not in an amateur band");
    expect(checkAt(c, at({ cls: "T" }), 14.3).why).toBe("No privileges here for this license class");
    expect(checkAt(c, at({ mode: "phone" }), 14.1).why).toBe("No phone privileges here for this license class");
    expect(checkAt(c, at(), 12).ok).toBe(false);
  });

  it("has no SWR outside the sweep, in a gap, or without a curve", () => {
    expect(checkAt(c, at(), 50.5).swr).toBeNaN();
    expect(checkAt(c, at(), 20.5).swr).toBeNaN();
    expect(checkAt(null, at(), 14.3).swr).toBeNaN();
    expect(checkAt(null, at(), 14.3).ok).toBe(false);
  });

  it("marks an SWR at the top of the scale as clipped", () => {
    expect(checkAt(c, at(), 28.5).clipped).toBe(true);
    expect(checkAt(c, at(), 14.3).clipped).toBe(false);
  });
});

describe("viewAround", () => {
  const c = vCurve(), an = analyze(c.f, c.s, { thr: 3, prom: 0.2, top: 5 })!;

  it("shows the band with a quarter of its width on each side", () => {
    const [lo, hi] = viewAround(an, 14.3)!;
    expect(lo).toBeCloseTo(14.0 - 0.0875, 6);
    expect(hi).toBeCloseTo(14.35 + 0.0875, 6);
  });

  it("centers a 20th of the sweep on a frequency outside the bands", () => {
    const [lo, hi] = viewAround(an, 12)!;
    expect(hi - lo).toBeCloseTo(27 / 20, 6);
    expect((lo + hi) / 2).toBeCloseTo(12, 6);
  });

  it("stays inside the sweep", () => {
    const [lo, hi] = viewAround(an, 3.2)!;
    expect(lo).toBeCloseTo(3, 6);
    expect(hi).toBeCloseTo(3 + 27 / 20, 6);
    expect(fitView(an, 0, 100)).toBeNull();
  });
});

describe("bandView", () => {
  const c = vCurve(), an = analyze(c.f, c.s, { thr: 3, prom: 0.2, top: 5 })!;
  const band = (name: string) => BANDS.find((b) => b.name === name)!;

  it("shows the band with 35% of its width on each side, inside the sweep", () => {
    const [lo, hi] = bandView(an, band("20m"));
    expect(lo).toBeCloseTo(14 - 0.35 * 0.35, 6);
    expect(hi).toBeCloseTo(14.35 + 0.35 * 0.35, 6);
    expect(bandView(an, band("10m"))[1]).toBe(30);
  });
});

describe("pickBand", () => {
  const b20: [number, number] = [13.9, 14.45], b40: [number, number] = [6.9, 7.4], zoom: [number, number] = [10, 20];

  it("shows the band, and a second click goes back to the view before it", () => {
    const one = pickBand(zoom, null, b20);
    expect(one.view).toEqual(b20);
    const two = pickBand(one.view, one.picked, b20);
    expect(two.view).toEqual(zoom);
    expect(two.picked).toBeNull();
  });

  it("goes back to the view before the first band when it moves from band to band", () => {
    const one = pickBand(null, null, b20);
    const two = pickBand(one.view, one.picked, b40);
    expect(two.view).toEqual(b40);
    expect(pickBand(two.view, two.picked, b40).view).toBeNull();
  });

  it("forgets the view before once the chart moves off the band", () => {
    const one = pickBand(zoom, null, b20);
    const two = pickBand([13, 15], one.picked, b40);
    expect(pickBand(two.view, two.picked, b40).view).toEqual([13, 15]);
  });

  it("goes back to the full sweep from a band no row picked", () => {
    expect(pickBand(b20, null, b20).view).toBeNull();
  });

  it("compares views", () => {
    expect(sameView(null, null)).toBe(true);
    expect(sameView(b20, [13.9, 14.45])).toBe(true);
    expect(sameView(b20, null)).toBe(false);
    expect(sameView(b20, b40)).toBe(false);
  });
});

describe("barPieces", () => {
  it("splits a segment into usable and unusable stretches, low to high", () => {
    expect(barPieces(7, 7.3, [[7.2, 7.25], [7.05, 7.1]])).toEqual([
      { lo: 7, hi: 7.05, ok: false }, { lo: 7.05, hi: 7.1, ok: true }, { lo: 7.1, hi: 7.2, ok: false },
      { lo: 7.2, hi: 7.25, ok: true }, { lo: 7.25, hi: 7.3, ok: false },
    ]);
  });

  it("gives one piece for a segment all or none usable", () => {
    expect(barPieces(14, 14.35, [[14, 14.35]])).toEqual([{ lo: 14, hi: 14.35, ok: true }]);
    expect(barPieces(14, 14.35, [])).toEqual([{ lo: 14, hi: 14.35, ok: false }]);
  });
});
