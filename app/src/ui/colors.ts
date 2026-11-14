/* Colors the canvases draw with. The CSS has the same ones as tokens. */

import { usableSwr } from "@/analysis";
import { inSegment, type LicenseClass, type OperatingMode } from "@/bands";

export const OK = "#3fb950";
export const BAD = "#f85149";
export const TRACE = "#4dd0ff";
/** The curve under Max SWR but outside the segments the settings allow. */
export const MATCH = "#93a1b3";
/** The frequency typed in the Analyze card, before Enter pins it. */
export const PROBE = "#6aa9ff";
/** The curve over Max SWR. */
export const HIGH = "#e3c84a";
/** The band a fine sweep filled in: the accent, as the chips' and buttons'
 *  selected state. The CSS's --accent. */
export const FINE = "#6aa9ff";

/** The kept sweeps, newest first: magenta, violet and cyan, each with its
 *  own dash. A color goes with the place, so ① is always magenta. The CSS
 *  has them as --kept1 to --kept3. */
export const KEPT = ["#ff6ec7", "#9d7bff", "#22d3ee"] as const;
export const KEPT_DASH = [[7, 4], [3, 3], [9, 3, 2, 3]] as const;
/** The dip path, from the kept sweeps' dips to the curve's: white, clear of the kept sweeps' colors. */
export const DIP_PATH = "#e6edf3";

/** The curve's color at f: green where you may transmit with SWR at or under
 *  Max SWR, gray where the SWR is under it outside your segments, yellow over
 *  it or at the top of the scale. */
export const curveColor = (w: number, f: number, s: { thr: number; top: number; bot: number; cls: LicenseClass; mode: OperatingMode }): string =>
  !usableSwr(w, s) ? HIGH : inSegment(f, s) ? OK : MATCH;
