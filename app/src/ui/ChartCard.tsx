/* The chart card: band chips to zoom with, the chart, and its legend.
 *
 * Click to pin a frequency or unpin one, drag to zoom, double-click to zoom
 * back out. The frequency under the pointer goes up to App, so the photo can
 * show the same point.
 */

import { useLayoutEffect, useRef, type RefObject } from "react";
import type { Analysis } from "@/analysis";
import { bandsInRange } from "@/bands";
import { drawChart, freqAt, type ChartGeom } from "./draw-chart";
import type { Curve, Settings } from "./model";

function Chips({ an, view, onView }: { an: Analysis; view: [number, number] | null; onView(v: [number, number] | null): void }): React.ReactElement {
  const same = (v: [number, number] | null): boolean =>
    (!v && !view) || !!(v && view && Math.abs(v[0] - view[0]) < 1e-9 && Math.abs(v[1] - view[1]) < 1e-9);
  const chips: [string, [number, number] | null][] = [["Full sweep", null]];
  for (const b of bandsInRange(an.fmin, an.fmax)) {
    const pad = Math.max((b.hi - b.lo) * 0.35, 0.02);
    chips.push([b.name, [Math.max(an.fmin, b.lo - pad), Math.min(an.fmax, b.hi + pad)]]);
  }
  return (
    <div className="chips" id="chips">
      {chips.map(([name, v]) => <button key={name} className={same(v) ? "on" : ""} onClick={() => onView(v)}>{name}</button>)}
    </div>
  );
}

export function ChartCard({ canvasRef, an, curve, settings, view, onView, manual, onTogglePin, hoverF, onHover, resNote }: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  an: Analysis | null;
  curve: Curve | null;
  settings: Settings;
  view: [number, number] | null;
  onView(v: [number, number] | null): void;
  manual: readonly number[];
  onTogglePin(f: number, tolerance: number): void;
  hoverF: number | null;
  onHover(f: number | null): void;
  resNote: string;
}): React.ReactElement {
  const geom = useRef<ChartGeom | null>(null), drag = useRef<{ x0: number; x1: number } | null>(null);
  const range: [number, number] | null = an ? view ?? [an.fmin, an.fmax] : null;

  const draw = (): void => {
    const c = canvasRef.current, ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
    c.width = W * dpr;
    c.height = H * dpr;
    geom.current = drawChart(ctx, W, H, dpr, { settings, an, curve, range, manual, hoverF, drag: drag.current });
  };
  const drawRef = useRef(draw);
  useLayoutEffect(() => { drawRef.current = draw; draw(); });
  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => drawRef.current());
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [canvasRef]);

  const xOf = (e: React.PointerEvent): number => e.clientX - e.currentTarget.getBoundingClientRect().left;
  return (
    <div className="card">
      <h2>SWR vs. frequency <span id="resNote" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>{resNote}</span></h2>
      {an && <Chips an={an} view={view} onView={onView} />}
      <canvas id="chart" ref={canvasRef}
        onPointerDown={(e) => { if (!geom.current) return; drag.current = { x0: xOf(e), x1: xOf(e) }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => {
          const x = xOf(e), g = geom.current;
          if (drag.current) drag.current.x1 = x;
          const f = g && x >= g.x0 && x <= g.x1 ? freqAt(g, x) : null;
          if (f !== hoverF) onHover(f);
          else draw();
        }}
        onPointerUp={() => {
          const g = geom.current, d = drag.current;
          drag.current = null;
          if (!d || !g) return;
          if (Math.abs(d.x1 - d.x0) > 6) onView([freqAt(g, Math.min(d.x0, d.x1)), freqAt(g, Math.max(d.x0, d.x1))]);
          else if (d.x0 >= g.x0 && d.x0 <= g.x1) onTogglePin(freqAt(g, d.x0), (6 * (g.hi - g.lo)) / (g.x1 - g.x0));
          draw();
        }}
        onPointerLeave={() => onHover(null)}
        onDoubleClick={() => onView(null)}
      />
      <div className="legend">
        <span><b>bands</b> row: <i style={{ background: "var(--ok)", marginLeft: 4 }}></i>usable (licensed, SWR ≤ max) <i style={{ background: "rgba(248,81,73,.7)", marginLeft: 6 }}></i>licensed, SWR too high</span>
        <span><b>≤3:1</b> row: start–end MHz of each stretch where SWR stays under the max</span>
        <span><i style={{ background: "var(--data)" }}></i>CW / RTTY / data</span>
        <span><i style={{ background: "var(--phone)" }}></i>Phone / image</span>
        <span><i style={{ background: "var(--cw)" }}></i>CW only</span>
        <span><i style={{ background: "var(--all)" }}></i>All modes / 60 m channel</span>
      </div>
    </div>
  );
}
