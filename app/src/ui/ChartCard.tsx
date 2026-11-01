/* The chart card: band chips to zoom with, the chart, and its legend.
 *
 * Click to pin a frequency, or click a pin to unpin it. Drag or scroll to
 * zoom, double-click to zoom back out. Shift + scroll, a sideways scroll or a
 * middle-button drag pans. The frequency under the pointer goes up to App, so
 * the photo can show the same point. Near a key point the hover snaps to it.
 * Over a band in the strip or its name, a tooltip sums up the band.
 *
 * On a touch screen a finger has no hover, so a drag reads the curve under
 * it instead of zooming. Zoom turns a drag into a zoom, for one zoom. The
 * reading stays when the finger lifts, and the next tap clears it.
 *
 * Full screen fills the window with the card, and the page behind stays put.
 * Done, Back or Escape leave it.
 */

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Analysis } from "@/analysis";
import { bandsInRange } from "@/bands";
import { Help } from "./Help";
import { bandTip, drawChart, freqAt, type ChartGeom, type KeyKind, type KeyPoint } from "./draw-chart";
import { fitCanvas } from "./draw-photo";
import type { Band } from "@/bands";
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
  const geom = useRef<ChartGeom | null>(null);
  /** A press on the chart. `pan` holds the view it started from. */
  const drag = useRef<{ x0: number; y0: number; x1: number; zoom: boolean; finger: boolean; t0: number; showing: boolean; pan?: [number, number] } | null>(null);
  const range: [number, number] | null = an ? view ?? [an.fmin, an.fmax] : null;
  /** The key point the hover snapped to, and the band under the pointer. */
  const [snap, setSnap] = useState<KeyKind | null>(null);
  const [tip, setTip] = useState<{ band: Band; cx: number; cy: number } | null>(null);
  const [panning, setPanning] = useState(false);
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
    geom.current = drawChart(ctx, W, H, dpr, {
      settings, an, curve, range, manual, hoverF, drag: drag.current?.zoom ? drag.current : null,
      snap, hoverNote: snap === "pin" ? (touch ? "tap to unpin" : "click to unpin") : undefined,
    });
  };

  /** A view of lo–hi, kept inside the sweep and no narrower than a
   *  2000th of it. The whole sweep is no zoom at all. */
  const fit = (lo: number, hi: number): [number, number] | null => {
    if (!an) return null;
    const full = an.fmax - an.fmin, span = Math.max(hi - lo, full / 2000);
    if (span >= full * 0.999) return null;
    const a = Math.min(Math.max(lo, an.fmin), an.fmax - span);
    return [a, a + span];
  };

  /** The key point nearest (x, y), if one is close enough to snap to. */
  const snapAt = (x: number, y: number, finger: boolean): KeyPoint | null => {
    let best: KeyPoint | null = null, bd = finger ? 24 : 14;
    // Pins come last, so a pin wins over a key point under it.
    for (const p of geom.current?.points ?? []) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= bd) { bd = d; best = p; }
    }
    return best;
  };

  /** Hover at (x, y): the frequency, snapped to a key point when close, and
   *  the band whose tooltip shows. */
  const hoverAt = (x: number, y: number, cx: number, cy: number, finger: boolean): void => {
    const g = geom.current, p = snapAt(x, y, finger);
    setSnap(p?.kind ?? null);
    const b = g?.bands.find((r) => x >= r.l && x <= r.r && y >= r.t && y <= r.b);
    setTip(b ? { band: b.band, cx, cy } : null);
    const f = p ? p.f : g && x >= g.x0 && x <= g.x1 ? freqAt(g, x) : null;
    if (f !== hoverF) onHover(f);
    else draw();
  };
  const clearHover = (): void => { setSnap(null); setTip(null); onHover(null); };

  // Wheel: zoom about the pointer. Shift or a sideways scroll pans when
  // zoomed. Over the chart the wheel never scrolls the page, even with
  // nothing left to zoom or pan.
  const onWheel = (e: WheelEvent): void => {
    const g = geom.current, c = canvasRef.current;
    if (!g || !c || !an) return;
    e.preventDefault();
    if (drag.current) return;
    const x = Math.min(Math.max(e.clientX - c.getBoundingClientRect().left, g.x0), g.x1);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const side = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    const perPx = (g.hi - g.lo) / (g.x1 - g.x0);
    if (e.shiftKey || side) {
      if (!view) return;
      const d = (side ? e.deltaX : e.deltaY) * unit * perPx;
      onView(fit(g.lo + d, g.hi + d));
      return;
    }
    if (!view && e.deltaY > 0) return;
    const k = Math.exp(e.deltaY * unit * 0.002), fa = freqAt(g, x);
    onView(fit(fa - (fa - g.lo) * k, fa + (g.hi - fa) * k));
  };
  const wheelRef = useRef(onWheel);
  wheelRef.current = onWheel;
  // React's wheel listener is passive and cannot stop the page scrolling.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const h = (e: WheelEvent): void => wheelRef.current(e);
    c.addEventListener("wheel", h, { passive: false });
    return () => c.removeEventListener("wheel", h);
  }, [canvasRef]);
  const drawRef = useRef(draw);
  useLayoutEffect(() => { drawRef.current = draw; draw(); });
  useNoSwipe(canvasRef);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => drawRef.current());
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [canvasRef]);

  const xOf = (e: React.PointerEvent): number => e.clientX - e.currentTarget.getBoundingClientRect().left;
  const yOf = (e: React.PointerEvent): number => e.clientY - e.currentTarget.getBoundingClientRect().top;
  const tipBox = tip && an && curve ? bandTip(tip.band, settings, an, curve) : null;
  return (
    <div className={"card" + (full ? " full" : "")} id="chartCard">
      <h2>SWR vs. frequency <Help align="start" text={touch
        ? "Drag along the chart to read the SWR; tap to clear the reading. Tap to pin your own marker; tap it again to remove it. Zoom, then drag across a range, to zoom in."
        : "Click to pin a marker, click a pin to remove it. Drag or scroll to zoom, Shift + scroll or middle-drag to pan, double-click to reset."} /> {resNote && <span id="resNote">{resNote}</span>}
        <span className="tools">
          {touch && an && <button id="chartZoom" className={"small" + (zoomDrag ? " on" : "")} onClick={() => setZoomDrag(!zoomDrag)}>Zoom</button>}
          {full
            ? <button id="chartFull" className="small on" onClick={() => setFull(false)}>Done</button>
            : <button id="chartFull" className="small" onClick={() => setFull(true)}>⤢ Full screen</button>}
        </span>
      </h2>
      {an && <Chips an={an} view={view} onView={onView} />}
      <canvas id="chart" ref={canvasRef}
        style={panning ? { cursor: "grabbing" } : snap === "pin" || tip ? { cursor: "pointer" } : undefined}
        // Stops the middle button's autoscroll.
        onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
        onPointerDown={(e) => {
          const g = geom.current;
          if (!g) return;
          const x = xOf(e), y = yOf(e);
          if (e.button === 1) {
            // The middle button pans, when there is a zoom to pan.
            e.preventDefault();
            if (!view) return;
            drag.current = { x0: x, y0: y, x1: x, zoom: false, finger: false, t0: e.timeStamp, showing: false, pan: [g.lo, g.hi] };
            e.currentTarget.setPointerCapture(e.pointerId);
            setPanning(true); clearHover();
            return;
          }
          // A finger reads the curve, and only zooms when Zoom is on.
          const finger = e.pointerType !== "mouse";
          drag.current = { x0: x, y0: y, x1: x, zoom: !finger || zoomDrag, finger, t0: e.timeStamp, showing: hoverF !== null };
          e.currentTarget.setPointerCapture(e.pointerId);
          if (!drag.current.zoom) hoverAt(x, y, e.clientX, e.clientY, true);
        }}
        onPointerMove={(e) => {
          const x = xOf(e), g = geom.current, d = drag.current;
          if (d?.pan) {
            if (!g) return;
            const shift = ((x - d.x0) * (d.pan[1] - d.pan[0])) / (g.x1 - g.x0);
            onView(fit(d.pan[0] - shift, d.pan[1] - shift));
            return;
          }
          if (d) d.x1 = x;
          // A zoom being dragged shows its selection, not the hover.
          if (d?.zoom && Math.abs(d.x1 - d.x0) > 6) { setTip(null); setSnap(null); draw(); return; }
          hoverAt(x, yOf(e), e.clientX, e.clientY, e.pointerType !== "mouse");
        }}
        onPointerUp={(e) => {
          const g = geom.current, d = drag.current;
          drag.current = null;
          if (!d || !g) return;
          if (d.pan) { setPanning(false); return; }
          const moved = Math.abs(d.x1 - d.x0) > 6;
          if (moved && d.zoom) { onView(fit(freqAt(g, Math.min(d.x0, d.x1)), freqAt(g, Math.max(d.x0, d.x1)))); setZoomDrag(false); }
          else if (d.finger && !d.zoom && (moved || e.timeStamp - d.t0 > 350)) { draw(); return; } // a reading: it stays
          else if (d.finger && d.showing) clearHover(); // a tap clears the reading
          else if (!moved && d.x0 >= g.x0 && d.x0 <= g.x1) {
            // A click on a snapped pin removes it. Anywhere else it pins,
            // at the key point itself when the click snapped to one.
            const p = snapAt(d.x0, d.y0, d.finger);
            if (p?.kind === "pin") onTogglePin(p.f, 1e-9);
            else onTogglePin(p ? p.f : freqAt(g, d.x0), 0);
            if (d.finger) clearHover();
          }
          draw();
        }}
        onPointerCancel={() => { drag.current = null; setPanning(false); }}
        // A finger has no hover: its reading stays until the next tap.
        onPointerLeave={(e) => { if (e.pointerType === "mouse" && !drag.current) clearHover(); }}
        onDoubleClick={() => onView(null)}
      />
      {tip && tipBox && (
        <div className="chartTip" style={{
          ...(tip.cx > window.innerWidth - 260 ? { right: window.innerWidth - tip.cx + 14 } : { left: tip.cx + 14 }),
          ...(tip.cy > window.innerHeight - 100 ? { bottom: window.innerHeight - tip.cy + 14 } : { top: tip.cy + 14 }),
        }}>
          <b>{tipBox.name}</b> · {tipBox.swr}
          <div><span className={"pill " + (tipBox.ok === "all" ? "ok" : tipBox.ok === "part" ? "part" : "no")}>{tipBox.usable}</span></div>
        </div>
      )}
      <div className="legend">
        <span><i style={{ background: "var(--ok)" }}></i>Usable</span>
        <span><i style={{ background: "var(--match)" }}></i>Under Max SWR, outside your segments</span>
        <span><i style={{ background: "rgba(248,81,73,.7)" }}></i>SWR too high</span>
        <span><i style={{ background: "var(--data)" }}></i>CW / RTTY / data</span>
        <span><i style={{ background: "var(--phone)" }}></i>Phone / image</span>
        <span><i style={{ background: "var(--cw)" }}></i>CW only</span>
        <span><i style={{ background: "var(--all)" }}></i>All modes / 60 m channel</span>
      </div>
    </div>
  );
}
