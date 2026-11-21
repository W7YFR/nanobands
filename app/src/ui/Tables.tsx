/* The two tables: how much of each band segment the antenna is ready for,
 * and the key points on the curve.
 */

import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { atTop, coverNote, segUsable, type Analysis, type SegmentUse } from "@/analysis";
import { MODES, MODE_NAMES, bandAt, bandsInRange, segsFor, type Band, type Segment } from "@/bands";
import { fmtF } from "@/format";
import { bandView, barPieces, compareSwr, dipIn, keptNumber, medianIn, sameView, type Compare, type Curve, type Settings } from "./model";
import { Help } from "./Help";
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

/** A median SWR as the Median SWR column gives it. */
const swrText = (m: number): string => (Number.isNaN(m) ? "—" : m.toFixed(2));

/** The arrow beside the sweep's median SWR, by how it compares with the newest kept sweep's. */
const ARROW: Partial<Record<Compare, { mark: string; say: string }>> = {
  lower: { mark: "↓", say: "lower than" },
  higher: { mark: "↑", say: "higher than" },
};

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
interface BarTip { kind: "bar"; band: string; title: string; piece: Piece; dips: Dip[]; cx: number; cy: number }
/** A cell's tooltip: what it says, and where the pointer is. */
interface CellTip { kind: "cell"; band: string; body: React.ReactNode; cx: number; cy: number }
type Tip = BarTip | CellTip;

/** A tooltip's title: the band, then the segment and what the tooltip shows, where it has them. */
const TipTitle = ({ parts }: { parts: readonly (string | false)[] }): React.ReactElement =>
  <span className="tipTitle">{parts.filter(Boolean).join(" · ")}</span>;

/** The room between the pointer and its tooltip, and between the tooltip and the window's edge, in pixels. */
const GAP = 14, EDGE = 8;

/** A tooltip at the pointer. It opens below and right of the pointer, and
 *  above or left of it where it would run off the window. */
function PointerTip({ cx, cy, className, children }: { cx: number; cy: number; className: string; children: React.ReactNode }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!, w = el.offsetWidth, h = el.offsetHeight;
    const vw = document.documentElement.clientWidth || window.innerWidth, vh = window.innerHeight;
    el.style.left = `${cx + GAP + w > vw - EDGE ? Math.max(EDGE, cx - GAP - w) : cx + GAP}px`;
    el.style.top = `${cy + GAP + h > vh - EDGE ? Math.max(EDGE, cy - GAP - h) : cy + GAP}px`;
  });
  return <div ref={ref} className={"chartTip " + className}>{children}</div>;
}

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
 *  four channels and a segment, shown as one row. The Dip column gives the
 *  lead line's dip, on the row of the segment it is in: the sweep, or the
 *  newest kept sweep while the sweep is hidden. With the sweep and a kept
 *  sweep shown, the Median SWR column gives the sweep's median SWR on each
 *  row. A tooltip over either gives every line's. */
function BandRows({ b, an, s, lines, med, hot, onTip }: {
  b: Band; an: Analysis; s: Settings; lines: readonly DipLine[];
  /** Whether the Median SWR column shows. */
  med: boolean;
  /** The dips the tooltip names, to light up their marks. */
  hot: readonly Dip[];
  onTip(t: Tip | null): void;
}): React.ReactElement {
  const { cls, mode } = s;
  const segs = useMemo(() => segsFor(b, { cls, mode }), [b, cls, mode]);
  const is60 = b.name === "60m";
  const shown: readonly Segment[] = useMemo(() => (is60 && segs.length ? [[segs[0]![0], segs[segs.length - 1]![1], "chan"]] : segs), [is60, segs]);
  // The sweep, and the kept sweeps newest first.
  const latest = lines.find((l) => l.latest), kept = useMemo(() => lines.filter((l) => !l.latest).reverse(), [lines]);
  // Each of those lines' median SWR on each row. 60 m's row counts its channels and segment.
  const meds = useMemo(() => (med && latest ? shown.map((g) => [latest, ...kept].map((l) => medianIn(l.f, l.s, is60 ? segs : [g]))) : []),
    [med, latest, kept, shown, is60, segs]);
  if (!segs.length) {
    const why = b.priv[s.cls].length ? `No ${MODE_NAMES[s.mode]} privileges here for this license class` : "No privileges for this license class";
    return <tr className="seg first"><td className="band"><b>{b.name}</b></td><td className="none" colSpan={med ? 6 : 5}>{why}</td></tr>;
  }
  const tot = segs.map((g) => segUsable(g, an));
  const avg = bandUse(b, an, s)!;
  const meas = Math.min(...tot.map((u) => u.measured)), swept = Math.min(...tot.map((u) => u.swept));
  const f60 = (g: Segment): string => (g[1] - g[0] < 0.005 ? ((g[0] + g[1]) / 2).toFixed(4) : `${g[0].toFixed(4)}–${g[1].toFixed(4)}`);
  const fr = (a: number, c: number): string => (is60 ? `${a.toFixed(4)}–${c.toFixed(4)}` : `${fmtF(a)}–${fmtF(c)}`);
  const ok60 = segs.filter((_, j) => tot[j]!.frac > 0.995);
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
    // The title names the segment the piece is in. Where you may not transmit, there is none.
    const p = pieces[at]!, mid = (p.hit[0] + p.hit[1]) / 2, seg = p.kind === "off" ? undefined : segs.find((g) => mid >= g[0] && mid <= g[1]);
    onTip({ kind: "bar", band: b.name, title: [b.name, seg && MODES[seg[2]].label].filter(Boolean).join(" · "), piece: p, dips: near, cx: e.clientX, cy: e.clientY });
  };
  /** A cell that shows `body` in a tooltip while the mouse is over it. */
  const tipOn = (body: React.ReactNode): React.TdHTMLAttributes<HTMLTableCellElement> => ({
    onPointerMove: (e) => { if (e.pointerType === "mouse") onTip({ kind: "cell", band: b.name, body, cx: e.clientX, cy: e.clientY }); },
    onPointerLeave: () => onTip(null),
  });
  // The lead line's dip, on the row whose segment it is in or nearest to.
  const pad = dips.some((d) => !d.line.latest);
  const lead = dips.find((d) => d.line === lines[lines.length - 1]);
  const away = (g: Segment, f: number): number => Math.max(0, g[0] - f, f - g[1]);
  const dipAt = lead ? shown.reduce((best, g, j) => (away(g, lead.f) < away(shown[best]!, lead.f) ? j : best), 0) : -1;
  const dipBody = dips.some((d) => d !== lead)
    ? <><TipTitle parts={[b.name, "Dip"]} />{[...dips].reverse().map((d) => <span key={d.line.name} className="dipRow"><DipTag d={d} pad={pad} /><span>{dipText(d, s)}</span></span>)}</>
    : null;
  const dipList = dipBody ? tipOn(dipBody) : {};
  /** The "⋯" that opens a cell's tooltip with a tap, where there is no mouse to hover with. */
  const tap = (body: React.ReactNode, label: string): React.ReactElement =>
    <Help className="tap" align="start" glyph="⋯" label={label} text={<span className="cellTip">{body}</span>} />;
  /** A row's Median SWR cell: the sweep's median, with an arrow where it is
   *  lower or higher than the newest kept sweep's. Gray where every line is
   *  over Max SWR. */
  const medCell = (j: number): React.ReactElement => {
    const m = meds[j]!, now = m[0]!, arrow = ARROW[compareSwr(now, m[1]!, s.thr)];
    const rows = [latest!, ...kept].map((l, i) => {
      const v = m[i]!, c = compareSwr(now, v, s.thr), d = Math.abs(now - v).toFixed(2);
      const tag = <span className={`n k${l.n}`}>{l.n}</span>;
      const say = i === 0 || Number.isNaN(now) || Number.isNaN(v) || c === "over" ? null
        : c === "same" ? <>{latest!.name} same as {tag}</> : <>{latest!.name} {d} {ARROW[c]!.say} {tag}</>;
      return (
        <span key={l.name} className="dipRow">
          {i === 0 ? <span className="n latest">L</span> : tag}<span>{l.name} · {swrText(v)}</span>{say && <span className={"say " + c}>{say}</span>}
        </span>
      );
    });
    const body = <><TipTitle parts={[b.name, !is60 && MODES[shown[j]![2]].label, "Median SWR"]} />{rows}</>;
    return (
      <td className={"num med" + (m.every((v) => v > s.thr) ? " nil" : "")} {...tipOn(body)}>
        {swrText(now)}{arrow && <span className="arr" aria-label={`${arrow.say} kept sweep ${kept[0]!.n}`}>{arrow.mark}</span>}
        {tap(body, "Each sweep's median SWR")}
      </td>
    );
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
            <td className={"mode" + (is60 ? " chan" : "")}><span style={{ color: MODES[g[2]].color }}>■</span> {is60 ? `4 channels + 1 segment (${ok60.length}/${segs.length} usable)` : MODES[g[2]].label}</td>
            <td className="num range">{fr(g[0], g[1])}</td>
            <td className={"num usable" + (parts === "—" ? " nil" : "")}>{parts}{note && <> <span className="warn">({note})</span></>}</td>
            {meds.length > 0 && medCell(j)}
            {lead
              ? <td className="num dips" {...(j === dipAt ? dipList : {})}>
                  {j === dipAt && <div className={"dipRow" + (lead.out ? " off" : "")}><DipTag d={lead} pad={pad} /><span>{dipText(lead, s)}</span>{dipBody && tap(dipBody, "Each sweep's dip")}</div>}
                </td>
              : j === 0 && <td className="num dips" rowSpan={shown.length} {...dipList}><span className="nil">No dip</span>{dipBody && tap(dipBody, "Each sweep's dip")}</td>}
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
  const [tip, setTip] = useState<Tip | null>(null);
  if (!an) return <Empty />;
  const all = bandsInRange(an.fmin, an.fmax);
  const bands = shown === "usable" ? all.filter((b) => (bandUse(b, an, settings) ?? 0) > 0.005) : all;
  const med = lines.some((l) => l.latest) && lines.some((l) => !l.latest);
  return (
    <>
      <table className="bands" style={{ "--thr": `"${settings.thr}"` } as React.CSSProperties}>
        <thead>
          <tr className="head">
            <th>Band<Help align="start" text="Click a band's rows to show it on the chart." /></th>
            <th>Segment<Help align="start" text="The segments your license class may use in this mode." /></th>
            <th>Range (MHz)<Help align="start" text="Where the segment starts and ends." /></th>
            <th>SWR ≤ {settings.thr}<Help text="The parts of the segment at or under Max SWR." /></th>
            {med && <th>Median SWR<Help text="The sweep's median SWR on the segment. ↓ or ↑: lower or higher than the newest kept sweep's." /></th>}
            <th>Dip<Help text="The sweep's lowest SWR in the band. A triangle means it is past the band's edge." /></th>
            <th style={{ width: "24%" }}><Help text="Green is usable and red is over Max SWR. A mark is a sweep's dip." /></th>
          </tr>
        </thead>
        {!bands.length && <tbody><tr><td colSpan={med ? 7 : 6} className="empty">{all.length ? "No usable band segments in this sweep." : "No amateur bands inside this sweep."}</td></tr></tbody>}
        {bands.map((b) => (
          <tbody key={b.name} className={"band" + (sameView(view, bandView(an, b)) ? " on" : "")} data-band={b.name}
            onClick={() => onPick?.(b)}>
            <BandRows b={b} an={an} s={settings} lines={lines} med={med} hot={tip?.kind === "bar" && tip.band === b.name ? tip.dips : []} onTip={setTip} />
          </tbody>
        ))}
      </table>
      {tip?.kind === "bar" && (
        <PointerTip cx={tip.cx} cy={tip.cy} className="barTip">
          <TipTitle parts={[tip.title]} />
          <i style={{ background: PIECE[tip.piece.kind].color }} />{tip.piece.range} · {tip.piece.say ?? PIECE[tip.piece.kind].say}
          {tip.dips.map((d) => <div key={d.line.name} className="dipRow"><DipTag d={d} pad={lines.some((l) => !l.latest)} /><span>{d.line.latest ? d.line.name : "Kept"} dip · {dipText(d, settings)}</span></div>)}
        </PointerTip>
      )}
      {tip?.kind === "cell" && <PointerTip cx={tip.cx} cy={tip.cy} className="cellTip">{tip.body}</PointerTip>}
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
