/* The two tables: how much of each band segment the antenna is ready for,
 * and the key points on the curve.
 */

import { memo, useState } from "react";
import { atTop, coverNote, segUsable, type Analysis, type SegmentUse } from "@/analysis";
import { MODES, MODE_NAMES, bandAt, bandsInRange, segsFor, type Band, type Segment } from "@/bands";
import { fmtF } from "@/format";
import { bandView, barPieces, dipIn, keptNumber, sameView, type Curve, type Settings } from "./model";
import type { Showing } from "./ChartCard";
import { BAD, OK, curveColor } from "./colors";

const Empty = ({ children = "No data yet." }: { children?: React.ReactNode }): React.ReactElement => <div className="empty">{children}</div>;

function Pill({ avg }: { avg: number }): React.ReactElement {
  return avg > 0.995 ? <span className="pill ok">all usable</span> : avg > 0.005 ? <span className="pill part">partial</span> : <span className="pill no">none</span>;
}

/** How much of a band's segments is usable, 0..1, or null with none to use. */
function bandUse(b: Band, an: Analysis, s: Settings): number | null {
  const segs = segsFor(b, s);
  if (!segs.length) return null;
  return segs.reduce((a, g) => a + segUsable(g, an).frac * (g[1] - g[0]), 0) / segs.reduce((a, g) => a + g[1] - g[0], 0);
}

/** A line whose dips the bars mark: the sweep, or a kept sweep. */
export interface DipLine {
  /** Latest, Live, or Kept and its number. */
  name: string;
  /** The kept number the line wears, or null. */
  n: number | null;
  /** The sweep itself, not a kept sweep. */
  latest: boolean;
  f: Float64Array;
  s: Float64Array;
}

/** The lines the chart shows, for the bars to mark their dips: the kept
 *  sweeps oldest first, then the sweep, so the sweep's mark is on top. */
export function dipLines(curve: Curve | null, showing: Showing | null): DipLine[] {
  const kept = showing ? showing.kept.flatMap((k, i): DipLine[] => {
    const n = keptNumber(showing.kept, i);
    return k.on && i !== showing.same ? [{ name: `Kept ${n}`, n, latest: false, f: k.f, s: k.s }] : [];
  }) : [];
  if (!curve || (showing && !showing.curveOn)) return kept;
  const n = showing && showing.same >= 0 ? keptNumber(showing.kept, showing.same) : null;
  return [...kept, { name: showing?.curveName ?? "Latest", n, latest: true, f: curve.f, s: curve.s }];
}

/** A line's dip in a band. `out`: the dip is off the band's low or high end. */
interface Dip { line: DipLine; f: number; s: number; out: "lo" | "hi" | null }

/** A dip's mark, by its line: white for the sweep, the kept sweep's color for a kept sweep. */
const dipCls = (l: DipLine): string => "dip " + (l.latest ? "now" : `k${l.n}`);

/** A dip's frequency and SWR, as the Dip column and the tooltip give them. */
const dipText = (d: Dip, s: Settings): string => `${fmtF(d.f)} · ${atTop(d.s, s) ? "≥ " + s.top : d.s.toFixed(2)}`;

/** A dip's mark, as the bar draws it, and its number, before its text.
 *  The sweep wears a green L, as its pill on the chart does. `pad`: with
 *  kept sweeps listed, the sweep wears its L and the texts line up. */
const DipTag = ({ d, pad = false }: { d: Dip; pad?: boolean }): React.ReactElement => (
  <>
    <i className={dipCls(d.line) + " glyph" + (d.out ? ` out ${d.out}` : "")} />
    {d.line.latest && (d.line.n || pad) && <span className="n latest">L</span>}
    {d.line.n && <span className={`n k${d.line.n}`}>{d.line.n}</span>}
  </>
);

/** A piece of a bar: usable, over Max SWR, not measured, or where you may not transmit. */
type PieceKind = "ok" | "bad" | "na" | "off";
/** A piece of a bar, with the stretch of the bar that shows it. `say` replaces the kind's words. */
interface Piece { kind: PieceKind; range: string; hit: [number, number]; say?: string }
/** A bar's tooltip: the piece of the bar under the pointer, the dips near it, and where the pointer is. */
interface BarTip { band: string; piece: Piece; dips: Dip[]; cx: number; cy: number }
const PIECE: Record<PieceKind, { color: string; say: string }> = {
  ok: { color: OK, say: "Usable" },
  bad: { color: BAD, say: "SWR too high" },
  na: { color: "#5b6270", say: "No readings" },
  off: { color: "#3a404a", say: "You may not transmit here" },
};

/** A 60 m channel's bar is drawn at least this share of the bar wide. */
const MIN_CHANNEL = 0.015;

/** The pointer this close to a dip's mark, in pixels, names the dip in the tooltip. */
const NEAR_DIP = 9;

/** One band's rows, and one bar for the whole band beside them. The bar
 *  marks each segment's mode over it, and each line's dip on it. 60 m is
 *  four channels and a segment, shown as one row. */
function BandRows({ b, an, s, lines, hot, onTip }: {
  b: Band; an: Analysis; s: Settings; lines: readonly DipLine[];
  /** The dips the tooltip names, to light up their marks. */
  hot: readonly Dip[];
  onTip(t: BarTip | null): void;
}): React.ReactElement {
  const segs = segsFor(b, s);
  if (!segs.length) {
    const why = b.priv[s.cls].length ? `No ${MODE_NAMES[s.mode]} privileges here for this license class` : "No privileges for this license class";
    return <tr className="seg first"><td className="band"><b>{b.name}</b></td><td className="none" colSpan={5}>{why}</td></tr>;
  }
  const tot = segs.map((g) => segUsable(g, an));
  const avg = bandUse(b, an, s)!;
  const meas = Math.min(...tot.map((u) => u.measured)), swept = Math.min(...tot.map((u) => u.swept));
  const is60 = b.name === "60m";
  const f60 = (g: Segment): string => (g[1] - g[0] < 0.005 ? ((g[0] + g[1]) / 2).toFixed(4) : `${g[0].toFixed(4)}–${g[1].toFixed(4)}`);
  const fr = (a: number, c: number): string => (is60 ? `${a.toFixed(4)}–${c.toFixed(4)}` : `${fmtF(a)}–${fmtF(c)}`);
  const ok60 = segs.filter((_, j) => tot[j]!.frac > 0.995);
  const shown: readonly Segment[] = is60 ? [[segs[0]![0], segs[segs.length - 1]![1], "chan"]] : segs;
  const span = b.hi - b.lo;
  const x = (f: number): number => Math.min(1, Math.max(0, (f - b.lo) / span));
  // Each line's dip in the band, as the chart gives it with the band picked.
  const [lo, hi] = bandView(an, b);
  const dips = lines.flatMap((line): Dip[] => {
    const d = dipIn(line.f, line.s, lo, hi);
    return d ? [{ line, ...d, out: d.f < b.lo ? "lo" : d.f > b.hi ? "hi" : null }] : [];
  });
  // The bar's pieces, low to high: where you may not transmit, each 60 m
  // channel, and the usable and unusable stretches of each segment.
  const sorted = [...segs].sort((p, q) => p[0] - q[0]);
  const gaps = [b.lo, ...sorted.flatMap((g) => [g[0], g[1]]), b.hi];
  const pieces: Piece[] = [
    ...sorted.flatMap((g): Piece[] => {
      const u = segUsable(g, an), note = coverNote(g, u, an);
      if (g[1] - g[0] < 0.005) return [{ kind: u.frac > 0.995 ? "ok" : "bad", range: f60(g), hit: [g[0], Math.max(g[1], g[0] + MIN_CHANNEL * span)] }];
      if (note) return [{ kind: "na", range: fr(g[0], g[1]), hit: [g[0], g[1]], say: note[0]!.toUpperCase() + note.slice(1) }];
      return barPieces(g[0], g[1], u.parts).map((p): Piece => ({ kind: p.ok ? "ok" : "bad", range: fr(p.lo, p.hi), hit: [p.lo, p.hi] }));
    }),
    ...Array.from({ length: gaps.length / 2 }, (_, i): [number, number] => [gaps[2 * i]!, gaps[2 * i + 1]!])
      .filter(([a, c]) => c - a > 1e-9).map(([a, c]): Piece => ({ kind: "off", range: fr(a, c), hit: [a, c] })),
  ];
  const tipAt = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.querySelector(".bar")!.getBoundingClientRect(), f = b.lo + ((e.clientX - r.left) / r.width) * span;
    // The piece under the pointer. A channel comes first, since its bar
    // can be drawn wider than the channel and cover part of a gap.
    const gap = (p: Piece): number => Math.max(0, p.hit[0] - f, f - p.hit[1]);
    const at = pieces.reduce((best, p, i) => (gap(p) < gap(pieces[best]!) ? i : best), 0);
    const near = dips.filter((d) => Math.abs(r.left + x(d.f) * r.width - e.clientX) <= NEAR_DIP);
    onTip({ band: b.name, piece: pieces[at]!, dips: near, cx: e.clientX, cy: e.clientY });
  };
  const box = (a: number, c: number, min = 0): React.CSSProperties => ({ left: `${x(a) * 100}%`, width: `${Math.max(min, (x(c) - x(a)) * 100)}%` });
  return (
    <>
      {shown.map((g, j) => {
        const u: SegmentUse = is60 ? { parts: segs.flatMap((c) => segUsable(c, an).parts), frac: avg, measured: meas, swept } : tot[j]!;
        const note = coverNote(g, u, an);
        const parts = is60
          ? ok60.length ? ok60.map(f60).join(", ") : "—"
          : u.parts.length ? u.parts.map(([a, c]) => `${fmtF(a)}–${fmtF(c)}`).join(", ") : "—";
        return (
          <tr key={j} className={"seg" + (j === 0 ? " first" : "")}>
            {j === 0 && <td className="band" rowSpan={shown.length}><b>{b.name}</b> <Pill avg={avg} /></td>}
            <td className="mode"><span style={{ color: MODES[g[2]].color }}>■</span> {is60 ? `4 channels + 1 segment (${ok60.length}/${segs.length} usable)` : MODES[g[2]].label}</td>
            <td className="num range">{fr(g[0], g[1])}</td>
            <td className={"num usable" + (parts === "—" ? " nil" : "")}>{parts}{note && <> <span className="warn">({note})</span></>}</td>
            {j === 0 && (
              <td className="num dips" rowSpan={shown.length}>
                {dips.length
                  ? [...dips].reverse().map((d) => <div key={d.line.name} className={"dipRow" + (d.out ? " off" : "")}><DipTag d={d} pad={dips.some((e) => !e.line.latest)} /><span>{dipText(d, s)}</span></div>)
                  : <span className="nil">No dip</span>}
              </td>
            )}
            {j === 0 && (
              <td className="barcell" rowSpan={shown.length}>
                <div className="barWrap" onPointerMove={tipAt} onPointerLeave={() => onTip(null)}>
                  {segs.map((c, i) => <span key={i} className="modeBar" style={{ ...box(c[0], c[1], MIN_CHANNEL * 100), background: MODES[c[2]].color }} />)}
                  <div className="bar">{pieces.map((p, i) => <span key={i} className={p.kind} style={box(p.hit[0], p.hit[1], p.kind === "off" ? 0 : 0.5)} />)}</div>
                  {dips.map((d) => (
                    <i key={d.line.name} className={dipCls(d.line) + (d.out ? ` out ${d.out}` : "") + (hot.some((h) => h.line.name === d.line.name) ? " hot" : "")}
                      style={{ left: `${x(d.f) * 100}%` }} />
                  ))}
                  <div className="ends"><span>{is60 ? b.lo.toFixed(4) : fmtF(b.lo)}</span><span>{is60 ? b.hi.toFixed(4) : fmtF(b.hi)}</span></div>
                </div>
              </td>
            )}
          </tr>
        );
      })}
    </>
  );
}

/** The Band segments table. A click on a band's rows shows it on the chart,
 *  and a second click goes back. The pointer over them changes nothing: the
 *  chart would jump as it passed. */
export const BandTable = memo(function BandTable({ an, settings, shown = "all", view = null, lines = [], onPick }: {
  an: Analysis | null;
  settings: Settings;
  /** All bands, or only those with a usable part. */
  shown?: "all" | "usable";
  /** The chart's view, to mark the band it shows. */
  view?: [number, number] | null;
  /** The lines whose dips the bars mark. */
  lines?: readonly DipLine[];
  onPick?(b: Band): void;
}): React.ReactElement {
  const [tip, setTip] = useState<BarTip | null>(null);
  if (!an) return <Empty />;
  const all = bandsInRange(an.fmin, an.fmax);
  const bands = shown === "usable" ? all.filter((b) => (bandUse(b, an, settings) ?? 0) > 0.005) : all;
  return (
    <>
      <table className="bands" style={{ "--thr": `"${settings.thr}"` } as React.CSSProperties}>
        <thead>
          <tr className="head"><th>Band</th><th>Segment</th><th>Range (MHz)</th><th>Usable at SWR ≤ {settings.thr}</th><th>Dip</th><th style={{ width: "24%" }}></th></tr>
        </thead>
        {!bands.length && <tbody><tr><td colSpan={6} className="empty">{all.length ? "No usable band segments in this sweep." : "No amateur bands inside this sweep."}</td></tr></tbody>}
        {bands.map((b) => (
          <tbody key={b.name} className={"band" + (sameView(view, bandView(an, b)) ? " on" : "")} data-band={b.name}
            onClick={() => onPick?.(b)}>
            <BandRows b={b} an={an} s={settings} lines={lines} hot={tip?.band === b.name ? tip.dips : []} onTip={setTip} />
          </tbody>
        ))}
      </table>
      {tip && (
        <div className="chartTip barTip" style={{
          ...(tip.cx > window.innerWidth - 260 ? { right: window.innerWidth - tip.cx + 14 } : { left: tip.cx + 14 }),
          ...(tip.cy > window.innerHeight - 160 ? { bottom: window.innerHeight - tip.cy + 14 } : { top: tip.cy + 14 }),
        }}>
          <i style={{ background: PIECE[tip.piece.kind].color }} />{tip.piece.range} · {tip.piece.say ?? PIECE[tip.piece.kind].say}
          {tip.dips.map((d) => <div key={d.line.name} className="dipRow"><DipTag d={d} pad={lines.some((l) => !l.latest)} /><span>{d.line.latest ? d.line.name : "Kept"} dip · {dipText(d, settings)}</span></div>)}
        </div>
      )}
    </>
  );
});

interface Row { f: number; s: number; kind: string; col: string; clipped?: boolean; manual?: boolean }

export const PointsTable = memo(function PointsTable({ an, settings, manual, swr, onRemove }: {
  an: Analysis | null;
  settings: Settings;
  manual: readonly number[];
  swr(f: number): number;
  onRemove(f: number): void;
}): React.ReactElement {
  if (!an) return <Empty />;
  const s = settings;
  const rows: Row[] = [
    ...an.crossings.map((c): Row => ({ f: c.f, s: s.thr, kind: c.dir === "down" ? `Drops below ${s.thr}` : `Rises above ${s.thr}`, col: "#ff9a94" })),
    ...an.extrema.map((e): Row => ({ f: e.f, s: e.s, kind: e.type === "dip" ? "Dip (best match)" : "Peak", col: e.type === "dip" ? curveColor(e.s, e.f, s) : "#f2cc60", clipped: e.clipped })),
    ...manual.map((m): Row => ({ f: m, s: swr(m), kind: "Pinned", col: curveColor(swr(m), m, s), clipped: atTop(swr(m), s), manual: true })),
  ].sort((a, b) => a.f - b.f);
  return (
    <table className="pts">
      <tbody>
        <tr><th>Frequency (MHz)</th><th>SWR</th><th>Point</th><th>Band</th><th></th></tr>
        {rows.map((q, i) => (
          <tr key={i}>
            <td className="num">{fmtF(q.f)}</td>
            <td className="num">{q.clipped ? "≥ " + s.top : q.s.toFixed(2)}</td>
            <td style={{ color: q.col }}>{q.kind}</td>
            <td>{bandAt(q.f)?.name ?? ""}</td>
            <td>{q.manual && <button data-del={q.f} onClick={() => onRemove(q.f)}>remove</button>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
});
