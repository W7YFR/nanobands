/* The chart drawn on a real canvas: the curve's colors, a dip's color, and
 * where the key points and band boxes sit for the hover and the tooltip.
 */

import { describe, expect, it } from "vitest";
import { analyze } from "@/analysis";
import { drawChart, isReading, type ChartGeom, type ChartScene } from "@/ui/draw-chart";
import { HIGH, MATCH, OK, PROBE } from "@/ui/colors";
import type { Curve, Settings } from "@/ui/model";

const W = 800, H = 460;
const settings: Settings = { start: 13.5, stop: 14.5, top: 5, bot: 1, thr: 3, cls: "G", mode: "any", prom: 0.2, sens: 0 };

/** A V-shaped curve over 13.5–14.5 MHz with its dip at `dip`. */
function vee(dip: number, slope = 4): Curve {
  const N = 1001, f = new Float64Array(N), s = new Float64Array(N);
  for (let i = 0; i < N; i++) { f[i] = 13.5 + i / 1000; s[i] = 1.2 + slope * Math.abs(f[i]! - dip); }
  return { N, f, s };
}

function draw(curve: Curve, manual: number[] = [], probe: number | null = null, hover: Partial<ChartScene> = {}): { ctx: CanvasRenderingContext2D; g: ChartGeom } {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const an = analyze(curve.f, curve.s, { thr: settings.thr, prom: settings.prom, top: settings.top });
  const g = drawChart(ctx, W, H, 1, { settings, an, curve, range: [13.5, 14.5], manual, probe, hoverF: null, drag: null, ...hover })!;
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

  it("draws the curve to both edges when its samples are far apart", () => {
    // Samples every 0.2 MHz, and a view whose edges fall between them.
    const N = 6, f = new Float64Array(N), sw = new Float64Array(N);
    for (let i = 0; i < N; i++) { f[i] = 13.5 + i * 0.2; sw[i] = 2; }
    const { ctx, g } = draw({ N, f, s: sw }, [], null, { range: [13.55, 14.38] });
    expect(colorsAt(ctx, g, xOf(g, 13.6)).size).toBe(1);
    expect(colorsAt(ctx, g, xOf(g, 14.36)).size).toBe(1);
  });

  it("runs the curve along the top until the line between readings comes under it, as the hover does", () => {
    // SWR 12 at 13.6 MHz and 4.5 at 13.8: the line between them meets the
    // top, 5, at 13.787 MHz. At 13.7 it is at 8.25, so the curve is at the top.
    const f = Float64Array.from([13.5, 13.6, 13.8, 14.0]), sw = Float64Array.from([12, 12, 4.5, 4.5]);
    const curve = { N: 4, f, s: sw };
    const { ctx, g } = draw(curve);
    // The top of the scale sits 24 px under the plot's top edge.
    const top = g.y0 + 24, x = xOf(g, 13.7);
    expect(colorsAt(ctx, g, x, top - 4, top + 4)).toEqual(new Set([HIGH]));
    expect(colorsAt(ctx, g, x, top + 6, g.y1).size).toBe(0);
    // The hover's dot sits at the top there too.
    const hovered = draw(curve, [], null, { hoverF: 13.7 }).ctx, d = hovered.getImageData(x, top - 8, 1, 16).data;
    let white = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i]! > 240 && d[i + 1]! > 240 && d[i + 2]! > 240) white++;
    expect(white).toBeGreaterThan(0);
  });

  describe("band edges", () => {
    const edgeF = (g: ChartGeom): number[] => g.points.filter((p) => p.kind === "edge").map((p) => p.f);

    it("puts a tick on the curve at each edge, for the hover to snap to", () => {
      // General class on 20 m.
      expect(edgeF(draw(vee(13.8)).g)).toEqual([14.0, 14.025, 14.15, 14.225, 14.35]);
    });

    it("shows no edges of a band too narrow on the chart to read them", () => {
      // 3–55 MHz across the plot: the widest band, 6 m, is about 57 px.
      const N = 521, f = Float64Array.from({ length: N }, (_, i) => 3 + i * 0.1), sw = new Float64Array(N).fill(2);
      expect(edgeF(draw({ N, f, s: sw }, [], null, { range: [3, 55] }).g)).toEqual([]);
      // 3–10 MHz: 80 m is about 53 px, 40 m under that; 3.5–4.5 MHz: 80 m fills the plot.
      expect(edgeF(draw({ N, f, s: sw }, [], null, { range: [3, 10] }).g)).toEqual([]);
      expect(edgeF(draw({ N, f, s: sw }, [], null, { range: [3.4, 4.1] }).g)).toEqual([3.5, 3.525, 3.6, 3.8, 4.0]);
    });

    it("leaves out an edge too close to the one before", () => {
      // 5.3–5.42 MHz: 60 m is wide, and its channels' two ends 2.8 kHz apart, about 17 px.
      const N = 121, f = Float64Array.from({ length: N }, (_, i) => 5.3 + i * 0.001), sw = new Float64Array(N).fill(2);
      const g = draw({ N, f, s: sw }, [], null, { range: [5.3, 5.42] }).g, xs = g.points.filter((p) => p.kind === "edge").map((p) => p.x);
      expect(xs.length).toBeGreaterThan(4);
      for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(8);
    });
  });

  describe("readings", () => {
    /** Readings every 0.2 MHz over 13.5–14.5 MHz. */
    const sparse = (s: number[]): Curve => ({ N: s.length, f: Float64Array.from(s, (_, i) => 13.5 + i * 0.2), s: Float64Array.from(s) });
    const readingDots = (g: ChartGeom): number => g.points.filter((p) => p.kind === "reading").length;

    it("puts a dot on each reading in Both, and none in Line or for a photo's trace", () => {
      const c = sparse([2, 2, 2, 2, 2, 2]);
      const both = draw(c, [], null, { readings: "both" }).g;
      expect(readingDots(both)).toBe(6);
      expect(both.crowded).toBe(false);
      expect(readingDots(draw(c, [], null, { readings: "line" }).g)).toBe(0);
      expect(readingDots(draw(c, [], null, { readings: null }).g)).toBe(0);
    });

    it("draws no line between readings in Points", () => {
      const c = sparse([2, 2, 2, 2, 2, 2]);
      const both = draw(c, [], null, { readings: "both" }), pts = draw(c, [], null, { readings: "points" });
      expect(colorsAt(both.ctx, both.g, xOf(both.g, 13.6)).size).toBe(1);
      expect(colorsAt(pts.ctx, pts.g, xOf(pts.g, 13.6)).size).toBe(0);
      expect(readingDots(pts.g)).toBe(6);
    });

    it("leaves out readings too close together to tell apart", () => {
      // 1001 readings across the plot: under a pixel apart.
      const { g } = draw(vee(13.8), [], null, { readings: "both" });
      expect(g.crowded).toBe(true);
      expect(readingDots(g)).toBe(0);
      expect(g.readings).toHaveLength(1001);
    });

    it("marks a reading over the top of the scale with a ▲ at the top", () => {
      const c = sparse([2, 12, 2, 2, 2, 2]), top = (g: ChartGeom): number => g.y0 + 24;
      const both = draw(c, [], null, { readings: "both" }), line = draw(c, [], null, { readings: "line" });
      const x = xOf(both.g, 13.7);
      expect(colorsAt(both.ctx, both.g, x, top(both.g) - 5, top(both.g) - 2)).toEqual(new Set([HIGH]));
      expect(colorsAt(line.ctx, line.g, x, top(line.g) - 5, top(line.g) - 2).size).toBe(0);
    });

    it("tells a reading from a value between readings", () => {
      const c = sparse([2, 3, 4]);
      expect(isReading(c, 13.7)).toBe(true);
      expect(isReading(c, 13.6)).toBe(false);
    });
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
    expect(kinds).toEqual(["crossing", "dip", "edge", "edge", "edge", "edge", "edge", "pin"]); // the other crossing, at 13.35 MHz, is out of view
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

  it("colors a pin's label the way the curve is colored there", () => {
    // On vee(13.8): 14.1 MHz is 2.4 in the CW/data segment, 13.6 MHz is 2.0 in no band.
    for (const [f, col] of [[14.1, OK], [13.6, MATCH]] as const) {
      const { ctx, g } = draw(vee(13.8), [f]);
      const pin = g.points.find((p) => p.kind === "pin")!;
      // The label's row, 14 px over the dot.
      const d = ctx.getImageData(Math.round(pin.x) - 30, Math.round(pin.y) - 14, 60, 1).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (near(d.subarray(i, i + 3), col, 30)) n++;
      expect(n, `pin at ${f}`).toBeGreaterThan(3);
    }
  });

  it("shows only the hover's readout over a snapped pin, in the curve's color", () => {
    /** Pixels of color col in a 120 px row centered on x. */
    const count = (ctx: CanvasRenderingContext2D, x: number, y: number, col: string): number => {
      const d = ctx.getImageData(Math.round(x) - 60, Math.round(y), 120, 1).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (near(d.subarray(i, i + 3), col, 30)) n++;
      return n;
    };
    // Snapped: the readout sits 22 px over the dot, in green. The pin's own
    // label, 14 px over the dot, is gone: its lower rows match a chart with no pin.
    const on = draw(vee(13.8), [14.1], null, { hoverF: 14.1, snap: "pin" });
    const pin = on.g.points.find((p) => p.kind === "pin")!;
    expect(count(on.ctx, pin.x, pin.y - 22, OK)).toBeGreaterThan(3);
    const bare = draw(vee(13.8));
    expect(count(on.ctx, pin.x, pin.y - 12, OK)).toBe(count(bare.ctx, pin.x, pin.y - 12, OK));
    // Not snapped: the pin keeps its label.
    const off = draw(vee(13.8), [14.1]);
    expect(count(off.ctx, pin.x, pin.y - 12, OK)).toBeGreaterThan(count(bare.ctx, pin.x, pin.y - 12, OK) + 3);
    // A hover off any key point takes the curve's color too, never white.
    // At 13.6 MHz the SWR is 2.0, outside the segments: its readout sits 18 px
    // over the dot, in gray.
    const gray = draw(vee(13.8), [], null, { hoverF: 13.6 });
    const py0 = gray.g.y0 + 24, py1 = gray.g.y1 - 22, dotY = py1 - ((2.0 - 1) / (5 - 1)) * (py1 - py0);
    let white = 0, inGray = 0;
    for (let r = dotY - 22; r <= dotY - 14; r++) {
      white += count(gray.ctx, xOf(gray.g, 13.6), r, "#e6edf3");
      inGray += count(gray.ctx, xOf(gray.g, 13.6), r, MATCH);
    }
    expect(white).toBe(0);
    expect(inGray).toBeGreaterThan(20);
  });

  it("marks the typed frequency with a dashed line and a point to pin it by", () => {
    const dashes = (ctx: CanvasRenderingContext2D, g: ChartGeom, x: number): number => {
      const d = ctx.getImageData(x, g.y0, 1, g.y1 - g.y0).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (blendOf(d.subarray(i, i + 3), PROBE)) n++;
      return n;
    };
    const { ctx, g } = draw(vee(13.8), [], 14.2);
    expect(dashes(ctx, g, xOf(g, 14.2))).toBeGreaterThan(50);
    const probe = g.points.find((p) => p.kind === "probe")!;
    expect(probe.f).toBe(14.2);
    expect(Math.round(probe.x)).toBe(xOf(g, 14.2));
    expect(g.points.map((p) => p.kind)).not.toContain("pin");
    const none = draw(vee(13.8));
    expect(dashes(none.ctx, none.g, xOf(none.g, 14.2))).toBeLessThan(5);
  });
});
