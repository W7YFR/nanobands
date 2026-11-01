/* The band plan against the rules it encodes.
 *
 * Spot checks of 47 CFR §97.301 and §97.305 as the ARRL chart lays them out,
 * chosen where the classes differ: those are the lines a typo would cost
 * somebody a violation on.
 */

import { describe, expect, it } from "vitest";
import { BANDS, MODES, bandAt, bandsInRange, inSegment, segsFor, type LicenseClass, type OperatingMode } from "@/bands";

const band = (name: string) => {
  const b = BANDS.find((x) => x.name === name);
  if (!b) throw new Error(`no ${name}`);
  return b;
};
const segs = (name: string, cls: LicenseClass, mode: OperatingMode = "any") =>
  segsFor(band(name), { cls, mode }).map(([lo, hi, kind]) => [lo, hi, kind]);

describe("privileges by class", () => {
  it("gives Extra the bottom 25 kHz of 80, 40, 20 and 15 m", () => {
    expect(segs("80m", "E")[0]).toEqual([3.5, 3.6, "data"]);
    expect(segs("40m", "E")[0]).toEqual([7.0, 7.125, "data"]);
    expect(segs("20m", "E")[0]).toEqual([14.0, 14.15, "data"]);
    expect(segs("15m", "E")[0]).toEqual([21.0, 21.2, "data"]);
    for (const [name, lo] of [["80m", 3.525], ["40m", 7.025], ["20m", 14.025], ["15m", 21.025]] as const) {
      expect(segs(name, "G")[0]![0], name).toBe(lo);
      expect(segs(name, "A")[0]![0], name).toBe(lo);
    }
  });

  it("starts General phone at 3.8, 7.175, 14.225 and 21.275 MHz", () => {
    expect(segs("80m", "G", "phone")).toEqual([[3.8, 4.0, "phone"]]);
    expect(segs("40m", "G", "phone")).toEqual([[7.175, 7.3, "phone"]]);
    expect(segs("20m", "G", "phone")).toEqual([[14.225, 14.35, "phone"]]);
    expect(segs("15m", "G", "phone")).toEqual([[21.275, 21.45, "phone"]]);
  });

  it("starts Advanced phone at 3.7, 7.125, 14.175 and 21.225 MHz", () => {
    expect(segs("80m", "A", "phone")[0]![0]).toBe(3.7);
    expect(segs("40m", "A", "phone")[0]![0]).toBe(7.125);
    expect(segs("20m", "A", "phone")[0]![0]).toBe(14.175);
    expect(segs("15m", "A", "phone")[0]![0]).toBe(21.225);
  });

  it("gives Technician CW on 80, 40 and 15 m, nothing on 20 m, and phone on 10 m to 28.5 MHz", () => {
    expect(segs("80m", "T")).toEqual([[3.525, 3.6, "cw"]]);
    expect(segs("40m", "T")).toEqual([[7.025, 7.125, "cw"]]);
    expect(segs("15m", "T")).toEqual([[21.025, 21.2, "cw"]]);
    expect(segs("20m", "T")).toEqual([]);
    expect(segs("10m", "T", "phone")).toEqual([[28.3, 28.5, "phone"]]);
  });

  it("keeps 160, 60, 30, 17 and 12 m from Technician", () => {
    for (const name of ["160m", "60m", "30m", "17m", "12m"]) expect(segs(name, "T"), name).toEqual([]);
  });

  it("gives every class 6 m and up, with the bottom 100 kHz of 6 and 2 m CW only", () => {
    for (const cls of ["E", "A", "G", "T"] as const) {
      expect(segs("6m", cls)[0], cls).toEqual([50, 50.1, "cw"]);
      expect(segs("2m", cls)[0], cls).toEqual([144, 144.1, "cw"]);
      expect(segs("70cm", cls), cls).toEqual([[420, 450, "all"]]);
    }
  });

  it("makes 30 m CW and data only", () => {
    expect(segs("30m", "G", "phone")).toEqual([]);
    expect(segs("30m", "G", "data")).toEqual([[10.1, 10.15, "data"]]);
  });
});

describe("60 m", () => {
  it("has four 2.8 kHz channels and the 5351.5–5366.5 kHz segment", () => {
    const s = segs("60m", "G");
    expect(s).toHaveLength(5);
    const channels = s.filter(([lo, hi]) => (hi as number) - (lo as number) < 0.005);
    expect(channels.map(([lo, hi]) => +(((lo as number) + (hi as number)) / 2).toFixed(4))).toEqual([5.332, 5.348, 5.373, 5.405]);
    for (const [lo, hi] of channels) expect((hi as number) - (lo as number)).toBeCloseTo(0.0028, 6);
    expect(s).toContainEqual([5.3515, 5.3665, "chan"]);
  });

  it("lists its segments in order", () => {
    const s = segs("60m", "E").map(([lo]) => lo as number);
    expect(s).toEqual([...s].sort((a, b) => a - b));
  });
});

describe("the Mode filter", () => {
  it("allows CW in every segment a class holds", () => {
    for (const b of BANDS) for (const cls of ["E", "A", "G", "T"] as const) {
      expect(segsFor(b, { cls, mode: "cw" }), `${b.name} ${cls}`).toEqual(segsFor(b, { cls, mode: "any" }));
    }
  });

  it("keeps phone out of the CW/data sub-bands", () => {
    for (const b of BANDS) for (const g of segsFor(b, { cls: "E", mode: "phone" })) expect(g[2]).not.toBe("data");
  });

  it("names a color and a label for every kind of segment", () => {
    for (const b of BANDS) for (const g of b.priv.E) expect(MODES[g[2]].color).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("the bands themselves", () => {
  it("are in order and do not overlap", () => {
    for (let i = 1; i < BANDS.length; i++) expect(BANDS[i]!.lo, BANDS[i]!.name).toBeGreaterThan(BANDS[i - 1]!.hi);
  });

  it("hold every segment inside the band", () => {
    for (const b of BANDS) for (const cls of ["E", "A", "G", "T"] as const) for (const [lo, hi] of b.priv[cls]) {
      expect(lo, `${b.name} ${cls}`).toBeGreaterThanOrEqual(b.lo - 1e-9);
      expect(hi, `${b.name} ${cls}`).toBeLessThanOrEqual(b.hi + 1e-9);
      expect(hi).toBeGreaterThan(lo);
    }
  });

  it("are found by frequency and by range", () => {
    expect(bandAt(14.2)?.name).toBe("20m");
    expect(bandAt(12)).toBeUndefined();
    expect(bandsInRange(3, 55).map((b) => b.name)).toEqual(["80m", "60m", "40m", "30m", "20m", "17m", "15m", "12m", "10m", "6m"]);
  });
});

describe("inSegment", () => {
  it("is true only inside a segment the class and mode allow", () => {
    expect(inSegment(14.1, { cls: "G", mode: "any" })).toBe(true);
    expect(inSegment(14.01, { cls: "G", mode: "any" })).toBe(false);
    expect(inSegment(14.01, { cls: "E", mode: "any" })).toBe(true);
    expect(inSegment(14.1, { cls: "G", mode: "phone" })).toBe(false);
    expect(inSegment(14.3, { cls: "G", mode: "phone" })).toBe(true);
    expect(inSegment(15.35, { cls: "E", mode: "any" })).toBe(false);
    expect(inSegment(14.1, { cls: "T", mode: "any" })).toBe(false);
  });
});
