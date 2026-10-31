/* The photo card: the photo with the analysis drawn over it.
 *
 * Drag a corner handle to fit the grid, draw with the pen to fix the trace,
 * or click a point of known frequency. A magnifier follows the pointer while
 * dragging a corner and in the pen and reference modes.
 *
 * On a touch screen the pen fills the screen, so the page cannot scroll or
 * resize under it, and a finger never covers what it traces: one finger
 * steers a cursor, as on a trackpad, and the magnifier shows what is under
 * it. Draw makes the cursor draw as it moves and Erase makes it wipe the
 * trace; with neither on it moves freely. Two fingers zoom and pan, and never
 * draw. Only the photo and its trace show there, and Stretch widens the photo
 * so a steep stretch of curve leans over.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Point } from "@/geometry";
import { drawMagnifier, drawPenView, drawPhoto, type PhotoScene } from "./draw-photo";
import { calOK } from "./model";
import type { Mode } from "./Cards";

/** How far a pinch can zoom in, over the photo fitted to the screen. */
const MAX_ZOOM = 8;
/** The widths Stretch steps through. */
const STRETCHES = [1, 2, 4] as const;

const touchScreen = (): boolean => window.matchMedia?.("(pointer: coarse)").matches ?? false;

export function PhotoCard({ scene, kRef, collapsed, onCollapse, onStraight, mode, onPenMode, onUndo, canUndo, onClearMarks, canClear, onCornerMove, onCornerDrop, onPen, onRef, onHover }: {
  /** Everything to draw, except the corner being dragged, which is the card's own. */
  scene: Omit<PhotoScene, "dragCorner">;
  /** CSS pixels per view pixel, for the PNG export. */
  kRef: React.RefObject<number>;
  collapsed: boolean;
  onCollapse(): void;
  onStraight(): void;
  mode: Mode;
  /** Turns the pen on or off, as Trace's Pen fix does. */
  onPenMode(): void;
  /** Takes back the last pen stroke. */
  onUndo(): void;
  canUndo: boolean;
  /** Takes back every pen mark. */
  onClearMarks(): void;
  canClear: boolean;
  onCornerMove(j: number, p: Point): void;
  onCornerDrop(): void;
  /** A pen stroke reached (x, y) in view pixels; `start` begins a new stroke, and `erase` wipes instead of drawing. */
  onPen(x: number, y: number, start: boolean, erase?: boolean): void;
  onRef(x: number, y: number): void;
  onHover(f: number | null): void;
}): React.ReactElement {
  const wrap = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const hover = useRef<Point | null>(null), drag = useRef(-1), pen = useRef(false);
  const vw = scene.view;
  const focus = mode === "pen" && !collapsed && touchScreen();

  // Where the photo is drawn: s CSS pixels per view pixel, its top-left at
  // (ox, oy) on the canvas. In focus, zoom and pan move it.
  const geo = useRef({ s: 1, sx: 1, ox: 0, oy: 0 });
  const zoom = useRef({ z: 1, ox: 0, oy: 0, w: 0, h: 0 });
  const touches = useRef(new Map<number, Point>());
  const pinch = useRef<{ d: number; mid: Point; z: number; ox: number; oy: number } | null>(null);
  /** Zoomed in, so Fit has something to undo. */
  const [zoomed, setZoomed] = useState(false);
  /** In focus: the cursor, in view pixels, and what it does as it moves. */
  const cursor = useRef<Point>([0, 0]);
  const [tool, setTool] = useState<"move" | "draw" | "erase">("move");
  const [stretch, setStretch] = useState<(typeof STRETCHES)[number]>(1);
  /** In focus: where the steering finger was, in client pixels. */
  const steer = useRef<Point | null>(null);

  const draw = (): void => {
    const c = canvas.current, ctx = c?.getContext("2d"), w = wrap.current;
    if (!c || !ctx || !w || collapsed) return;
    const dpr = window.devicePixelRatio || 1;
    let s: number, sx: number, ox: number, oy: number, cw: number, ch: number;
    if (focus) {
      cw = w.clientWidth;
      ch = w.clientHeight;
      const fit = Math.min(cw / vw.w, ch / vw.h), zm = zoom.current;
      // A new screen size, as when the phone turns, or Fit: fit the photo
      // again, centered, or on the cursor when stretched wider than the screen.
      if (zm.w !== cw || zm.h !== ch) {
        const left = stretch === 1 ? (cw - vw.w * fit) / 2 : cw / 2 - cursor.current[0] * fit * stretch;
        Object.assign(zm, { z: 1, ox: left, oy: (ch - vw.h * fit) / 2, w: cw, h: ch });
      }
      s = fit * zm.z;
      sx = s * stretch;
      ox = zm.ox;
      oy = zm.oy;
    } else {
      s = sx = Math.min(w.clientWidth / vw.w, (window.innerHeight * 0.72) / vw.h);
      kRef.current = s;
      ox = oy = 0;
      cw = vw.w * s;
      ch = vw.h * s;
    }
    geo.current = { s, sx, ox, oy };
    c.style.width = cw + "px";
    c.style.height = ch + "px";
    c.width = Math.round(cw * dpr);
    c.height = Math.round(ch * dpr);
    const sc: PhotoScene = { ...scene, dragCorner: drag.current };
    if (focus) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cw, ch);
      drawPenView(ctx, dpr, sc, sx, s, ox, oy);
      // The cursor: a ring, red while it draws and yellow while it erases, and the magnifier on it.
      const [x, y] = cursor.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2;
      ctx.strokeStyle = tool === "draw" ? "#f85149" : tool === "erase" ? "#f2cc60" : "#fff";
      ctx.beginPath(); ctx.arc(ox + x * sx, oy + y * s, 9, 0, 7); ctx.stroke();
      drawMagnifier(ctx, dpr, s, sc, cursor.current, ox, oy, cw, sx);
      return;
    }
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    drawPhoto(ctx, 1 / s, sc, false);
    if (hover.current && (drag.current >= 0 || mode !== "idle")) drawMagnifier(ctx, dpr, s, sc, hover.current, ox, oy, cw);
  };
  const drawRef = useRef(draw);
  useLayoutEffect(() => { drawRef.current = draw; draw(); });
  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => drawRef.current());
    if (wrap.current) ro.observe(wrap.current);
    const onResize = (): void => drawRef.current();
    window.addEventListener("resize", onResize);
    return () => { ro.disconnect(); window.removeEventListener("resize", onResize); };
  }, []);

  // In focus the page behind stays put and nothing on it can be selected,
  // since a long press would select the page instead of drawing. Each focus
  // starts fitted.
  useEffect(() => {
    if (!focus) return;
    zoom.current.w = 0;
    setZoomed(false);
    cursor.current = [vw.w / 2, vw.h / 2];
    window.getSelection()?.removeAllRanges();
    const root = document.documentElement;
    root.classList.add("pen-focus");
    return () => { root.classList.remove("pen-focus"); touches.current.clear(); pinch.current = null; steer.current = null; setTool("move"); setStretch(1); };
  }, [focus, vw.w, vw.h]);

  /** Draw or Erase on, or off again: each on starts a new stroke at the cursor. */
  const pick = (t: "draw" | "erase"): void => {
    if (tool === t) { setTool("move"); return; }
    setTool(t);
    onPen(cursor.current[0], cursor.current[1], true, t === "erase");
  };
  // Undo and Clear marks end the stroke first, so the next move does not carry on with it.
  const undo = (): void => { setTool("move"); onUndo(); };
  const clearMarks = (): void => { setTool("move"); onClearMarks(); };
  /** The next width, keeping the cursor where it is on the screen. */
  const nextStretch = (): void => {
    const n = STRETCHES[(STRETCHES.indexOf(stretch) + 1) % STRETCHES.length]!, g = geo.current, x = cursor.current[0];
    zoom.current.ox = g.ox + x * g.sx - x * (g.sx / stretch) * n;
    setStretch(n);
  };

  /** Focus: one finger steers the cursor, two fingers zoom and pan. */
  const focusDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    touches.current.set(e.pointerId, [e.clientX, e.clientY]);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (touches.current.size >= 2) {
      steer.current = null;
      const z = zoom.current, { d, mid } = spread(e.currentTarget.getBoundingClientRect());
      pinch.current = { d, mid, z: z.z, ox: z.ox, oy: z.oy };
    } else if (!pinch.current) steer.current = [e.clientX, e.clientY];
  };
  const focusMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!touches.current.has(e.pointerId)) return;
    touches.current.set(e.pointerId, [e.clientX, e.clientY]);
    const p0 = pinch.current;
    if (p0) {
      if (touches.current.size < 2) return;
      const { d, mid } = spread(e.currentTarget.getBoundingClientRect()), zm = zoom.current;
      const z = Math.min(MAX_ZOOM, Math.max(1, (p0.z * d) / p0.d));
      // The photo point that was under the fingers stays under them.
      zm.ox = mid[0] - ((p0.mid[0] - p0.ox) * z) / p0.z;
      zm.oy = mid[1] - ((p0.mid[1] - p0.oy) * z) / p0.z;
      zm.z = z;
      if (z > 1.01 !== zoomed) setZoomed(z > 1.01);
      draw();
      return;
    }
    const last = steer.current;
    if (!last) return;
    steer.current = [e.clientX, e.clientY];
    const g = geo.current, c = cursor.current;
    cursor.current = [
      Math.min(vw.w, Math.max(0, c[0] + (e.clientX - last[0]) / g.sx)),
      Math.min(vw.h, Math.max(0, c[1] + (e.clientY - last[1]) / g.s)),
    ];
    if (tool !== "move") onPen(cursor.current[0], cursor.current[1], false, tool === "erase");
    draw();
  };
  const focusUp = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    touches.current.delete(e.pointerId);
    // A pinch lasts until the last finger lifts, so a finger left down does not steer.
    if (!touches.current.size) { pinch.current = null; steer.current = null; }
  };

  const at = (e: React.PointerEvent): Point => {
    const r = e.currentTarget.getBoundingClientRect(), g = geo.current;
    return [(e.clientX - r.left - g.ox) / g.s, (e.clientY - r.top - g.oy) / g.s];
  };
  const nearCorner = (x: number, y: number): number =>
    vw.straight ? -1 : scene.corners.findIndex(([cx, cy]) => Math.hypot(cx - x, cy - y) * geo.current.s < 14);

  /** Two fingers: how far apart they are, and the point between them, in canvas pixels. */
  const spread = (r: DOMRect): { d: number; mid: Point } => {
    const [a, b] = [...touches.current.values()] as [Point, Point];
    return { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top] };
  };

  const tools = focus ? (
    <span className="tools">
      <button id="penUndo" className="small" disabled={!canUndo} onClick={undo}>↶ Undo</button>
      <button id="penClear" className="small" disabled={!canClear} onClick={clearMarks}>Clear marks</button>
      <button id="penStretch" className={"small" + (stretch > 1 ? " on" : "")} onClick={nextStretch}>↔ {stretch}×</button>
      <button id="penFit" className="small" disabled={!zoomed} onClick={() => { zoom.current.w = 0; setZoomed(false); draw(); }}>Fit</button>
      <button id="penDone" className="small on" onClick={onPenMode}>Done</button>
    </span>
  ) : (
    <span className="tools">
      {!collapsed && <button id="photoPen" className={"small" + (mode === "pen" ? " on" : "")} onClick={onPenMode}>✎ Pen</button>}
      {!collapsed && <button id="straightBtn" className="small" onClick={onStraight}>{vw.straight ? "Edit corners" : "Straighten"}</button>}
      <button id="collapseBtn" className="small" onClick={onCollapse}>{collapsed ? "Expand" : "Collapse"}</button>
    </span>
  );

  return (
    <div className={"card" + (collapsed ? " collapsed" : "") + (focus ? " focus" : "")} id="photoCard">
      <h2>{focus ? <>✎ Pen <span className="focus-hint">Drag to move the cursor. Two fingers zoom.</span></> : "Photo"}{tools}</h2>
      {!collapsed && (
        <div id="photoWrap" ref={wrap}>
          <canvas id="photo" ref={canvas}
            onPointerDown={(e) => {
              if (focus) { focusDown(e); return; }
              const [x, y] = at(e);
              hover.current = [x, y];
              const hit = nearCorner(x, y);
              if (hit >= 0) { drag.current = hit; e.currentTarget.setPointerCapture(e.pointerId); draw(); return; }
              if (mode === "pen") { pen.current = true; e.currentTarget.setPointerCapture(e.pointerId); onPen(x, y, true); draw(); return; }
              if (mode === "ref") onRef(x, y);
            }}
            onPointerMove={(e) => {
              if (focus) { focusMove(e); return; }
              const [x, y] = at(e);
              hover.current = [x, y];
              e.currentTarget.style.cursor = nearCorner(x, y) >= 0 ? "grab" : "crosshair";
              if (drag.current >= 0) { onCornerMove(drag.current, [x, y]); return; }
              if (mode === "pen" && pen.current && e.buttons & 1) { onPen(x, y, false); return; }
              const s = scene.settings;
              let f: number | null = null;
              if (calOK(s) && scene.trace) {
                const [u] = vw.vb(x, y);
                if (u >= 0 && u <= 1) f = s.start + u * (s.stop - s.start);
              }
              if (f !== scene.hoverF) onHover(f);
              else draw();
            }}
            onPointerUp={(e) => {
              if (focus) { focusUp(e); return; }
              pen.current = false;
              if (drag.current >= 0) { drag.current = -1; onCornerDrop(); }
              // A finger has no hover: the magnifier goes when it lifts.
              if (e.pointerType !== "mouse") { hover.current = null; draw(); }
            }}
            onPointerCancel={(e) => {
              if (focus) { focusUp(e); return; }
              pen.current = false;
              hover.current = null;
              draw();
            }}
            onPointerLeave={() => {
              if (drag.current >= 0 || focus) return;
              hover.current = null;
              onHover(null);
              draw();
            }}
          />
        </div>
      )}
      {focus && (
        <div className="ink">
          <button id="penDraw" className={tool === "draw" ? "on" : ""} onClick={() => pick("draw")}>{tool === "draw" ? "■ Stop" : "✎ Draw"}</button>
          <button id="penErase" className={tool === "erase" ? "on erase" : ""} onClick={() => pick("erase")}>{tool === "erase" ? "■ Stop" : "⌫ Erase"}</button>
        </div>
      )}
    </div>
  );
}
