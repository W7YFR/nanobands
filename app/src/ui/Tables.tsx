/* The two tables: how much of each band segment the antenna is ready for,
 * and the key points on the curve.
 */

import { memo, useState } from "react";
import { segUsable, type Analysis, type SegmentUse } from "@/analysis";
import { MODES, MODE_NAMES, bandAt, bandsInRange, segsFor, type Band, type Segment } from "@/bands";
import { fmtF } from "@/format";
import { bandView, barPieces, sameView, type Settings } from "./model";
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

/** A piece of a bar: usable, over Max SWR, or between 60 m's channels, where you may not transmit. */
type PieceKind = "ok" | "bad" | "off";
/** A piece of a bar, with the stretch of the bar that shows it. */
interface Piece { kind: PieceKind; range: string; hit: [number, number] }
/** A bar's tooltip: the piece of the bar under the pointer, and where the pointer is. */
interface BarTip { piece: Piece; cx: number; cy: number }
const PIECE: Record<PieceKind, { color: string; say: string }> = {
  ok: { color: OK, say: "Usable" },
  bad: { color: BAD, say: "SWR too high" },
  off: { color: "#3a404a", say: "You may not transmit here" },
};

/** A 60 m channel's bar is drawn at least this share of the bar wide. */
const MIN_CHANNEL = 0.015;

/** One band's rows. 60 m is four channels and a segment, shown as one row. */
function BandRows({ b, an, s, onTip }: { b: Band; an: Analysis; s: Settings; onTip(t: BarTip | null): void }): React.ReactElement {
  const segs = segsFor(b, s);
  if (!segs.length) {
    const why = b.priv[s.cls].length ? `No ${MODE_NAMES[s.mode]} privileges here for this license class` : "No privileges for this license class";
    return <tr className="seg first"><td className="band"><b>{b.name}</b></td><td className="none" colSpan={4}>{why}</td></tr>;
  }
  const tot = segs.map((g) => segUsable(g, an));
  const avg = bandUse(b, an, s)!;
  const meas = Math.min(...tot.map((u) => u.measured));
  const is60 = b.name === "60m";
  const f60 = (g: Segment): string => (g[1] - g[0] < 0.005 ? ((g[0] + g[1]) / 2).toFixed(4) : `${g[0].toFixed(4)}–${g[1].toFixed(4)}`);
  const ok60 = segs.filter((_, j) => tot[j]!.frac > 0.995);
  const shown: readonly Segment[] = is60 ? [[segs[0]![0], segs[segs.length - 1]![1], "chan"]] : segs;
  return (
    <>
      {shown.map((g, j) => {
        const u: SegmentUse = is60 ? { parts: segs.flatMap((c) => segUsable(c, an).parts), frac: avg, measured: meas } : tot[j]!;
        const parts = is60
          ? ok60.length ? ok60.map(f60).join(", ") : "—"
          : u.parts.length ? u.parts.map(([a, c]) => `${fmtF(a)}–${fmtF(c)}`).join(", ") : "—";
        const span = g[1] - g[0];
        // The bar's pieces, for its tooltip: each channel of 60 m and the
        // gaps between them, or the usable and unusable stretches of a segment.
        const pieces: Piece[] = is60
          ? [
            ...segs.map((c, i): Piece => ({ kind: tot[i]!.frac > 0.995 ? "ok" : "bad", range: f60(c), hit: [c[0], Math.max(c[1], c[0] + MIN_CHANNEL * span)] })),
            ...segs.slice(1).map((c, i): Piece => ({ kind: "off", range: `${segs[i]![1].toFixed(4)}–${c[0].toFixed(4)}`, hit: [segs[i]![1], c[0]] })),
          ]
          : barPieces(g[0], g[1], u.parts).map((p): Piece => ({ kind: p.ok ? "ok" : "bad", range: `${fmtF(p.lo)}–${fmtF(p.hi)}`, hit: [p.lo, p.hi] }));
        const tipAt = (e: React.PointerEvent<HTMLDivElement>): void => {
          if (e.pointerType !== "mouse") return;
          const r = e.currentTarget.getBoundingClientRect(), f = g[0] + ((e.clientX - r.left) / r.width) * span;
          // The piece under the pointer. A channel comes first, since its bar
          // can be drawn wider than the channel and cover part of a gap.
          const gap = (p: Piece): number => Math.max(0, p.hit[0] - f, f - p.hit[1]);
          const at = pieces.reduce((best, p, i) => (gap(p) < gap(pieces[best]!) ? i : best), 0);
          onTip({ piece: pieces[at]!, cx: e.clientX, cy: e.clientY });
        };
        const tipped = { onPointerMove: tipAt, onPointerLeave: () => onTip(null) };
        const bar = u.measured < 0.999
          ? <div className="bar na" title="Partly outside the sweep" />
          : is60
            ? <div className="bar na" {...tipped}>{segs.map((c, i) => <span key={i} style={{ left: `${((c[0] - g[0]) / span) * 100}%`, width: `${Math.max(MIN_CHANNEL * 100, ((c[1] - c[0]) / span) * 100)}%`, background: tot[i]!.frac > 0.995 ? OK : BAD }} />)}</div>
            : <div className="bar" {...tipped}>{u.parts.map(([a, c], i) => <span key={i} style={{ left: `${((a - g[0]) / span) * 100}%`, width: `${Math.max(1, ((c - a) / span) * 100)}%` }} />)}</div>;
        return (
          <tr key={j} className={"seg" + (j === 0 ? " first" : "")}>
            {j === 0 && <td className="band" rowSpan={shown.length}><b>{b.name}</b> <Pill avg={avg} /></td>}
            <td className="mode"><span style={{ color: MODES[g[2]].color }}>■</span> {is60 ? `4 channels + 1 segment (${ok60.length}/${segs.length} usable)` : MODES[g[2]].label}</td>
            <td className="num range">{is60 ? `${g[0].toFixed(4)}–${g[1].toFixed(4)}` : `${fmtF(g[0])}–${fmtF(g[1])}`}</td>
            <td className={"num usable" + (parts === "—" ? " nil" : "")}>{parts}{u.measured < 0.999 && <> <span className="warn">(partly outside sweep)</span></>}</td>
            <td className="barcell">{bar}</td>
          </tr>
        );
      })}
    </>
  );
}

/** The Band segments table. A band's rows show it on the chart while the
 *  pointer is over them. A click keeps it there, and a second click goes back. */
export const BandTable = memo(function BandTable({ an, settings, shown = "all", view = null, onPeek, onPick }: {
  an: Analysis | null;
  settings: Settings;
  /** All bands, or only those with a usable part. */
  shown?: "all" | "usable";
  /** The chart's view, to mark the band it shows. */
  view?: [number, number] | null;
  /** The pointer came onto a band's rows, or left them. */
  onPeek?(b: Band | null): void;
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
          <tr className="head"><th>Band</th><th>Segment</th><th>Range (MHz)</th><th>Usable at SWR ≤ {settings.thr}</th><th style={{ width: "22%" }}></th></tr>
        </thead>
        {!bands.length && <tbody><tr><td colSpan={5} className="empty">{all.length ? "No usable band segments in this sweep." : "No amateur bands inside this sweep."}</td></tr></tbody>}
        {bands.map((b) => (
          <tbody key={b.name} className={"band" + (sameView(view, bandView(an, b)) ? " on" : "")} data-band={b.name}
            onPointerEnter={(e) => { if (e.pointerType === "mouse") onPeek?.(b); }}
            onPointerLeave={(e) => { if (e.pointerType === "mouse") onPeek?.(null); }}
            onClick={() => onPick?.(b)}>
            <BandRows b={b} an={an} s={settings} onTip={setTip} />
          </tbody>
        ))}
      </table>
      {tip && (
        <div className="chartTip barTip" style={{
          ...(tip.cx > window.innerWidth - 260 ? { right: window.innerWidth - tip.cx + 14 } : { left: tip.cx + 14 }),
          ...(tip.cy > window.innerHeight - 160 ? { bottom: window.innerHeight - tip.cy + 14 } : { top: tip.cy + 14 }),
        }}>
          <i style={{ background: PIECE[tip.piece.kind].color }} />{tip.piece.range} · {PIECE[tip.piece.kind].say}
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
    ...manual.map((m): Row => ({ f: m, s: swr(m), kind: "Pinned", col: curveColor(swr(m), m, s), manual: true })),
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
