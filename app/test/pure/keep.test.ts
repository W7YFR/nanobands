/* Kept sweeps: how Keep numbers them and drops the oldest, and the dip each is named by. */

import { describe, expect, it } from "vitest";
import { MAX_KEPT, dipIn, isKept, keep, type Curve, type Kept } from "@/ui/model";

const curve = (dip: number): Curve => {
  const f = Float64Array.from({ length: 11 }, (_, i) => 14 + i / 20), s = f.map((x) => 1.2 + Math.abs(x - dip) * 4);
  return { N: f.length, f, s };
};

describe("keep", () => {
  it("numbers each sweep after the last, and drops the oldest past the most it keeps", () => {
    let kept: Kept[] = [];
    for (let i = 0; i < MAX_KEPT + 1; i++) kept = keep(kept, curve(14.1));
    expect(kept.map((k) => k.n)).toEqual([2, 3, 4]);
    expect(kept.every((k) => k.on)).toBe(true);
  });

  it("keeps a copy, so a later sweep does not change it", () => {
    const c = curve(14.1), [k] = keep([], c);
    c.s[0] = 9;
    expect(k!.s[0]).not.toBe(9);
  });

  it("starts again at 1 once none is kept", () => {
    expect(keep([], curve(14.1))[0]!.n).toBe(1);
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
