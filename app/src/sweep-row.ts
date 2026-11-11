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

import type { Quad } from "./geometry";
import type { OcrSymbol } from "./ocr-zeros";
import type { Pixels } from "./pixels";
import { squareUp, type Strip } from "./screen-parts";
import type { SweepRange } from "./sweep-text";

/** Where the row lies, in plot units: under the grid, past both its edges. */
const ROW = { u0: -0.1, u1: 1.25, v0: 1.005, v1: 1.1 };
/** The brightness cut for OCR, and the higher one that splits glyphs that
 *  touch: a share of the way from background to the brightest text. */
export const CUT_TEXT = 0.8;
const CUT_SPLIT = 0.9;
/** How far a glyph's middle may be from a known 0's and still be a 0. The
 *  photos give 0.17 or less for a slashed 0, and 0.21 or more for an 8. */
const SAME_AS_ZERO = 0.185;
/** The descriptor: the middle of a glyph, sampled on this grid. */
const DW = 16, DH = 10;

/** The row under the grid, squared up at about the photo's own resolution. */
export const rowStrip = (px: Pixels, corners: Quad): Strip | null => squareUp(px, corners, ROW);

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

/** Each glyph's columns. A point glows into the digit beside it, so low
 *  columns at either end of a run are cut off as a narrow span of their own.
 *  Glyphs that still touch come as one span about twice as wide, and are
 *  split evenly. */
function glyphSpans(s: Strip, top: number, bot: number): [number, number][] {
  const cut = s.lo + (s.hi - s.lo) * CUT_SPLIT, runs: [number, number][] = [];
  /** The first row with ink in column x, or -1. */
  const inkTop = (x: number): number => {
    for (let y = top; y <= bot; y++) if (s.gray[y * s.width + x]! > cut) return y;
    return -1;
  };
  let start = -1;
  for (let x = 0; x <= s.width; x++) {
    const ink = x < s.width && inkTop(x) >= 0;
    if (ink && start < 0) start = x;
    else if (!ink && start >= 0) { runs.push([start, x - 1]); start = -1; }
  }
  // Columns with ink only in the lowest third: a point.
  const low = (x: number): boolean => inkTop(x) > top + (bot - top) * 0.65;
  const parts: [number, number][] = [];
  for (const [a, b] of runs) {
    let l = a, r = b;
    while (l < r && low(l)) l++;
    while (r > l && low(r)) r--;
    if (l > a) parts.push([a, l - 1]);
    parts.push([l, r]);
    if (r < b) parts.push([r + 1, b]);
  }
  const widths = parts.map(([a, b]) => b - a + 1).filter((w) => w > 2).sort((a, b) => a - b);
  const one = widths[Math.floor(widths.length * 0.75)] ?? 0;
  // A thin stroke can break at the higher cut and leave a glyph in two. A
  // narrow run with ink above the baseline is a piece of a glyph, not a
  // point: join it to the neighbour it fits with.
  const lowOnly = ([a, b]: [number, number]): boolean => { for (let x = a; x <= b; x++) if (!low(x)) return false; return true; };
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k]!;
    if (p[1] - p[0] + 1 >= 0.6 * one || lowOnly(p)) continue;
    const fits = (q: [number, number] | undefined): number => (q && !lowOnly(q) && Math.max(p[1], q[1]) - Math.min(p[0], q[0]) + 1 <= 1.25 * one ? Math.max(0, Math.max(p[0], q[0]) - Math.min(p[1], q[1])) : Infinity);
    const gl = fits(parts[k - 1]), gr = fits(parts[k + 1]);
    if (gl === Infinity && gr === Infinity) continue;
    const j = gl <= gr ? k - 1 : k + 1, q = parts[j]!;
    parts.splice(Math.min(k, j), 2, [Math.min(p[0], q[0]), Math.max(p[1], q[1])]);
    k = Math.min(k, j) - 1;
  }
  return parts.flatMap(([a, b]) => {
    const r = one ? (b - a + 1) / one : 1, n = r < 1.6 ? 1 : Math.round(r);
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
  const sorted = spans.map(([a, b]) => b - a + 1).sort((a, b) => a - b), one = sorted[Math.floor(sorted.length * 0.75)]!;
  /** The glyphs after `from`, up to the word's end, one per span, with what
   *  OCR read over each, so a glyph OCR split in two, or two it read as one,
   *  counts once each. */
  const glyphsAfter = (w: RowWord, from: number): { sp: [number, number]; ocr: string }[] => {
    const x1 = Math.max(...w.symbols.map((y) => y.bbox.x1));
    return spans
      .filter(([a, b]) => (a + b) / 2 > from && (a + b) / 2 < x1 && b - a + 1 >= 0.5 * one)
      .map((sp) => {
        const overlap = (y: OcrSymbol): number => Math.min(sp[1], y.bbox.x1) - Math.max(sp[0], y.bbox.x0);
        return { sp, ocr: w.symbols.filter((y) => /\w/.test(y.text)).reduce<OcrSymbol | undefined>((best, y) => (!best || overlap(y) > overlap(best) ? y : best), undefined)?.text ?? "" };
      });
  };
  /** The digits after the point in each number, and the group of three after it. */
  const afterPoints = (): { sp: [number, number]; ocr: string }[] => {
    const out: { sp: [number, number]; ocr: string }[] = [];
    let after = false;
    for (const w of words) {
      if (!/^[0-9OQDB.,]+$/i.test(text(w))) { after = false; continue; }
      const p = w.symbols.find((y) => /[.,]/.test(y.text));
      if (p) { after = true; out.push(...glyphsAfter(w, (p.bbox.x0 + p.bbox.x1) / 2)); }
      else if (after) { after = false; out.push(...glyphsAfter(w, Math.min(...w.symbols.map((y) => y.bbox.x0)) - 1)); }
    }
    return out;
  };

  /** The 6s, 8s and 9s in the whole parts, as OCR read them. */
  const known = new Map<string, Float32Array[]>();
  for (const w of words) {
    const p = w.symbols.findIndex((y) => /[.,]/.test(y.text));
    if (p < 0 || !/^[0-9OQDB.,]+$/i.test(text(w))) continue;
    for (const y of w.symbols.slice(0, p)) {
      const sp = spanAt(y);
      if (sp && "689".includes(y.text)) known.set(y.text, [...(known.get(y.text) ?? []), middle(s, sp, top, bot)]);
    }
  }

  /* No point count to learn the 0 from, as when glare washes out the middle
     of the row: the largest group of digits after the points that are all
     alike. In one photo every 0 is drawn the same. The group is 0s when OCR
     read a fair share of it as 0, or when it is unlike the row's own 8. */
  if (!zeros.length) {
    const g = afterPoints().map((x) => ({ m: middle(s, x.sp, top, bot), ocr: x.ocr }));
    let group: typeof g = [];
    for (const a of g) {
      const like = g.filter((b) => apart(a.m, b.m) < SAME_AS_ZERO);
      if (like.length > group.length) group = like;
    }
    const eights = known.get("8") ?? [];
    const notEights = eights.length > 0 && group.every((x) => Math.min(...eights.map((e) => apart(e, x.m))) >= SAME_AS_ZERO);
    if (group.length >= 4 && (notEights || group.filter((x) => x.ocr === "0").length >= 0.3 * group.length)) zeros.push(...group.map((x) => x.m));
  }
  if (!zeros.length) return plain;

  /** One glyph settled: a 0 when it matches the row's 0s, else what OCR read
   *  over it, with a 0 OCR read taken for the 8 it looks like. A glyph found
   *  to be a 0 is kept, to learn from. */
  const learned: Float32Array[] = [];
  const settle = (sp: [number, number], ocr: string): string => {
    // A glyph cut short by a broken stroke is also compared a full glyph
    // wide, from either end.
    const tries: [number, number][] = [sp];
    if (sp[1] - sp[0] + 1 < 0.95 * one) tries.push([sp[0], sp[0] + one - 1], [sp[1] - one + 1, sp[1]]);
    let m = middle(s, sp, top, bot), d = Infinity;
    for (const t of tries) {
      const mt = middle(s, t, top, bot), dt = Math.min(...zeros.map((z) => apart(z, mt)));
      if (dt < d) { d = dt; m = mt; }
    }
    if (d < SAME_AS_ZERO) { learned.push(m); return "0"; }
    // Further off: a 0 still, if it is nearer the row's 0s than the row's
    // own 6, 8 or 9, from the whole parts OCR reads well.
    const others = [...known.values()].flat();
    if (others.length && d < Math.min(...others.map((o) => apart(o, m)))) return "0";
    return "0OQD".includes(ocr.toUpperCase()) ? "8" : ocr;
  };
  /** The digits after `from`, up to the word's end, settled one per span. */
  const fraction = (w: RowWord, from: number): string => glyphsAfter(w, from).map(({ sp, ocr }) => settle(sp, ocr)).join("");

  /* Twice: the photo can be softer toward one edge, so the 0s found in the
     first pass join the point count's, and each glyph is judged again
     against 0s from its own part of the row. */
  const once = (): string => {
  let afterPoint = false;
  return words.map((w) => {
    const t = text(w);
    if (!/^[0-9OQDB.,]+$/i.test(t)) { afterPoint = false; return t; }
    const point = w.symbols.findIndex((y) => /[.,]/.test(y.text));
    if (point >= 0) {
      // The whole part as OCR read it; the digits after the point by span.
      afterPoint = true;
      const p = w.symbols[point]!;
      return t.slice(0, point + 1) + fraction(w, (p.bbox.x0 + p.bbox.x1) / 2);
    }
    if (afterPoint) {
      // The second group of three, after the first.
      afterPoint = false;
      return fraction(w, Math.min(...w.symbols.map((y) => y.bbox.x0)) - 1);
    }
    return w.symbols.map((y) => {
      const sp = spanAt(y);
      return sp && "03689OQDB".includes(y.text.toUpperCase()) ? settle(sp, y.text) : y.text;
    }).join("");
  }).join(" ");
  };
  once();
  zeros.push(...learned);
  return once();
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
