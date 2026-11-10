/* The START/STOP row under the plot, read on its own.
 *
 * OCR over the whole photo sees the row as small text among much else. Here
 * the row is cut out under the grid, squared up at the photo's resolution,
 * and read as one line. That settles the whole part of each frequency.
 *
 * The digits after the point are harder. The NanoVNA draws 0 with a slash,
 * and in a photo's glow a slashed 0 has the outline of an 8: OCR reads it as
 * 0, 6 or 8 at random. The row holds 0s whose value is known: the point
 * count, 101, 201, 401 or 1001, is 0 between its first and last digit. Each
 * uncertain digit is compared with those, across the middle of the glyph,
 * where the slash and the 8's waist differ.
 */

import { mappingFor, type Quad } from "./geometry";
import type { OcrSymbol } from "./ocr-zeros";
import type { Pixels } from "./pixels";
import type { SweepRange } from "./sweep-text";

/** The row, squared up: brightness 0..255, row major. */
export interface Strip {
  gray: Float32Array;
  width: number;
  height: number;
  /** The background and the brightest text, for the cuts below. */
  lo: number;
  hi: number;
}

/** Where the row lies, in plot units: u across, v down from the top line. */
const U0 = -0.1, U1 = 1.25, V0 = 1.005, V1 = 1.1;
/** The brightness cut for OCR, and the higher one that splits glyphs that
 *  touch: a share of the way from background to the brightest text. */
const CUT_TEXT = 0.8, CUT_SPLIT = 0.9;
/** How far a glyph's middle may be from a known 0's and still be a 0. The
 *  photos give 0.17 or less for a slashed 0, and 0.21 or more for an 8. */
const SAME_AS_ZERO = 0.185;
/** The descriptor: the middle of a glyph, sampled on this grid. */
const DW = 16, DH = 10;

/** The row under the grid, squared up at about the photo's own resolution. */
export function rowStrip(px: Pixels, corners: Quad): Strip | null {
  const [tl, tr, , bl] = corners;
  const gw = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]), gh = Math.hypot(bl[0] - tl[0], bl[1] - tl[1]);
  const height = Math.round((V1 - V0) * gh), width = Math.round((U1 - U0) * gw);
  if (height < 12 || width < 100) return null;
  const fwd = mappingFor(corners).fwd, { width: iw, height: ih, data: d } = px;
  const gray = new Float32Array(width * height);
  for (let j = 0; j < height; j++) {
    const v = V0 + ((V1 - V0) * (j + 0.5)) / height;
    for (let i = 0; i < width; i++) {
      const [sx, sy] = fwd(U0 + ((U1 - U0) * (i + 0.5)) / width, v);
      const x = Math.floor(sx), y = Math.floor(sy);
      if (x < 0 || y < 0 || x >= iw - 1 || y >= ih - 1) continue;
      // Red and green: the text is white or yellow.
      const fx = sx - x, fy = sy - y, a = (y * iw + x) * 4, b = a + iw * 4;
      const at = (k: number): number => (d[k]! + d[k + 1]!) / 2;
      gray[j * width + i] = (at(a) * (1 - fx) + at(a + 4) * fx) * (1 - fy) + (at(b) * (1 - fx) + at(b + 4) * fx) * fy;
    }
  }
  const sorted = Float32Array.from(gray).sort();
  const lo = sorted[Math.floor(sorted.length * 0.5)]!, hi = sorted[Math.floor(sorted.length * 0.985)]!;
  return hi - lo < 30 ? null : { gray, width, height, lo, hi };
}

/** The strip as black text on white, RGBA, for OCR. */
export function stripImage(s: Strip): Uint8ClampedArray<ArrayBuffer> {
  const cut = s.lo + (s.hi - s.lo) * CUT_TEXT, out = new Uint8ClampedArray(s.gray.length * 4);
  for (let k = 0; k < s.gray.length; k++) {
    const v = s.gray[k]! > cut ? 0 : 255;
    out[k * 4] = out[k * 4 + 1] = out[k * 4 + 2] = v;
    out[k * 4 + 3] = 255;
  }
  return out;
}

/** The first and last rows with text in them. */
function textRows(s: Strip): [number, number] {
  const cut = s.lo + (s.hi - s.lo) * CUT_TEXT;
  let top = s.height, bot = -1;
  for (let y = 0; y < s.height; y++) {
    let n = 0;
    for (let x = 0; x < s.width; x++) if (s.gray[y * s.width + x]! > cut) n++;
    if (n > s.width * 0.02) { top = Math.min(top, y); bot = Math.max(bot, y); }
  }
  return [top, bot];
}

/** Each glyph's columns. Glyphs that still touch at the higher cut come as
 *  one span about twice as wide, and are split evenly. */
function glyphSpans(s: Strip, top: number, bot: number): [number, number][] {
  const cut = s.lo + (s.hi - s.lo) * CUT_SPLIT, runs: [number, number][] = [];
  let start = -1;
  for (let x = 0; x <= s.width; x++) {
    let ink = false;
    if (x < s.width) for (let y = top; y <= bot && !ink; y++) ink = s.gray[y * s.width + x]! > cut;
    if (ink && start < 0) start = x;
    else if (!ink && start >= 0) { runs.push([start, x - 1]); start = -1; }
  }
  const widths = runs.map(([a, b]) => b - a + 1).sort((a, b) => a - b);
  const one = widths[Math.floor(widths.length / 2)] ?? 0;
  return runs.flatMap(([a, b]) => {
    const n = one ? Math.round((b - a + 1) / one) : 1;
    if (n < 2) return [[a, b] as [number, number]];
    return Array.from({ length: n }, (_, k) => [Math.round(a + ((b - a + 1) * k) / n), Math.round(a + ((b - a + 1) * (k + 1)) / n) - 1] as [number, number]);
  });
}

/** The middle of the glyph in columns [a, b], sampled and normalized. */
function middle(s: Strip, [a, b]: [number, number], top: number, bot: number): Float32Array {
  const w = b - a, h = bot - top;
  const x0 = a + w * 0.1, x1 = b - w * 0.1, y0 = top + h * 0.28, y1 = bot - h * 0.28;
  const d = new Float32Array(DW * DH);
  for (let j = 0; j < DH; j++) {
    for (let i = 0; i < DW; i++) {
      let t = 0, n = 0;
      for (let y = Math.floor(y0 + ((y1 - y0 + 1) * j) / DH); y < y0 + ((y1 - y0 + 1) * (j + 1)) / DH; y++) {
        for (let x = Math.floor(x0 + ((x1 - x0 + 1) * i) / DW); x < x0 + ((x1 - x0 + 1) * (i + 1)) / DW; x++) {
          t += Math.min(1, Math.max(0, (s.gray[y * s.width + x]! - s.lo) / (s.hi - s.lo)));
          n++;
        }
      }
      d[j * DW + i] = n ? t / n : 0;
    }
  }
  let mean = 0;
  for (const v of d) mean += v;
  mean /= d.length;
  let norm = 0;
  for (let k = 0; k < d.length; k++) { d[k]! -= mean; norm += d[k]! ** 2; }
  norm = Math.sqrt(norm) || 1;
  for (let k = 0; k < d.length; k++) d[k]! /= norm;
  return d;
}

/** 1 less the correlation: 0 for the same shape. */
const apart = (a: Float32Array, b: Float32Array): number => {
  let t = 0;
  for (let k = 0; k < a.length; k++) t += a[k]! * b[k]!;
  return 1 - t;
};

/** A word OCR read in the row, in strip pixels. */
export interface RowWord {
  symbols: OcrSymbol[];
}

/** The row's text with each uncertain digit settled against the row's known
 *  0s. Without a point count to learn the 0 from, the text as OCR read it. */
export function settleRow(s: Strip, words: readonly RowWord[]): string {
  const text = (w: RowWord): string => w.symbols.map((y) => y.text).join("");
  const plain = words.map(text).join(" ");
  const [top, bot] = textRows(s);
  if (bot - top < 8) return plain;
  const spans = glyphSpans(s, top, bot);
  const spanAt = (y: OcrSymbol): [number, number] | undefined => {
    const c = (y.bbox.x0 + y.bbox.x1) / 2;
    let best: [number, number] | undefined, gap = Infinity;
    for (const sp of spans) {
      const g = c < sp[0] ? sp[0] - c : c > sp[1] ? c - sp[1] : 0;
      if (g < gap) { gap = g; best = sp; }
    }
    return best;
  };

  const zeros: Float32Array[] = [];
  for (const w of words) {
    if (!/^\d{3,4}p$/i.test(text(w))) continue;
    const digits = w.symbols.slice(0, -1), first = spanAt(digits[0]!), last = spanAt(digits[digits.length - 1]!);
    if (!first || !last) continue;
    for (const sp of spans) if (sp[0] > first[1] && sp[1] < last[0]) zeros.push(middle(s, sp, top, bot));
  }
  if (!zeros.length) return plain;

  return words.map((w) => {
    if (!/^[0-9OQDB.,]+$/i.test(text(w))) return text(w);
    const widths = w.symbols.map((y) => y.bbox.x1 - y.bbox.x0).sort((a, b) => a - b);
    const full = widths[Math.floor(widths.length / 2)]!;
    let prev: [number, number] | undefined;
    return w.symbols.map((y) => {
      const sp = spanAt(y), again = sp !== undefined && sp === prev;
      prev = sp;
      // OCR can read one glyph as two narrow ones. The second adds nothing.
      if (again && /\d/.test(y.text) && y.bbox.x1 - y.bbox.x0 < 0.7 * full) return "";
      if (!"03689OQDB".includes(y.text.toUpperCase())) return y.text;
      if (!sp) return y.text;
      const d = Math.min(...zeros.map((z) => apart(z, middle(s, sp, top, bot))));
      // Not a 0: OCR's reading stands, and a 0 it read is the 8 it looks like.
      return d < SAME_AS_ZERO ? "0" : "0OQD".includes(y.text.toUpperCase()) ? "8" : y.text;
    }).join("");
  }).join(" ");
}

/** START and STOP out of the row, in the NanoVNA's format: a whole part, a
 *  point, and six digits in two groups of three, in MHz. A unit OCR garbled does not
 *  matter; a G scales it. A k is taken for a misread M: that format is MHz. */
export function parseSweepRow(text: string): SweepRange | null {
  const t = text.toUpperCase();
  const grab = (key: RegExp): { f: number; raw: string } | null => {
    // Three digits a group. OCR can split a glyph in two, so a fourth is dropped.
    const m = t.match(new RegExp(key.source + /\s*(\d{1,4})(?:[.,]\s?(\d{3})\d?\s?(\d{3})\d?|(\d{6}))\s*([KMG])?/.source));
    if (!m) return null;
    const frac = m[2] && m[3] ? m[2] + m[3] : m[4]!;
    const unit = m[5] === "G" ? 1e3 : 1;
    return { f: parseFloat(`${m[1]}.${frac}`) * unit, raw: `${m[1]}.${frac.slice(0, 3)} ${frac.slice(3)}` };
  };
  const a = grab(/\bS?T[AH]?RT\b/), b = grab(/\b[SE]?T[O0Q]P\b/);
  return a && b && b.f > a.f ? { start: a.f, stop: b.f, raw: `START ${a.raw} / STOP ${b.raw}` } : null;
}
