/* A "?" that shows its detail text, so a card keeps its rows short and the
 * detail is there when wanted. A tap or click opens it and a second one
 * closes it, as does a tap elsewhere or Escape. A mouse also opens it on
 * hover. It does not rely on focus: Safari does not focus a button on a tap.
 * The text moves sideways as far as it must to stay on the screen, or inside
 * a box around it that scrolls sideways. It opens upward where the box it
 * sits in would cut it off below. A click stays with the "?", so a row it
 * sits in does not take it too. Another glyph can stand in for the "?", as
 * the "⋯" that opens a cell's tooltip where there is no mouse to hover with.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/** The least room between the text and the edge of the screen, in pixels. */
const EDGE = 8;

/** Whether a box cuts off what sticks out of it, as one that scrolls does. */
const clips = (o: string): boolean => o === "auto" || o === "scroll" || o === "hidden";

/** The lowest point the text can show at: the window's bottom, or higher
 *  where a box around it scrolls and so cuts off what sticks out. */
function floorOf(el: HTMLElement): number {
  let floor = window.innerHeight;
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (clips(getComputedStyle(p).overflowY)) floor = Math.min(floor, p.getBoundingClientRect().bottom);
  }
  return floor;
}

/** The left and right edges the text can show between: the window's, or
 *  nearer where a box around it scrolls sideways, as a wide table's does. */
function sidesOf(el: HTMLElement): [number, number] {
  let lo = 0, hi = document.documentElement.clientWidth;
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (!clips(getComputedStyle(p).overflowX)) continue;
    const r = p.getBoundingClientRect();
    lo = Math.max(lo, r.left);
    hi = Math.min(hi, r.right);
  }
  return [lo, hi];
}

export function Help({ text, align = "end", glyph = "?", label = "More information", className = "" }: {
  text: React.ReactNode;
  /** Which edge of the "?" the text lines up with: "end" opens leftward, for a "?" at a card's right edge. */
  align?: "start" | "end";
  glyph?: string;
  label?: string;
  className?: string;
}): React.ReactElement {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLButtonElement>(null), tip = useRef<HTMLSpanElement>(null);
  const shown = open || hover;

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent): void => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent): void => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  useLayoutEffect(() => {
    const t = tip.current;
    if (!t || !shown) return;
    t.style.translate = "";
    t.classList.remove("up");
    const r = t.getBoundingClientRect(), [lo, hi] = sidesOf(t);
    const dx = r.right > hi - EDGE ? hi - EDGE - r.right : r.left < lo + EDGE ? lo + EDGE - r.left : 0;
    if (dx) t.style.translate = `${dx}px 0`;
    if (r.bottom > floorOf(t) - EDGE) t.classList.add("up");
  }, [shown]);

  return (
    <button type="button" ref={ref} className={["help", align, className, shown && "shown"].filter(Boolean).join(" ")}
      aria-label={label} aria-expanded={open} aria-describedby={id} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setHover(true); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") setHover(false); }}>
      <span className="glyph">{glyph}</span>
      <span className="tip" role="tooltip" id={id} ref={tip}>{text}</span>
    </button>
  );
}
