/* The page end to end: the React app mounted in Chromium, a real photo
 * dropped on it, and a stand-in NanoVNA connected to it.
 *
 * OCR is the one thing replaced. The real Tesseract.js comes from a CDN and
 * takes seconds; a stand-in on window.Tesseract answers with the text the
 * NanoVNA's screen says, so what is tested is the wiring around it.
 */

import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import "@/ui/base.css";
import photo from "../data/random-wire-3-55mhz.jpg?url";
import pkg from "../../../package.json";
import { FakeNanoVNA, fakeSwr } from "@/vna-fake";
import { detectGrid } from "@/grid";
import { openStore } from "@/store";
import type { Snapshot } from "@/ui/session";

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector<T>(sel)!;
const has = (sel: string): boolean => document.querySelector(sel) !== null;

async function until(test: () => boolean, ms = 20000): Promise<void> {
  const t0 = performance.now();
  while (!test()) {
    if (performance.now() - t0 > ms) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 50));
  }
}

const device = new FakeNanoVNA();

/** A pointer event at (x, y) on the page, from a mouse or a finger. */
function point(el: Element, type: string, x: number, y: number, pointerType = "mouse", buttons = 1): void {
  el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, pointerType, buttons, bubbles: true, cancelable: true }));
}
/** A drag from x0 to x1 across `el` at height y, in steps. */
function swipe(el: Element, x0: number, x1: number, y: number, pointerType = "mouse"): void {
  point(el, "pointerdown", x0, y, pointerType);
  for (let k = 1; k <= 5; k++) point(el, "pointermove", x0 + ((x1 - x0) * k) / 5, y, pointerType);
  point(el, "pointerup", x1, y, pointerType, 0);
}
const tap = (el: Element, x: number, y: number): void => {
  point(el, "pointerdown", x, y, "touch");
  point(el, "pointerup", x, y, "touch", 0);
};
/** The first row, in page coordinates, of the chart's plot in page column x
 *  whose pixel `hit` accepts, searched from the top or from the bottom. */
function scanChart(x: number, hit: (p: Uint8ClampedArray) => boolean, from: "top" | "bottom"): number | null {
  const c = $<HTMLCanvasElement>("#chart"), r = c.getBoundingClientRect(), k = c.width / r.width;
  // The plot spans 30 px from the top to 86 px from the bottom.
  const top = Math.round(30 * k), bot = Math.round((r.height - 86) * k);
  const d = c.getContext("2d")!.getImageData(Math.round((x - r.left) * k), top, 1, bot - top).data;
  const rows = [...Array(bot - top).keys()];
  if (from === "bottom") rows.reverse();
  const row = rows.find((i) => hit(d.subarray(i * 4, i * 4 + 3)));
  return row === undefined ? null : r.top + (top + row) / k;
}
/** Where a pin's dot sits in column x: the lowest pure white there, as only pins are drawn in it. */
const pinY = (x: number): number | null => {
  const y = scanChart(x, (p) => p[0]! > 250 && p[1]! > 250 && p[2]! > 250, "bottom");
  return y === null ? null : y - 3;
};
const wheel = (el: Element, x: number, y: number, deltaY: number, shiftKey = false): boolean =>
  el.dispatchEvent(new WheelEvent("wheel", { clientX: x, clientY: y, deltaY, shiftKey, bubbles: true, cancelable: true }));
const frames = (n: number): Promise<void> =>
  new Promise((r) => { let k = 0; const f = (): void => { if (++k >= n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });

/** A pen stroke from (x0, y0) to (x1, y1), one move a frame, as a real
 *  pointer sends them: the page draws each move onto the last one's trace. */
async function penStroke(el: Element, x0: number, y0: number, x1: number, y1: number, pointerType = "mouse"): Promise<void> {
  point(el, "pointerdown", x0, y0, pointerType);
  await frames(1);
  for (let k = 1; k <= 8; k++) {
    point(el, "pointermove", x0 + ((x1 - x0) * k) / 8, y0 + ((y1 - y0) * k) / 8, pointerType);
    await frames(1);
  }
  point(el, "pointerup", x1, y1, pointerType, 0);
}

/** Open a file through the page's file input, as Browse does. */
function openFile(file: File): void {
  const dt = new DataTransfer();
  dt.items.add(file);
  const input = $<HTMLInputElement>("#file");
  input.files = dt.files;
  fireEvent.change(input);
}
const photoFile = async (name = "random-wire.jpg"): Promise<File> =>
  new File([await (await fetch(photo)).blob()], name, { type: "image/jpeg" });

/** Run `fn` on a touch screen: a coarse pointer. */
async function asTouch(fn: () => Promise<void>): Promise<void> {
  const real = window.matchMedia;
  window.matchMedia = ((q: string) => q.includes("coarse")
    ? { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }
    : real.call(window, q)) as typeof window.matchMedia;
  try { await fn(); } finally { window.matchMedia = real; }
}

/** Every file the page saves, by name and URL, while `fn` runs. */
async function downloads(fn: () => void | Promise<void>): Promise<{ name: string; url: string }[]> {
  const real = HTMLAnchorElement.prototype.click, got: { name: string; url: string }[] = [];
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { got.push({ name: this.download, url: this.href }); };
  try { await fn(); } finally { HTMLAnchorElement.prototype.click = real; }
  return got;
}

/** A Tesseract stand-in that reads `text`, after `wait` when given. */
const tesseract = (text: string, wait?: Promise<void>): NonNullable<Window["Tesseract"]> => ({
  createWorker: async () => ({
    setParameters: async () => undefined,
    recognize: async () => { await wait; return { data: { text, lines: null } }; },
    terminate: async () => undefined,
  }),
});
const SCREEN_TEXT = "YSTL SUR 500n/ 2.970\nSTART 3.000 000 MHz\nBW:1000Hz 401p\nSTOP 55.000 000 MHz";

/** What a status line in the sidebar says, without its ✓, ! or … mark. */
const stat = (id: string): string => document.querySelector(`#${id} span:last-child`)?.textContent ?? "";

/** The rows of Key points with this kind, and a row's frequency. */
const pointRows = (kind: string): Element[] => [...document.querySelectorAll("#ptTable tr")].filter((tr) => tr.children[2]?.textContent === kind);
const rowF = (tr: Element): number => +tr.children[0]!.textContent!;

/** Pin a frequency as Enter in Frequency does, then clear the field. */
async function pinFreq(f: string): Promise<void> {
  const n = pointRows("Pinned").length;
  fireEvent.change($("#freq"), { target: { value: f } });
  fireEvent.keyDown($("#freq"), { key: "Enter" });
  await until(() => pointRows("Pinned").length === n + 1);
  $("#freqClear").click();
  await until(() => $<HTMLInputElement>("#freq").value === "");
}

/** Wait until the saved session matches `test`, so a remount reads it back. */
async function saved(test: (s: Snapshot) => boolean): Promise<void> {
  const store = openStore();
  const t0 = performance.now();
  for (;;) {
    const s = await store.get<Snapshot>("session");
    if (s && test(s)) return;
    if (performance.now() - t0 > 5000) throw new Error("session not saved");
    await new Promise((r) => setTimeout(r, 100));
  }
}

// Synthetic pointers have no real pointer to capture; capture is the
// browser's business, not the page's, so let it pass.
const capture = Element.prototype.setPointerCapture;
afterAll(() => { Element.prototype.setPointerCapture = capture; });

beforeAll(async () => {
  Element.prototype.setPointerCapture = () => undefined;
  indexedDB.deleteDatabase("nanobands");
  localStorage.clear();
  window.Tesseract = tesseract(SCREEN_TEXT);
  Object.defineProperty(navigator, "serial", { value: device.serial(), configurable: true });
  await mount();
});

let root: Root | null = null;
/** Mount the page afresh, as a refresh does: it reads back what it saved. */
async function mount(): Promise<void> {
  const { App } = await import("@/ui/App");
  root?.unmount();
  document.querySelector("#root")?.remove();
  const el = document.createElement("div");
  el.id = "root";
  document.body.appendChild(el);
  root = createRoot(el);
  root.render(<StrictMode><App /></StrictMode>);
  await until(() => has(".app") && !has(".app.booting"));
}

/** Key points as the photo first opened, on the grid the page found. */
let opened = "";

describe("the page", () => {
  it("shows the version from package.json in its footer", () => {
    expect($("#version").textContent).toBe(pkg.version);
    expect($("#year").textContent).toBe(String(new Date().getFullYear()));
  });

  it("starts on the landing, with no Clear and no page", () => {
    expect(has(".app.no-data")).toBe(true);
    expect(has("#landing")).toBe(true);
    expect(has("#photoDisclaimer")).toBe(false);
    expect(has(".wrap")).toBe(false);
    expect($("#clearAll").classList.contains("ghost")).toBe(true);
    expect(getComputedStyle($("header h1")).visibility).toBe("hidden");
  });

  it("finds the grid, reads the sweep and fills the tables from a dropped photo", async () => {
    const blob = await (await fetch(photo)).blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "random-wire.jpg", { type: "image/jpeg" }));
    const input = $<HTMLInputElement>("#file");
    input.files = dt.files;
    fireEvent.change(input);

    await until(() => has("#fStop") && $<HTMLInputElement>("#fStop").value === "55");
    // A photo's trace has no readings to show, and its scale comes from the photo.
    expect(has("#readingsShown")).toBe(false);
    expect(has("#scaleTop")).toBe(false);
    expect($("#fileName").textContent).toBe("random-wire.jpg");
    expect($("#gridNote").textContent).toContain("Grid found");
    expect($("#calSummary").textContent).toBe("3–55 MHz · SWR 1–5");
    expect($("#ocrNote").textContent).toContain("3–55 MHz, SWR 1–5");
    expect($<HTMLInputElement>("#fStart").value).toBe("3");
    expect($("#straightBtn").textContent).toBe("Edit corners");
    expect($("#clearAll").classList.contains("ghost")).toBe(false);
    expect(has("#landing")).toBe(false);
    expect($("#photoDisclaimer").textContent).toContain("Check before you transmit.");
    // At the top of the page, over both columns.
    expect($("#photoDisclaimer").getBoundingClientRect().bottom).toBeLessThanOrEqual($(".wrap").getBoundingClientRect().top);
    expect(getComputedStyle($("header h1")).visibility).toBe("visible");

    const rows = [...document.querySelectorAll<HTMLTableRowElement>("#ptTable tr")].map((r) => r.textContent ?? "");
    expect(rows.filter((r) => /Drops below 3|Rises above 3/.test(r))).toHaveLength(9);
    expect(rows.some((r) => r.startsWith("4.640"))).toBe(true);
    // General class, 3:1: 20 m is all usable, 40 m is not.
    const bands = $("#bandTable").textContent ?? "";
    expect(bands).toMatch(/20m\s*all usable/);
    expect(bands).toMatch(/40m\s*none/);
    opened = $("#ptTable").textContent!;
  });

  it("filters the table by mode", async () => {
    fireEvent.change($("#mode"), { target: { value: "phone" } });
    await until(() => $("#bandTable").textContent!.includes("No phone privileges here for this license class"));
    fireEvent.change($("#mode"), { target: { value: "any" } });
    await until(() => !$("#bandTable").textContent!.includes("No phone privileges"));
  });

  describe("the Band segments table", () => {
    const chip = (): string => $("#chips button.on")?.textContent ?? "";
    const rows = (name: string): HTMLElement => $(`#bandTable tbody[data-band="${name}"]`);
    /** The mouse comes onto a band's rows from outside them, or leaves them. */
    const enter = (name: string): boolean => rows(name).querySelector("td")!.dispatchEvent(new PointerEvent("pointerover", { pointerType: "mouse", bubbles: true }));
    const leave = (name: string): boolean => rows(name).querySelector("td")!.dispatchEvent(new PointerEvent("pointerout", { pointerType: "mouse", bubbles: true, relatedTarget: document.body }));

    it("shows a band on the chart while the mouse is over its rows", async () => {
      expect(chip()).toBe("Full sweep");
      enter("20m");
      await until(() => chip() === "20m");
      expect(rows("20m").classList.contains("on")).toBe(false);
      leave("20m");
      await until(() => chip() === "Full sweep");
    });

    it("keeps a band on the chart on a click, and goes back to the view before on a second", async () => {
      [...document.querySelectorAll<HTMLButtonElement>("#chips button")].find((b) => b.textContent === "40m")!.click();
      await until(() => chip() === "40m");
      enter("20m");
      rows("20m").querySelector("td")!.click();
      await until(() => chip() === "20m" && rows("20m").classList.contains("on"));
      // Clicked, the band stays when the mouse leaves.
      leave("20m");
      await frames(2);
      expect(chip()).toBe("20m");
      // From 20 m to 17 m, then off 17 m: back to the view before 20 m.
      rows("17m").querySelector("td")!.click();
      await until(() => chip() === "17m");
      rows("17m").querySelector("td")!.click();
      await until(() => chip() === "40m" && $("#bandTable tbody.on")?.dataset.band === "40m");
      [...document.querySelectorAll<HTMLButtonElement>("#chips button")].find((b) => b.textContent === "Full sweep")!.click();
      await until(() => chip() === "Full sweep");
    });

    it("lists only the usable bands on Usable", async () => {
      const button = (label: string): HTMLButtonElement => [...document.querySelectorAll<HTMLButtonElement>("#bandsShown button")].find((b) => b.textContent === label)!;
      expect(button("All").getAttribute("aria-pressed")).toBe("true");
      button("Usable").click();
      await until(() => !has('#bandTable tbody[data-band="40m"]'));
      expect(button("Usable").getAttribute("aria-pressed")).toBe("true");
      expect(has('#bandTable tbody[data-band="20m"]')).toBe(true);
      button("All").click();
      await until(() => has('#bandTable tbody[data-band="40m"]'));
    });
  });

  it("collapses and expands the photo", async () => {
    $("#collapseBtn").click();
    await until(() => $("#photoCard").classList.contains("collapsed"));
    expect($("#collapseBtn").textContent).toBe("Expand");
    expect(has("#photo")).toBe(false);
    $("#collapseBtn").click();
    await until(() => !$("#photoCard").classList.contains("collapsed"));
    expect(has("#photo")).toBe(true);
  });

  it("puts Export last on a narrow screen", () => {
    expect(window.innerWidth).toBeLessThanOrEqual(900);
    expect($("#exportCard").getBoundingClientRect().top).toBeGreaterThan($("#ptCard").getBoundingClientRect().top);
  });

  describe("the chart, read by finger", () => {
    const pins = (): number => document.querySelectorAll("#ptTable [data-del]").length;
    const chip = (): string => $("#chips button.on")?.textContent ?? "";
    const at = (u: number): [number, number] => {
      const r = $("#chart").getBoundingClientRect();
      return [r.left + r.width * u, r.top + r.height / 2];
    };

    it("reads the curve on a drag, keeps the reading, and clears it on the next tap", async () => {
      const n = pins(), [x0, y] = at(0.3), [x1] = at(0.5), [x2] = at(0.6);
      swipe($("#chart"), x0, x1, y, "touch");
      await frames(2);
      expect(chip()).toBe("Full sweep");
      // A tap while the reading shows clears it and pins nothing.
      tap($("#chart"), x2, y);
      await frames(2);
      expect(pins()).toBe(n);
      // With no reading, a tap pins, and a second tap on the pin unpins.
      tap($("#chart"), x2, y);
      await until(() => pins() === n + 1);
      await frames(2);
      tap($("#chart"), x2, pinY(x2)!);
      await until(() => pins() === n);
    });

    it("zooms on a mouse drag", async () => {
      const [x0, y] = at(0.3), [x1] = at(0.5);
      swipe($("#chart"), x0, x1, y);
      await until(() => chip() !== "Full sweep");
      [...document.querySelectorAll<HTMLButtonElement>("#chips button")].find((b) => b.textContent === "Full sweep")!.click();
      await until(() => chip() === "Full sweep");
    });

    it("zooms on a finger drag only after Zoom, and for one zoom", async () => {
      const real = window.matchMedia;
      window.matchMedia = ((q: string) => q.includes("coarse")
        ? { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }
        : real.call(window, q)) as typeof window.matchMedia;
      try {
        const [x0, y] = at(0.3), [x1] = at(0.5);
        // Any update renders the card again, now on a touch screen.
        point($("#chart"), "pointermove", x0, y, "mouse", 0);
        await until(() => has("#chartZoom"));
        $("#chartZoom").click();
        await until(() => $("#chartZoom").classList.contains("on"));
        swipe($("#chart"), x0, x1, y, "touch");
        await until(() => chip() !== "Full sweep");
        expect($("#chartZoom").classList.contains("on")).toBe(false);
        [...document.querySelectorAll<HTMLButtonElement>("#chips button")].find((b) => b.textContent === "Full sweep")!.click();
        await until(() => chip() === "Full sweep");
      } finally {
        window.matchMedia = real;
      }
    });
  });

  describe("the chart, by mouse", () => {
    const pins = (): number => document.querySelectorAll("#ptTable [data-del]").length;
    const chip = (): string => $("#chips button.on")?.textContent ?? "";
    const pick = async (name: string): Promise<void> => {
      [...document.querySelectorAll<HTMLButtonElement>("#chips button")].find((b) => b.textContent === name)!.click();
      await until(() => chip() === name);
    };
    const at = (u: number): [number, number] => {
      const r = $("#chart").getBoundingClientRect();
      return [r.left + r.width * u, r.top + r.height / 2];
    };
    /** The page x of frequency f, with the chart showing lo–hi. */
    const xAt = (f: number, lo: number, hi: number): number => {
      const r = $("#chart").getBoundingClientRect(), x0 = 46, x1 = r.width - 14;
      return r.left + x0 + ((f - lo) / (hi - lo)) * (x1 - x0);
    };
    /** A click with the mouse, and the hover moved off to the side so its dot is not in column x. */
    const click = async (x: number, y: number): Promise<void> => {
      point($("#chart"), "pointerdown", x, y);
      point($("#chart"), "pointerup", x, y, "mouse", 0);
      point($("#chart"), "pointermove", at(0.08)[0], at(0.08)[1], "mouse", 0);
      await frames(2);
    };

    it("zooms on the wheel, and never scrolls the page over the chart", async () => {
      const [x, y] = at(0.5);
      // Zoomed all the way out, a scroll down does nothing, and the page stays put.
      expect(wheel($("#chart"), x, y, 100)).toBe(false);
      await frames(2);
      expect(chip()).toBe("Full sweep");
      expect(wheel($("#chart"), x, y, -300)).toBe(false);
      await until(() => chip() === "");
      // Zooming back out stops at the whole sweep.
      expect(wheel($("#chart"), x, y, 2000)).toBe(false);
      await until(() => chip() === "Full sweep");
    });

    it("pans a zoom with Shift + scroll and with a middle-button drag", async () => {
      const [x, y] = at(0.5);
      await pick("20m");
      expect(wheel($("#chart"), x, y, 100, true)).toBe(false);
      await until(() => chip() === "");
      await pick("20m");
      const c = $("#chart"), press = (type: string, px: number, buttons: number): boolean =>
        c.dispatchEvent(new PointerEvent(type, { clientX: px, clientY: y, pointerId: 1, pointerType: "mouse", button: type === "pointermove" ? -1 : 1, buttons, bubbles: true, cancelable: true }));
      press("pointerdown", x, 4);
      for (let k = 1; k <= 5; k++) press("pointermove", x + 20 * k, 4);
      press("pointerup", x + 100, 0);
      await until(() => chip() === "");
      // A middle-button drag pins nothing, and leaves the zoom in place.
      expect(chip()).toBe("");
      await pick("Full sweep");
    });

    it("sums up a band in a tooltip over its strip or its name", async () => {
      await pick("20m");
      // The 20m chip shows the band with a third of its width each side.
      const lo = 14 - 0.35 * 0.35, hi = 14.35 + 0.35 * 0.35, r = $("#chart").getBoundingClientRect();
      const move = (x: number, y: number): void => point($("#chart"), "pointermove", x, y, "mouse", 0);
      move(xAt(14.1, lo, hi), r.bottom - 58);
      await until(() => has(".chartTip"));
      expect($(".chartTip").textContent).toMatch(/^20m · SWR [\d.≥–]+/);
      expect($(".chartTip .pill").textContent).toMatch(/usable/);
      move(xAt(14.1, lo, hi), r.top + r.height / 2);
      await until(() => !has(".chartTip"));
      move(xAt(14.175, lo, hi), r.top + 18);
      await until(() => has(".chartTip"));
      move(xAt(14.1, lo, hi), r.top + r.height / 2);
      await until(() => !has(".chartTip"));
      await pick("Full sweep");
    });

    it("unpins only a click that snaps to the pin", async () => {
      const n = pins(), [x, y] = at(0.62);
      await click(x, y);
      await until(() => pins() === n + 1);
      const py = pinY(x)!;
      expect(py).not.toBeNull();
      // Well clear of the pin, a click pins again rather than unpinning.
      const away = py - 60 > $("#chart").getBoundingClientRect().top + 60 ? py - 60 : py + 60;
      await click(x, away);
      await until(() => pins() === n + 2);
      // On the dot, the first pin comes off and the second stays.
      await click(x + 3, py + 3);
      await until(() => pins() === n + 1);
      $<HTMLButtonElement>("#ptTable [data-del]").click();
      await until(() => pins() === n);
    });

    it("pins a dip itself when a click snaps to it", async () => {
      const rows = (kind: string): Element[] => [...document.querySelectorAll("#ptTable tr")].filter((tr) => tr.children[2]?.textContent === kind);
      const freq = (tr: Element): string => tr.children[0]!.textContent!;
      const dip = rows("Dip (best match)").find((tr) => +freq(tr) > 15 && +freq(tr) < 16)!;
      // Where the chart puts the dip's dot: the trace runs from about 3.2 MHz,
      // where the photo's dim edge starts, to 55 MHz, and the SWR scale spans
      // 54 px from the top to 108 px from the bottom.
      const r = $("#chart").getBoundingClientRect();
      const top = +$<HTMLInputElement>("#swrTop").value, bot = +$<HTMLInputElement>("#swrBot").value, w = +dip.children[1]!.textContent!;
      const x = xAt(+freq(dip), 3.2, 55), py0 = r.top + 54, py1 = r.bottom - 108;
      const y = py1 - ((w - bot) / (top - bot)) * (py1 - py0);
      await click(x + 5, y - 4);
      await until(() => rows("Pinned").length === 1);
      expect(rows("Pinned").map(freq)).toEqual([freq(dip)]);
      $<HTMLButtonElement>("#ptTable [data-del]").click();
      await until(() => rows("Pinned").length === 0);
    });
  });

  it("fills the window with the chart, and leaves on Escape or Done", async () => {
    const root = document.documentElement;
    $("#chartFull").click();
    await until(() => $("#chartCard").classList.contains("full"));
    expect(root.classList.contains("chart-full")).toBe(true);
    expect($("#chartFull").textContent).toBe("Done");
    expect($("#chart").getBoundingClientRect().height).toBeGreaterThan(window.innerHeight / 2);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await until(() => !$("#chartCard").classList.contains("full"));
    expect(root.classList.contains("chart-full")).toBe(false);
    $("#chartFull").click();
    await until(() => $("#chartCard").classList.contains("full"));
    $("#chartFull").click();
    await until(() => !$("#chartCard").classList.contains("full") && !root.classList.contains("chart-full"));
  });

  it("drags a corner without redoing the page until release", async () => {
    $("#straightBtn").click();
    await until(() => $("#straightBtn").textContent === "Straighten");
    // Where the page put the top right corner: the grid in the photo, scaled to the canvas.
    const bmp = await createImageBitmap(await (await fetch(photo)).blob());
    const sc = Math.min(1, 4000 / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * sc), h = Math.round(bmp.height * sc);
    const oc = new OffscreenCanvas(w, h), ox = oc.getContext("2d")!;
    ox.drawImage(bmp, 0, 0, w, h);
    const [cx, cy] = detectGrid(ox.getImageData(0, 0, w, h))!.corners[1];
    const c = $("#photo"), r = c.getBoundingClientRect(), k = r.width / w;
    const x = r.left + cx * k, y = r.top + cy * k, before = $("#ptTable").textContent;

    point(c, "pointerdown", x, y);
    expect(document.documentElement.classList.contains("photo-drag")).toBe(true);
    for (let j = 1; j <= 4; j++) point(c, "pointermove", x - 10 * j, y);
    await frames(2);
    expect($("#ptTable").textContent).toBe(before);
    point(c, "pointerup", x - 40, y, "mouse", 0);
    expect(document.documentElement.classList.contains("photo-drag")).toBe(false);
    await until(() => $("#ptTable").textContent !== before);
  });

  it("finds the grid again on Detect grid, and traces it afresh", async () => {
    // The corner drag above moved a corner off the grid.
    expect($("#ptTable").textContent).not.toBe(opened);
    $("#gridBtn").click();
    await until(() => $("#ptTable").textContent === opened);
    expect($("#gridNote").textContent).toContain("Grid found");
    expect(stat("traceNote")).toBe("Traced automatically");
  });

  it("works out the sweep from two frequency references", async () => {
    if ($("#straightBtn").textContent === "Straighten") $("#straightBtn").click();
    await until(() => $("#straightBtn").textContent === "Edit corners");
    const answers: (string | null)[] = ["16", "42", null], real = window.prompt;
    window.prompt = () => answers.shift() ?? null;
    try {
      // Straightened, the grid spans the photo less a margin of 7% of its width each side.
      const c = $("#photo"), r = c.getBoundingClientRect(), y = r.top + r.height / 2;
      const ref = async (u: number): Promise<void> => {
        $("#refBtn").click();
        await until(() => $("#refBtn").classList.contains("on"));
        const x = r.left + (r.width * (0.07 + u)) / 1.14;
        point(c, "pointerdown", x, y);
        point(c, "pointerup", x, y, "mouse", 0);
        await until(() => !$("#refBtn").classList.contains("on"));
      };
      // 16 and 42 MHz sit a quarter and three quarters across a 3–55 MHz grid.
      await ref(0.25);
      expect($("#refs").textContent).toContain("16 MHz");
      expect($("#refs").textContent).toContain("add one more…");
      await ref(0.75);
      expect($("#refs").textContent).toContain("42 MHz");
      expect(+$<HTMLInputElement>("#fStart").value).toBeCloseTo(3, 1);
      expect(+$<HTMLInputElement>("#fStop").value).toBeCloseTo(55, 1);
      // A cancelled prompt adds no reference.
      await ref(0.5);
      expect(document.querySelectorAll("#refs i")).toHaveLength(2);
      // Removing one keeps the sweep; removing both clears the list.
      $("#refs i").click();
      await until(() => document.querySelectorAll("#refs i").length === 1);
      expect(+$<HTMLInputElement>("#fStop").value).toBeCloseTo(55, 1);
      $("#refs i").click();
      await until(() => !has("#refs"));
    } finally {
      window.prompt = real;
    }
  });

  describe("Pen fix", () => {
    const table = (): string => $("#ptTable").textContent!;
    const note = (): string => stat("traceNote");
    let auto = "";

    it("redraws a stretch of the auto-trace with a mouse stroke", async () => {
      $("#traceBtn").click();
      await until(() => note() === "Traced automatically");
      auto = table();
      $("#penBtn").click();
      await until(() => $("#photoPen").classList.contains("on") && $("#penBtn").classList.contains("on"));
      const c = $("#photo"), r = c.getBoundingClientRect();
      await penStroke(c, r.left + r.width * 0.3, r.top + r.height * 0.8, r.left + r.width * 0.6, r.top + r.height * 0.8);
      await until(() => note() === "Traced automatically, then fixed with the pen");
      expect(table()).not.toBe(auto);
      $("#penBtn").click();
      await until(() => !$("#photoPen").classList.contains("on"));
    });

    it("takes a stroke back on Undo, and every mark on Clear marks, on a touch screen", async () => {
      await asTouch(async () => {
        $("#penBtn").click();
        await until(() => $("#photoCard").classList.contains("focus"));
        expect($<HTMLButtonElement>("#penUndo").disabled).toBe(false);
        $("#penUndo").click();
        await until(() => table() === auto);
        expect(note()).toBe("Traced automatically");
        expect($<HTMLButtonElement>("#penUndo").disabled).toBe(true);
        expect($<HTMLButtonElement>("#penClear").disabled).toBe(true);

        // Draw on, a finger steers the cursor and the cursor draws.
        $("#penDraw").click();
        await until(() => $("#penDraw").classList.contains("on"));
        const c = $("#photo"), r = c.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        await penStroke(c, x, y, x + 150, y + 75, "touch");
        await until(() => note() === "Traced automatically, then fixed with the pen");
        expect(table()).not.toBe(auto);
        $("#penClear").click();
        await until(() => table() === auto && note() === "Traced automatically");
        $("#penDone").click();
        await until(() => !$("#photoCard").classList.contains("focus"));
      });
    });

    it("draws a trace from scratch after Erase trace", async () => {
      $("#clearBtn").click();
      await until(() => note().startsWith("No trace yet"));
      $("#penBtn").click();
      await until(() => $("#photoPen").classList.contains("on"));
      const c = $("#photo"), r = c.getBoundingClientRect();
      // A low line from about 11 to 41 MHz.
      await penStroke(c, r.left + r.width * 0.2, r.top + r.height * 0.8, r.left + r.width * 0.7, r.top + r.height * 0.8);
      await until(() => note() === "Traced with the pen");
      expect($("#bandTable").textContent).toMatch(/20m\s*all usable/);
      $("#penBtn").click();
      await until(() => !$("#photoPen").classList.contains("on"));
    });

    it("asks to auto-trace again when Detect grid moves the corners under a pen trace", async () => {
      $("#gridBtn").click();
      await until(() => has("#retraceHint"));
      expect($("#retraceHint").textContent).toContain("Corners moved.");
      $("#retraceHint button").click();
      await until(() => !has("#retraceHint") && note() === "Traced automatically");
      expect(table()).toBe(auto);
    });
  });

  it("saves the photo with its overlay, the chart and the data", async () => {
    expect(has("#expS1p")).toBe(false);
    const files = await downloads(() => { $("#expPhoto").click(); $("#expChart").click(); $("#expCsv").click(); });
    expect(files.map((f) => f.name)).toEqual(["swr-overlay.png", "swr-chart.png", "swr-trace.csv"]);
    const [photoPng, chartPng, csv] = files.map((f) => f.url) as [string, string, string];

    // The photo at its own size, shaped as the page shows it.
    expect(photoPng.startsWith("data:image/png")).toBe(true);
    const pb = await createImageBitmap(await (await fetch(photoPng)).blob()), pr = $("#photo").getBoundingClientRect();
    expect(pb.width).toBeGreaterThanOrEqual(Math.floor(pr.width));
    expect(pb.width / pb.height).toBeCloseTo(pr.width / pr.height, 1);
    // The chart at twice its size on the page.
    expect(chartPng.startsWith("data:image/png")).toBe(true);
    const cb = await createImageBitmap(await (await fetch(chartPng)).blob()), chart = $("#chart");
    expect([cb.width, cb.height]).toEqual([chart.clientWidth * 2, chart.clientHeight * 2]);

    // The curve as frequency and SWR, in order, across the sweep.
    const lines = (await (await fetch(csv)).text()).trim().split("\n");
    expect(lines[0]).toBe("freq_mhz,swr");
    const rows = lines.slice(1).map((l) => l.split(",").map(Number) as [number, number]);
    expect(rows.length).toBeGreaterThan(100);
    expect(rows.every(([f, s]) => Number.isFinite(f) && s >= 1 && s < 10)).toBe(true);
    expect(rows.every(([f], i) => i === 0 || f > rows[i - 1]![0])).toBe(true);
    const start = +$<HTMLInputElement>("#fStart").value, stop = +$<HTMLInputElement>("#fStop").value;
    expect(rows[0]![0]).toBeGreaterThanOrEqual(start - 0.01);
    expect(rows.at(-1)![0]).toBeLessThanOrEqual(stop + 0.01);
    expect(rows.at(-1)![0] - rows[0]![0]).toBeGreaterThan(0.8 * (stop - start));
  });

  it("stretches the photo in the pen with a mouse, and scrolls it at the edge", async () => {
    $("#photoPen").click();
    await until(() => has("#photoStretch"));
    const wrap = $("#photoWrap"), c = $("#photo");
    expect($("#photoStretch").textContent).toBe("↔ 1×");
    $("#photoStretch").click();
    await until(() => wrap.classList.contains("wide"));
    expect($("#photoStretch").textContent).toBe("↔ 2×");
    expect(c.getBoundingClientRect().width).toBeGreaterThan(wrap.clientWidth * 1.5);

    // A stroke held near the right edge scrolls the photo along.
    wrap.scrollLeft = 0;
    const r = wrap.getBoundingClientRect(), y = r.top + r.height / 2;
    point(c, "pointerdown", r.left + r.width / 2, y);
    point(c, "pointermove", r.right - 5, y);
    await until(() => wrap.scrollLeft > 0);
    point(c, "pointerup", r.right - 5, y, "mouse", 0);

    $("#photoStretch").click();
    await until(() => $("#photoStretch").textContent === "↔ 4×");
    $("#photoStretch").click();
    await until(() => $("#photoStretch").textContent === "↔ 1×" && !wrap.classList.contains("wide"));
    // Stretched, then the pen off: the photo is back to its width.
    $("#photoStretch").click();
    await until(() => wrap.classList.contains("wide"));
    $("#photoPen").click();
    await until(() => !has("#photoStretch") && !wrap.classList.contains("wide"));
    // The pen back on starts at the photo's width again.
    $("#photoPen").click();
    await until(() => has("#photoStretch"));
    expect($("#photoStretch").textContent).toBe("↔ 1×");
    $("#photoPen").click();
    await until(() => !has("#photoStretch"));
  });

  it("brings the photo, its settings, trace and pins back after a refresh", async () => {
    await pinFreq("14.1");
    const was = $("#ptTable").textContent;
    fireEvent.change($("#swrTop"), { target: { value: "6" } });
    await until(() => $("#ptTable").textContent !== was);
    const text = (sel: string): string => $(sel).textContent!, value = (sel: string): string => $<HTMLInputElement>(sel).value;
    const before = {
      table: text("#ptTable"), bands: text("#bandTable"), grid: text("#gridNote"), ocr: text("#ocrNote"), trace: text("#traceNote"),
      start: value("#fStart"), stop: value("#fStop"), top: value("#swrTop"), bot: value("#swrBot"), straight: text("#straightBtn"),
    };
    await saved((s) => s.manual.includes(14.1) && s.fields.top === "6");

    await mount();
    await until(() => has("#ptTable") && $("#ptTable").textContent === before.table);
    expect($("#fileName").textContent).toBe("random-wire.jpg");
    expect(has("#photo")).toBe(true);
    expect({
      table: text("#ptTable"), bands: text("#bandTable"), grid: text("#gridNote"), ocr: text("#ocrNote"), trace: text("#traceNote"),
      start: value("#fStart"), stop: value("#fStop"), top: value("#swrTop"), bot: value("#swrBot"), straight: text("#straightBtn"),
    }).toEqual(before);
    expect(pointRows("Pinned").map(rowF)).toEqual([14.1]);
  });

  it("starts over on Clear", async () => {
    $("#clearAll").click();
    await until(() => has("#landing"));
    expect($("#clearAll").classList.contains("ghost")).toBe(true);
    expect(has(".app.no-data")).toBe(true);
  });
});

describe("an opened .s1p file", () => {
  // A dip at 14.2 MHz across 3–30 MHz, in 201 points.
  const S1P = ["! a test sweep", "# MHz S RI R 50", ...Array.from({ length: 201 }, (_, i) => {
    const f = 3 + (27 * i) / 200, swr = Math.min(10, 1.2 + ((f - 14.2) / 1.5) ** 2), g = (swr - 1) / (swr + 1);
    return `${f.toFixed(4)} ${g.toFixed(6)} 0`;
  })].join("\n") + "\n";
  const chip = (): string => $("#chips button.on")?.textContent ?? "";

  it("reads the sweep from the file", async () => {
    openFile(new File([S1P], "dipole.s1p", { type: "text/plain" }));
    await until(() => has("#bandTable") && /20m\s*all usable/.test($("#bandTable").textContent!));
    expect($("#fileName").textContent).toBe("dipole.s1p");
    expect($("#resNote").textContent).toContain("201 points from file");
    expect(has("#photoCard")).toBe(false);
    expect(has("#calCard")).toBe(false);
  });

  it("saves the file back as it was, and its data as CSV", async () => {
    expect(has("#expPhoto")).toBe(false);
    const files = await downloads(() => { $("#expS1p").click(); $("#expCsv").click(); });
    expect(files.map((f) => f.name)).toEqual(["dipole.s1p", "swr-trace.csv"]);
    expect(await (await fetch(files[0]!.url)).text()).toBe(S1P);
    const lines = (await (await fetch(files[1]!.url)).text()).trim().split("\n");
    expect(lines).toHaveLength(202);
    expect(lines[1]).toBe("3.000000,10.000");
    // The lowest SWR is the sample nearest the dip at 14.2 MHz.
    const low = lines.slice(1).reduce((a, l) => (+l.split(",")[1]! < +a.split(",")[1]! ? l : a));
    expect(low).toBe("14.205000,1.200");
  });

  it("brings the file, its pins and its zoom back after a refresh", async () => {
    await pinFreq("14.1");
    [...document.querySelectorAll<HTMLButtonElement>("#chips button")].find((b) => b.textContent === "20m")!.click();
    await until(() => chip() === "20m");
    const table = $("#ptTable").textContent;
    await saved((s) => s.manual.includes(14.1) && s.view !== null);

    await mount();
    await until(() => has("#fileName") && chip() === "20m");
    expect($("#fileName").textContent).toBe("dipole.s1p");
    expect($("#resNote").textContent).toContain("201 points from file");
    expect($("#ptTable").textContent).toBe(table);
    expect(pointRows("Pinned").map(rowF)).toEqual([14.1]);
    // The file itself comes back too, to save again.
    const files = await downloads(() => $("#expS1p").click());
    expect(await (await fetch(files[0]!.url)).text()).toBe(S1P);
  });

  it("starts over on Clear", async () => {
    $("#clearAll").click();
    await until(() => has("#landing"));
  });
});

describe("reading the sweep off a photo", () => {
  const note = (): string => stat("ocrNote");
  afterEach(() => { window.Tesseract = tesseract(SCREEN_TEXT); });

  it("offers what it read when the sweep was typed meanwhile, and uses it on Use it", async () => {
    let done = (): void => undefined;
    window.Tesseract = tesseract(SCREEN_TEXT, new Promise((r) => { done = r; }));
    openFile(await photoFile());
    await until(() => note() === "Reading the sweep from the photo");
    fireEvent.change($("#fStart"), { target: { value: "3.5" } });
    fireEvent.change($("#fStop"), { target: { value: "50" } });
    done();
    await until(() => note().includes("The photo says 3–55 MHz."));
    // What was typed stands until Use it.
    expect($<HTMLInputElement>("#fStart").value).toBe("3.5");
    expect($<HTMLInputElement>("#fStop").value).toBe("50");
    $("#ocrUse").click();
    await until(() => note().includes("Sweep read from the photo: 3–55 MHz"));
    expect($<HTMLInputElement>("#fStart").value).toBe("3");
    expect($<HTMLInputElement>("#fStop").value).toBe("55");
  });

  it("says when the photo shows no sweep, and fills the tables from a typed one", async () => {
    window.Tesseract = tesseract("");
    openFile(await photoFile());
    await until(() => note() === "No sweep found on the photo. Enter it below.");
    expect($("#gridNote").textContent).toContain("Grid found");
    expect($<HTMLInputElement>("#fStart").value).toBe("");
    expect(has("#calSummary")).toBe(false);
    fireEvent.change($("#fStart"), { target: { value: "3" } });
    fireEvent.change($("#fStop"), { target: { value: "55" } });
    await until(() => /20m\s*all usable/.test($("#bandTable").textContent!));
  });

  it("says when it cannot read the photo's text, as when Tesseract does not load", async () => {
    delete window.Tesseract;
    const head = document.head, real = head.appendChild;
    let asked = false;
    head.appendChild = (<T extends Node>(n: T): T => {
      if (n instanceof HTMLScriptElement && n.src.includes("tesseract")) {
        asked = true;
        setTimeout(() => n.onerror?.(new Event("error")), 0);
        return n;
      }
      return real.call(head, n) as T;
    }) as typeof head.appendChild;
    try {
      openFile(await photoFile());
      await until(() => note() === "Couldn't read the photo's text. Enter the sweep below.");
      expect(asked).toBe(true);
      expect($("#gridNote").textContent).toContain("Grid found");
      expect($<HTMLInputElement>("#fStart").value).toBe("");
    } finally {
      head.appendChild = real;
    }
  });

  it("says when there is no grid, and Detect grid finds none either", async () => {
    window.Tesseract = tesseract("");
    const oc = new OffscreenCanvas(800, 480), ox = oc.getContext("2d")!;
    ox.fillStyle = "#000";
    ox.fillRect(0, 0, 800, 480);
    openFile(new File([await oc.convertToBlob({ type: "image/png" })], "blank.png", { type: "image/png" }));
    await until(() => has("#gridNote") && $("#fileName").textContent === "blank.png" && note().startsWith("No sweep"));
    expect(stat("gridNote")).toBe("No grid found. Drag the photo's corners onto it.");
    expect(stat("traceNote")).toContain("No trace yet");
    expect($("#straightBtn").textContent).toBe("Straighten");
    $("#gridBtn").click();
    await frames(2);
    expect(stat("gridNote")).toBe("No grid found. Drag the photo's corners onto it.");
    expect(stat("traceNote")).toContain("No trace yet");
  });

  it("starts over on Clear", async () => {
    $("#clearAll").click();
    await until(() => has("#landing"));
  });
});

describe("a connected NanoVNA", () => {
  it("connects from the landing, reads the device and sweeps its range", async () => {
    $("#landConnect").click();
    await until(() => has("#vnaInfo") && $("#bandTable").textContent!.includes("20m"));
    expect($("#vnaInfo").textContent).toBe("NanoVNA-H 4 · firmware 1.2.44");
    expect($("#vnaRange").textContent).toBe("3–55 MHz · 401 points");
    expect($("#loadCard .step").classList.contains("done")).toBe(true);
    expect(has("#vnaBtn")).toBe(false);
    expect(has("#shellBtn")).toBe(true);
    expect($("#resNote").textContent).toContain("401 points from the NanoVNA");
    expect(has("#photoCard")).toBe(false);
    expect(has("#photoDisclaimer")).toBe(false);
    expect(has("#expS1p")).toBe(true);
    expect(device.log).toContain("scan 3000000 55000000 401 3");
    expect(device.log.at(-1)).toBe("resume");
    expect(device.paused).toBe(false);
  });

  it("keeps pins across live sweeps, and stops on Hold", async () => {
    await pinFreq("14.1");
    expect(pointRows("Pinned").map(rowF)).toEqual([14.1]);
    const scans = (): number => device.log.filter((c) => c.startsWith("scan")).length;
    const before = scans();
    $("#liveBtn").click();
    await until(() => $("#liveBtn").textContent === "Hold");
    expect($<HTMLButtonElement>("#sweepBtn").disabled).toBe(true);
    await until(() => scans() >= before + 3);
    // Live leaves the device paused between its sweeps.
    expect(device.log.slice(-3).includes("resume")).toBe(false);
    $("#liveBtn").click();
    await until(() => $("#liveBtn").textContent === "Live");
    await until(() => !device.paused);
    expect(pointRows("Pinned").map(rowF)).toEqual([14.1]);
    expect(pointRows("Pinned")[0]!.children[1]!.textContent).toMatch(/^\d+\.\d\d$/);
    $<HTMLButtonElement>("#ptTable [data-del]").click();
    await until(() => pointRows("Pinned").length === 0);
  });

  it("recalls a calibration slot and sweeps its range", async () => {
    const slot = $<HTMLSelectElement>("#vnaSlot");
    expect(slot.options).toHaveLength(8);
    fireEvent.change(slot, { target: { value: "0" } });
    await until(() => $("#vnaRange").textContent === "144–148 MHz · 101 points");
    expect($("#bandTable").textContent).toContain("2m");
  });

  it("reads what each slot holds, names them, and ends on the slot it started on", async () => {
    localStorage.removeItem("nanobands-slots");
    const from = device.log.length;
    $("#readSlots").click();
    await until(() => $<HTMLSelectElement>("#vnaSlot").options[1]?.textContent === "Slot 1 · 0.05–900 MHz");
    const slot = $<HTMLSelectElement>("#vnaSlot");
    expect([...slot.options].map((o) => o.textContent)).toEqual([
      "Slot 0 · 144–148 MHz", "Slot 1 · 0.05–900 MHz", "Slot 2 · 14–14.35 MHz",
      "Slot 3 · 28–30 MHz", "Slot 4 · 13–15 MHz · S11 only", "Slot 5 · 6–50 MHz",
      "Slot 6 · 3–55 MHz",
    ]);
    await until(() => $("#readSlots").textContent === "Read");
    expect(slot.value).toBe("0");
    expect(device.log.slice(from).filter((c) => c.startsWith("recall")).at(-1)).toBe("recall 0");
    expect($("#vnaRange").textContent).toBe("144–148 MHz · 101 points");
    expect(has("#vnaNote")).toBe(false);
  });

  it("says when a picked slot is empty, and stays on its slot", async () => {
    const kept = device.slots[2]!;
    device.slots[2] = null;
    const slot = $<HTMLSelectElement>("#vnaSlot");
    fireEvent.change(slot, { target: { value: "2" } });
    await until(() => has("#vnaNote"));
    expect($("#vnaNote").textContent).toContain("Slot 2 is empty");
    expect(slot.value).toBe("0");
    expect($("#vnaRange").textContent).toBe("144–148 MHz · 101 points");
    device.slots[2] = kept;
  });

  it("keeps the slot names after a clearconfig with the wrong key, and drops them after the right one", async () => {
    const kept = device.slots.slice();
    const send = async (cmd: string, reply: string): Promise<void> => {
      fireEvent.change($("#shellInput"), { target: { value: cmd } });
      fireEvent.keyDown($("#shellInput"), { key: "Enter" });
      await until(() => $("#shell").textContent!.includes(reply) && !$<HTMLInputElement>("#shellInput").disabled);
    };
    $("#shellBtn").click();
    await until(() => has("#shellInput"));
    await send("clearconfig 9999", "Key unmatched.");
    expect(localStorage.getItem("nanobands-slots")).toContain("144000000");
    await send("clearconfig 1234", "Config and all cal data cleared.");
    expect(localStorage.getItem("nanobands-slots") ?? "").not.toContain("144000000");
    fireEvent.keyDown(document, { key: "Escape" });
    await until(() => !has("#shell"));
    const names = [...$<HTMLSelectElement>("#vnaSlot").options].map((o) => o.textContent);
    expect(names).toContain("Slot 1");
    expect(names).not.toContain("Slot 1 · 0.05–900 MHz");
    device.slots = kept;
  });

  it("fine-sweeps a band, merges it into the full sweep, repeats it live, and goes back with ×", async () => {
    const fineRow = (): string[] => [...document.querySelectorAll("#vnaFine button[aria-pressed]")].map((b) => b.textContent!);
    const repeats = (): string | undefined => $("#vnaFine [aria-pressed=true]")?.textContent ?? undefined;
    const chipBtn = (name: string): HTMLButtonElement =>
      [...document.querySelectorAll<HTMLButtonElement>("#chips button")].find((b) => b.textContent === name)!;
    const slot = $<HTMLSelectElement>("#vnaSlot");
    fireEvent.change(slot, { target: { value: "6" } });
    await until(() => $("#vnaRange").textContent === "3–55 MHz · 401 points" && $("#resNote").textContent!.includes("401 points"));
    // The Fine row offers + Band, and nothing more at the full view.
    expect($("#fineAdd").textContent).toBe("+ Band");
    expect(has("#fineSuggest")).toBe(false);
    expect(has("#fineClear")).toBe(false);
    // Zoomed to 40m, the row offers it.
    chipBtn("40m").click();
    await until(() => has("#fineSuggest"));
    expect($("#fineSuggest").textContent).toBe("+ 40m");
    const from = device.log.length;
    $("#fineSuggest").click();
    await until(() => fineRow().length === 1 && $("#resNote").textContent!.includes("fine sweep"));
    expect(device.log.slice(from)).toEqual(["scan 7000000 7300000 401 3", "resume"]);
    expect([device.start, device.stop, device.points]).toEqual([3e6, 55e6, 401]);
    expect(fineRow()).toEqual(["40m"]);
    expect(repeats()).toBe("40m");
    // The 3 readings of the full sweep inside 40 m give way to 401.
    expect($("#resNote").textContent).toBe("799 points from the NanoVNA, 40m fine sweep with calibration filled in · zoom in to see readings");
    // Swept, 40m is a chip in the row, and no longer offered.
    expect(has("#fineSuggest")).toBe(false);
    chipBtn("Full sweep").click();
    await until(() => $("#chips button.on")?.textContent === "Full sweep");
    expect(chipBtn("40m").classList.contains("fined")).toBe(true);
    expect($("#bandTable").textContent).toContain("20m");

    // Live scans the band, says so, and resumes the device when it stops.
    const fines = (): number => device.log.filter((c) => c === "scan 7000000 7300000 401 3").length;
    const before = fines();
    $("#liveBtn").click();
    await until(() => fines() >= before + 3);
    expect($("#vnaPanel .status").textContent).toBe("Sweeping 40m live");
    expect($("#liveNote").textContent).toBe("Live: 40m only");
    $("#liveBtn").click();
    await until(() => $("#liveBtn").textContent === "Live" && !device.paused);
    expect($("#vnaPanel .status").textContent).toBe("Connected");
    expect(has("#liveNote")).toBe(false);

    // + Band lists the bands in the range, grays one that a fine sweep would
    // not help, and sweeps a picked band and shows it on the chart.
    $("#fineAdd").click();
    await until(() => has("#fineMenu"));
    const item = (name: string): HTMLButtonElement =>
      [...document.querySelectorAll<HTMLButtonElement>("#fineMenu button")].find((b) => b.firstChild?.textContent === name)!;
    // The stand-in NanoVNA has all of 80 m over SWR 5.
    expect(item("80m").disabled).toBe(true);
    expect(item("80m").textContent).toBe("80mall over the SWR scale");
    expect(item("40m").textContent).toBe("40mswept · sweep again");
    expect(item("20m").disabled).toBe(false);
    item("20m").click();
    await until(() => !has("#fineMenu") && $("#chips button.on")?.textContent === "20m");
    // A second band's fine sweep keeps the first's, and Sweep then repeats the second.
    await until(() => repeats() === "20m" && $("#resNote").textContent!.includes("40m and 20m"));
    expect(fineRow()).toEqual(["40m", "20m"]);
    // 3 readings each in 40 m and 20 m give way to 401 each.
    expect($("#resNote").textContent).toMatch(/^1197 points from the NanoVNA, 40m and 20m fine sweeps with calibration filled in/);
    expect(chipBtn("40m").classList.contains("fined")).toBe(true);
    expect(chipBtn("20m").classList.contains("fined")).toBe(true);
    const sent = device.log.length;
    $("#sweepBtn").click();
    await until(() => device.log.length > sent + 1);
    expect(device.log.slice(sent)[0]).toBe("scan 14000000 14350000 401 3");

    // A click on 40m in the row makes it the one repeated, and sweeps it.
    const again = device.log.length;
    [...document.querySelectorAll<HTMLButtonElement>("#vnaFine button")].find((b) => b.textContent === "40m")!.click();
    await until(() => repeats() === "40m" && device.log.length > again + 1);
    expect(device.log.slice(again)[0]).toBe("scan 7000000 7300000 401 3");
    expect(fineRow()).toEqual(["40m", "20m"]);

    // × drops the fine sweeps at once, while Live's pass of 40m is still running,
    // and that pass does not bring 40m back.
    device.scanMs = 200;
    $("#liveBtn").click();
    await until(() => device.log.at(-1) === "scan 7000000 7300000 401 3");
    $("#fineClear").click();
    await frames(2);
    expect(fineRow()).toEqual([]);
    expect(has("#fineClear")).toBe(false);
    expect($("#resNote").textContent).not.toContain("fine");
    expect(chipBtn("40m").classList.contains("fined")).toBe(false);
    expect($("#liveNote").textContent).toBe("Live");
    // Live's next pass sweeps the whole range; the 40m pass before it was dropped.
    await until(() => device.log.at(-1) === "scan 3000000 55000000 401 3");
    await frames(2);
    expect(chipBtn("40m").classList.contains("fined")).toBe(false);
    expect(chipBtn("20m").classList.contains("fined")).toBe(false);
    $("#liveBtn").click();
    await until(() => $("#liveBtn").textContent === "Live" && !device.paused);
    device.scanMs = 0;
  });

  it("offers no fine sweep where it would add nothing, the band is off the scale, or the calibration is too coarse", async () => {
    const slot = $<HTMLSelectElement>("#vnaSlot");
    const offered = async (n: string, range: string, band: string): Promise<boolean> => {
      fireEvent.change(slot, { target: { value: n } });
      await until(() => $("#vnaRange").textContent === range && !!$("#bandTable").textContent);
      [...document.querySelectorAll<HTMLButtonElement>("#chips button")].find((b) => b.textContent === band)!.click();
      await until(() => $("#chips button.on")?.textContent === band);
      return has("#fineSuggest");
    };
    // The stand-in NanoVNA has all of 80 m over SWR 5, the top of the scale.
    expect(await offered("6", "3–55 MHz · 401 points", "80m")).toBe(false);
    // Calibrated for 20 m itself.
    expect(await offered("2", "14–14.35 MHz · 101 points", "20m")).toBe(false);
    // Calibrated points 9 MHz apart: + Band says so.
    expect(await offered("1", "0.05–900 MHz · 101 points", "2m")).toBe(false);
    $("#fineAdd").click();
    await until(() => has("#fineMenu"));
    const twoM = [...document.querySelectorAll<HTMLButtonElement>("#fineMenu button")].find((b) => b.firstChild?.textContent === "2m")!;
    expect(twoM.disabled).toBe(true);
    expect(twoM.textContent).toBe("2mcalibration too coarse");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await until(() => !has("#fineMenu"));
    // 13–15 MHz: 18 readings in 20 m, and a fine sweep gives 101.
    expect(await offered("4", "13–15 MHz · 101 points", "20m")).toBe(true);
    fireEvent.change(slot, { target: { value: "0" } });
    await until(() => $("#vnaRange").textContent === "144–148 MHz · 101 points");
  });

  it("offers Both by default, and in Points pins only readings", async () => {
    const rows = (kind: string): Element[] => [...document.querySelectorAll("#ptTable tr")].filter((tr) => tr.children[2]?.textContent === kind);
    const pressed = (): string => $("#readingsShown [aria-pressed=true]").textContent!;
    expect(pressed()).toBe("Both");
    [...document.querySelectorAll<HTMLButtonElement>("#readingsShown button")].find((b) => b.textContent === "Points")!.click();
    await until(() => pressed() === "Points");
    // Between the readings at 145.00 and 145.04 MHz, nearer the second.
    const r = $("#chart").getBoundingClientRect(), x = r.left + 46 + ((145.03 - 144) / 4) * (r.width - 60), y = r.top + r.height / 2;
    point($("#chart"), "pointermove", x, y, "mouse", 0);
    point($("#chart"), "pointerdown", x, y);
    point($("#chart"), "pointerup", x, y, "mouse", 0);
    await until(() => rows("Pinned").length === 1);
    expect(+rows("Pinned")[0]!.children[0]!.textContent!).toBe(145.04);
    $<HTMLButtonElement>("#ptTable [data-del]").click();
    await until(() => rows("Pinned").length === 0);
    [...document.querySelectorAll<HTMLButtonElement>("#readingsShown button")].find((b) => b.textContent === "Both")!.click();
    await until(() => pressed() === "Both");
  });

  it("sets the top of the SWR scale, so a peak over 5 reads as its value at 10", async () => {
    const peakSwr = (): string[] => [...document.querySelectorAll("#ptTable tr")].filter((tr) => tr.children[2]?.textContent === "Peak").map((tr) => tr.children[1]!.textContent!);
    const pressed = (): string => $("#scaleTop [aria-pressed=true]").textContent!;
    const pick = (v: string): void => [...document.querySelectorAll<HTMLButtonElement>("#scaleTop button")].find((b) => b.textContent === v)!.click();
    expect(pressed()).toBe("5");
    // Slot 0's peak, near 145.6 MHz, is about SWR 7.15: over a top of 5.
    if (!has("#ptTable")) $("#ptCard h2 button")?.click();
    await until(() => peakSwr().length > 0);
    expect(peakSwr().every((v) => v === "≥ 5")).toBe(true);
    pick("10");
    await until(() => pressed() === "10" && peakSwr().every((v) => /^\d+\.\d\d$/.test(v)));
    expect(+peakSwr()[0]!).toBeGreaterThan(7);
    pick("5");
    await until(() => pressed() === "5");
  });

  it("pins a band edge itself when a click snaps to its tick", async () => {
    const rows = (kind: string): Element[] => [...document.querySelectorAll("#ptTable tr")].filter((tr) => tr.children[2]?.textContent === kind);
    // Slot 0, 144–148 MHz: 2 m ends at the chart's right edge.
    const r = $("#chart").getBoundingClientRect(), x = r.right - 14;
    const w = Math.min(5, fakeSwr(148e6)), py0 = r.top + 54, py1 = r.bottom - 108, y = py1 - ((w - 1) / 4) * (py1 - py0);
    point($("#chart"), "pointermove", x - 4, y + 3, "mouse", 0);
    point($("#chart"), "pointerdown", x - 4, y + 3);
    point($("#chart"), "pointerup", x - 4, y + 3, "mouse", 0);
    await until(() => rows("Pinned").length === 1);
    expect(+rows("Pinned")[0]!.children[0]!.textContent!).toBe(148);
    $<HTMLButtonElement>("#ptTable [data-del]").click();
    await until(() => rows("Pinned").length === 0);
  });

  it("disconnects from Change, and keeps the last sweep on the page", async () => {
    $("#changeBtn").click();
    await until(() => has("#vnaBtn"));
    // As a scan typed in the shell leaves it.
    device.paused = true;
    $("#vnaBtn").click();
    await until(() => $("#vnaBtn").textContent === "Connect NanoVNA");
    expect(has("#vnaPanel")).toBe(false);
    expect(device.paused).toBe(false);
    expect($("#bandTable").textContent).toContain("2m");
    expect(has(".app.no-data")).toBe(false);
  });

  it("brings the last sweep back after a refresh as the NanoVNA's, not as an opened file", async () => {
    await mount();
    await until(() => $("#bandTable").textContent!.includes("2m"));
    expect(has("#fileName")).toBe(false);
    expect($("#resNote").textContent).toContain("from the NanoVNA");
    // Connecting sweeps afresh, and the card still names no file.
    $("#vnaBtn").click();
    await until(() => has("#vnaPanel"));
    expect(has("#fileName")).toBe(false);
  });
});
