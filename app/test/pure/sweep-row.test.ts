/* The START/STOP row: parsing what OCR read in it. The glyphs themselves are
 * settled against real photos in the browser tier; see ocr.test.ts. */

import { describe, expect, it } from "vitest";
import { parseSweepRow, settleRow, type Strip } from "@/sweep-row";

describe("parseSweepRow", () => {
  it("reads START and STOP as the row settled them on real photos", () => {
    expect(parseSweepRow("START 144.000 000 MHz BW:1800Hz 1061p STOP 148.000 000 MHz")).toMatchObject({ start: 144, stop: 148 });
    expect(parseSweepRow("START 6.000 000 MHz BW:1066Hz 1681p STOP 50.000 000 MHz")).toMatchObject({ start: 6, stop: 50 });
  });

  it("takes a garbled unit, and an A read as H in START", () => {
    expect(parseSweepRow("STHRT 3.000 000 MHz B1808Hz 4811p STOP 55.000 000 HH:")).toMatchObject({ start: 3, stop: 55 });
    expect(parseSweepRow("START 3.000 000 Mz STOP 55.000 000 ME")).toMatchObject({ start: 3, stop: 55 });
  });

  it("drops a fourth digit in a group, from a glyph OCR split in two", () => {
    expect(parseSweepRow("START 144.0000 000 MHz STOP 148.0000 000 MHz")).toMatchObject({ start: 144, stop: 148 });
  });

  it("reads six digits run together, and a whole part with no point", () => {
    expect(parseSweepRow("START 144.000 000 MHz STOP 148.000000 MHz")).toMatchObject({ start: 144, stop: 148 });
    expect(parseSweepRow("START 144.000 000 MHz STOP 148000000 MHz")).toMatchObject({ start: 144, stop: 148 });
  });

  it("keeps the digits after the point, and scales GHz", () => {
    expect(parseSweepRow("START 18.068 000 MHz STOP 18.168 000 MHz")).toMatchObject({ start: 18.068, stop: 18.168 });
    expect(parseSweepRow("START 1.200 000 GHz STOP 1.300 000 GHz")).toMatchObject({ start: 1200, stop: 1300 });
  });

  it("says what it read, for the note that asks for a check", () => {
    expect(parseSweepRow("START 144.000 000 MHz STOP 148.000 000 MHz")!.raw).toBe("START 144.000 000 / STOP 148.000 000");
  });

  it("refuses a stop below the start, and a row with no sweep in it", () => {
    expect(parseSweepRow("START 148.000 000 MHz STOP 144.000 000 MHz")).toBeNull();
    expect(parseSweepRow("TART 144.ARR ARR HH CTAP 1492 0")).toBeNull();
  });
});

describe("settleRow", () => {
  it("leaves the text as OCR read it when the row has no text to learn from", () => {
    const blank: Strip = { gray: new Float32Array(400 * 40), width: 400, height: 40, lo: 0, hi: 255 };
    const sym = (text: string, x: number) => ({ text, bbox: { x0: x, y0: 5, x1: x + 8, y1: 30 } });
    expect(settleRow(blank, [{ symbols: [sym("1", 10), sym("4", 20), sym("8", 30)] }])).toBe("148");
  });
});
