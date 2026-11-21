/* What the Smith chart reads off S11, and where its pointer lands. */

import { describe, expect, it } from "vitest";
import { impedance, isEstimate, reactancePart, renormalize, returnLoss, s11At } from "@/smith";
import type { S11 } from "@/touchstone";
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
  it("is 6 dB when |S11| is 0.5: half the voltage, a quarter of the power, comes back", () => {
    expect(returnLoss(0.5)).toBeCloseTo(6.02, 2);
  });
});

describe("nearestF", () => {
  // One line from 14 to 14.2 MHz, along the bottom of a square.
  const g: SmithGeom = { lines: [{ f: [14, 14.1, 14.2], x: [0, 100, 200], y: [200, 200, 200] }], points: [] };

  it("reads the reading nearer the pointer on the line nearest it, never a point between", () => {
    expect(nearestF(g, 140, 190, 24)).toBe(14.1);
    expect(nearestF(g, 160, 190, 24)).toBe(14.2);
    expect(nearestF(g, -50, 200, 60)).toBe(14);
  });

  it("reads nothing out of reach", () => {
    expect(nearestF(g, 100, 150, 24)).toBeNull();
  });

  it("passes over a piece of line with no reading, so a line a little farther away still reads", () => {
    // The near line is two made-up ends; the far one has readings.
    const made: SmithGeom = { lines: [{ f: [14.1, 14.4], x: [0, 200], y: [100, 100], real: [false, false] }, { f: [7, 7.3], x: [0, 200], y: [115, 115] }], points: [] };
    expect(nearestF(made, 150, 102, 24)).toBe(7.3);
    expect(nearestF({ ...made, lines: [made.lines[0]!] }, 150, 102, 24)).toBeNull();
  });

  it("takes the nearer of two lines", () => {
    const two: SmithGeom = { lines: [...g.lines, { f: [7, 7.3], x: [0, 200], y: [100, 100] }], points: [] };
    expect(nearestF(two, 120, 110, 24)).toBe(7.3);
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

describe("isEstimate", () => {
  /** Two readings at |S11| m, `deg` degrees apart about the real axis. */
  const pair = (m: number, deg: number): S11 => {
    const a = (deg * Math.PI) / 360;
    return { f: [14, 14.1], re: [m * Math.cos(a), m * Math.cos(a)], im: [-m * Math.sin(a), m * Math.sin(a)], z0: 50 };
  };

  it("is false at a reading and outside the sweep", () => {
    expect(isEstimate(pair(0.9, 40), 14)).toBe(false);
    expect(isEstimate(pair(0.9, 40), 14.1)).toBe(false);
    expect(isEstimate(pair(0.9, 40), 15)).toBe(false);
  });

  it("is false where the straight line and the arc agree within 1%, and true where they do not", () => {
    // Halfway, 10° apart: the gap is 0.5% at |S11| 0.5, 3.5% at 0.9.
    expect(isEstimate(pair(0.5, 10), 14.05)).toBe(false);
    expect(isEstimate(pair(0.9, 10), 14.05)).toBe(true);
    // Readings close together are not estimates even near the rim.
    expect(isEstimate(pair(0.9, 3), 14.05)).toBe(false);
  });
});

describe("renormalize", () => {
  it("gives the same impedance against the new reference impedance", () => {
    const g: S11 = { f: [14], re: [0.2], im: [-0.3], z0: 75 };
    const r = renormalize(g, 50);
    const [a, b] = [impedance(g.re[0]!, g.im[0]!, 75), impedance(r.re[0]!, r.im[0]!, 50)];
    expect(r.z0).toBe(50);
    expect(b[0]).toBeCloseTo(a[0], 9);
    expect(b[1]).toBeCloseTo(a[1], 9);
  });

  it("leaves a sweep alone at its own reference impedance, and keeps an open an open", () => {
    const g: S11 = { f: [14], re: [1], im: [0], z0: 75 };
    expect(renormalize(g, 75)).toBe(g);
    expect(renormalize(g, 50).re[0]).toBe(1);
  });
});
