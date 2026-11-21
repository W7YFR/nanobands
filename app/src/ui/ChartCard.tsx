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
 *
 * With sweeps kept, a row of pills under the chips shows or hides each line:
 * the sweep itself (Latest, or Live while Live sweeps), the kept sweeps
 * newest first, and the dip path. Each pill names its line's dip in view.
 * While the sweep is a kept sweep, as before the next sweep comes in, the
 * two are one line: the sweep's pill wears the kept sweep's number, and the
 * kept sweep has no pill of its own.
 * Over a pill, or with it focused from the keyboard, a tooltip names its
 * line and gives the line's range. Keeping and dropping sweeps is the
 * NanoVNA panel's work, not the chart's.
 *
 * NanoVNA and file data have the phase of S11 too, so for them a switch
 * turns the chart into a Smith chart. It shows the frequencies the chips
 * pick, the pills show and hide its lines, and Line, Points and Both show
 * the sweep as on the SWR chart. The SWR scale, Zoom and the dip path are the
 * SWR chart's, so their controls go while it shows.
 */

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Analysis } from "@/analysis";
import { bandsInRange } from "@/bands";
import { fmtF } from "@/format";
import { Help } from "./Help";
import { bandTip, drawChart, freqAt, type ChartGeom, type KeyKind, type KeyPoint, type Readings } from "./draw-chart";
import { fitCanvas } from "./draw-photo";
import type { Band } from "@/bands";
import { bandView, dipIn, fitView, keptNumber, sameView, type ChartKind, type Curve, type FineSpan, type Kept, type ScaleTop, type Settings } from "./model";
import { SmithView, type SmithData } from "./SmithView";
import type { Zoom } from "./draw-smith";
import { Switch } from "./Switch";
import { useNoSwipe } from "./useNoSwipe";

const READINGS: { value: Readings; label: string }[] = [{ value: "line", label: "Line" }, { value: "points", label: "Points" }, { value: "both", label: "Both" }];
const SCALES: { value: ScaleTop; label: string }[] = [{ value: "3", label: "3" }, { value: "5", label: "5" }, { value: "10", label: "10" }];
const CHARTS: { value: ChartKind; label: string }[] = [{ value: "swr", label: "SWR" }, { value: "smith", label: "Smith" }];

function Chips({ an, view, onView, fine }: {
  an: Analysis; view: [number, number] | null; onView(v: [number, number] | null): void; fine: readonly FineSpan[];
}): React.ReactElement {
  const chips: [string, [number, number] | null][] = [["Full sweep", null], ...bandsInRange(an.fmin, an.fmax).map((b): [string, [number, number]] => [b.name, bandView(an, b)])];
  return (
    <div className="chips" id="chips">
      {chips.map(([name, v]) => (
        <button key={name} className={(sameView(v, view) ? "on" : "") + (fine.some((f) => f.band === name) ? " fined" : "")}
          title={fine.some((f) => f.band === name) ? "Fine sweep, with calibration filled in" : undefined} onClick={() => onView(v)}>{name}</button>
      ))}
    </div>
  );
}

/** The lines the pills show or hide, and the switches for them. */
export interface Showing {
  kept: readonly Kept[];
  /** The index of the kept sweep the sweep is, oldest first, or -1. */
  same: number;
  /** The sweep's name: Latest, or Live while Live sweeps. */
  curveName: "Latest" | "Live";
  curveOn: boolean;
  dipPath: boolean;
  onCurve(on: boolean): void;
  /** Show or hide a kept sweep, by its index, oldest first. */
  onToggle(i: number): void;
  onDipPath(on: boolean): void;
}

/** The kept sweeps as the chart draws them: the one the sweep is draws as the sweep, so not again. */
export const drawnKept = (s: Showing | null): readonly Kept[] =>
  (s ? s.kept.map((k, i) => (i === s.same && k.on ? { ...k, on: false } : k)) : []);

/** A frequency in MHz with no trailing zeros, as the NanoVNA panel gives a range. */
const mhz = (f: number): number => +f.toFixed(6);

/** A line's range, such as `3–55 MHz`. */
const rangeOf = (f: Float64Array): string => `${mhz(f[0]!)}–${mhz(f[f.length - 1]!)} MHz`;

/** What a pill's tooltip says: the line's name, and its range or what it does. */
interface TipText { name: string; text: string }

/** One pill: a line's mark, its name, and a click to hide or show it. A
 *  mouse over it, or keyboard focus on it, shows its tooltip under it. */
function Pill({ cls, on, tip, onTip, onClick, children }: {
  cls: string; on: boolean; tip: TipText; onTip(t: { tip: TipText; at: DOMRect } | null): void; onClick(): void; children: React.ReactNode;
}): React.ReactElement {
  const show = (el: HTMLElement): void => onTip({ tip, at: el.getBoundingClientRect() });
  return (
    <span className={"keptChip " + cls + (on ? "" : " off")}>
      <button type="button" aria-pressed={on} aria-description={`${tip.name} · ${tip.text}`} onClick={onClick}
        onPointerEnter={(e) => { if (e.pointerType === "mouse") show(e.currentTarget); }}
        onPointerLeave={() => onTip(null)}
        onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) show(e.currentTarget); }}
        onBlur={() => onTip(null)}>
        {children}
      </button>
    </span>
  );
}

/** `zoomed`: the chart shows less than the full sweep, so the dip path draws.
 *  `path`: the chart has a dip path, as the Smith chart has not. */
export function ShowRow({ showing: k, curve, range, top, zoomed, path = true }: {
  showing: Showing; curve: Curve | null; range: [number, number]; top: number; zoomed: boolean; path?: boolean;
}): React.ReactElement {
  const dip = (f: Float64Array, s: Float64Array): React.ReactNode => {
    const d = dipIn(f, s, range[0], range[1]);
    return d ? `${fmtF(d.f)} · ${d.s >= top ? "≥" + top : d.s.toFixed(2)}` : <span className="none">No dip</span>;
  };
  const live = k.curveName === "Live";
  const [tip, setTip] = useState<{ tip: TipText; at: DOMRect } | null>(null);
  // A pill that goes takes its tooltip with it.
  useEffect(() => setTip(null), [k.kept.length, k.same]);
  const same = k.same >= 0 ? keptNumber(k.kept, k.same) : null;
  return (
    <div className="kept" id="showRow">
      <span className="keptChips">
        <Pill cls={"now" + (live ? " live" : "")} on={k.curveOn} onTip={setTip} onClick={() => k.onCurve(!k.curveOn)}
          tip={{ name: k.curveName, text: (same ? `Kept ${same} · ` : "") + (curve ? rangeOf(curve.f) : "No sweep") }}>
          {live ? <i className="pulse" /> : <span className="n latest" aria-hidden="true">L</span>}{same && <span className={`n k${same}`}>{same}</span>}{k.curveName} · {curve ? dip(curve.f, curve.s) : "—"}
        </Pill>
        {k.kept.map((x, i) => ({ x, i, n: keptNumber(k.kept, i) })).reverse().filter(({ i }) => i !== k.same).map(({ x, i, n }) => (
          <Pill key={n} cls={`k${n}`} on={x.on} onTip={setTip} onClick={() => k.onToggle(i)} tip={{ name: `Kept ${n}`, text: rangeOf(x.f) }}>
            <span className="n">{n}</span>{dip(x.f, x.s)}
          </Pill>
        ))}
        {path && <Pill cls="path" on={k.dipPath} onTip={setTip} onClick={() => k.onDipPath(!k.dipPath)}
          tip={{ name: "Dip path", text: zoomed ? "Joins the kept sweeps' dips to the sweep's dip" : "Pick a band to see the dip path" }}>
          <span className="sw" />Dip path
        </Pill>}
      </span>
      {tip && (
        <div className="chartTip" id="pillTip" style={{
          top: tip.at.bottom + 6,
          ...(tip.at.left > window.innerWidth - 260 ? { right: window.innerWidth - tip.at.right } : { left: tip.at.left }),
        }}>
          <b>{tip.tip.name}</b> · {tip.tip.text}
        </div>
      )}
    </div>
  );
}

export function ChartCard({ canvasRef, an, curve, settings, view, onView, manual, probe, onTogglePin, hoverF, onHover, resNote, fine = [], readings = null, onReadings, live = null, scaleTop = null, onScaleTop, showing = null, smith = null, chart = "swr", onChart, smithZoom = null, onSmithZoom = () => undefined }: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  an: Analysis | null;
  curve: Curve | null;
  settings: Settings;
  view: [number, number] | null;
  onView(v: [number, number] | null): void;
  manual: readonly number[];
  probe: number | null;
  onTogglePin(f: number, tolerance: number): void;
  hoverF: number | null;
  onHover(f: number | null): void;
  resNote: string;
  /** The bands fine sweeps filled in. */
  fine?: readonly FineSpan[];
  /** The top of the SWR scale, or null for a photo, whose scale comes from the photo. */
  scaleTop?: ScaleTop | null;
  onScaleTop?(v: ScaleTop): void;
  /** While Live sweeps: the band it sweeps, "" for the whole range. Null when not live. */
  live?: string | null;
  /** How to show readings, or null for a photo's trace, which has none. */
  readings?: Readings | null;
  onReadings?(v: Readings): void;
  /** The pills, with sweeps kept. Null with none. */
  showing?: Showing | null;
  /** S11 for the Smith chart, or null for a photo, which has none. */
  smith?: SmithData | null;
  chart?: ChartKind;
  onChart?(v: ChartKind): void;
  /** How far the Smith chart is zoomed in, or null zoomed out. */
  smithZoom?: Zoom | null;
  onSmithZoom?(z: Zoom | null): void;
}): React.ReactElement {
  const geom = useRef<ChartGeom | null>(null);
  /** A press on the chart. `pan` holds the view it started from. */
  const drag = useRef<{ x0: number; y0: number; x1: number; zoom: boolean; finger: boolean; t0: number; showing: boolean; pan?: [number, number] } | null>(null);
  const range: [number, number] | null = an ? view ?? [an.fmin, an.fmax] : null;
  const drawn = drawnKept(showing);
  /** The key point the hover snapped to, and the band under the pointer. */
  const [snap, setSnap] = useState<KeyKind | null>(null);
  const [tip, setTip] = useState<{ band: Band; cx: number; cy: number } | null>(null);
  const [panning, setPanning] = useState(false);
  /** On a touch screen: the next drag zooms instead of reading the curve. */
  const [zoomDrag, setZoomDrag] = useState(false);
  const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const [full, setFull] = useState(false);
  const isSmith = !!smith && chart === "smith" && !!range;
  /** The Smith chart's reference impedance, for its help: usually 50 ohms. */
  const z0 = +(smith?.latest.z0 ?? 50).toFixed(1);

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
    // The Smith chart shows instead, and the SWR chart waits, hidden.
    if (!c || !ctx || c.hidden) return;
    const dpr = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
    fitCanvas(c, ctx, Math.round(W * dpr), Math.round(H * dpr));
    geom.current = drawChart(ctx, W, H, dpr, {
      settings, an, curve, range, manual, probe, hoverF, drag: drag.current?.zoom ? drag.current : null, fine, readings,
      kept: drawnKept(showing), dipPath: !!showing?.dipPath, hideCurve: !!showing && !showing.curveOn, curveName: showing?.curveName ?? "Latest",
      snap, hoverNote: snap === "pin" ? (touch ? "tap to unpin" : "click to unpin") : snap === "probe" ? (touch ? "tap to pin" : "click to pin") : undefined,
    });
  };

  const fit = (lo: number, hi: number): [number, number] | null => (an ? fitView(an, lo, hi) : null);

  /** The key point nearest (x, y), if one is close enough to snap to. */
  const snapAt = (x: number, y: number, finger: boolean): KeyPoint | null => {
    const g = geom.current;
    let best: KeyPoint | null = null, bd = finger ? 24 : 14;
    // Pins come last, so a pin wins over a key point under it.
    for (const p of g?.points ?? []) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= bd) { bd = d; best = p; }
    }
    // Points shows only readings, so the hover and a click take the nearest one.
    if (!best && readings === "points" && g?.readings.length && x >= g.x0 && x <= g.x1) {
      const fx = freqAt(g, x), f = g.readings.reduce((a, b) => (Math.abs(b - fx) < Math.abs(a - fx) ? b : a));
      best = { kind: "reading", f, x, y };
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
      <h2>
        {/* First, so it holds still when the chart changes and the tools after the title come and go. */}
        {smith && onChart && <Switch id="chartKind" label="Chart" value={chart} options={CHARTS} onChange={onChart} />}
        <span className="title">{isSmith ? "Smith chart" : "SWR vs. frequency"}</span> <Help align="start" text={isSmith
        ? (touch
          ? `The middle is a perfect ${z0} Ω match. The farther a line is from the middle, the higher the SWR. The top half is inductive, and the bottom half is capacitive. Drag along a line to read the impedance there. Tap to clear the reading. Tap a line to add a pin, and tap a pin to remove the pin. Pinch to zoom. The band chips pick the frequencies shown.`
          : `The middle is a perfect ${z0} Ω match. The farther a line is from the middle, the higher the SWR. The top half is inductive, and the bottom half is capacitive. Point at a line to read the impedance there. Click a line to add a pin. Click a pin to remove the pin. Scroll to zoom, drag to pan, double-click to reset. The band chips pick the frequencies shown.`)
        : touch
          ? "Drag along the chart to read the SWR. Tap to clear the reading. Tap the chart to add a pin, and tap a pin to remove the pin. To zoom in, tap Zoom, then drag across a range."
          : "Click to add a pin. Click a pin to remove the pin. Drag or scroll to zoom, Shift + scroll or middle-drag to pan, double-click to reset."} />
        {/* What Live sweeps, first: the rest of the chart holds still while it sweeps one band. */}
        {live !== null && <span id="liveNote"><i />{live ? `Live: ${live} only` : "Live"}</span>}
        {/* The ✦ before the count marks the fine-swept chips below too, so the note is their key. */}
        {resNote && <span id="resNote">{resNote}{fine.length > 0 && <> · <span className="star">✦</span> {fine.length} fine sweep{fine.length > 1 ? "s" : ""}</>}</span>}
        <span className="tools">
          {!isSmith && scaleTop && onScaleTop && (
            <span className="labeled" title="The top of the SWR scale">
              <span className="lbl" aria-hidden="true">SWR</span>
              <Switch id="scaleTop" label="Top of the SWR scale" value={scaleTop} options={SCALES} onChange={onScaleTop} />
            </span>
          )}
          {readings && onReadings && <Switch id="readingsShown" label="Readings shown" value={readings} options={READINGS} onChange={onReadings} />}
          {!isSmith && touch && an && <button id="chartZoom" className={"small" + (zoomDrag ? " on" : "")} onClick={() => setZoomDrag(!zoomDrag)}>Zoom</button>}
          {full
            ? <button id="chartFull" className="small on" onClick={() => setFull(false)}>Done</button>
            : <button id="chartFull" className="small" onClick={() => setFull(true)}>⤢ Full screen</button>}
        </span>
      </h2>
      {an && <Chips an={an} view={view} onView={onView} fine={fine} />}
      {showing && range && <ShowRow showing={showing} curve={curve} range={range} top={settings.top} zoomed={view !== null} path={!isSmith} />}
      {isSmith && smith && range && (
        <SmithView data={smith} settings={settings} range={range} curve={curve} showing={showing} manual={manual} probe={probe}
          hoverF={hoverF} onHover={onHover} onTogglePin={onTogglePin} touch={touch} readings={readings} zoom={smithZoom} onZoom={onSmithZoom} />
      )}
      <canvas id="chart" ref={canvasRef} hidden={isSmith}
        style={panning ? { cursor: "grabbing" } : snap === "pin" || snap === "probe" || tip ? { cursor: "pointer" } : undefined}
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
            // at the key point itself when the click snapped to one, such
            // as the typed frequency.
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
      {isSmith ? (
        <div className="legend">
          <span><i style={{ background: "var(--ok)" }}></i>Usable</span>
          <span><i style={{ background: "var(--match)" }}></i>Under Max SWR, outside your segments</span>
          <span><i style={{ background: "#e3c84a" }}></i>Over Max SWR</span>
          <span><i className="dash" style={{ "--k": "var(--bad)" } as React.CSSProperties}></i>Max SWR</span>
          {readings && readings !== "line" && <span><i className="dot"></i>Reading</span>}
          <span><i className="arrow"></i>Frequency rising</span>
          {drawn.some((k, i) => k.on && smith?.kept[i]) && (
            <span id="keptKey">{drawn.map((x, i) => ({ x, i, n: keptNumber(drawn, i) })).reverse().filter(({ x, i }) => x.on && smith?.kept[i])
              .map(({ n }) => <i key={n} className={`dash k${n}`}></i>)}Kept sweep</span>
          )}
        </div>
      ) : <div className="legend">
        <span><i style={{ background: "var(--ok)" }}></i>Usable</span>
        <span><i style={{ background: "var(--match)" }}></i>Under Max SWR, outside your segments</span>
        <span><i style={{ background: "rgba(248,81,73,.7)" }}></i>SWR too high</span>
        <span><i style={{ background: "var(--data)" }}></i>CW / RTTY / data</span>
        <span><i style={{ background: "var(--phone)" }}></i>Phone / image</span>
        <span><i style={{ background: "var(--cw)" }}></i>CW only</span>
        <span><i style={{ background: "var(--all)" }}></i>All modes / 60 m channel</span>
        {readings && readings !== "line" && <span><i className="dot"></i>Reading</span>}
        {readings && readings !== "line" && curve && curve.s.some((w) => w > settings.top) && <span><i className="tri"></i>Reading over the scale</span>}
        {drawn.some((k) => k.on) && (
          <span id="keptKey">{drawn.map((x, i) => ({ x, n: keptNumber(drawn, i) })).reverse().filter(({ x }) => x.on)
            .map(({ n }) => <i key={n} className={`dash k${n}`}></i>)}Kept sweep</span>
        )}
        {showing?.dipPath && view && drawn.some((k) => k.on) && <span id="dipKey"><i className="path"></i>Dip path</span>}
        {fine.length > 0 && <span id="fineKey"><i style={{ background: "var(--accent)" }}></i>Fine sweep, calibration filled in</span>}
      </div>}
    </div>
  );
}
