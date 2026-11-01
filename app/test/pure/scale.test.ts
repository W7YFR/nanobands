/* The SWR scale, out of OCR text. The label sets are what OCR read off the
 * three fixtures and the photo they came from, in a real Chromium page:
 * each word's text and its height on the plot. */

import { describe, expect, it } from "vitest";
import { axisLabels, fitScale, parsePerDivision } from "@/scale-text";

/** Words at the plot's right edge, on a plot that fills a unit square. */
const words = (...ws: [text: string, v: number][]) =>
  ws.map(([text, v]) => ({ text, box: { x0: 0.93, y0: v - 0.01, x1: 0.97, y1: v + 0.01 } }));
const identity = (x: number, y: number): [number, number] => [x, y];
const scaleOf = (per: number | null, ...ws: [string, number][]) => fitScale(axisLabels(words(...ws), identity), per);

describe("parsePerDivision", () => {
  it("reads SWR per division from the header as OCR saw it", () => {
    expect(parsePerDivision("C FS11 SWR 250m 2.258\n(ui)\n5.080 (000 MHz")).toBe(0.25);
    expect(parsePerDivision("EST ———\nI ——\nC FS11 TSWR 250ms 2.258\nui]")).toBe(0.25);
    expect(parsePerDivision("] YSTL SUR 500n/ 2.970\npH1: 4.690 000 MHz")).toBe(0.5);
    expect(parsePerDivision("1] »S11 SUR 500mn/ 2.970\nMM1: 4.690 000 MH")).toBe(0.5);
  });

  it("reads whole units, and thousandths that lost their unit", () => {
    expect(parsePerDivision("S11 SWR 1/ 1.420")).toBe(1);
    expect(parsePerDivision("S11 SWR 250 2.258")).toBe(0.25);
    expect(parsePerDivision("S11 SWR 1O0m/")).toBe(0.1);
  });

  it("finds none in text without it", () => {
    expect(parsePerDivision("START 3.000 000 MHz STOP 55.000 000 MHz")).toBeNull();
    expect(parsePerDivision("S11 SWR /")).toBeNull();
  });
});

describe("the axis labels", () => {
  it("give both ends of a 1–3 scale, past a misread label and START below the plot", () => {
    expect(scaleOf(0.25, ["3", 0.025], ["2.75", 0.149], ["5", 0.399], ["1.75", 0.65], ["1.5", 0.774], ["55.000", 1.022])).toEqual({ top: 3, bot: 1 });
    expect(scaleOf(0.25, ["3", 0.025], ["2.75", 0.149], ["1.75", 0.65], ["1.5", 0.774], ["1.25", 0.899], ["65.000", 1.022])).toEqual({ top: 3, bot: 1 });
  });

  it("give a 1–5 scale from labels that lost their decimal points", () => {
    expect(scaleOf(0.5, ["45", 0.149], ["3.5", 0.399], ["25", 0.645], ["1.5", 0.898], ["55.000", 1.021], ["0", 1.027])).toEqual({ top: 5, bot: 1 });
    expect(scaleOf(0.5, ["45", 0.149], ["4", 0.274], ["2", 0.611], ["1.5", 0.898])).toEqual({ top: 5, bot: 1 });
  });

  it("give a bottom other than SWR 1 when the reference line moved", () => {
    expect(scaleOf(null, ["4", 0.02], ["3.75", 0.125], ["3.5", 0.25], ["3", 0.5], ["2.25", 0.875])).toEqual({ top: 4, bot: 2 });
    expect(scaleOf(null, ["11", 0.02], ["10", 0.125], ["7", 0.5], ["4", 0.875])).toEqual({ top: 11, bot: 3 });
  });

  it("take two lines only when the header agrees", () => {
    expect(scaleOf(0.25, ["2.75", 0.125], ["1.5", 0.75])).toEqual({ top: 3, bot: 1 });
    expect(scaleOf(null, ["2.75", 0.125], ["1.5", 0.75])).toBeNull();
    expect(scaleOf(0.5, ["2.75", 0.125], ["1.5", 0.75])).toBeNull();
  });

  it("leave out words off the right edge, and words that are not numbers", () => {
    const ws = [...words(["2.75", 0.125], ["2.5", 0.25]), { text: "2", box: { x0: 0.4, y0: 0.49, x1: 0.42, y1: 0.51 } }, ...words(["MHz", 0.5])];
    expect(axisLabels(ws, identity).map((l) => l.values[0])).toEqual([2.75, 2.5]);
  });

  it("find no scale without labels", () => {
    expect(fitScale([], 0.5)).toBeNull();
  });
});
