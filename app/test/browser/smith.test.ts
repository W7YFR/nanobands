/* The Smith chart drawn on a real canvas: where a frequency lands, the
 * sweep's colors there, and what the pointer reads back.
 */

import { describe, expect, it } from "vitest";
import { clampZoom, drawSmith, nearestF, type SmithGeom, type SmithScene } from "@/ui/draw-smith";
import { dipIn } from "@/ui/model";
import { HIGH, OK } from "@/ui/colors";
import type { Settings } from "@/ui/model";
import { swrFromGamma, type S11 } from "@/touchstone";

const S = 500;
const settings: Settings = { start: 14, stop: 14.35, top: 5, bot: 1, thr: 3, cls: "G", mode: "any", prom: 0.2, sens: 0, clip: false };

/** A series-resonant load at 14.2 MHz: 50 ohms plus reactance growing either side. */
function resonant(): S11 {
  const f: number[] = [], re: number[] = [], im: number[] = [];
  for (let i = 0; i <= 200; i++) {
    const fq = 14 + (0.35 * i) / 200, x = 3000 * (fq / 14.2 - 14.2 / fq), d = 100 ** 2 + x ** 2;
    // S11 = (Z - 50) / (Z + 50), Z = 50 + jx.
    f.push(fq); re.push((x * x) / d); im.push((100 * x) / d);
  }
  return { f, re, im, z0: 50 };
}

function draw(over: Partial<SmithScene> = {}): { ctx: CanvasRenderingContext2D; g: SmithGeom } {
  const c = document.createElement("canvas");
  c.width = S; c.height = S;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const g = drawSmith(ctx, S, S, 1, { settings, range: [14, 14.35], latest: resonant(), kept: [], manual: [], hoverF: null, ...over });
  return { ctx, g };
}

const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** Whether pixel p is color c laid over the chart's background, at least
 *  a third opaque: thin lines are anti-aliased into it. */
function blendOf(p: ArrayLike<number>, c: string): boolean {
  const bg = rgb("#1a1f27"), col = rgb(c), d = col.map((v, i) => v - bg[i]!), q = [0, 1, 2].map((i) => p[i]! - bg[i]!);
  const t = q.reduce((a, v, i) => a + v * d[i]!, 0) / d.reduce((a, v) => a + v * v, 0);
  return t > 0.33 && t < 1.05 && q.every((v, i) => Math.abs(v - t * d[i]!) < 10);
}
/** Whether a pixel within r of (x, y) is color c. */
function colorNear(ctx: CanvasRenderingContext2D, x: number, y: number, c: string, r = 3): boolean {
  const d = ctx.getImageData(Math.round(x) - r, Math.round(y) - r, 2 * r + 1, 2 * r + 1).data;
  for (let i = 0; i < d.length; i += 4) if (blendOf(d.subarray(i, i + 3), c)) return true;
  return false;
}

describe("drawSmith", () => {
  it("draws the sweep through the middle at resonance, green under Max SWR, yellow over it", () => {
    const { ctx, g } = draw(), l = g.lines[0]!;
    const at = (f: number): number => l.f.findIndex((x) => x >= f);
    // 14.2 MHz is 50 ohms: the middle of the chart, give or take the next reading.
    expect(Math.abs(l.x[at(14.2)]! - S / 2)).toBeLessThan(2);
    expect(Math.abs(l.y[at(14.2)]! - S / 2)).toBeLessThan(2);
    const i = at(14.32), j = at(14.03);
    expect(colorNear(ctx, l.x[i]!, l.y[i]!, OK)).toBe(true);
    expect(colorNear(ctx, l.x[j]!, l.y[j]!, HIGH)).toBe(true);
  });

  it("runs across the whole view, through every reading in it, and marks which points are readings", () => {
    const { g } = draw({ range: [14.1, 14.3] });
    const l = g.lines[0]!, f = resonant().f.filter((x) => x >= 14.1 && x <= 14.3);
    expect(l.f).toEqual([14.1, ...f, 14.3]);
    expect(l.real).toEqual([false, ...f.map(() => true), false]);
  });

  it("draws the line and a pin in a view between two readings, with no dip, and reads no made-up frequency", () => {
    // Two readings per MHz: 14 and 14.5 MHz. The view, 14.1–14.4 MHz, holds none.
    const f = [13.5, 14, 14.5, 15], g: S11 = { f, re: [0.5, 0.2, -0.1, -0.3], im: [-0.4, -0.1, 0.2, 0.4], z0: 50 };
    const { g: geom } = draw({ latest: g, range: [14.1, 14.4], manual: [14.25] });
    const l = geom.lines[0]!;
    expect(l.f).toEqual([14.1, 14.4]);
    expect(l.real).toEqual([false, false]);
    expect(geom.points.map((p) => p.kind)).toEqual(["pin"]);
    // Anywhere on that line, the pointer reads nothing rather than a made-up frequency.
    const mid = [(l.x[0]! + l.x[1]!) / 2, (l.y[0]! + l.y[1]!) / 2] as const;
    expect([nearestF(geom, l.x[0]!, l.y[0]!, 24), nearestF(geom, ...mid, 24), nearestF(geom, l.x[1]!, l.y[1]!, 24)]).toEqual([null, null, null]);
    // One reading in view: the pointer near either end reads it.
    const one = draw({ latest: g, range: [13.9, 14.4] }).g;
    const m = one.lines[0]!;
    expect(m.real).toEqual([false, true, false]);
    expect(nearestF(one, m.x[0]!, m.y[0]!, 24)).toBe(14);
    expect(nearestF(one, m.x[2]!, m.y[2]!, 24)).toBe(14);
  });

  it("marks no dip at the end of the view, as the SWR chart marks none there", () => {
    // Over 14.21–14.3 MHz the SWR only rises, so the lowest reading in view is the first.
    const { g } = draw({ range: [14.21, 14.3] });
    const s = Float64Array.from(resonant().f.map((_, i) => swrFromGamma(Math.hypot(resonant().re[i]!, resonant().im[i]!))));
    expect(dipIn(Float64Array.from(resonant().f), s, 14.21, 14.3)).toBeNull();
    expect(g.points.find((p) => p.kind === "dip")).toBeUndefined();
  });

  it("labels a pin with the SWR the SWR chart gives, not one from the S11 line", () => {
    const c = document.createElement("canvas");
    c.width = S; c.height = S;
    const ctx = c.getContext("2d")!, said: string[] = [], fill = ctx.fillText.bind(ctx);
    ctx.fillText = (t: string, x: number, y: number) => { said.push(t); fill(t, x, y); };
    drawSmith(ctx, S, S, 1, { settings, range: [14, 14.35], latest: resonant(), kept: [], manual: [14.25], probe: 14.3, hoverF: null, swr: () => 9.87 });
    expect(said).toContain("14.250 · 9.87");
    expect(said).toContain("14.300 · 9.87");
  });

  it("puts a pin where the pointer reads its frequency back", () => {
    const { g } = draw({ manual: [14.25] });
    const p = g.points.find((q) => q.kind === "pin")!;
    expect(p.f).toBe(14.25);
    // 14.25 MHz falls between readings: the pointer there reads the nearer one.
    const f = nearestF(g, p.x, p.y, 4)!;
    expect(resonant().f).toContain(f);
    expect(Math.abs(f - 14.25)).toBeLessThan(0.00175);
  });

  it("gives the dip, the typed frequency and the pins to snap to, pins last, and not the made-up ends", () => {
    const { g } = draw({ manual: [14.25], probe: 14.3 });
    expect(g.points.map((p) => [p.kind, +p.f.toFixed(2)])).toEqual([["dip", 14.2], ["probe", 14.3], ["pin", 14.25]]);
  });

  it("draws a kept sweep but no line for a hidden sweep", () => {
    const { g } = draw({ latest: null, kept: [{ g: resonant(), n: 1 }] });
    expect(g.lines).toHaveLength(1);
    expect(g.points).toEqual([]);
  });

  it("shows the readings as dots in Points, and reads only them", () => {
    const line = draw().g, points = draw({ readings: "points" }).g;
    expect(line.lines[0]!.dots).toBeUndefined();
    // The readings in view, and none of the ends the line adds between them.
    expect(points.lines[0]!.dots).toBe(true);
    expect(points.lines[0]!.f).toEqual(resonant().f);
    // Between two readings, the pointer reads the nearer one.
    const l = points.lines[0]!, x = (l.x[100]! + l.x[101]!) / 2 + 0.1, y = (l.y[100]! + l.y[101]!) / 2;
    expect([l.f[100], l.f[101]]).toContain(nearestF(points, x, y, 24));
  });

  it("zooms about a point, and holds the zoom to the chart", () => {
    // 4× about the middle: the reading nearest the match at 14.2 MHz lands near the canvas's middle.
    const g = draw({ zoom: { k: 4, c: [0, 0] } }).g, l = g.lines[0]!;
    const i = l.f.reduce((b, f, j) => (Math.abs(f - 14.2) < Math.abs(l.f[b]! - 14.2) ? j : b), 0);
    expect(Math.hypot(l.x[i]! - S / 2, l.y[i]! - S / 2)).toBeLessThan(8);
    // With S11 0.25 in the middle, the match sits a whole unzoomed radius to its left.
    const z = draw({ zoom: { k: 4, c: [0.25, 0] } }).g;
    expect(z.lines[0]!.x[i]! - l.x[i]!).toBeCloseTo(-(S / 2 - 30), 0);
    expect(clampZoom({ k: 0.5, c: [0.3, 0] })).toBeNull();
    expect(clampZoom({ k: 100, c: [3, 4] })).toEqual({ k: 40, c: [0.6, 0.8] });
  });
});
