import { describe, expect, it } from "vitest";
import { fmtF, niceStep } from "@/format";
import { mappingFor, solveRefs, type Quad } from "@/geometry";

const skewed: Quad = [[120, 90], [1080, 60], [1110, 840], [90, 800]];

describe("mappingFor", () => {
  it("takes the unit square's corners to the quadrilateral's", () => {
    const m = mappingFor(skewed);
    [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], i) => {
      const [x, y] = m.fwd(u!, v!);
      expect(x).toBeCloseTo(skewed[i]![0], 6);
      expect(y).toBeCloseTo(skewed[i]![1], 6);
    });
  });

  it("goes back to where it started", () => {
    const m = mappingFor(skewed);
    for (const [u, v] of [[0.3, 0.7], [0.91, 0.05], [0.5, 0.5]] as const) {
      const [x, y] = m.fwd(u, v);
      const [u2, v2] = m.back(x, y);
      expect(u2).toBeCloseTo(u, 9);
      expect(v2).toBeCloseTo(v, 9);
    }
  });

  it("is a plain scale for a rectangle", () => {
    const m = mappingFor([[0, 0], [200, 0], [200, 100], [0, 100]]);
    const [x, y] = m.fwd(0.25, 0.5);
    expect(x).toBeCloseTo(50);
    expect(y).toBeCloseTo(50);
  });
});

describe("solveRefs", () => {
  it("finds start and stop from two known frequencies", () => {
    const r = solveRefs([{ u: 0.25, f: 16 }, { u: 0.75, f: 42 }])!;
    expect(r.start).toBeCloseTo(3);
    expect(r.stop).toBeCloseTo(55);
  });

  it("needs two points at different places", () => {
    expect(solveRefs([{ u: 0.5, f: 10 }])).toBeNull();
    expect(solveRefs([{ u: 0.5, f: 10 }, { u: 0.5, f: 12 }])).toBeNull();
  });
});

describe("format", () => {
  it("gives a frequency the decimals its size deserves", () => {
    expect(fmtF(14.2)).toBe("14.200");
    expect(fmtF(146.52)).toBe("146.52");
    expect(fmtF(0.4755)).toBe("0.4755");
  });

  it("rounds an axis step to 1, 2 or 5", () => {
    expect(niceStep(4.3)).toBe(5);
    expect(niceStep(0.023)).toBe(0.02);
    expect(niceStep(1.2)).toBe(1);
  });
});
