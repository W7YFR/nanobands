/* The chart drawn on a real canvas: the curve's colors, a dip's color, and
 * where the key points and band boxes sit for the hover and the tooltip.
 */

import { describe, expect, it } from "vitest";
import { analyze } from "@/analysis";
import { drawChart, type ChartGeom } from "@/ui/draw-chart";
import { HIGH, MATCH, OK } from "@/ui/colors";
import type { Curve, Settings } from "@/ui/model";

const W = 800, H = 460;
const settings: Settings = { start: 13.5, stop: 14.5, top: 5, bot: 1, thr: 3, cls: "G", mode: "any", prom: 0.2, sens: 0 };

/** A V-shaped curve over 13.5–14.5 MHz with its dip at `dip`. */
function vee(dip: number, slope = 4): Curve {
  const N = 1001, f = new Float64Array(N), s = new Float64Array(N);
  for (let i = 0; i < N; i++) { f[i] = 13.5 + i / 1000; s[i] = 1.2 + slope * Math.abs(f[i]! - dip); }
  return { N, f, s };
}

function draw(curve: Curve, manual: number[] = []): { ctx: CanvasRenderingContext2D; g: ChartGeom } {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const an = analyze(curve.f, curve.s, { thr: settings.thr, prom: settings.prom, top: settings.top });
  const g = drawChart(ctx, W, H, 1, { settings, an, curve, range: [13.5, 14.5], manual, hoverF: null, drag: null })!;
  return { ctx, g };
}

const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const near = (p: ArrayLike<number>, hex: string, tol = 40): boolean => rgb(hex).every((v, i) => Math.abs(p[i]! - v) <= tol);
/** Whether pixel p is color c laid over the chart's background, at least
 *  a third opaque: thin lines are anti-aliased into it. */
function blendOf(p: ArrayLike<number>, c: string): boolean {
  const bg = rgb("#1a1f27"), col = rgb(c), d = col.map((v, i) => v - bg[i]!), q = [0, 1, 2].map((i) => p[i]! - bg[i]!);
  const t = q.reduce((a, v, i) => a + v * d[i]!, 0) / d.reduce((a, v) => a + v * v, 0);
  return t > 0.33 && t < 1.05 && q.every((v, i) => Math.abs(v - t * d[i]!) < 10);
}
const xOf = (g: ChartGeom, f: number): number => Math.round(g.x0 + ((f - g.lo) / (g.hi - g.lo)) * (g.x1 - g.x0));
/** The colors of the curve found in column x, inside the plot, or between rows y0 and y1. */
function colorsAt(ctx: CanvasRenderingContext2D, g: ChartGeom, x: number, y0 = g.y0, y1 = g.y1): Set<string> {
  const d = ctx.getImageData(x, y0, 1, y1 - y0).data, out = new Set<string>();
  for (let i = 0; i < d.length; i += 4) for (const c of [OK, MATCH, HIGH]) if (blendOf(d.subarray(i, i + 3), c)) out.add(c);
  return out;
}

describe("drawChart", () => {
  it("draws the curve green in your segments, gray outside them, yellow over Max SWR", () => {
    const { ctx, g } = draw(vee(13.8));
    expect(colorsAt(ctx, g, xOf(g, 13.6))).toEqual(new Set([MATCH])); // 2.0, no band
    expect(colorsAt(ctx, g, xOf(g, 14.1))).toEqual(new Set([OK])); // 2.4, CW/data segment
    expect(colorsAt(ctx, g, xOf(g, 14.4))).toEqual(new Set([HIGH])); // 3.6
  });

  it("colors a dip the way the curve is colored there", () => {
    for (const [dip, col] of [[13.8, MATCH], [14.1, OK]] as const) {
      const { ctx, g } = draw(vee(dip));
      const p = g.points.find((q) => q.kind === "dip")!;
      expect(p.f).toBeCloseTo(dip, 3);
      expect(near(ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data, col, 4), `dip at ${dip}`).toBe(true);
    }
  });

  it("draws a stretch's bracket gray outside your segments and green inside them", () => {
    // Under 3 from 13.35 to 14.25 MHz: in view from 13.5, through the CW/data segment.
    const { ctx, g } = draw(vee(13.8));
    // Under the band strip, where the brackets go.
    const below = (f: number): Set<string> => colorsAt(ctx, g, xOf(g, f), g.y1 + 36, H);
    expect(below(13.6)).toEqual(new Set([MATCH]));
    expect(below(14.1)).toEqual(new Set([OK]));
    // A stretch wholly outside your segments, from 13.61 to 13.79 MHz: gray, label and all.
    const out = draw(vee(13.7, 20));
    expect(colorsAt(out.ctx, out.g, xOf(out.g, 13.65), out.g.y1 + 36, H)).toEqual(new Set([MATCH]));
    expect(colorsAt(out.ctx, out.g, xOf(out.g, 13.7), out.g.y1 + 36, H)).toEqual(new Set([MATCH]));
  });

  it("returns the key points and the band's boxes", () => {
    const { g } = draw(vee(13.8), [14.1]);
    const kinds = g.points.map((p) => p.kind).sort();
    expect(kinds).toEqual(["crossing", "dip", "pin"]); // the other crossing, at 13.35 MHz, is out of view
    const pin = g.points.find((p) => p.kind === "pin")!;
    expect(pin.f).toBe(14.1);
    expect(Math.round(pin.x)).toBe(xOf(g, 14.1));
    // 20 m's boxes: in the strip, across its segments, and over its name,
    // at the band's middle.
    const boxes = g.bands.filter((b) => b.band.name === "20m");
    expect(boxes).toHaveLength(2);
    const strip = boxes.find((b) => b.t > g.y1)!, name = boxes.find((b) => b.b < g.y0)!;
    expect(strip.l).toBeCloseTo(xOf(g, 14.025), -1);
    expect(strip.r).toBeCloseTo(xOf(g, 14.35), -1);
    expect(name.l < xOf(g, 14.175) && name.r > xOf(g, 14.175)).toBe(true);
  });
});
