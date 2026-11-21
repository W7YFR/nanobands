/* The chart card's Smith chart, and its readout beside it.
 *
 * The readout gives one frequency: the one under the pointer, or else the
 * sweep's dip in view. Each line shown gets a row there, the sweep first and
 * then the kept sweeps newest first, with its impedance and SWR at that
 * frequency. Under them, the sweep's reactance as a part, its S11 and its
 * return loss.
 *
 * The pointer reads the line nearest it. A click pins the frequency, or
 * unpins a pin. On a touch screen a drag reads, the reading stays when the
 * finger lifts, and the next tap clears it.
 */

import { useLayoutEffect, useRef, useState } from "react";
import { swrAt } from "@/analysis";
import { fmtF } from "@/format";
import { impedance, reactancePart, returnLoss, s11At } from "@/smith";
import type { S11 } from "@/touchstone";
import { drawnKept, type Showing } from "./ChartCard";
import { fitCanvas } from "./draw-photo";
import { drawSmith, nearestF, type SmithGeom, type SmithScene } from "./draw-smith";
import { dipIn, keptNumber, swrOn, type Curve, type Kept, type Settings } from "./model";
import { useNoSwipe } from "./useNoSwipe";

/** S11 of the sweep, and of each kept sweep, oldest first. A kept sweep with
 *  no Touchstone text has none. */
export interface SmithData { latest: S11; kept: readonly (S11 | null)[] }

/** How far from a line, in CSS pixels, the pointer still reads it. A finger gets more room. */
const REACH = 24, FINGER_REACH = 40;

/** The kept sweeps the Smith chart shows, newest first, with their numbers. */
function keptLines(data: SmithData, showing: Showing | null): { g: S11; n: number; k: Kept }[] {
  const drawn = drawnKept(showing);
  return drawn.flatMap((k, i) => (k.on && data.kept[i] ? [{ g: data.kept[i]!, n: keptNumber(drawn, i), k }] : [])).sort((a, b) => a.n - b.n);
}

export function smithScene(data: SmithData, showing: Showing | null, settings: Settings, range: [number, number],
  manual: readonly number[], probe: number | null, hoverF: number | null): SmithScene {
  return {
    settings, range, manual, probe, hoverF,
    latest: !showing || showing.curveOn ? data.latest : null,
    kept: keptLines(data, showing).map(({ g, n }) => ({ g, n })),
  };
}

/** R ± jX in ohms. */
function fmtZ([r, x]: [number, number]): string {
  if (!Number.isFinite(r)) return "open";
  const v = (n: number): string => (Math.abs(n) >= 1000 ? Math.round(n).toString() : n.toFixed(1));
  return `${v(r)} ${x < 0 ? "−" : "+"} j${v(Math.abs(x))} Ω`;
}

/** A reactance as the part that has it, such as `46 nH` or `120 pF`. */
function fmtPart(x: number, f: number): string {
  const { kind, value } = reactancePart(x, f);
  const [big, small] = kind === "L" ? ["µH", "nH"] : ["nF", "pF"];
  const v = value >= 1000 ? value / 1000 : value, u = value >= 1000 ? big : small;
  return `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v)} ${u} (${kind === "L" ? "inductive" : "capacitive"})`;
}

const fmtSwr = (w: number): string => (Number.isNaN(w) ? "—" : w >= 999 ? "≥999" : w.toFixed(2));

export function SmithView({ data, settings, range, curve, showing, manual, probe, hoverF, onHover, onTogglePin, touch }: {
  data: SmithData;
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
  const press = useRef<{ x: number; y: number; t0: number; moved: boolean; finger: boolean; showing: boolean } | null>(null);
  const [onPin, setOnPin] = useState(false);
  const scene = smithScene(data, showing, settings, range, manual, probe, hoverF);

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

  const at = (e: React.PointerEvent): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const pinAt = (x: number, y: number, finger: boolean): number | null =>
    geom.current?.pins.find((p) => Math.hypot(p.x - x, p.y - y) <= (finger ? 18 : 10))?.f ?? null;
  const read = (x: number, y: number, finger: boolean): void => {
    const g = geom.current;
    const pin = pinAt(x, y, finger);
    setOnPin(pin !== null);
    const f = pin ?? (g ? nearestF(g, x, y, finger ? FINGER_REACH : REACH) : null);
    if (f !== hoverF) onHover(f);
  };
  const pinHere = (x: number, y: number, finger: boolean): void => {
    const pin = pinAt(x, y, finger);
    if (pin !== null) { onTogglePin(pin, 1e-9); return; }
    const f = geom.current ? nearestF(geom.current, x, y, finger ? FINGER_REACH : REACH) : null;
    if (f !== null) onTogglePin(f, 0);
  };

  // The readout's frequency: the one under the pointer, or the sweep's dip in view.
  const latestOn = scene.latest !== null;
  const dip = latestOn && curve ? dipIn(curve.f, curve.s, range[0], range[1]) : null;
  const f = hoverF !== null && hoverF >= range[0] && hoverF <= range[1] ? hoverF : dip?.f ?? null;
  const what = f === null ? "" : f === hoverF ? (manual.includes(f) ? "Pin" : "") : "Dip";
  const kept = keptLines(data, showing);
  const g = f !== null && latestOn ? s11At(data.latest, f) : null;
  const z = g ? impedance(g[0], g[1], data.latest.z0) : null;
  const mag = g ? Math.hypot(g[0], g[1]) : 0;
  const name = showing?.curveName ?? "Latest";
  // The kept sweep the sweep is, as its pill marks it.
  const same = showing && showing.same >= 0 ? keptNumber(showing.kept, showing.same) : null;

  return (
    <div className="smith">
      <canvas id="smith" ref={ref} style={onPin ? { cursor: "pointer" } : undefined}
        onPointerDown={(e) => {
          const [x, y] = at(e), finger = e.pointerType !== "mouse";
          press.current = { x, y, t0: e.timeStamp, moved: false, finger, showing: hoverF !== null };
          e.currentTarget.setPointerCapture(e.pointerId);
          if (finger) read(x, y, true);
        }}
        onPointerMove={(e) => {
          const [x, y] = at(e), p = press.current;
          if (p && Math.hypot(x - p.x, y - p.y) > 6) p.moved = true;
          if (!p || p.finger || !p.moved) read(x, y, e.pointerType !== "mouse");
        }}
        onPointerUp={(e) => {
          const p = press.current;
          press.current = null;
          if (!p) return;
          if (p.finger && (p.moved || e.timeStamp - p.t0 > 350)) return; // a reading: it stays
          if (p.finger && p.showing) { onHover(null); return; } // a tap clears the reading
          if (!p.moved) pinHere(p.x, p.y, p.finger);
          if (p.finger) onHover(null);
        }}
        onPointerCancel={() => { press.current = null; }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse" && !press.current) { setOnPin(false); onHover(null); } }}
      />
      <div className="smithRead" id="smithRead">
        {f === null ? (
          <p className="hint">{touch ? "Touch a line to read it." : "Point at a line to read it."}</p>
        ) : (
          <>
            <div className="at">{fmtF(f)} MHz{what && <span> · {what}</span>}</div>
            <table>
              <thead><tr><th></th><th>Impedance</th><th>SWR</th></tr></thead>
              <tbody>
                {latestOn && (
                  <tr><td><span className="n latest" title={name}>L</span>{same && <span className={`n k${same}`} title={`Kept ${same}`}>{same}</span>}</td><td className="num">{z ? fmtZ(z) : "—"}</td><td className="num">{fmtSwr(swrOn(curve, f))}</td></tr>
                )}
                {kept.map(({ g: kg, n, k }) => {
                  const kz = s11At(kg, f);
                  return (
                    <tr key={n} className={`k${n}`}><td><span className="n" title={`Kept ${n}`}>{n}</span></td>
                      <td className="num">{kz ? fmtZ(impedance(kz[0], kz[1], kg.z0)) : "—"}</td><td className="num">{fmtSwr(swrAt(k.f, k.s, f))}</td></tr>
                  );
                })}
              </tbody>
            </table>
            {z && g && (
              <dl>
                <dt>Reactance</dt><dd>{fmtPart(z[1], f)}</dd>
                <dt>S11</dt><dd>{mag.toFixed(3)} ∠ {Math.round((Math.atan2(g[1], g[0]) * 180) / Math.PI)}°</dd>
                <dt>Return loss</dt><dd>{mag > 0.001 ? `${returnLoss(mag).toFixed(1)} dB` : "> 60 dB"}</dd>
              </dl>
            )}
          </>
        )}
      </div>
    </div>
  );
}
