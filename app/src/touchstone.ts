/* Touchstone (.s1p) files: frequency and S11 per line, read as SWR.
 *
 * The option line (`# MHz S RI R 50`) says the frequency unit and how S11 is
 * written: real and imaginary (RI), magnitude and angle (MA), or dB and angle
 * (DB). Only the magnitude of S11 matters for SWR. An .s2p file has S11 in the
 * same columns, so it reads the same way. A file of Y, Z, G or H parameters
 * holds no S11, so it reads as empty.
 */

export interface Sweep {
  /** Frequencies in MHz. */
  f: number[];
  /** SWR at each frequency. 999 stands for 999 or more. */
  s: number[];
}

/** SWR from the magnitude of the reflection coefficient, capped at 999. */
export function swrFromGamma(g: number): number {
  const s = (1 + g) / (1 - g);
  return g >= 1 || s > 999 ? 999 : s;
}

export function parseTouchstone(text: string): Sweep {
  let unit = 1e9;
  let fmt: "MA" | "DB" | "RI" = "MA";
  const f: number[] = [], s: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/!.*/, "").trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      for (const w of line.slice(1).trim().toUpperCase().split(/\s+/)) {
        if (w === "HZ") unit = 1;
        else if (w === "KHZ") unit = 1e3;
        else if (w === "MHZ") unit = 1e6;
        else if (w === "GHZ") unit = 1e9;
        else if (w === "MA" || w === "DB" || w === "RI") fmt = w;
        else if (w === "Y" || w === "Z" || w === "G" || w === "H") return { f: [], s: [] };
      }
      continue;
    }
    const n = line.split(/[\s,]+/).map(Number);
    if (n.length < 3 || n.some(Number.isNaN)) continue;
    const [freq = 0, a = 0, b = 0] = n;
    const g = fmt === "RI" ? Math.hypot(a, b) : fmt === "DB" ? Math.pow(10, a / 20) : Math.abs(a);
    f.push((freq * unit) / 1e6);
    s.push(swrFromGamma(g));
  }
  return { f, s };
}

export const isTouchstone = (name: string): boolean => /\.(s1p|s2p|txt)$/i.test(name);
