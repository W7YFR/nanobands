/* The frequency check: the SWR at one frequency, and whether the band plan
 * and Max SWR let you transmit there.
 */

import { describe, expect, it } from "vitest";
import { segmentAt } from "@/bands";
import { DEFAULT_FIELDS, DEFAULT_PREFS, checkAt, settingsOf, type Curve, type Prefs } from "@/ui/model";

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
