/* The US amateur band plan, in MHz.
 *
 * Privileges per 47 CFR §97.301 and §97.305, checked against the ARRL
 * frequency-allocations chart. Each band lists, per license class, the
 * segments that class may use and what kind of segment each one is. Power
 * limits are not modeled.
 */

export type LicenseClass = "E" | "A" | "G" | "T";
/** What a segment allows. `chan` is a 60 m channel. */
export type SegmentKind = "data" | "phone" | "cw" | "all" | "chan";
/** The Mode filter. `any` shows every segment. */
export type OperatingMode = "any" | "phone" | "cw" | "data";
export type Segment = readonly [lo: number, hi: number, kind: SegmentKind];

export interface Band {
  readonly name: string;
  readonly lo: number;
  readonly hi: number;
  readonly priv: Readonly<Record<LicenseClass, readonly Segment[]>>;
}

/** General, Advanced and Extra share the segments; Technician has none. */
const GAE = (s: readonly Segment[]): Band["priv"] => ({ E: s, A: s, G: s, T: [] });
/** Every class shares the segments. */
const ALL = (s: readonly Segment[]): Band["priv"] => ({ E: s, A: s, G: s, T: s });

/* 60 m: four 2.8 kHz USB channels (ARRL lists the dial frequencies 5330.5,
   5346.5, 5371.5 and 5403.5 kHz; the centers are 1.5 kHz higher) plus the
   5351.5–5366.5 kHz segment. */
const CH60: readonly Segment[] = [
  ...[5.332, 5.348, 5.373, 5.405].map((c): Segment => [c - 0.0014, c + 0.0014, "chan"]),
  [5.3515, 5.3665, "chan"] as Segment,
].sort((a, b) => a[0] - b[0]);

export const BANDS: readonly Band[] = [
  { name: "2200m", lo: 0.1357, hi: 0.1378, priv: GAE([[0.1357, 0.1378, "all"]]) },
  { name: "630m", lo: 0.472, hi: 0.479, priv: GAE([[0.472, 0.479, "all"]]) },
  { name: "160m", lo: 1.8, hi: 2.0, priv: GAE([[1.8, 2.0, "all"]]) },
  {
    name: "80m", lo: 3.5, hi: 4.0,
    priv: {
      E: [[3.5, 3.6, "data"], [3.6, 4.0, "phone"]],
      A: [[3.525, 3.6, "data"], [3.7, 4.0, "phone"]],
      G: [[3.525, 3.6, "data"], [3.8, 4.0, "phone"]],
      T: [[3.525, 3.6, "cw"]],
    },
  },
  { name: "60m", lo: 5.3305, hi: 5.4064, priv: GAE(CH60) },
  {
    name: "40m", lo: 7.0, hi: 7.3,
    priv: {
      E: [[7.0, 7.125, "data"], [7.125, 7.3, "phone"]],
      A: [[7.025, 7.125, "data"], [7.125, 7.3, "phone"]],
      G: [[7.025, 7.125, "data"], [7.175, 7.3, "phone"]],
      T: [[7.025, 7.125, "cw"]],
    },
  },
  { name: "30m", lo: 10.1, hi: 10.15, priv: GAE([[10.1, 10.15, "data"]]) },
  {
    name: "20m", lo: 14.0, hi: 14.35,
    priv: {
      E: [[14.0, 14.15, "data"], [14.15, 14.35, "phone"]],
      A: [[14.025, 14.15, "data"], [14.175, 14.35, "phone"]],
      G: [[14.025, 14.15, "data"], [14.225, 14.35, "phone"]],
      T: [],
    },
  },
  { name: "17m", lo: 18.068, hi: 18.168, priv: GAE([[18.068, 18.11, "data"], [18.11, 18.168, "phone"]]) },
  {
    name: "15m", lo: 21.0, hi: 21.45,
    priv: {
      E: [[21.0, 21.2, "data"], [21.2, 21.45, "phone"]],
      A: [[21.025, 21.2, "data"], [21.225, 21.45, "phone"]],
      G: [[21.025, 21.2, "data"], [21.275, 21.45, "phone"]],
      T: [[21.025, 21.2, "cw"]],
    },
  },
  { name: "12m", lo: 24.89, hi: 24.99, priv: GAE([[24.89, 24.93, "data"], [24.93, 24.99, "phone"]]) },
  {
    name: "10m", lo: 28.0, hi: 29.7,
    priv: {
      E: [[28.0, 28.3, "data"], [28.3, 29.7, "phone"]],
      A: [[28.0, 28.3, "data"], [28.3, 29.7, "phone"]],
      G: [[28.0, 28.3, "data"], [28.3, 29.7, "phone"]],
      T: [[28.0, 28.3, "data"], [28.3, 28.5, "phone"]],
    },
  },
  { name: "6m", lo: 50, hi: 54, priv: ALL([[50, 50.1, "cw"], [50.1, 54, "all"]]) },
  { name: "2m", lo: 144, hi: 148, priv: ALL([[144, 144.1, "cw"], [144.1, 148, "all"]]) },
  { name: "1.25m", lo: 222, hi: 225, priv: ALL([[222, 225, "all"]]) },
  { name: "70cm", lo: 420, hi: 450, priv: ALL([[420, 450, "all"]]) },
  { name: "33cm", lo: 902, hi: 928, priv: ALL([[902, 928, "all"]]) },
  { name: "23cm", lo: 1240, hi: 1300, priv: ALL([[1240, 1300, "all"]]) },
];

type Mode = Exclude<OperatingMode, "any">;

export const MODES: Readonly<Record<SegmentKind, { label: string; color: string; modes: readonly Mode[] }>> = {
  data: { label: "CW/RTTY/data", color: "#58a6ff", modes: ["cw", "data"] },
  phone: { label: "Phone/image", color: "#e3a33b", modes: ["cw", "phone"] },
  cw: { label: "CW only", color: "#bc8cff", modes: ["cw"] },
  all: { label: "All modes", color: "#39c5bb", modes: ["cw", "phone", "data"] },
  chan: { label: "Channel", color: "#39c5bb", modes: ["cw", "phone", "data"] },
};

export const MODE_NAMES: Readonly<Record<OperatingMode, string>> = {
  any: "any",
  phone: "phone",
  cw: "CW",
  data: "RTTY/digital",
};

/** The segments of a band a license class may use in a mode. */
export function segsFor(b: Band, s: { cls: LicenseClass; mode: OperatingMode }): readonly Segment[] {
  return b.priv[s.cls].filter((g) => s.mode === "any" || MODES[g[2]].modes.includes(s.mode));
}

/** The bands that overlap [lo, hi]. */
export function bandsInRange(lo: number, hi: number): readonly Band[] {
  return BANDS.filter((b) => b.hi > lo && b.lo < hi);
}

/** The band a frequency is in, if any. */
export function bandAt(f: number): Band | undefined {
  return BANDS.find((b) => f >= b.lo && f <= b.hi);
}
