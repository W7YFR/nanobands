/* A matching network: the two parts, a coil or a capacitor each, that turn
 * a measured impedance R + jX into the line's Z0 + j0 at one frequency. It
 * is an L-network: one part in series with the line and one across it.
 *
 * Xs is the reactance of the part in series and B the susceptance of the
 * part across the line. Pozar, Microwave Engineering, section 5.1:
 *
 * - R under Z0: the part in series sits next to the load.
 *     Xs = ±√(R(Z0 − R)) − X
 *     B  = ±√((Z0 − R) ÷ R) ÷ Z0, with the same sign
 * - R over Z0: the part across the line sits next to the load.
 *     B  = (X ± √(R ÷ Z0) · √(R² + X² − Z0·R)) ÷ (R² + X²)
 *     Xs = 1 ÷ B + X·Z0 ÷ R − Z0 ÷ (B·R)
 *
 * Each form has two answers, one per sign. A part that changes almost
 * nothing is left out: near R = Z0 one part in series cancels X, and its
 * partner across the line works out to almost no susceptance, which only a
 * huge coil would give. Whether a part changes almost nothing is checked
 * through the network: without it, the SWR must stay under DROP_SWR. The
 * values are for ideal, lossless parts.
 */

/** A part is left out when the network without it still gives an SWR under
 *  this. Every answer shown must give an SWR under it, built from its parts. */
export const DROP_SWR = 1.01;
/** R within this share of Z0 counts as Z0. */
export const R_EQUAL = 1e-9;

/** Under this SWR, no network is needed. */
export const NO_NEED_SWR = 1.1;
/** Over this |S11|, almost all of the signal reflects back: a network would need parts too extreme to build. */
export const MAX_GAMMA = 0.98;
/** Part values outside these are hard to build: a capacitor under 1 pF is
 *  about the stray capacitance of its leads, one over 10 nF that takes RF
 *  voltage is rare, a coil under 10 nH is about a short wire, and one over
 *  100 µH is large and self-resonant at HF. */
export const MIN_PF = 1, MAX_PF = 10_000, MIN_NH = 10, MAX_NH = 100_000;

/** One part: a coil in nH or a capacitor in pF. */
export interface Part { kind: "coil" | "capacitor"; value: number }

/** One answer. `loadSide` is the part next to the load, the antenna side. */
export interface Answer {
  /** The sign taken before the square root. */
  sign: 1 | -1;
  xs: number;
  b: number;
  series: Part | null;
  across: Part | null;
  loadSide: "series" | "across";
  /** Low-pass: a coil in series and a capacitor across. High-pass: the other way. Else none. */
  filter: "low" | "high" | null;
}

export type Match =
  | { kind: "none" }
  | { kind: "extreme" }
  /** No answer passed the check: the network built from its parts must match. */
  | { kind: "unsure" }
  | { kind: "parts"; form: "series-first" | "across-first"; answers: Answer[] };

/** The part with reactance x ohms, in series, at f MHz. Null for none. */
export function seriesPart(x: number, f: number): Part | null {
  const w = 2 * Math.PI * f * 1e6;
  if (Math.abs(x) < 1e-9) return null;
  return x > 0 ? { kind: "coil", value: (x / w) * 1e9 } : { kind: "capacitor", value: (-1 / (w * x)) * 1e12 };
}

/** The part with susceptance b siemens, across the line, at f MHz. Null for none. */
export function acrossPart(b: number, f: number): Part | null {
  const w = 2 * Math.PI * f * 1e6;
  if (Math.abs(b) < 1e-12) return null;
  return b > 0 ? { kind: "capacitor", value: (b / w) * 1e12 } : { kind: "coil", value: (-1 / (w * b)) * 1e9 };
}

/** A part's value in the unit a builder reads: nH or µH, pF or nF. */
export function fmtPart(p: Part): string {
  const [big, small] = p.kind === "coil" ? ["µH", "nH"] : ["nF", "pF"];
  const v = p.value >= 1000 ? p.value / 1000 : p.value;
  return `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v)} ${p.value >= 1000 ? big : small}`;
}

/** Whether a part is hard to build. */
export const hardToBuild = (p: Part | null): boolean =>
  !!p && (p.kind === "capacitor" ? p.value < MIN_PF || p.value > MAX_PF : p.value < MIN_NH || p.value > MAX_NH);

/** The two answers for load R + jX on a Z0 line, by Xs and B. */
export function lNetwork(r: number, x: number, z0: number): { form: "series-first" | "across-first"; xb: { sign: 1 | -1; xs: number; b: number }[] } {
  // Just over Z0, B is the difference of two near-equal terms and Xs divides
  // by it: rounding noise. So R this close to Z0 takes the series-first form,
  // which has no such difference.
  if (r - z0 > R_EQUAL * z0) {
    const d = r * r + x * x, root = Math.sqrt(r / z0) * Math.sqrt(d - z0 * r);
    return {
      form: "across-first",
      xb: ([1, -1] as const).map((sign) => {
        const b = (x + sign * root) / d;
        return { sign, b, xs: 1 / b + (x * z0) / r - z0 / (b * r) };
      }),
    };
  }
  const xr = Math.sqrt(Math.max(0, r * (z0 - r))), br = Math.sqrt(Math.max(0, (z0 - r) / r)) / z0;
  return { form: "series-first", xb: ([1, -1] as const).map((sign) => ({ sign, xs: sign * xr - x, b: sign * br })) };
}

/** The input impedance of load R + jX through answer (xs, b) in `form`. */
export function inputOf(r: number, x: number, form: "series-first" | "across-first", xs: number, b: number): [number, number] {
  const series = ([a, c]: [number, number]): [number, number] => [a, c + xs];
  const across = ([a, c]: [number, number]): [number, number] => {
    const d = a * a + c * c, g = a / d, s = -c / d + b, e = g * g + s * s;
    return [g / e, -s / e];
  };
  return form === "series-first" ? across(series([r, x])) : series(across([r, x]));
}

/** The network that matches load R + jX to z0 at f MHz, with its SWR `swr`. */
export function matchAt(r: number, x: number, z0: number, f: number, swr: number): Match {
  if (swr < NO_NEED_SWR) return { kind: "none" };
  if (!(r > 0) || (swr - 1) / (swr + 1) > MAX_GAMMA) return { kind: "extreme" };
  const { form, xb } = lNetwork(r, x, z0);
  /** The SWR on the line through the network (xs, b). */
  const swrOf = (xs: number, b: number): number => {
    const [a, c] = inputOf(r, x, form, xs, b), g = Math.hypot(a - z0, c) / Math.hypot(a + z0, c);
    return (1 + g) / (1 - g);
  };
  // Then the check: built from what its parts are made from, an answer must match.
  const answers = xb.filter(({ xs, b }) => Number.isFinite(xs) && Number.isFinite(b)).map(({ sign, xs: x0, b: b0 }): Answer => {
    // Leave out the part across the line, or else the one in series, if the network does as well without it.
    const dropAcross = swrOf(x0, 0) < DROP_SWR, dropSeries = !dropAcross && swrOf(0, b0) < DROP_SWR;
    const xs = dropSeries ? 0 : x0, b = dropAcross ? 0 : b0;
    const series = seriesPart(xs, f), across = acrossPart(b, f);
    const filter = series?.kind === "coil" && across?.kind === "capacitor" ? "low"
      : series?.kind === "capacitor" && across?.kind === "coil" ? "high" : null;
    return { sign, xs, b, series, across, loadSide: form === "series-first" ? "series" : "across", filter };
  }).filter((a) => (a.series || a.across) && swrOf(a.series ? a.xs : 0, a.across ? a.b : 0) < DROP_SWR);
  if (!answers.length) return { kind: "unsure" };
  // Near R = Z0 both signs can give the same one part, as printed.
  const shown = (a: Answer): string => [a.series, a.across].map((p) => (p ? `${p.kind} ${fmtPart(p)}` : "")).join("|");
  const same = answers.length === 2 && shown(answers[0]!) === shown(answers[1]!);
  return { kind: "parts", form, answers: same ? [answers[0]!] : answers };
}

/** Over this peak voltage, a part is marked high voltage: most small mica
 *  and ceramic capacitors are rated 500 V or less. */
export const HIGH_V = 500;
/** Over this RMS current, a part is marked high current: thin wire and small
 *  toroids heat up, and so do small capacitors. */
export const HIGH_A = 5;

/** What one part sees: `v` the peak voltage across it, `i` the RMS current through it. */
export interface Stress { v: number; i: number }

/** What each part of answer `a` sees with `watts` going into the matched
 *  network, for ideal parts. Power in is power in the load's R, so:
 *
 * - The line side: V0 = √(P·Z0) and I0 = √(P ÷ Z0), RMS.
 * - The load side: the load current is √(P ÷ R) and the load voltage
 *   √(P·(R² + X²) ÷ R), RMS.
 *
 * The part next to the load sees the load side, and the other part the line
 * side. A part in series carries the current and sees it times |Xs|. A part
 * across the line sees the voltage and carries it times |B|. Peak is RMS
 * times √2. A part left out has no numbers. */
export function stressOf(r: number, x: number, z0: number, a: Answer, watts: number): { series: Stress | null; across: Stress | null } {
  const iLoad = Math.sqrt(watts / r), vLoad = Math.sqrt((watts * (r * r + x * x)) / r);
  const i = a.loadSide === "series" ? iLoad : Math.sqrt(watts / z0);
  const v = a.loadSide === "across" ? vLoad : Math.sqrt(watts * z0);
  return {
    series: a.series && { v: i * Math.abs(a.xs) * Math.SQRT2, i },
    across: a.across && { v: v * Math.SQRT2, i: v * Math.abs(a.b) },
  };
}
