import { describe, expect, it } from "vitest";
import { analyze, segUsable, swrAt } from "@/analysis";

/** A curve sampled at `n` points from `lo` to `hi` MHz. */
function sample(fn: (f: number) => number, lo = 3, hi = 55, n = 521): { f: number[]; s: number[] } {
  const f = Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
  return { f, s: f.map(fn) };
}
const opts = { thr: 3, prom: 0.2, top: 5 };

describe("analyze", () => {
  // A V-shaped dip at 14 MHz, 1.2 at the bottom and rising 0.5 per MHz.
  const v = sample((f) => 1.2 + 0.5 * Math.abs(f - 14));

  it("finds where the curve crosses the maximum", () => {
    const an = analyze(v.f, v.s, opts)!;
    expect(an.crossings.map((c) => c.dir)).toEqual(["down", "up"]);
    expect(an.crossings[0]!.f).toBeCloseTo(14 - 3.6, 2);
    expect(an.crossings[1]!.f).toBeCloseTo(14 + 3.6, 2);
  });

  it("gives the stretch under the maximum", () => {
    const [u] = analyze(v.f, v.s, opts)!.usable;
    expect(u![0]).toBeCloseTo(10.4, 2);
    expect(u![1]).toBeCloseTo(17.6, 2);
  });

  it("finds the dip and its SWR", () => {
    const an = analyze(v.f, v.s, opts)!;
    expect(an.extrema).toHaveLength(1);
    expect(an.extrema[0]).toMatchObject({ type: "dip", clipped: false });
    expect(an.extrema[0]!.f).toBeCloseTo(14, 1);
    expect(an.extrema[0]!.s).toBeCloseTo(1.2, 2);
  });

  it("never counts a flat line along the top of the scale as usable", () => {
    // A 1–3 scale with Max SWR 3: the dip at 14 MHz, flat at 3 elsewhere,
    // as the NanoVNA draws an SWR past its top line.
    const flat = sample((f) => Math.min(3, 1.2 + 0.5 * Math.abs(f - 14)));
    const an = analyze(flat.f, flat.s, { thr: 3, prom: 0.2, top: 3, bot: 1 })!;
    expect(an.usable).toHaveLength(1);
    expect(an.usable[0]![0]).toBeCloseTo(10.46, 1);
    expect(an.usable[0]![1]).toBeCloseTo(17.54, 1);
    expect(an.crossings.map((c) => c.dir)).toEqual(["down", "up"]);
    // Under the top of the scale, the flat line is a real reading.
    const high = analyze(flat.f, flat.s, { thr: 3, prom: 0.2, top: 5, bot: 1 })!;
    expect(high.usable).toEqual([[3, 55]]);
  });

  it("scales the margin at the top with the scale", () => {
    const near = sample(() => 4.95);
    expect(analyze(near.f, near.s, { thr: 5, prom: 0.2, top: 5, bot: 1 })!.usable).toEqual([]);
    expect(analyze(near.f, near.s, { thr: 5, prom: 0.2, top: 5, bot: 4.5 })!.usable).toEqual([[3, 55]]);
  });

  it("reports a stretch that runs off either end of the sweep", () => {
    const low = sample(() => 1.5);
    expect(analyze(low.f, low.s, opts)!.usable).toEqual([[3, 55]]);
    expect(analyze(low.f, low.s, opts)!.crossings).toEqual([]);
  });

  it("ignores wiggles smaller than the minimum prominence", () => {
    const w = sample((f) => 2 + 0.05 * Math.sin(f * 3));
    expect(analyze(w.f, w.s, opts)!.extrema).toEqual([]);
    expect(analyze(w.f, w.s, { ...opts, prom: 0.01 })!.extrema.length).toBeGreaterThan(5);
  });

  it("marks a flat-topped peak at the top of the scale as clipped, at the middle of its plateau", () => {
    const p = sample((f) => Math.min(5, 1.5 + Math.max(0, 6 - Math.abs(f - 30))));
    const peak = analyze(p.f, p.s, opts)!.extrema.find((e) => e.type === "peak")!;
    expect(peak.clipped).toBe(true);
    expect(peak.f).toBeCloseTo(30, 0);
  });

  it("splits a stretch at a gap in the trace", () => {
    const g = sample(() => 1.5);
    for (let i = 200; i < 220; i++) g.s[i] = NaN;
    const an = analyze(g.f, g.s, opts)!;
    expect(an.usable).toHaveLength(2);
    expect(an.usable[0]![1]).toBeLessThan(an.usable[1]![0]);
  });

  it("returns nothing for a curve with no points", () => {
    expect(analyze([NaN, NaN], [NaN, NaN], opts)).toBeNull();
  });
});

describe("swrAt", () => {
  it("interpolates between points and refuses outside the sweep", () => {
    expect(swrAt([1, 2, 3], [2, 4, 6], 2.5)).toBeCloseTo(5);
    expect(swrAt([1, 2, 3], [2, 4, 6], 1)).toBe(2);
    expect(swrAt([1, 2, 3], [2, 4, 6], 0.9)).toBeNaN();
    expect(swrAt([1, 2, 3], [2, 4, 6], 3.1)).toBeNaN();
  });
});

describe("segUsable", () => {
  const an = { crossings: [], extrema: [], usable: [[14.1, 14.3]] as [number, number][], fmin: 3, fmax: 55 };

  it("gives the usable part of a segment and its share", () => {
    const u = segUsable([14.0, 14.35, "data"], an);
    expect(u.parts).toEqual([[14.1, 14.3]]);
    expect(u.frac).toBeCloseTo(0.2 / 0.35, 6);
    expect(u.measured).toBe(1);
  });

  it("says how much of a segment the sweep covered", () => {
    expect(segUsable([1.8, 4, "all"], an).measured).toBeCloseTo(1 / 2.2, 6);
  });
});
