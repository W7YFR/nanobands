/* The sweep's start and stop, out of the text OCR read off the screen.
 *
 * The NanoVNA prints `START 3.000 000 MHz` and `STOP 55.000 000 MHz`, or
 * `CENTER` and `SPAN`. OCR garbles some of it in predictable ways: an O, a D
 * or an A for a 0, a B for an 8, and the unit letters run together or read as
 * `Miz`. The slashed zeros are handled before this, against the pixels; see
 * ocr-zeros.ts.
 */

export interface SweepRange {
  start: number;
  stop: number;
  /** What OCR saw, for the note that asks the user to check it. */
  raw: string;
}

export const cleanFreq = (raw: string): number =>
  parseFloat(raw.toUpperCase().replace(/[\s,]/g, "").replace(/[OQDA@Ø]/g, "0").replace(/B/g, "8"));

export function parseSweepText(text: string): SweepRange | null {
  const t = text.toUpperCase().replace(/\n/g, " ");
  // The unit is often garbled; the NanoVNA shows MHz.
  const mult = (u: string | undefined): number => (u === "K" ? 1e-3 : u === "G" ? 1e3 : 1);
  const grab = (key: string): { f: number; raw: string } | null => {
    const m = t.match(new RegExp(key + "\\W*([0-9OQDAB@Ø][0-9OQDAB@Ø.,\\s]*?)\\s*([KMG])?\\s*(?:H|IZ)"));
    return m?.[1] ? { f: cleanFreq(m[1]) * mult(m[2]), raw: m[1].trim() } : null;
  };
  const a = grab("START"), b = grab("STOP");
  if (a && b && b.f > a.f) return { start: a.f, stop: b.f, raw: `START ${a.raw} / STOP ${b.raw}` };
  const c = grab("CENTER"), s = grab("SPAN");
  if (c && s && s.f > 0) return { start: c.f - s.f / 2, stop: c.f + s.f / 2, raw: `CENTER ${c.raw} / SPAN ${s.raw}` };
  return null;
}

/** The words a NanoVNA prints on its screen, as OCR tends to read them. */
const SCREEN_WORDS = [/START/, /STOP/, /CENTER/, /SPAN/, /[S$]1[1IL]/, /S[WU]R/, /M[HI][ZI=]/, /B[WULY]:/];

/** Whether a photo shows a NanoVNA screen: two of its words or more in the
 *  text OCR read, or a grid of 9 SWR lines. One word alone could be
 *  anything, a stop sign say. `swrLines` is null when no grid was found. */
export function looksLikeScreen(text: string, swrLines: number | null): boolean {
  const t = text.toUpperCase();
  return SCREEN_WORDS.filter((w) => w.test(t)).length >= 2 || swrLines === 9;
}
