/* Touchstone (.s1p) files: frequency and S11 per line, read as SWR.
 *
 * The option line (`# MHz S RI R 50`) says the frequency unit and how S11 is
 * written: real and imaginary (RI), magnitude and angle (MA), or dB and angle
 * (DB), and the reference impedance after R. SWR needs only the magnitude of
 * S11; the Smith chart needs all of it. An .s2p file has S11 in the same
 * columns, so it reads the same way. A file of Y, Z, G or H parameters holds
 * no S11, so it reads as empty.
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

/** S11 per point, as real and imaginary parts. */
export interface S11 {
  /** Frequencies in MHz. */
  f: number[];
  re: number[];
  im: number[];
  /** The reference impedance in ohms. */
  z0: number;
}

export function parseS11(text: string): S11 {
  let unit = 1e9, z0 = 50;
  let fmt: "MA" | "DB" | "RI" = "MA";
  const out: S11 = { f: [], re: [], im: [], z0 };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/!.*/, "").trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const words = line.slice(1).trim().toUpperCase().split(/\s+/);
      for (const [i, w] of words.entries()) {
        if (w === "HZ") unit = 1;
        else if (w === "KHZ") unit = 1e3;
        else if (w === "MHZ") unit = 1e6;
        else if (w === "GHZ") unit = 1e9;
        else if (w === "MA" || w === "DB" || w === "RI") fmt = w;
        else if (w === "R" && +words[i + 1]! > 0) z0 = +words[i + 1]!;
        else if (w === "Y" || w === "Z" || w === "G" || w === "H") return { f: [], re: [], im: [], z0 };
      }
      continue;
    }
    const n = line.split(/[\s,]+/).map(Number);
    if (n.length < 3 || n.some(Number.isNaN)) continue;
    const [freq = 0, a = 0, b = 0] = n;
    const mag = fmt === "DB" ? Math.pow(10, a / 20) : a, rad = (b * Math.PI) / 180;
    out.f.push((freq * unit) / 1e6);
    out.re.push(fmt === "RI" ? a : mag * Math.cos(rad));
    out.im.push(fmt === "RI" ? b : mag * Math.sin(rad));
  }
  out.z0 = z0;
  return out;
}

export function parseTouchstone(text: string): Sweep {
  const g = parseS11(text);
  return { f: g.f, s: g.re.map((re, i) => swrFromGamma(Math.hypot(re, g.im[i]!))) };
}

export const isTouchstone = (name: string): boolean => /\.(s1p|s2p|txt)$/i.test(name);
