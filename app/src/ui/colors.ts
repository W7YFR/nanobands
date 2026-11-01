/* Colors the canvases draw with. The CSS has the same ones as tokens. */

import { inSegment, type LicenseClass, type OperatingMode } from "@/bands";

export const OK = "#3fb950";
export const BAD = "#f85149";
export const TRACE = "#4dd0ff";
/** The curve under Max SWR but outside the segments the settings allow. */
export const MATCH = "#93a1b3";
/** The curve over Max SWR. */
export const HIGH = "#e3c84a";

/** The curve's color at f: green where you may transmit with SWR at or under
 *  Max SWR, gray where the SWR is under it outside your segments, yellow over it. */
export const curveColor = (w: number, f: number, s: { thr: number; cls: LicenseClass; mode: OperatingMode }): string =>
  w > s.thr ? HIGH : inSegment(f, s) ? OK : MATCH;
