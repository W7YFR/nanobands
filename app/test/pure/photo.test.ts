/* Finding the grid, tracing the curve and straightening, on synthetic screens.
 *
 * The real photos are in the browser tier, because decoding one needs a
 * canvas. Here the answer is known exactly, so the checks can be tight.
 */

import { describe, expect, it } from "vitest";
import { mappingFor, type Quad } from "@/geometry";
import { detectGrid } from "@/grid";
import { rectify } from "@/rectify";
import { autoTrace } from "@/trace";
import { YELLOW, blank, screen } from "./synth";

const near = (a: Quad, b: Quad, tol: number): void => {
  a.forEach((p, i) => {
    expect(Math.abs(p[0] - b[i]![0]), `corner ${i} x`).toBeLessThan(tol);
    expect(Math.abs(p[1] - b[i]![1]), `corner ${i} y`).toBeLessThan(tol);
  });
};

describe("detectGrid", () => {
  it("finds the corners of a square grid", () => {
    const sc = screen();
    const r = detectGrid(sc.px);
    expect(r).not.toBeNull();
    near(r!.corners, sc.corners, 3);
    expect(r!.horizontal).toBe(9);
    expect(r!.vertical).toBe(11);
  });

  it("finds the corners of a skewed grid", () => {
    const sc = screen({ skew: 30 });
    const r = detectGrid(sc.px);
    expect(r).not.toBeNull();
    near(r!.corners, sc.corners, 3);
  });

  it("finds nothing in a blank picture", () => {
    expect(detectGrid(blank(1200, 900))).toBeNull();
  });
});

/** Median absolute error of a trace against the true curve, and how much of
 *  the plot it covers. */
function score(v: Float32Array, curve: (u: number) => number): { err: number; cover: number } {
  const errs: number[] = [];
  for (let i = 0; i < v.length; i++) if (!Number.isNaN(v[i])) errs.push(Math.abs(v[i]! - curve((i + 0.5) / v.length)));
  errs.sort((a, b) => a - b);
  return { err: errs[Math.floor(errs.length / 2)] ?? Infinity, cover: errs.length / v.length };
}

describe("autoTrace", () => {
  it("follows the curve across the whole plot", () => {
    const sc = screen();
    const { N, v } = autoTrace(sc.px, mappingFor(sc.corners).fwd, sc.corners, 70);
    expect(N).toBeGreaterThan(900);
    const { err, cover } = score(v, sc.curve);
    expect(err).toBeLessThan(0.005);
    expect(cover).toBeGreaterThan(0.97);
  });

  it("follows the curve in a skewed photo", () => {
    const sc = screen({ skew: 30 });
    const { v } = autoTrace(sc.px, mappingFor(sc.corners).fwd, sc.corners, 70);
    expect(score(v, sc.curve).err).toBeLessThan(0.006);
  });

  it("ignores yellow text in the plot", () => {
    const sc = screen({ clutter: true });
    const { v } = autoTrace(sc.px, mappingFor(sc.corners).fwd, sc.corners, 70);
    // The text stands across the curve's peak near u = 0.375. A column that
    // took a stroke of text instead of the curve is off by far more than this.
    const N = v.length;
    let worst = 0;
    for (let i = Math.floor(N * 0.28); i < N * 0.47; i++) if (!Number.isNaN(v[i])) worst = Math.max(worst, Math.abs(v[i]! - sc.curve((i + 0.5) / N)));
    expect(worst).toBeLessThan(0.05);
  });

  it("finds nothing when the color sensitivity rules out the curve", () => {
    const sc = screen();
    // The curve's yellow has min(r, g) − b = 180; asking for more finds none.
    expect(YELLOW[1] - YELLOW[2]).toBe(180);
    const { v } = autoTrace(sc.px, mappingFor(sc.corners).fwd, sc.corners, 200);
    expect(v.every(Number.isNaN)).toBe(true);
  });
});

describe("rectify", () => {
  it("puts the grid's corners at the plot's corners in the copy", () => {
    const sc = screen({ skew: 30 });
    const m = mappingFor(sc.corners);
    const r = rectify(sc.px, m.fwd, sc.corners);
    expect(r.data.length).toBe(r.W * r.H * 4);
    // Grid ink at the copy's plot corners, dark well outside them.
    const at = (x: number, y: number): number => r.data[(Math.round(y) * r.W + Math.round(x)) * 4 + 2]!;
    expect(at(r.mx, r.my)).toBeGreaterThan(150);
    expect(at(r.mx + r.pw - 1, r.my + r.ph - 1)).toBeGreaterThan(150);
    expect(at(r.mx / 2, r.my / 2)).toBeLessThan(60);
  });

  it("keeps the copy under the width it is given", () => {
    const sc = screen();
    expect(rectify(sc.px, mappingFor(sc.corners).fwd, sc.corners, 500).W).toBeLessThanOrEqual(500);
  });
});
