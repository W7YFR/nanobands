/* The two tables: which band segments the antenna is ready for, and the key
 * points on the curve.
 */

import { memo } from "react";
import { segUsable, type Analysis, type SegmentUse } from "@/analysis";
import { MODES, MODE_NAMES, bandAt, bandsInRange, segsFor, type Band, type Segment } from "@/bands";
import { fmtF } from "@/format";
import type { Settings } from "./model";
import { BAD, OK } from "./colors";

const Empty = ({ children = "No data yet." }: { children?: React.ReactNode }): React.ReactElement => <div className="empty">{children}</div>;

function Pill({ avg }: { avg: number }): React.ReactElement {
  return avg > 0.995 ? <span className="pill ok">all usable</span> : avg > 0.005 ? <span className="pill part">partial</span> : <span className="pill no">none</span>;
}

/** One band's rows. 60 m is four channels and a segment, shown as one row. */
function BandRows({ b, an, s }: { b: Band; an: Analysis; s: Settings }): React.ReactElement {
  const segs = segsFor(b, s);
  if (!segs.length) {
    const why = b.priv[s.cls].length ? `No ${MODE_NAMES[s.mode]} privileges here for this license class` : "No privileges for this license class";
    return <tr><td><b>{b.name}</b></td><td colSpan={4} style={{ color: "var(--muted)" }}>{why}</td></tr>;
  }
  const tot = segs.map((g) => segUsable(g, an));
  const avg = tot.reduce((a, u, j) => a + u.frac * (segs[j]![1] - segs[j]![0]), 0) / segs.reduce((a, g) => a + g[1] - g[0], 0);
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
        const bar = u.measured < 0.999
          ? <div className="bar na" title="Partly outside the sweep" />
          : is60
            ? <div className="bar na">{segs.map((c, i) => <span key={i} style={{ left: `${((c[0] - g[0]) / span) * 100}%`, width: `${Math.max(1.5, ((c[1] - c[0]) / span) * 100)}%`, background: tot[i]!.frac > 0.995 ? OK : BAD }} />)}</div>
            : <div className="bar">{u.parts.map(([a, c], i) => <span key={i} style={{ left: `${((a - g[0]) / span) * 100}%`, width: `${Math.max(1, ((c - a) / span) * 100)}%` }} />)}</div>;
        return (
          <tr key={j}>
            {j === 0 && <td rowSpan={shown.length}><b>{b.name}</b><br /><Pill avg={avg} /></td>}
            <td><span style={{ color: MODES[g[2]].color }}>■</span> {is60 ? `4 channels + 1 segment (${ok60.length}/${segs.length} usable)` : MODES[g[2]].label}</td>
            <td className="num">{is60 ? `${g[0].toFixed(4)}–${g[1].toFixed(4)}` : `${fmtF(g[0])}–${fmtF(g[1])}`}</td>
            <td className="num">{parts}{u.measured < 0.999 && <> <span className="warn">(partly outside sweep)</span></>}</td>
            <td>{bar}</td>
          </tr>
        );
      })}
    </>
  );
}

export const BandTable = memo(function BandTable({ an, settings }: { an: Analysis | null; settings: Settings }): React.ReactElement {
  if (!an) return <Empty />;
  const bands = bandsInRange(an.fmin, an.fmax);
  return (
    <table>
      <tbody>
        <tr><th>Band</th><th>Segment</th><th>Range (MHz)</th><th>Usable at SWR ≤ {settings.thr}</th><th style={{ width: "22%" }}></th></tr>
        {!bands.length && <tr><td colSpan={5} className="empty">No amateur bands inside this sweep.</td></tr>}
        {bands.map((b) => <BandRows key={b.name} b={b} an={an} s={settings} />)}
      </tbody>
    </table>
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
    ...an.extrema.map((e): Row => ({ f: e.f, s: e.s, kind: e.type === "dip" ? "Dip (best match)" : "Peak", col: e.type === "dip" ? OK : "#f2cc60", clipped: e.clipped })),
    ...manual.map((m): Row => ({ f: m, s: swr(m), kind: "Pinned", col: "#fff", manual: true })),
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
