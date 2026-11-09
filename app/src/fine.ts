/* A fine sweep: one band swept at the device's point count, inside its range.
 *
 * The device's calibration was taken at its range's points. Between them the
 * firmware fills in the correction, which at HF is as good as a calibration
 * of the band itself while the calibrated points are close. So a band gets a
 * fine sweep only when the calibrated points are at most FINE_STEP_HZ apart,
 * and only when it at least doubles the band's readings. On a slot calibrated
 * for the band itself, it would add nothing. Nor does it where the sweep has
 * the whole band at the top of the SWR scale: it would only draw the top.
 *
 * The scan uses the device's own point count, so the device keeps its
 * settings, and its range is never left.
 */

import { alongTop, swrAt } from "./analysis";
import type { Band } from "./bands";
import type { Range, Scan } from "./vna";

/** The widest spacing of calibrated points a fine sweep fills in across. */
export const FINE_STEP_HZ = 1e6;

/** A band to sweep finely, in Hz, inside the device's range. */
export interface Fine {
  band: string;
  start: number;
  stop: number;
}

/** Why a band gets no fine sweep on this range: it lies outside it, the
 *  calibration is too coarse to fill in, or the sweep already has it closely. */
export type NoFine = "outside" | "coarse" | "close";

/** The fine sweep a band could have on this range, or why it has none. */
export function fineCheck(r: Range, b: Band): Fine | NoFine {
  const start = Math.max(r.start, Math.round(b.lo * 1e6)), stop = Math.min(r.stop, Math.round(b.hi * 1e6));
  if (stop <= start) return "outside";
  const step = (r.stop - r.start) / (r.points - 1);
  if (step > FINE_STEP_HZ) return "coarse";
  // The sweep's own readings in the band, against the fine sweep's.
  const have = Math.floor((stop - r.start) / step) - Math.ceil((start - r.start) / step) + 1;
  return r.points >= 2 * Math.max(1, have) ? { band: b.name, start, stop } : "close";
}

/** The fine sweep a band could have on this range, or null when it would add
 *  nothing or the calibration is too coarse to fill in. */
export function fineFor(r: Range, b: Band): Fine | null {
  const f = fineCheck(r, b);
  return typeof f === "string" ? null : f;
}

/** Whether the sweep has every reading over lo–hi (MHz) at the top of the
 *  SWR scale. Its values at lo and hi count too, so a band narrower than the
 *  spacing of the readings has some. Readings it lacks do not count. */
export function offScale(c: { f: ArrayLike<number>; s: ArrayLike<number> }, lo: number, hi: number, scale: { top: number; bot: number }): boolean {
  const w = [swrAt(c.f, c.s, lo), swrAt(c.f, c.s, hi)];
  for (let i = 0; i < c.f.length; i++) if (c.f[i]! > lo && c.f[i]! < hi) w.push(c.s[i]!);
  const known = w.filter((x) => !Number.isNaN(x));
  return known.length > 0 && known.every((x) => alongTop(x, scale));
}

/** The full sweep with a fine sweep in place of its readings over the same span. */
export function mergeScan(full: Scan, fine: Scan): Scan {
  const lo = fine.hz[0]!, hi = fine.hz[fine.hz.length - 1]!, out: Scan = { hz: [], re: [], im: [] };
  const add = (s: Scan, i: number): void => { out.hz.push(s.hz[i]!); out.re.push(s.re[i]!); out.im.push(s.im[i]!); };
  let j = 0;
  for (let i = 0; i < full.hz.length; i++) {
    const f = full.hz[i]!;
    if (f >= lo && j === 0) for (; j < fine.hz.length; j++) add(fine, j);
    if (f < lo || f > hi) add(full, i);
  }
  for (; j < fine.hz.length; j++) add(fine, j);
  return out;
}
