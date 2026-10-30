/* Telling the NanoVNA's slashed 0 from an 8, against drawn glyphs. */

import { describe, expect, it } from "vitest";
import { fixSlashedZeros, isSlashedZero } from "@/ocr-zeros";
import { blank } from "./synth";

const WHITE = [255, 255, 255] as const;

/** A 0 with a slash, or an 8 (the same box with a crossbar), at x. */
function glyphs(): { px: ReturnType<typeof blank>; zero: Box; eight: Box } {
  const px = blank(200, 80);
  const box = (x: number): Box => ({ x0: x, y0: 20, x1: x + 22, y1: 56 });
  const outline = (b: Box): void => {
    px.line(b.x0, b.y0, b.x1, b.y0, WHITE, 1.5);
    px.line(b.x0, b.y1, b.x1, b.y1, WHITE, 1.5);
    px.line(b.x0, b.y0, b.x0, b.y1, WHITE, 1.5);
    px.line(b.x1, b.y0, b.x1, b.y1, WHITE, 1.5);
  };
  const zero = box(30), eight = box(120);
  outline(zero);
  px.line(zero.x0 + 4, zero.y1 - 4, zero.x1 - 4, zero.y0 + 4, WHITE, 1.5);
  outline(eight);
  px.line(eight.x0, (eight.y0 + eight.y1) / 2, eight.x1, (eight.y0 + eight.y1) / 2, WHITE, 1.5);
  return { px, zero, eight };
}
interface Box { x0: number; y0: number; x1: number; y1: number }

describe("isSlashedZero", () => {
  it("tells a slashed 0 from an 8", () => {
    const { px, zero, eight } = glyphs();
    expect(isSlashedZero(px, zero)).toBe(true);
    expect(isSlashedZero(px, eight)).toBe(false);
  });

  it("refuses a box too small to judge", () => {
    const { px } = glyphs();
    expect(isSlashedZero(px, { x0: 30, y0: 20, x1: 32, y1: 56 })).toBe(false);
  });
});

describe("fixSlashedZeros", () => {
  it("turns slashed zeros read as 8 back into 0, and leaves real 8s alone", () => {
    const { px, zero, eight } = glyphs();
    // OCR ran on a half-size copy, so its boxes are half the photo's.
    const half = (b: Box): Box => ({ x0: b.x0 / 2, y0: b.y0 / 2, x1: b.x1 / 2, y1: b.y1 / 2 });
    const text = fixSlashedZeros(
      { text: "88", lines: [{ words: [{ symbols: [{ text: "8", bbox: half(zero) }, { text: "8", bbox: half(eight) }] }] }] },
      px,
      0.5,
    );
    expect(text).toBe("08");
  });

  it("keeps the plain text when OCR gave no symbols", () => {
    expect(fixSlashedZeros({ text: "START 3.000", lines: null }, blank(10, 10), 1)).toBe("START 3.000");
  });
});
