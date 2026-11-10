/* Turning a photo's pixels by quarter turns. */

import { describe, expect, it } from "vitest";
import { rotatePixels, type Turns } from "@/orient";

/** A 3×2 image whose red channel numbers its pixels 1 to 6, row by row. */
const img = { width: 3, height: 2, data: Uint8ClampedArray.from([1, 2, 3, 4, 5, 6].flatMap((v) => [v, 0, 0, 255])) };
const reds = (p: { width: number; data: ArrayLike<number> }): number[][] => {
  const rows: number[][] = [];
  for (let i = 0; i < p.data.length / 4; i++) (rows[Math.floor(i / p.width)] ??= []).push(p.data[i * 4]!);
  return rows;
};

describe("rotatePixels", () => {
  it("turns clockwise by quarter turns", () => {
    expect(reds(rotatePixels(img, 1))).toEqual([[4, 1], [5, 2], [6, 3]]);
    expect(reds(rotatePixels(img, 2))).toEqual([[6, 5, 4], [3, 2, 1]]);
    expect(reds(rotatePixels(img, 3))).toEqual([[3, 6], [2, 5], [1, 4]]);
  });

  it("swaps width and height on a quarter turn", () => {
    expect(rotatePixels(img, 1)).toMatchObject({ width: 2, height: 3 });
    expect(rotatePixels(img, 2)).toMatchObject({ width: 3, height: 2 });
  });

  it("comes back to the start after four quarter turns", () => {
    let p = rotatePixels(img, 0);
    for (let i = 0; i < 4; i++) p = rotatePixels(p, 1 as Turns);
    expect(reds(p)).toEqual(reds(img));
  });
});
