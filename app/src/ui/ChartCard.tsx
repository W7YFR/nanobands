/* The chart card: band chips to zoom with, the chart, and its legend.
 *
 * Click to pin a frequency or unpin one, drag to zoom, double-click to zoom
 * back out. The frequency under the pointer goes up to App, so the photo can
 * show the same point.
 *
 * On a touch screen a finger has no hover, so a drag reads the curve under
 * it instead of zooming. Zoom turns a drag into a zoom, for one zoom.
 *
 * Full screen fills the window with the card, and the page behind stays put.
 * Done, Back or Escape leave it.
 */

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Analysis } from "@/analysis";
import { bandsInRange } from "@/bands";
import { Help } from "./Help";
import { drawChart, freqAt, type ChartGeom } from "./draw-chart";
import { fitCanvas } from "./draw-photo";
import type { Curve, Settings } from "./model";
import { useNoSwipe } from "./useNoSwipe";

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
  const geom = useRef<ChartGeom | null>(null), drag = useRef<{ x0: number; x1: number; zoom: boolean } | null>(null);
  const range: [number, number] | null = an ? view ?? [an.fmin, an.fmax] : null;
  /** On a touch screen: the next drag zooms instead of reading the curve. */
  const [zoomDrag, setZoomDrag] = useState(false);
  const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const [full, setFull] = useState(false);

  // Full screen: the page behind does not scroll, and Back or Escape leave.
  // Back on a phone is an edge swipe a page cannot stop, so full screen keeps
  // a step in the history for it to take; Done takes that step back off.
  useEffect(() => {
    if (!full) return;
    const root = document.documentElement;
    root.classList.add("chart-full");
    history.pushState({ chartFull: true }, "");
    let popped = false;
    const onPop = (): void => { popped = true; setFull(false); };
    const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      root.classList.remove("chart-full");
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      if (!popped && (history.state as { chartFull?: boolean } | null)?.chartFull) history.back();
    };
  }, [full]);

  const draw = (): void => {
    const c = canvasRef.current, ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
    fitCanvas(c, ctx, Math.round(W * dpr), Math.round(H * dpr));
    geom.current = drawChart(ctx, W, H, dpr, { settings, an, curve, range, manual, hoverF, drag: drag.current?.zoom ? drag.current : null });
  };
  const drawRef = useRef(draw);
  useLayoutEffect(() => { drawRef.current = draw; draw(); });
  useNoSwipe(canvasRef);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => drawRef.current());
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [canvasRef]);

  const xOf = (e: React.PointerEvent): number => e.clientX - e.currentTarget.getBoundingClientRect().left;
  return (
    <div className={"card" + (full ? " full" : "")} id="chartCard">
      <h2>SWR vs. frequency <Help align="start" text={touch
        ? "Drag along the chart to read the SWR. Tap to pin your own marker; tap it again to remove it. Zoom, then drag across a range, to zoom in."
        : "Click the chart to pin your own marker; click it again to remove it. Drag across the chart to zoom, double-click to reset."} /> {resNote && <span id="resNote">{resNote}</span>}
        <span className="tools">
          {touch && an && <button id="chartZoom" className={"small" + (zoomDrag ? " on" : "")} onClick={() => setZoomDrag(!zoomDrag)}>Zoom</button>}
          {full
            ? <button id="chartFull" className="small on" onClick={() => setFull(false)}>Done</button>
            : <button id="chartFull" className="small" onClick={() => setFull(true)}>⤢ Full screen</button>}
        </span>
      </h2>
      {an && <Chips an={an} view={view} onView={onView} />}
      <canvas id="chart" ref={canvasRef}
        onPointerDown={(e) => {
          if (!geom.current) return;
          // A finger reads the curve, and only zooms when Zoom is on.
          drag.current = { x0: xOf(e), x1: xOf(e), zoom: e.pointerType === "mouse" || zoomDrag };
          e.currentTarget.setPointerCapture(e.pointerId);
          if (!drag.current.zoom) { const g = geom.current, x = xOf(e); onHover(x >= g.x0 && x <= g.x1 ? freqAt(g, x) : null); }
        }}
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
          if (Math.abs(d.x1 - d.x0) > 6) {
            if (d.zoom) { onView([freqAt(g, Math.min(d.x0, d.x1)), freqAt(g, Math.max(d.x0, d.x1))]); setZoomDrag(false); }
          } else if (d.x0 >= g.x0 && d.x0 <= g.x1) onTogglePin(freqAt(g, d.x0), (6 * (g.hi - g.lo)) / (g.x1 - g.x0));
          draw();
        }}
        onPointerLeave={() => onHover(null)}
        onDoubleClick={() => onView(null)}
      />
      <div className="legend">
        <span><i style={{ background: "var(--ok)" }}></i>Usable</span>
        <span><i style={{ background: "rgba(248,81,73,.7)" }}></i>SWR too high</span>
        <span><i style={{ background: "var(--data)" }}></i>CW / RTTY / data</span>
        <span><i style={{ background: "var(--phone)" }}></i>Phone / image</span>
        <span><i style={{ background: "var(--cw)" }}></i>CW only</span>
        <span><i style={{ background: "var(--all)" }}></i>All modes / 60 m channel</span>
      </div>
    </div>
  );
}
