/* The matching network's math against worked answers: Pozar's Example 5.1,
 * a load under Z0, and a reading from a real 20 m sweep. Every answer must
 * bring the load to Z0 + j0. */

import { describe, expect, it } from "vitest";
import { acrossPart, fmtPart, hardToBuild, inputOf, lNetwork, matchAt, seriesPart, stressOf, type Answer, type Part } from "@/match";

/** Each answer's parts, as `kind value` rounded, series first. */
const parts = (a: Answer[]): string[][] => a.map((x) => [x.series, x.across].map((p) => (p ? `${p.kind} ${+p.value.toFixed(2)}` : "none")));

describe("lNetwork", () => {
  it("matches Pozar's Example 5.1: 200 − j100 Ω on a 100 Ω line, the part across the line at the load", () => {
    const { form, xb } = lNetwork(200, -100, 100);
    expect(form).toBe("across-first");
    expect(xb.map(({ xs, b }) => [+b.toFixed(5), +xs.toFixed(1)])).toEqual([[0.0029, 122.5], [-0.0069, -122.5]]);
    // Pozar prints 38.8 nH and 2.61 pF, from B and Xs rounded first.
    const m = matchAt(200, -100, 100, 500, 2.62);
    expect(m.kind === "parts" && parts(m.answers)).toEqual([["coil 38.98", "capacitor 0.92"], ["capacitor 2.6", "coil 46.14"]]);
  });

  it("puts the part in series at the load when R is under Z0", () => {
    const { form, xb } = lNetwork(25, 20, 50);
    expect(form).toBe("series-first");
    expect(xb.map(({ xs, b }) => [+xs.toFixed(6), +b.toFixed(6)])).toEqual([[5, 0.02], [-45, -0.02]]);
  });

  it("brings every load to Z0 + j0", () => {
    for (const [r, x, z0] of [[200, -100, 100], [25, 20, 50], [27.8, -11.8, 50], [120, 80, 50], [10, -40, 50], [50, 30, 50], [300, 0, 75]] as const) {
      const { form, xb } = lNetwork(r, x, z0);
      for (const { xs, b } of xb) {
        const [a, c] = inputOf(r, x, form, xs, b);
        expect(a).toBeCloseTo(z0, 6);
        expect(c).toBeCloseTo(0, 6);
      }
    }
  });
});

describe("matchAt", () => {
  it("gives a low-pass and a high-pass answer for the 20 m reading at 14.133 MHz", () => {
    const m = matchAt(27.8, -11.8, 50, 14.133, 1.94);
    expect(m.kind).toBe("parts");
    if (m.kind !== "parts") return;
    expect(m.answers.map((a) => [a.series, a.across].map((p) => `${p!.kind} ${Math.round(p!.value)}`))).toEqual([["coil 413", "capacitor 201"], ["capacitor 863", "coil 630"]]);
    expect(m.answers.map((a) => [a.filter, a.loadSide])).toEqual([["low", "series"], ["high", "series"]]);
  });

  it("says neither is a filter when both answers put the same kind of part in series", () => {
    // Strongly capacitive and under Z0: both answers put a coil in series.
    const m = matchAt(10, -40, 50, 14.2, 8);
    expect(m.kind === "parts" && m.answers.map((a) => [a.series?.kind, a.filter])).toEqual([["coil", "low"], ["coil", null]]);
  });

  it("needs one part in series when R is Z0", () => {
    const m = matchAt(50, 30, 50, 14.2, 1.82);
    expect(m.kind === "parts" && parts(m.answers)).toEqual([["capacitor 373.6", "none"]]);
  });

  it("leaves out a part that changes almost nothing, near R = Z0", () => {
    for (const r of [50 - 1e-9, 50.001, 50.000001, 50.02]) {
      const m = matchAt(r, 30, 50, 14.2, 1.82);
      if (m.kind !== "parts") throw new Error("no parts");
      // An answer of one part, a capacitor of about 374 pF in series, and no absurd part anywhere.
      const one = m.answers.filter((a) => !a.across);
      expect(one.map((a) => a.series?.kind)).toEqual(["capacitor"]);
      expect(one[0]!.series!.value).toBeCloseTo(373.6, 0);
      for (const a of m.answers) for (const p of [a.series, a.across]) if (p) expect(p.value).toBeLessThan(1000);
    }
  });

  it("cancels X with one part when R is Z0 but for rounding, from either side", () => {
    // R a hair over Z0, as a file of "Z0 in series with a reactance" gives after its S11 round trip.
    const m = matchAt(75.00000000000146, -186.93733951632743, 75, 45.080189077966004, 8.088919680159295);
    if (m.kind !== "parts") throw new Error(m.kind);
    expect(m.form).toBe("series-first");
    expect(m.answers.map((a) => [a.series?.kind, +a.xs.toFixed(2), a.across])).toEqual([["coil", 186.94, null]]);
  });

  it("shows no answer its own parts do not match", () => {
    // Fed a network the check rejects, matchAt has nothing to show.
    const m = matchAt(75.00000000000146, -186.93733951632743, 75, 45.08, 8.09);
    expect(m.kind === "parts" && m.answers.every((a) => {
      const [zr, zx] = inputOf(75.00000000000146, -186.93733951632743, m.form, a.series ? a.xs : 0, a.across ? a.b : 0);
      const g = Math.hypot(zr - 75, zx) / Math.hypot(zr + 75, zx);
      return (1 + g) / (1 - g) < 1.01;
    })).toBe(true);
  });

  it("needs no network under SWR 1.1, and none can be built near the rim", () => {
    expect(matchAt(51, 2, 50, 14.2, 1.05).kind).toBe("none");
    expect(matchAt(0.9, 480, 50, 3, 999).kind).toBe("extreme");
    expect(matchAt(0, 30, 50, 3, Infinity).kind).toBe("extreme");
  });
});

describe("parts", () => {
  it("turn a reactance or susceptance into a coil or a capacitor", () => {
    expect(seriesPart(36.6, 14.133)!.kind).toBe("coil");
    expect(seriesPart(-13, 14.133)!.kind).toBe("capacitor");
    expect(acrossPart(0.0179, 14.133)!.kind).toBe("capacitor");
    expect(acrossPart(-0.0179, 14.133)!.kind).toBe("coil");
    expect(seriesPart(0, 14)).toBeNull();
  });

  it("call a capacitor under 1 pF or over 10 nF, or a coil under 10 nH or over 100 µH, hard to build", () => {
    expect([0.92, 1, 10_000, 12_000].map((value) => hardToBuild({ kind: "capacitor", value }))).toEqual([true, false, false, true]);
    expect([8, 10, 100_000, 150_000].map((value) => hardToBuild({ kind: "coil", value }))).toEqual([true, false, false, true]);
  });
});

/** The impedance of a part in series at f MHz, from its kind and value. */
const seriesX = (p: Part, f: number): number => {
  const w = 2 * Math.PI * f * 1e6;
  return p.kind === "coil" ? w * p.value * 1e-9 : -1 / (w * p.value * 1e-12);
};
/** The susceptance of a part across the line at f MHz, from its kind and value. */
const acrossB = (p: Part, f: number): number => {
  const w = 2 * Math.PI * f * 1e6;
  return p.kind === "capacitor" ? w * p.value * 1e-12 : -1 / (w * p.value * 1e-9);
};
/** The radio's view of load R + jX through the parts, built from the antenna side out, in the order the card gives. */
const build = (r: number, x: number, a: Answer, f: number): [number, number] => {
  let z: [number, number] = [r, x];
  const series = (): void => { if (a.series) z = [z[0], z[1] + seriesX(a.series, f)]; };
  const across = (): void => {
    if (!a.across) return;
    const d = z[0] ** 2 + z[1] ** 2, g = z[0] / d, b = -z[1] / d + acrossB(a.across, f), e = g * g + b * b;
    z = [g / e, -b / e];
  };
  // The part on the antenna side first, then the one on the radio side.
  if (a.loadSide === "series") { series(); across(); } else { across(); series(); }
  return z;
};

describe("the network as the card describes it", () => {
  /** A small random number generator, so a failure repeats. */
  const rand = ((seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646)(12345);

  it("brings 400 random loads to Z0 from the part kinds, values and order it shows", () => {
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const z0 = i % 2 ? 75 : 50, r = z0 * (0.05 + rand() * 6), x = z0 * (rand() * 8 - 4), f = 1.8 + rand() * 52;
      const gam = Math.hypot(r - z0, x) / Math.hypot(r + z0, x), swr = (1 + gam) / (1 - gam);
      const m = matchAt(r, x, z0, f, swr);
      if (m.kind !== "parts") continue;
      for (const a of m.answers) {
        const [zr, zx] = build(r, x, a, f);
        if (a.series && a.across) {
          expect(Math.abs(zr - z0) / z0).toBeLessThan(1e-9);
          expect(Math.abs(zx) / z0).toBeLessThan(1e-9);
        } else {
          // A part that changes almost nothing was left out: close, not exact.
          const g = Math.hypot(zr - z0, zx) / Math.hypot(zr + z0, zx);
          expect((1 + g) / (1 - g)).toBeLessThan(1.01);
        }
        n++;
      }
    }
    expect(n).toBeGreaterThan(500);
  });

  it("still matches closely with the values rounded as the card prints them", () => {
    const m = matchAt(27.8, -11.8, 50, 14.133, 1.94);
    if (m.kind !== "parts") throw new Error("no parts");
    const shown = (p: Part): Part => {
      const [v, u] = fmtPart(p).split(" ") as [string, string];
      return { kind: p.kind, value: +v * (u === "µH" || u === "nF" ? 1000 : 1) };
    };
    for (const a of m.answers) {
      const [zr, zx] = build(27.8, -11.8, { ...a, series: a.series && shown(a.series), across: a.across && shown(a.across) }, 14.133);
      const g = Math.hypot(zr - 50, zx) / Math.hypot(zr + 50, zx);
      expect((1 + g) / (1 - g)).toBeLessThan(1.02);
    }
  });
});

describe("a part left out", () => {
  const rand = ((seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646)(777);
  it("gives every answer an SWR under 1.01 from its parts, for loads near the R = Z0 and G = 1/Z0 circles", () => {
    let dropped = 0;
    for (let i = 0; i < 20000; i++) {
      const z0 = i % 2 ? 75 : 50;
      // Near R = Z0, or near G = 1/Z0: R = Z0·(1 + tiny), or a load on the G = 1/Z0 circle nudged.
      // From either side, as close as 1e-15 relative.
      const tiny = (rand() - 0.5) * 10 ** (-1 - 14 * rand()), x = z0 * (rand() * 6 - 3);
      const [r, xx] = i % 4 < 2 ? [z0 * (1 + tiny), x] : (() => {
        const bl = (rand() - 0.5) * 6 / z0, g = (1 + tiny) / z0, d = g * g + bl * bl;
        return [g / d, -bl / d];
      })();
      const gam = Math.hypot(r - z0, xx) / Math.hypot(r + z0, xx), swr = (1 + gam) / (1 - gam);
      const m = matchAt(r, xx, z0, 14.2, swr);
      if (m.kind !== "parts") continue;
      const { xb } = lNetwork(r, xx, z0);
      for (const a of m.answers) {
        if (!(a.series && a.across)) dropped++;
        // Built from the parts' kinds and values, in the order the card gives.
        const [zr, zx] = build(r, xx, a, 14.2);
        const g = Math.hypot(zr - z0, zx) / Math.hypot(zr + z0, zx);
        expect((1 + g) / (1 - g)).toBeLessThan(1.01);
        expect(xb.length).toBe(2);
      }
    }
    expect(dropped).toBeGreaterThan(100);
  });
});

/** Complex numbers as [re, im]. */
type C = [number, number];
const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const sub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a: C, b: C): C => { const d = b[0] ** 2 + b[1] ** 2; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const abs = (a: C): number => Math.hypot(a[0], a[1]);

/** Drive the network from a source of 2·√(P·Z0) volts RMS behind Z0, which
 *  gives P into a matched network. Solve each part's RMS voltage and current
 *  and the power in the load's R, from the parts' kinds and values. */
function solve(r: number, x: number, z0: number, a: Answer, f: number, watts: number): { series?: [number, number]; across?: [number, number]; pLoad: number } {
  const zl: C = [r, x];
  const zs: C | null = a.series && [0, seriesX(a.series, f)];
  const zp: C | null = a.across && div([1, 0], [0, acrossB(a.across, f)]);
  const par = (p: C, q: C): C => div(mul(p, q), add(p, q));
  // The impedance the source sees, from the antenna side out.
  const zIn = a.loadSide === "series"
    ? (() => { const z = zs ? add(zl, zs) : zl; return zp ? par(z, zp) : z; })()
    : (() => { const z = zp ? par(zl, zp) : zl; return zs ? add(z, zs) : z; })();
  const iIn = div([2 * Math.sqrt(watts * z0), 0], add([z0, 0], zIn)), vIn = mul(iIn, zIn);
  const out: { series?: [number, number]; across?: [number, number]; pLoad: number } = { pLoad: 0 };
  let iLoad: C;
  if (a.loadSide === "series") {
    // The part across the line at the input, then the part in series to the load.
    const iP = zp ? div(vIn, zp) : ([0, 0] as C);
    if (zp) out.across = [abs(vIn), abs(iP)];
    iLoad = sub(iIn, iP);
    if (zs) out.series = [abs(mul(iLoad, zs)), abs(iLoad)];
  } else {
    // The part in series at the input, then the part across the line at the load.
    const vLoad = zs ? sub(vIn, mul(iIn, zs)) : vIn;
    if (zs) out.series = [abs(mul(iIn, zs)), abs(iIn)];
    const iP = zp ? div(vLoad, zp) : ([0, 0] as C);
    if (zp) out.across = [abs(vLoad), abs(iP)];
    iLoad = sub(iIn, iP);
  }
  out.pLoad = abs(iLoad) ** 2 * r;
  return out;
}

describe("stressOf", () => {
  const rand = ((seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646)(4242);

  it("gives the 2.06 A and 1266 V peak of a 11.4 pF capacitor in series with 23.6 + j410 Ω at 32 MHz and 100 W", () => {
    const { xb } = lNetwork(23.6, 410, 50), { sign, xs, b } = xb[1]!;
    const a: Answer = { sign, xs, b, series: seriesPart(xs, 32), across: acrossPart(b, 32), loadSide: "series", filter: null };
    expect(fmtPart(a.series!)).toBe("11.4 pF");
    const s = stressOf(23.6, 410, 50, a, 100);
    expect(s.series!.i).toBeCloseTo(2.058, 3);
    expect(s.series!.v).toBeCloseTo(1266.2, 1);
    expect(s.across!.v).toBeCloseTo(100, 6);
  });

  it("matches a solve of the circuit for 400 random loads, both forms, on 50 and 75 Ω lines", () => {
    let two = 0, one = 0;
    for (let i = 0; i < 400; i++) {
      const z0 = i % 2 ? 75 : 50, r = z0 * (0.05 + rand() * 6), x = z0 * (rand() * 8 - 4), f = 1.8 + rand() * 52, watts = [5, 100, 1500][i % 3]!;
      const gam = Math.hypot(r - z0, x) / Math.hypot(r + z0, x), swr = (1 + gam) / (1 - gam);
      const m = matchAt(r, x, z0, f, swr);
      if (m.kind !== "parts") continue;
      for (const a of m.answers) {
        const s = stressOf(r, x, z0, a, watts), got = solve(r, x, z0, a, f, watts);
        // Two parts match exactly. A part left out leaves an SWR up to 1.01: about 1 percent.
        const tol = a.series && a.across ? 1e-6 : 0.01;
        a.series && a.across ? two++ : one++;
        expect(Math.abs(got.pLoad - watts) / watts).toBeLessThan(tol);
        for (const k of ["series", "across"] as const) {
          expect(!!s[k]).toBe(!!got[k]);
          if (!s[k]) continue;
          expect(Math.abs(s[k].v / Math.SQRT2 - got[k]![0]) / got[k]![0]).toBeLessThan(tol);
          expect(Math.abs(s[k].i - got[k]![1]) / got[k]![1]).toBeLessThan(tol);
        }
      }
    }
    expect(two).toBeGreaterThan(400);
    expect(one + two).toBeGreaterThan(500);
  });

  it("matches the solve within 1 percent for one-part answers near R = Z0", () => {
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const z0 = i % 2 ? 75 : 50, r = z0 * (1 + (rand() - 0.5) * 1e-3), x = z0 * (rand() * 4 - 2);
      const gam = Math.hypot(r - z0, x) / Math.hypot(r + z0, x), swr = (1 + gam) / (1 - gam);
      const m = matchAt(r, x, z0, 14.2, swr);
      if (m.kind !== "parts") continue;
      for (const a of m.answers.filter((a) => !(a.series && a.across))) {
        const s = stressOf(r, x, z0, a, 100), got = solve(r, x, z0, a, 14.2, 100);
        expect(Math.abs(got.pLoad - 100) / 100).toBeLessThan(0.01);
        for (const k of ["series", "across"] as const) if (s[k]) {
          expect(Math.abs(s[k].v / Math.SQRT2 - got[k]![0]) / got[k]![0]).toBeLessThan(0.01);
          expect(Math.abs(s[k].i - got[k]![1]) / got[k]![1]).toBeLessThan(0.01);
        }
        n++;
      }
    }
    expect(n).toBeGreaterThan(200);
  });
});
