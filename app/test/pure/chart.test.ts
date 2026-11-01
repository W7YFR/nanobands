/* The chart's colors and its band tooltip, without a canvas. */

import { describe, expect, it } from "vitest";
import { analyze } from "@/analysis";
import { bandTip } from "@/ui/draw-chart";
import { HIGH, MATCH, OK, curveColor } from "@/ui/colors";
import { BANDS } from "@/bands";
import type { Curve, Settings } from "@/ui/model";

const settings: Settings = { start: 13.5, stop: 14.5, top: 5, bot: 1, thr: 3, cls: "G", mode: "any", prom: 0.2, sens: 0 };
const band20 = BANDS.find((b) => b.name === "20m")!;

/** A curve over 13.5–14.5 MHz with SWR w(f). */
function curveOf(w: (f: number) => number): Curve {
  const N = 1001, f = new Float64Array(N), s = new Float64Array(N);
  for (let i = 0; i < N; i++) { f[i] = 13.5 + i / 1000; s[i] = w(f[i]!); }
  return { N, f, s };
}

describe("curveColor", () => {
  it("is green in your segments under Max SWR, gray outside them, yellow over it", () => {
    expect(curveColor(1.5, 14.1, settings)).toBe(OK);
    expect(curveColor(1.5, 13.9, settings)).toBe(MATCH);
    expect(curveColor(1.5, 14.01, settings)).toBe(MATCH); // Extra only
    expect(curveColor(1.5, 14.01, { ...settings, cls: "E" })).toBe(OK);
    expect(curveColor(3, 14.1, settings)).toBe(OK);
    expect(curveColor(3.2, 14.1, settings)).toBe(HIGH);
    expect(curveColor(3.2, 13.9, settings)).toBe(HIGH);
  });
});

describe("bandTip", () => {
  const tip = (w: (f: number) => number, s = settings) => {
    const c = curveOf(w);
    return bandTip(band20, s, analyze(c.f, c.s, { thr: s.thr, prom: s.prom, top: s.top })!, c);
  };

  it("gives the lowest and highest SWR over your segments, and how much is usable", () => {
    // The CW/data segment is under 3, the phone segment over it.
    const t = tip((f) => (f < 14.2 ? 1.5 : 4));
    expect(t).toEqual({ name: "20m", swr: "SWR 1.50–4.00", usable: "Partial: 50% usable", ok: "part" });
  });

  it("ignores the SWR outside your segments", () => {
    // Bad only in the Extra sub-band and between the segments.
    const t = tip((f) => ((f >= 14.0 && f < 14.025) || (f > 14.15 && f < 14.225) ? 4 : 1.2));
    expect(t.swr).toBe("SWR 1.20");
    expect(t.ok).toBe("all");
    expect(t.usable).toBe("All usable");
  });

  it("says when none is usable, and marks a clipped SWR", () => {
    const t = tip(() => 5);
    expect(t).toEqual({ name: "20m", swr: "SWR ≥5", usable: "None usable", ok: "none" });
  });

  it("says when the band runs past the sweep", () => {
    const c = curveOf((f) => (f < 14.3 ? 1.5 : NaN));
    const an = analyze(c.f, c.s, { thr: 3, prom: 0.2, top: 5 })!;
    expect(bandTip(band20, settings, an, c).usable).toBe("Partial: 80% usable (partly outside sweep)");
  });
});
