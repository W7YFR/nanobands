import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/* jsdom setup for the dom tier, as in cwt.
 *
 * jsdom has a document and no layout. What this tier tests is markup and
 * wiring, so the gaps that matter are filled here on purpose. jsdom has no
 * canvas either, and that is left missing: the photo and the chart belong to
 * the browser tier. */

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

// jsdom has no PointerEvent, so a pointer event would lose its pointerType.
if (!window.PointerEvent) {
  class PointerEvent extends MouseEvent {
    readonly pointerType: string;
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? "";
      this.pointerId = init.pointerId ?? 0;
    }
  }
  window.PointerEvent = PointerEvent as typeof window.PointerEvent;
}

afterEach(() => cleanup());
