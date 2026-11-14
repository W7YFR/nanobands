/* A set of sweeps saved as Touchstone files, as Export's All (.zip) saves
 * them: the latest sweep under its own name, and each kept sweep with
 * `-keptN` before its extension, where 1 is the newest.
 */

import { isTouchstone } from "./touchstone";

export interface SweepFile { name: string; text: string }

/** The latest sweep, and the kept sweeps oldest first. */
export interface SweepSet { latest: SweepFile; kept: SweepFile[] }

/** A kept sweep's number in its file name, or null for the latest sweep. */
export const keptNumberOf = (name: string): number | null => {
  const m = /-kept(\d+)\.[^./]+$/i.exec(name);
  return m ? +m[1]! : null;
};

/** The set in a zip's files, or why there is none. Folders in a name, and
 *  the `._` files macOS adds, are left out. Up to `max` kept sweeps, the
 *  newest. */
export function sweepSet(files: readonly SweepFile[], max: number): SweepSet | string {
  const sweeps = files
    .map((f) => ({ ...f, name: f.name.split("/").pop() ?? f.name }))
    .filter((f) => isTouchstone(f.name) && !f.name.startsWith("._"));
  const latest = sweeps.filter((f) => keptNumberOf(f.name) === null);
  if (latest.length !== 1) {
    return latest.length
      ? "The .zip holds more than one sweep without -kept in its name, so NanoBands can't tell which is the latest."
      : "The .zip holds no Touchstone file for the latest sweep.";
  }
  const kept = sweeps
    .filter((f) => keptNumberOf(f.name) !== null)
    .sort((a, b) => keptNumberOf(b.name)! - keptNumberOf(a.name)!)
    .slice(-max);
  return { latest: latest[0]!, kept };
}
