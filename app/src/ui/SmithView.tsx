/* The chart card's Smith chart, and its readout beside it.
 *
 * The readout gives one frequency: the one under the pointer, or else the
 * pin added last, or else the sweep's dip in view. Each line shown gets a row there, the sweep first and
 * then the kept sweeps newest first, with its impedance and SWR at that
 * frequency. Under them, the sweep's reactance as a part, its S11 and its
 * return loss.
 *
 * The pointer reads the nearest reading on the line nearest it, as only
 * readings are measured. It snaps to a pin, the dip or the typed frequency
 * when close, as on the SWR chart. A click pins the
 * frequency, or unpins a pin. On a touch screen a drag reads, the reading
 * stays when the finger lifts, and the next tap clears it.
 *
 * The wheel zooms about the pointer, a drag pans while zoomed in, and a
 * double-click zooms back out. On a touch screen two fingers pinch to zoom
 * and pan, and a pinch all the way out zooms back out. While zoomed in,
 * Zoom out shows on the chart, for a touch screen above all. A new range of
 * frequencies zooms back out too. The zoom is App's, so Chart (.png) saves
 * the chart as it shows.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { swrAt } from "@/analysis";
import { fmtF } from "@/format";
import { impedance, isEstimate, reactancePart, returnLoss, s11At } from "@/smith";
import type { S11 } from "@/touchstone";
import { drawnKept, type Showing } from "./ChartCard";
import { fitCanvas } from "./draw-photo";
import type { Readings } from "./draw-chart";
import { drawSmith, nearestF, zoomAbout, type SmithGeom, type SmithPoint, type SmithScene, type Zoom } from "./draw-smith";
import { Help } from "./Help";
import { dipIn, keptNumber, swrOn, type Curve, type Kept, type Settings } from "./model";
import { useNoSwipe } from "./useNoSwipe";

/** S11 of the sweep, and of each kept sweep, oldest first. A kept sweep with
 *  no Touchstone text has none. */
export interface SmithData { latest: S11; kept: readonly (S11 | null)[] }

/** How far from a line, in CSS pixels, the pointer still reads it. A finger gets more room. */
const REACH = 24, FINGER_REACH = 40;
/** How far from a point, in CSS pixels, the pointer snaps to it, as on the SWR chart. */
const SNAP = 14, FINGER_SNAP = 24;

/** The kept sweeps the Smith chart shows, newest first, with their numbers. */
function keptLines(data: SmithData, showing: Showing | null): { g: S11; n: number; k: Kept }[] {
  const drawn = drawnKept(showing);
  return drawn.flatMap((k, i) => (k.on && data.kept[i] ? [{ g: data.kept[i]!, n: keptNumber(drawn, i), k }] : [])).sort((a, b) => a.n - b.n);
}

/** The frequency the readout gives: the one under the pointer, or else the
 *  pin added last, or else the sweep's dip in view. `what` names it: Pin,
 *  Dip, or nothing. The matching network card gives the same one. */
export function readoutF(latest: S11 | null, curve: Curve | null, range: [number, number], manual: readonly number[],
  hoverF: number | null): { f: number | null; what: string; dip: number | null } {
  const inView = (m: number): boolean => m >= range[0] && m <= range[1];
  const dip = latest && curve ? dipIn(curve.f, curve.s, range[0], range[1]) : null;
  const lastPin = latest ? [...manual].reverse().find((m) => inView(m) && s11At(latest, m)) : undefined;
  const f = hoverF !== null && inView(hoverF) ? hoverF : lastPin ?? dip?.f ?? null;
  return { f, what: f === null ? "" : manual.includes(f) ? "Pin" : f === dip?.f ? "Dip" : "", dip: dip?.f ?? null };
}

export function smithScene(data: SmithData, curve: Curve | null, showing: Showing | null, settings: Settings, range: [number, number],
  manual: readonly number[], probe: number | null, hoverF: number | null, readings: Readings | null, zoom: Zoom | null = null): SmithScene {
  return {
    settings, range, manual, probe, hoverF, readings, zoom,
    // One SWR for a frequency between readings: the SWR chart's.
    swr: curve ? (f: number) => swrOn(curve, f) : null,
    latest: !showing || showing.curveOn ? data.latest : null,
    kept: keptLines(data, showing).map(({ g, n }) => ({ g, n })),
  };
}

/** `n` as the readout rounds it, with no −0.0: a noisy reading just past
 *  the rim gives a resistance a hair under 0. */
const ohms = (n: number): string => (Math.abs(n) >= 1000 ? Math.round(n).toString() : Math.abs(n) < 0.05 ? "0.0" : n.toFixed(1));
/** The sign before j for reactance x, + when it rounds to 0. */
const jSign = (x: number): string => (x < 0 && ohms(x) !== "0.0" ? "−" : "+");

/** R ± jX in ohms. */
export function fmtZ([r, x]: [number, number]): string {
  if (!Number.isFinite(r)) return "open";
  return `${ohms(r)} ${jSign(x)} j${ohms(Math.abs(x))} Ω`;
}

/** Under this reactance in ohms, the readout calls the load close to resonant. */
const NEAR_RESONANT = 5;

/** A reactance as the part that has it, such as `46 nH (inductive)`. Close
 *  to j0 the part is large and says little, so the readout gives the ohms. */
function fmtPart(x: number, f: number): string {
  if (Math.abs(x) < NEAR_RESONANT) return `Close to resonant (${jSign(x)}j${ohms(Math.abs(x))} Ω)`;
  const { kind, value } = reactancePart(x, f);
  const [big, small] = kind === "L" ? ["µH", "nH"] : ["nF", "pF"];
  const v = value >= 1000 ? value / 1000 : value, u = value >= 1000 ? big : small;
  return `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v)} ${u} (${kind === "L" ? "inductive" : "capacitive"})`;
}

/** A reference impedance as the help gives it, such as `50`. */
const fmtZ0 = (z0: number): string => String(+z0.toFixed(1));

/** What each thing in the readout means, at reference impedance z0. */
const readoutHelp = (z0: number): React.ReactElement => (
  <dl className="readHelp">
    <dt><span className="n latest">L</span> <span className="n k1">1</span></dt><dd>One row per sweep: L is the latest sweep, and the numbers are kept sweeps. Every row is read at the same frequency.</dd>
    <dt>Impedance</dt><dd>Resistance ± reactance, in ohms. A perfect match is {fmtZ0(z0)} + j0. A + sign means inductive, a − sign means capacitive, and j0 means resonant.</dd>
    <dt>SWR</dt><dd>1.00 is a perfect match. A higher number means more power reflects back to the radio.</dd>
    <dt>Reactance</dt><dd>The latest sweep's reactance as a part: a coil in nH or a capacitor in pF, at this frequency. When the reactance is under {NEAR_RESONANT} Ω, the readout says close to resonant and gives the reactance in ohms instead.</dd>
    <dt>S11</dt><dd>For the latest sweep: the size of the reflected signal compared with the signal sent, from 0 (none) to 1 (all), and the angle of the reflection. S11 compares voltages, not power: 0.5 means a quarter of the power reflects back.</dd>
    <dt>Return loss</dt><dd>For the latest sweep: how much weaker the reflected signal is than the signal sent, in dB. Higher is better. 10 dB is SWR 1.92, and 20 dB is SWR 1.22.</dd>
    <dt>≈</dt><dd>The frequency falls between two readings that are far apart on the chart, so the value is an estimate.</dd>
  </dl>
);

const fmtSwr = (w: number): string => (Number.isNaN(w) ? "—" : w >= 999 ? "≥999" : w.toFixed(2));

export function SmithView({ data, settings, range, curve, showing, manual, probe, hoverF, onHover, onTogglePin, touch, readings, zoom, onZoom }: {
  data: SmithData;
  readings: Readings | null;
  zoom: Zoom | null;
  onZoom(z: Zoom | null): void;
  settings: Settings;
  range: [number, number];
  curve: Curve | null;
  showing: Showing | null;
  manual: readonly number[];
  probe: number | null;
  hoverF: number | null;
  onHover(f: number | null): void;
  onTogglePin(f: number, tolerance: number): void;
  touch: boolean;
}): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  const geom = useRef<SmithGeom | null>(null);
  /** A press: where it began, and for a mouse while zoomed in, the zoom then, to pan from. */
  const press = useRef<{ x: number; y: number; t0: number; moved: boolean; finger: boolean; showing: boolean; before: number | null; z: Zoom | null } | null>(null);
  /** The fingers down, and a pinch: where its fingers began and the zoom then. */
  const fingers = useRef(new Map<number, [number, number]>());
  const pinch = useRef<{ d: number; mid: [number, number]; z: Zoom | null } | null>(null);
  const [snap, setSnap] = useState<SmithPoint["kind"] | null>(null);
  const [panning, setPanning] = useState(false);
  useEffect(() => onZoom(null), [range[0], range[1]]);
  const scene = smithScene(data, curve, showing, settings, range, manual, probe, hoverF, readings, zoom);

  const draw = (): void => {
    const c = ref.current, ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
    fitCanvas(c, ctx, Math.round(W * dpr), Math.round(H * dpr));
    geom.current = drawSmith(ctx, W, H, dpr, scene);
  };
  const drawRef = useRef(draw);
  useLayoutEffect(() => { drawRef.current = draw; draw(); });
  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => drawRef.current());
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  useNoSwipe(ref);

  // Wheel: zoom about the pointer. Over the chart the wheel never scrolls the page.
  const onWheel = (e: WheelEvent): void => {
    const c = ref.current;
    if (!c) return;
    e.preventDefault();
    const r = c.getBoundingClientRect(), p: [number, number] = [e.clientX - r.left, e.clientY - r.top];
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    onZoom(zoomAbout(zoom, p, p, (zoom?.k ?? 1) * Math.exp(-e.deltaY * unit * 0.002), c.clientWidth, c.clientHeight));
  };
  const wheelRef = useRef(onWheel);
  wheelRef.current = onWheel;
  // React's wheel listener is passive and cannot stop the page scrolling.
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const h = (e: WheelEvent): void => wheelRef.current(e);
    c.addEventListener("wheel", h, { passive: false });
    return () => c.removeEventListener("wheel", h);
  }, []);
  const size = (): [number, number] => [ref.current?.clientWidth ?? 0, ref.current?.clientHeight ?? 0];
  /** The two fingers' distance apart and their midpoint. */
  const span = (): { d: number; mid: [number, number] } => {
    const [a, b] = [...fingers.current.values()] as [[number, number], [number, number]];
    return { d: Math.max(Math.hypot(a[0] - b[0], a[1] - b[1]), 1), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
  };
  const lift = (e: React.PointerEvent): boolean => {
    fingers.current.delete(e.pointerId);
    if (!pinch.current) return false;
    // A pinch ends with its first finger up, and the other finger does nothing more.
    if (fingers.current.size < 2) pinch.current = null;
    return true;
  };

  const at = (e: React.PointerEvent): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  /** The point nearest (x, y), if one is close enough to snap to. Pins come last, so a pin wins a tie. */
  const snapAt = (x: number, y: number, finger: boolean): SmithPoint | null => {
    let best: SmithPoint | null = null, bd = finger ? FINGER_SNAP : SNAP;
    for (const p of geom.current?.points ?? []) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= bd) { bd = d; best = p; }
    }
    return best;
  };
  /** The frequency at (x, y): a point snapped to, or the nearest line. */
  const freqAt = (x: number, y: number, finger: boolean, p: SmithPoint | null): number | null =>
    p?.f ?? (geom.current ? nearestF(geom.current, x, y, finger ? FINGER_REACH : REACH) : null);
  const read = (x: number, y: number, finger: boolean): void => {
    const p = snapAt(x, y, finger);
    setSnap(p?.kind ?? null);
    const f = freqAt(x, y, finger, p);
    if (f !== hoverF) onHover(f);
  };
  const pinHere = (x: number, y: number, finger: boolean): void => {
    const p = snapAt(x, y, finger);
    if (p?.kind === "pin") { onTogglePin(p.f, 1e-9); return; }
    const f = freqAt(x, y, finger, p);
    if (f !== null) onTogglePin(f, 0);
  };

  const latestOn = scene.latest !== null;
  const { f, what } = readoutF(scene.latest, curve, range, manual, hoverF);
  // Over a pin or the typed frequency, what a click does, as the SWR chart says it.
  const act = f !== hoverF ? "" : snap === "pin" ? (touch ? "tap to unpin" : "click to unpin") : snap === "probe" ? (touch ? "tap to pin" : "click to pin") : "";
  const kept = keptLines(data, showing);
  const g = f !== null && latestOn ? s11At(data.latest, f) : null;
  const z = g ? impedance(g[0], g[1], data.latest.z0) : null;
  const mag = g ? Math.hypot(g[0], g[1]) : 0;
  // A pin or the typed frequency can fall between readings: mark an estimate.
  const est = f !== null && latestOn && isEstimate(data.latest, f) ? "≈ " : "";
  // Return loss from the SWR the readout gives, so the two agree.
  const w = f !== null ? swrOn(curve, f) : NaN, rl = Number.isNaN(w) ? mag : (w - 1) / (w + 1);
  const name = showing?.curveName ?? "Latest";
  // The kept sweep the sweep is, as its pill marks it.
  const same = showing && showing.same >= 0 ? keptNumber(showing.kept, showing.same) : null;

  return (
    <div className="smith">
      <canvas id="smith" ref={ref} style={panning ? { cursor: "grabbing" } : snap === "pin" || snap === "probe" ? { cursor: "pointer" } : undefined}
        onDoubleClick={() => onZoom(null)}
        onPointerDown={(e) => {
          const [x, y] = at(e), finger = e.pointerType !== "mouse";
          if (finger) fingers.current.set(e.pointerId, [x, y]);
          e.currentTarget.setPointerCapture(e.pointerId);
          if (fingers.current.size === 2) {
            // A second finger: a pinch, not a reading. The reading goes back to what it was.
            pinch.current = { ...span(), z: zoom };
            if (press.current) onHover(press.current.before);
            press.current = null;
            return;
          }
          if (pinch.current) return;
          press.current = { x, y, t0: e.timeStamp, moved: false, finger, showing: hoverF !== null, before: hoverF, z: zoom && !finger ? zoom : null };
          if (finger) read(x, y, true);
        }}
        onPointerMove={(e) => {
          const [x, y] = at(e), p = press.current, pi = pinch.current;
          if (fingers.current.has(e.pointerId)) fingers.current.set(e.pointerId, [x, y]);
          if (pi) {
            const now = span();
            onZoom(zoomAbout(pi.z, pi.mid, now.mid, (pi.z?.k ?? 1) * (now.d / pi.d), ...size()));
            return;
          }
          // A finger only reads while it presses.
          if (!p && e.pointerType !== "mouse") return;
          if (p && Math.hypot(x - p.x, y - p.y) > 6) p.moved = true;
          // A mouse drag pans while zoomed in.
          if (p?.z && p.moved) { setPanning(true); onZoom(zoomAbout(p.z, [p.x, p.y], [x, y], p.z.k, ...size())); return; }
          if (!p || p.finger || !p.moved) read(x, y, e.pointerType !== "mouse");
        }}
        onPointerUp={(e) => {
          const p = press.current;
          press.current = null;
          setPanning(false);
          if (lift(e) || !p) return;
          if (p.finger && (p.moved || e.timeStamp - p.t0 > 350)) return; // a reading: it stays
          if (p.finger && p.showing) { onHover(null); return; } // a tap clears the reading
          if (!p.moved) pinHere(p.x, p.y, p.finger);
          if (p.finger) onHover(null);
        }}
        onPointerCancel={(e) => { lift(e); press.current = null; setPanning(false); }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse" && !press.current) { setSnap(null); onHover(null); } }}
      />
      {zoom && <button type="button" id="smithZoomOut" className="small" onClick={() => onZoom(null)}>Zoom out</button>}
      <div className="smithRead" id="smithRead">
        {f === null ? (
          <p className="hint">{touch ? "Touch a line to read it." : "Point at a line to read it."}</p>
        ) : (
          <>
            <div className="at">{fmtF(f)} MHz{(what || act) && <span>{[what, act].filter(Boolean).map((t) => ` · ${t}`).join("")}</span>}<Help align="start" label="What the readout shows" text={readoutHelp(data.latest.z0)} /></div>
            <table>
              <thead><tr><th></th><th>Impedance</th><th>SWR</th></tr></thead>
              <tbody>
                {latestOn && (
                  <tr><td><span className="n latest" title={name}>L</span>{same && <span className={`n k${same}`} title={`Kept ${same}`}>{same}</span>}</td><td className="num">{z ? est + fmtZ(z) : "—"}</td><td className="num">{fmtSwr(w)}</td></tr>
                )}
                {kept.map(({ g: kg, n, k }) => {
                  const kz = s11At(kg, f), kest = isEstimate(kg, f) ? "≈ " : "";
                  return (
                    <tr key={n} className={`k${n}`}><td><span className="n" title={`Kept ${n}`}>{n}</span></td>
                      <td className="num">{kz ? kest + fmtZ(impedance(kz[0], kz[1], kg.z0)) : "—"}</td><td className="num">{fmtSwr(swrAt(k.f, k.s, f))}</td></tr>
                  );
                })}
              </tbody>
            </table>
            {z && g && (
              <dl>
                <dt>Reactance</dt><dd>{est + fmtPart(z[1], f)}</dd>
                <dt>S11</dt><dd>{est}{mag.toFixed(3)} ∠ {Math.round((Math.atan2(g[1], g[0]) * 180) / Math.PI)}°</dd>
                <dt>Return loss</dt><dd>{rl > 0.001 ? `${returnLoss(rl).toFixed(1)} dB` : "> 60 dB"}</dd>
              </dl>
            )}
          </>
        )}
      </div>
    </div>
  );
}
