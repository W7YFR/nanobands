/* A "?" that shows its detail text, so a card keeps its rows short and the
 * detail is there when wanted. A tap or click opens it and a second one
 * closes it, as does a tap elsewhere or Escape. A mouse also opens it on
 * hover. It does not rely on focus: Safari does not focus a button on a tap.
 * The text moves sideways as far as it must to stay on the screen, and opens
 * upward where the box it sits in would cut it off below.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/** The least room between the text and the edge of the screen, in pixels. */
const EDGE = 8;

/** The lowest point the text can show at: the window's bottom, or higher
 *  where a box around it scrolls and so cuts off what sticks out. */
function floorOf(el: HTMLElement): number {
  let floor = window.innerHeight;
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === "auto" || o === "scroll" || o === "hidden") floor = Math.min(floor, p.getBoundingClientRect().bottom);
  }
  return floor;
}

export function Help({ text, align = "end" }: {
  text: string;
  /** Which edge of the "?" the text lines up with: "end" opens leftward, for a "?" at a card's right edge. */
  align?: "start" | "end";
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
    const r = t.getBoundingClientRect(), vw = document.documentElement.clientWidth;
    const dx = r.right > vw - EDGE ? vw - EDGE - r.right : r.left < EDGE ? EDGE - r.left : 0;
    if (dx) t.style.translate = `${dx}px 0`;
    if (r.bottom > floorOf(t) - EDGE) t.classList.add("up");
  }, [shown]);

  return (
    <button type="button" ref={ref} className={"help " + align + (shown ? " shown" : "")}
      aria-label="More information" aria-expanded={open} aria-describedby={id} onClick={() => setOpen(!open)}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setHover(true); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") setHover(false); }}>
      <span className="glyph">?</span>
      <span className="tip" role="tooltip" id={id} ref={tip}>{text}</span>
    </button>
  );
}
