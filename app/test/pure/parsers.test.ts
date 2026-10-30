/* The two text formats the page reads: Touchstone files, and what OCR saw on
 * the NanoVNA's screen. */

import { describe, expect, it } from "vitest";
import { cleanFreq, parseSweepText } from "@/sweep-text";
import { isTouchstone, parseTouchstone, swrFromGamma } from "@/touchstone";

describe("swrFromGamma", () => {
  it("turns a reflection coefficient into SWR", () => {
    expect(swrFromGamma(0)).toBe(1);
    expect(swrFromGamma(0.5)).toBeCloseTo(3);
    expect(swrFromGamma(1)).toBe(999);
  });
});

describe("parseTouchstone", () => {
  it("reads real and imaginary S11 in MHz", () => {
    const { f, s } = parseTouchstone("! from NanoVNA-Saver\n# MHz S RI R 50\n3.0 0.5 0.0\n14.2 0 0.2\n");
    expect(f).toEqual([3, 14.2]);
    expect(s[0]).toBeCloseTo(3);
    expect(s[1]).toBeCloseTo(1.2 / 0.8);
  });

  it("reads magnitude and angle in Hz", () => {
    const { f, s } = parseTouchstone("# Hz S MA R 50\n3000000 0.5 -45\n");
    expect(f).toEqual([3]);
    expect(s[0]).toBeCloseTo(3);
  });

  it("reads dB and angle, and defaults to GHz", () => {
    const { f, s } = parseTouchstone("# S DB R 50\n0.0142 -6.0206 10\n");
    expect(f[0]).toBeCloseTo(14.2);
    expect(s[0]).toBeCloseTo(3, 3);
  });

  it("reads S11 out of an .s2p line and skips comments and junk", () => {
    const { f } = parseTouchstone("# MHz S RI R 50\n! comment\n7.1 0.1 0.1 0.9 0 0 0 0.1 0.1 ! trailing\nnot a number line\n\n");
    expect(f).toEqual([7.1]);
  });

  it("knows the file names it reads", () => {
    expect(isTouchstone("antenna.S1P")).toBe(true);
    expect(isTouchstone("sweep.s2p")).toBe(true);
    expect(isTouchstone("photo.jpg")).toBe(false);
  });
});

describe("parseSweepText", () => {
  it("reads START and STOP as OCR saw them on the NanoVNA", () => {
    // Real OCR output from a photo, after the slashed zeros are fixed.
    expect(parseSweepText("pH1: 4.690 000 MHz\nSTART\nSTOP 55.000 000 MH=")).toBeNull();
    expect(parseSweepText("START 3.000 000 MHz\nBW:1000Hz 401p\nSTOP 55.000 000 MH=")).toMatchObject({ start: 3, stop: 55 });
  });

  it("reads CENTER and SPAN, with the span in kHz", () => {
    const r = parseSweepText("CENTER 14.175 000 MHz SPAN 500.000 kHz")!;
    expect(r.start).toBeCloseTo(13.925);
    expect(r.stop).toBeCloseTo(14.425);
  });

  it("takes O, D and B for the digits OCR mistook them for", () => {
    expect(cleanFreq("3.OOO OOO")).toBe(3);
    expect(cleanFreq("1B.D00")).toBe(18);
  });

  it("keeps a sweep that does not start on a round number", () => {
    expect(parseSweepText("START 1.800 000 MHz STOP 30.000 000 MHz")).toMatchObject({ start: 1.8, stop: 30 });
  });

  it("refuses a stop below the start, and text with no sweep in it", () => {
    expect(parseSweepText("START 55 MHz STOP 3 MHz")).toBeNull();
    expect(parseSweepText("S11 SWR 500m/ 2.970")).toBeNull();
  });

  it("says what it read, for the note that asks for a check", () => {
    expect(parseSweepText("START 3.000 000 MHz STOP 55.000 000 MHz")!.raw).toBe("START 3.000 000 / STOP 55.000 000");
  });
});
