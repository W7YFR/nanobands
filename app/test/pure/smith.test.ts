/* What the Smith chart reads off S11, and where its pointer lands. */

import { describe, expect, it } from "vitest";
import { impedance, reactancePart, returnLoss, s11At } from "@/smith";
import { nearestF, zoomAbout, type SmithGeom } from "@/ui/draw-smith";

describe("impedance", () => {
  it("is the reference impedance for no reflection", () => {
    expect(impedance(0, 0, 50)).toEqual([50, 0]);
    expect(impedance(0, 0, 75)).toEqual([75, 0]);
  });

  it("gives R + jX for S11", () => {
    const [r, x] = impedance(0.5, 0, 50);
    expect(r).toBeCloseTo(150);
    expect(x).toBeCloseTo(0);
    const [r2, x2] = impedance(0, 1, 50);
    expect(r2).toBeCloseTo(0);
    expect(x2).toBeCloseTo(50);
  });

  it("is open at S11 of 1", () => {
    expect(impedance(1, 0, 50)[0]).toBe(Infinity);
  });
});

describe("s11At", () => {
  const g = { f: [14, 14.1, 14.2], re: [0, 0.2, 0.4], im: [0.4, 0, -0.4], z0: 50 };

  it("reads a point, and the straight line between two", () => {
    expect(s11At(g, 14.1)).toEqual([0.2, 0]);
    const [re, im] = s11At(g, 14.15)!;
    expect(re).toBeCloseTo(0.3);
    expect(im).toBeCloseTo(-0.2);
  });

  it("gives nothing outside the sweep", () => {
    expect(s11At(g, 13.9)).toBeNull();
    expect(s11At(g, 14.3)).toBeNull();
  });
});

describe("reactancePart", () => {
  it("is an inductance for positive reactance, a capacitance for negative", () => {
    // 50 ohms at 14.2 MHz: 560 nH, or 224 pF.
    const l = reactancePart(50, 14.2), c = reactancePart(-50, 14.2);
    expect(l.kind).toBe("L");
    expect(l.value).toBeCloseTo(560.4, 0);
    expect(c.kind).toBe("C");
    expect(c.value).toBeCloseTo(224.2, 0);
  });
});

describe("returnLoss", () => {
  it("is 6 dB for half the power reflected in voltage", () => {
    expect(returnLoss(0.5)).toBeCloseTo(6.02, 2);
  });
});

describe("nearestF", () => {
  // One line from 14 to 14.2 MHz, along the bottom of a square.
  const g: SmithGeom = { lines: [{ f: [14, 14.1, 14.2], x: [0, 100, 200], y: [200, 200, 200] }], pins: [] };

  it("reads the frequency along the line nearest the pointer", () => {
    expect(nearestF(g, 150, 190, 24)).toBeCloseTo(14.15);
    expect(nearestF(g, -50, 200, 60)).toBe(14);
  });

  it("reads nothing out of reach", () => {
    expect(nearestF(g, 100, 150, 24)).toBeNull();
  });

  it("takes the nearer of two lines", () => {
    const two: SmithGeom = { lines: [...g.lines, { f: [7, 7.3], x: [0, 200], y: [100, 100] }], pins: [] };
    expect(nearestF(two, 100, 110, 24)).toBeCloseTo(7.15);
  });
});

describe("zoomAbout", () => {
  // A 500 px canvas: the middle at 250, a radius of 220 unzoomed.
  it("keeps the point under the pointer under it", () => {
    const z = zoomAbout(null, [360, 250], [360, 250], 2, 500, 500)!;
    // 110 px right is S11 0.5 unzoomed. At 2x, 0.5 is still 110 px right of the middle.
    expect(z.k).toBe(2);
    expect(z.c[0]).toBeCloseTo(0.25);
    expect(z.c[1]).toBeCloseTo(0);
  });

  it("pans: the point under the drag's start follows it", () => {
    const z = zoomAbout({ k: 4, c: [0, 0] }, [250, 250], [250 + 88, 250], 4, 500, 500)!;
    expect(z.c[0]).toBeCloseTo(-0.1);
  });

  it("zooms back out under 1x", () => {
    expect(zoomAbout({ k: 2, c: [0.3, 0] }, [250, 250], [250, 250], 0.9, 500, 500)).toBeNull();
  });
});
