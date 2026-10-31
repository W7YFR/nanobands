/* Keeps a sideways swipe over a canvas from going back or forward a page.
 *
 * A trackpad's two-finger swipe reaches the page as sideways wheel events,
 * and the browser turns the ones nothing takes into back and forward. Over
 * the chart and the photo a sideways drag means the drawing, so take them
 * there. Elsewhere the swipe still goes back. On a touch screen the canvases
 * take touches already (touch-action: none).
 */

import { useEffect, type RefObject } from "react";

export function useNoSwipe(ref: RefObject<HTMLElement | null>, mounted = true): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || !mounted) return;
    const take = (e: WheelEvent): void => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault(); };
    // Not passive, or preventDefault is ignored.
    el.addEventListener("wheel", take, { passive: false });
    return () => el.removeEventListener("wheel", take);
  }, [ref, mounted]);
}
