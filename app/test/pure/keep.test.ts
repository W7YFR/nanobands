/* Kept sweeps: how Keep numbers them and drops the oldest, the dip each is
 * named by, and how the sweep's median SWR compares with theirs. */

import { describe, expect, it } from "vitest";
import { MAX_KEPT, compareSwr, dipIn, isKept, keep, keptNumber, medianIn, type Curve, type Kept } from "@/ui/model";

const curve = (dip: number): Curve => {
  const f = Float64Array.from({ length: 11 }, (_, i) => 14 + i / 20), s = f.map((x) => 1.2 + Math.abs(x - dip) * 4);
  return { N: f.length, f, s };
};

describe("keep", () => {
  it("adds the newest last, and drops the oldest past the most it keeps", () => {
    let kept: Kept[] = [];
    for (const dip of [14.05, 14.1, 14.15, 14.2]) kept = keep(kept, curve(dip));
    expect(kept.length).toBe(MAX_KEPT);
    expect(kept.map((k) => dipIn(k.f, k.s, 14, 14.5)?.f)).toEqual([14.1, 14.15, 14.2]);
    expect(kept.every((k) => k.on)).toBe(true);
  });

  it("numbers the newest 1, counting back", () => {
    const kept = keep(keep(keep([], curve(14.1)), curve(14.15)), curve(14.2));
    expect(kept.map((_, i) => keptNumber(kept, i))).toEqual([3, 2, 1]);
  });

  it("keeps a copy, so a later sweep does not change it", () => {
    const c = curve(14.1), [k] = keep([], c);
    c.s[0] = 9;
    expect(k!.s[0]).not.toBe(9);
  });
});

describe("isKept", () => {
  it("is true for a sweep with the readings of a kept one, as before the next sweep", () => {
    const c = curve(14.1), kept = keep([], c);
    expect(isKept(kept, c)).toBe(true);
    expect(isKept(kept, { ...c, f: c.f.slice(), s: c.s.slice() })).toBe(true);
    expect(isKept(kept, curve(14.15))).toBe(false);
    expect(isKept([], c)).toBe(false);
  });
});

describe("dipIn", () => {
  it("is the lowest reading in view", () => {
    const c = curve(14.2);
    expect(dipIn(c.f, c.s, 14, 14.5)).toEqual({ f: 14.2, s: 1.2 });
  });

  it("is null when the lowest reading is at an end of the view, as when the dip moved out of it", () => {
    const c = curve(14.2);
    expect(dipIn(c.f, c.s, 14.3, 14.5)).toBeNull();
    expect(dipIn(c.f, c.s, 14, 14.15)).toBeNull();
  });

  it("skips a missing reading, and is null with none in view", () => {
    const f = Float64Array.from([14, 14.1, 14.2, 14.3]), s = Float64Array.from([NaN, 2, 1.5, 3]);
    expect(dipIn(f, s, 14, 14.3)).toEqual({ f: 14.2, s: 1.5 });
    expect(dipIn(f, s, 15, 16)).toBeNull();
  });
});

describe("medianIn", () => {
  it("is the median of the readings in the segments, skipping a missing one", () => {
    const f = Float64Array.from([14, 14.1, 14.2, 14.3, 14.4]), s = Float64Array.from([5, 1.4, NaN, 1.2, 3]);
    expect(medianIn(f, s, [[14.05, 14.35, "data"]])).toBeCloseTo(1.3, 9);
    expect(medianIn(f, s, [[14, 14.1, "data"], [14.3, 14.4, "phone"]])).toBe(2.2);
  });

  it("counts the SWR at the center of a segment with no reading in it, and is NaN outside the readings", () => {
    const f = Float64Array.from([5.33, 5.34]), s = Float64Array.from([2, 4]);
    expect(medianIn(f, s, [[5.3346, 5.3374, "chan"]])).toBeCloseTo(3.2, 6);
    expect(medianIn(f, s, [[7, 7.3, "data"]])).toBeNaN();
  });
});

describe("compareSwr", () => {
  it("is lower or higher past 0.1, or 5% where that is more, and the same within it", () => {
    expect(compareSwr(1.43, 2.08, 2)).toBe("lower");
    expect(compareSwr(1.6, 1.35, 2)).toBe("higher");
    expect(compareSwr(1.43, 1.52, 2)).toBe("same");
    expect(compareSwr(3.0, 3.14, 5)).toBe("same");
    expect(compareSwr(3.0, 3.16, 5)).toBe("lower");
  });

  it("is over when both are over Max SWR, and not when one is under it", () => {
    expect(compareSwr(8.2, 9.1, 2)).toBe("over");
    expect(compareSwr(2.06, 1.54, 2)).toBe("higher");
  });
});
