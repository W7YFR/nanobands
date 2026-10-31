/* A "?" that shows its detail text, so a card keeps its rows short and the
 * detail is there when wanted. A tap or click opens it and a second one
 * closes it, as does a tap elsewhere or Escape. A mouse also opens it on
 * hover. It does not rely on focus: Safari does not focus a button on a tap.
 * The text moves sideways as far as it must to stay on the screen.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/** The least room between the text and the edge of the screen, in pixels. */
const EDGE = 8;

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
    const r = t.getBoundingClientRect(), vw = document.documentElement.clientWidth;
    const dx = r.right > vw - EDGE ? vw - EDGE - r.right : r.left < EDGE ? EDGE - r.left : 0;
    if (dx) t.style.translate = `${dx}px 0`;
  }, [shown]);

  return (
    <button type="button" ref={ref} className={"help " + align + (shown ? " shown" : "")}
      aria-label="More information" aria-expanded={open} aria-describedby={id} onClick={() => setOpen(!open)}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setHover(true); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") setHover(false); }}>
      ?
      <span className="tip" role="tooltip" id={id} ref={tip}>{text}</span>
    </button>
  );
}
