/* The photo card: the photo with the analysis drawn over it.
 *
 * Drag a corner handle to fit the grid, draw with the pen to fix the trace,
 * or click a point of known frequency. A magnifier follows the pointer while
 * dragging a corner and in the pen and reference modes.
 */

import { useLayoutEffect, useRef } from "react";
import type { Point } from "@/geometry";
import { drawMagnifier, drawPhoto, type PhotoScene } from "./draw-photo";
import { calOK } from "./model";
import type { Mode } from "./Cards";

const small: React.CSSProperties = { textTransform: "none", letterSpacing: 0, fontSize: 12, padding: "3px 10px" };

export function PhotoCard({ scene, kRef, collapsed, onCollapse, onStraight, mode, onCornerMove, onCornerDrop, onPen, onRef, onHover }: {
  /** Everything to draw, except the corner being dragged, which is the card's own. */
  scene: Omit<PhotoScene, "dragCorner">;
  /** CSS pixels per view pixel, for the PNG export. */
  kRef: React.RefObject<number>;
  collapsed: boolean;
  onCollapse(): void;
  onStraight(): void;
  mode: Mode;
  onCornerMove(j: number, p: Point): void;
  onCornerDrop(): void;
  /** A pen stroke reached (x, y) in view pixels; `start` begins a new stroke. */
  onPen(x: number, y: number, start: boolean): void;
  onRef(x: number, y: number): void;
  onHover(f: number | null): void;
}): React.ReactElement {
  const wrap = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const hover = useRef<Point | null>(null), drag = useRef(-1), pen = useRef(false);
  const vw = scene.view;

  const draw = (): void => {
    const c = canvas.current, ctx = c?.getContext("2d"), w = wrap.current;
    if (!c || !ctx || !w || collapsed) return;
    const k = Math.min(w.clientWidth / vw.w, (window.innerHeight * 0.72) / vw.h), dpr = window.devicePixelRatio || 1;
    kRef.current = k;
    c.style.width = vw.w * k + "px";
    c.style.height = vw.h * k + "px";
    c.width = Math.round(vw.w * k * dpr);
    c.height = Math.round(vw.h * k * dpr);
    const sc: PhotoScene = { ...scene, dragCorner: drag.current };
    ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    drawPhoto(ctx, 1 / k, sc, false);
    if (hover.current && (drag.current >= 0 || mode !== "idle")) drawMagnifier(ctx, dpr, k, sc, hover.current);
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

  const at = (e: React.PointerEvent): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return [(e.clientX - r.left) / kRef.current, (e.clientY - r.top) / kRef.current];
  };
  const nearCorner = (x: number, y: number): number =>
    vw.straight ? -1 : scene.corners.findIndex(([cx, cy]) => Math.hypot(cx - x, cy - y) * kRef.current < 14);

  return (
    <div className={"card" + (collapsed ? " collapsed" : "")} id="photoCard">
      <h2>Photo <span style={{ flex: 1 }}></span>
        {!collapsed && <button id="straightBtn" style={small} onClick={onStraight}>{vw.straight ? "Edit corners" : "Straighten"}</button>}
        <button id="collapseBtn" style={small} onClick={onCollapse}>{collapsed ? "Expand" : "Collapse"}</button>
      </h2>
      {!collapsed && (
        <div id="photoWrap" ref={wrap}>
          <canvas id="photo" ref={canvas}
            onPointerDown={(e) => {
              const [x, y] = at(e);
              hover.current = [x, y];
              const hit = nearCorner(x, y);
              if (hit >= 0) { drag.current = hit; e.currentTarget.setPointerCapture(e.pointerId); draw(); return; }
              if (mode === "pen") { pen.current = true; e.currentTarget.setPointerCapture(e.pointerId); onPen(x, y, true); return; }
              if (mode === "ref") onRef(x, y);
            }}
            onPointerMove={(e) => {
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
            onPointerUp={() => {
              pen.current = false;
              if (drag.current >= 0) { drag.current = -1; onCornerDrop(); }
            }}
            onPointerLeave={() => {
              if (drag.current >= 0) return;
              hover.current = null;
              onHover(null);
              draw();
            }}
          />
        </div>
      )}
    </div>
  );
}
