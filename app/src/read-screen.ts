/* What the page reads off a photo of the screen: the sweep, the SWR per
 * division, and the words with their places, for the axis labels.
 *
 * The START/STOP row is read on its own when the grid is found (see
 * sweep-row.ts), and its reading wins. The reading over the whole photo is
 * the fallback, and the source of everything else.
 */

import type { Quad } from "./geometry";
import { ocrCanvas, recognize } from "./ocr";
import { fixedWords, type OcrWord } from "./ocr-zeros";
import type { Pixels } from "./pixels";
import { parsePerDivision } from "./scale-text";
import { parseSweepRow, rowStrip, settleRow, stripImage } from "./sweep-row";
import { parseSweepText, type SweepRange } from "./sweep-text";

export interface ScreenText {
  /** The text over the whole photo, line by line. */
  text: string;
  words: OcrWord[][];
  sweep: SweepRange | null;
  /** SWR per division, from the header. */
  per: number | null;
}

/** Read the photo. `corners` is the grid's, when it was found. */
export async function readScreen(photo: { src: HTMLCanvasElement; px: Pixels }, corners: Quad | null): Promise<ScreenText> {
  const { canvas, scale } = ocrCanvas(photo.src);
  const strip = corners ? rowStrip(photo.px, corners) : null;
  let row: HTMLCanvasElement | null = null;
  if (strip) {
    row = document.createElement("canvas");
    row.width = strip.width;
    row.height = strip.height;
    row.getContext("2d")!.putImageData(new ImageData(stripImage(strip), strip.width, strip.height), 0, 0);
  }
  const read = await recognize(canvas, row);
  const words = fixedWords(read.screen, photo.px, scale);
  const text = read.screen.lines?.length ? words.map((l) => l.map((w) => w.text).join(" ")).join("\n") : read.screen.text;
  const rowWords = read.row?.lines?.flatMap((l) => l.words) ?? [];
  const fromRow = strip && rowWords.length ? parseSweepRow(settleRow(strip, rowWords)) : null;
  return { text, words, sweep: fromRow ?? parseSweepText(text), per: parsePerDivision(text) };
}
