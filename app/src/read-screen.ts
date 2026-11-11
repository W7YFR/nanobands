/* What the page reads off a photo of the screen: the sweep, the SWR scale,
 * and the text, for the check that it is a NanoVNA at all.
 *
 * When the grid is found, three parts of the screen are cut out from around
 * it and read on their own (see screen-parts.ts): the START/STOP row under
 * it, the SWR labels down its right edge, and the header across its top.
 * Their readings win. The reading over the whole photo is the fallback.
 */

import { mappingFor, type Quad } from "./geometry";
import { ocrCanvas, recognize, type Part } from "./ocr";
import { fixedWords, type OcrResult } from "./ocr-zeros";
import type { Pixels } from "./pixels";
import { axisLabels, columnLabels, DIVISIONS, fitColumn, fitScale, parsePerDivision, type SwrScale } from "./scale-text";
import { squareUp, stripImage, type Area, type Strip } from "./screen-parts";
import { CUT_TEXT, parseSweepRow, rowStrip, settleRow } from "./sweep-row";
import { parseSweepText, type SweepRange } from "./sweep-text";

export interface ScreenText {
  /** The text over the whole photo, line by line. */
  text: string;
  sweep: SweepRange | null;
  /** SWR per division, from the header. */
  per: number | null;
  scale: SwrScale | null;
}

/** The SWR labels: inside the right edge of the plot, top line to bottom. */
const LABELS: Area = { u0: 0.8, u1: 1, v0: -0.03, v1: 1.03 };
/** The header: across the top of the plot, from its left edge. */
const HEADER: Area = { u0: 0, u1: 0.55, v0: -0.04, v1: 0.1 };

const canvasOf = (s: Strip): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = s.width;
  c.height = s.height;
  c.getContext("2d")!.putImageData(new ImageData(stripImage(s, CUT_TEXT), s.width, s.height), 0, 0);
  return c;
};
const wordsOf = (r: OcrResult | undefined): { symbols: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[] }[] =>
  r?.lines?.flatMap((l) => l.words) ?? [];

/** Read the photo. `grid` is the grid found in it: its corners, and how
 *  many SWR lines it has. The scale is read only off a grid of all nine; a
 *  part of the plot would give a wrong one. */
export async function readScreen(photo: { src: HTMLCanvasElement; px: Pixels }, grid: { corners: Quad; horizontal: number } | null): Promise<ScreenText> {
  const corners = grid?.corners ?? null, whole = grid?.horizontal === DIVISIONS + 1;
  const { canvas, scale: shrink } = ocrCanvas(photo.src);
  const row = corners ? rowStrip(photo.px, corners) : null;
  const labels = corners && whole ? squareUp(photo.px, corners, LABELS, true) : null;
  const header = corners ? squareUp(photo.px, corners, HEADER, true) : null;
  const parts: Part[] = [], at: Record<string, number> = {};
  if (row) { at.row = parts.length; parts.push({ canvas: canvasOf(row), line: true, chars: "0123456789.STARTOPCENMHzkGBWp:/ " }); }
  if (labels) { at.labels = parts.length; parts.push({ canvas: canvasOf(labels), line: false, chars: "0123456789." }); }
  if (header) { at.header = parts.length; parts.push({ canvas: canvasOf(header), line: true, chars: "0123456789.S1WRUm/ " }); }

  const read = await recognize(canvas, parts);
  const part = (k: string): OcrResult | undefined => (at[k] === undefined ? undefined : read.parts[at[k]!]);
  const words = fixedWords(read.screen, photo.px, shrink);
  const text = read.screen.lines?.length ? words.map((l) => l.map((w) => w.text).join(" ")).join("\n") : read.screen.text;

  const rowWords = wordsOf(part("row"));
  const fromRow = row && rowWords.length ? parseSweepRow(settleRow(row, rowWords)) : null;
  // SWR per division: the header over the whole photo, or the header read on
  // its own. Each helps fit the labels; a scale they give settles which.
  const pers = [parsePerDivision(text), parsePerDivision(part("header")?.text ?? "")].filter((p): p is number => p !== null);
  const fit = (per: number | null): SwrScale | null =>
    (labels ? fitColumn(columnLabels(wordsOf(part("labels")), LABELS.v0, LABELS.v1, labels.height), per) : null) ??
    (corners && whole ? fitScale(axisLabels(words.flat(), mappingFor(corners).back), per) : null);
  let scale: SwrScale | null = null;
  for (const p of [...pers, null]) if ((scale = fit(p))) break;
  // With a scale, its step, as the screen rounds it: 188m for 0.1875, 12.38
  // for 12.375. The header misreads its slash as a 7.
  const step = scale ? (scale.top - scale.bot) / DIVISIONS : null;
  const per = step ? +step.toPrecision(step < 1 ? 3 : 4) : pers[0] ?? null;
  return { text, sweep: fromRow ?? parseSweepText(text), per, scale };
}
