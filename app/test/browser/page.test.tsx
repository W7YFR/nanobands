/* The page end to end: the React app mounted in Chromium, a real photo
 * dropped on it, and a stand-in NanoVNA connected to it.
 *
 * OCR is the one thing replaced. The real Tesseract.js comes from a CDN and
 * takes seconds; a stand-in on window.Tesseract answers with the text the
 * NanoVNA's screen says, so what is tested is the wiring around it.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "@/ui/base.css";
import photo from "../data/random-wire-3-55mhz.jpg?url";
import pkg from "../../../package.json";
import { FakeNanoVNA } from "@/vna-fake";
import { detectGrid } from "@/grid";

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
const frames = (n: number): Promise<void> =>
  new Promise((r) => { let k = 0; const f = (): void => { if (++k >= n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });

// Synthetic pointers have no real pointer to capture; capture is the
// browser's business, not the page's, so let it pass.
const capture = Element.prototype.setPointerCapture;
afterAll(() => { Element.prototype.setPointerCapture = capture; });

beforeAll(async () => {
  Element.prototype.setPointerCapture = () => undefined;
  indexedDB.deleteDatabase("nanobands");
  localStorage.clear();
  window.Tesseract = {
    createWorker: async () => ({
      setParameters: async () => undefined,
      recognize: async () => ({ data: { text: "START 3.000 000 MHz\nBW:1000Hz 401p\nSTOP 55.000 000 MHz", lines: null } }),
      terminate: async () => undefined,
    }),
  };
  Object.defineProperty(navigator, "serial", { value: device.serial(), configurable: true });
  const { App } = await import("@/ui/App");
  const root = document.createElement("div");
  document.body.appendChild(root);
  createRoot(root).render(<StrictMode><App /></StrictMode>);
  await until(() => has(".app") && !has(".app.booting"));
});

describe("the page", () => {
  it("shows the version from package.json in its footer", () => {
    expect($("#version").textContent).toBe(pkg.version);
    expect($("#year").textContent).toBe(String(new Date().getFullYear()));
  });

  it("starts on the landing, with no Clear and no page", () => {
    expect(has(".app.no-data")).toBe(true);
    expect(has("#landing")).toBe(true);
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
    expect($("#fileName").textContent).toBe("random-wire.jpg");
    expect($("#gridNote").textContent).toContain("Grid found");
    expect($("#calSummary").textContent).toBe("3–55 MHz · SWR 1–5");
    expect($("#ocrNote").textContent).toContain("3–55 MHz");
    expect($<HTMLInputElement>("#fStart").value).toBe("3");
    expect($("#straightBtn").textContent).toBe("Edit corners");
    expect($("#clearAll").classList.contains("ghost")).toBe(false);
    expect(has("#landing")).toBe(false);
    expect(getComputedStyle($("header h1")).visibility).toBe("visible");

    const rows = [...document.querySelectorAll<HTMLTableRowElement>("#ptTable tr")].map((r) => r.textContent ?? "");
    expect(rows.filter((r) => /Drops below 3|Rises above 3/.test(r))).toHaveLength(9);
    expect(rows.some((r) => r.startsWith("4.640"))).toBe(true);
    // General class, 3:1: 20 m is all usable, 40 m is not.
    const bands = $("#bandTable").textContent ?? "";
    expect(bands).toMatch(/20m\s*all usable/);
    expect(bands).toMatch(/40m\s*none/);
  });

  it("filters the table by mode", async () => {
    fireEvent.change($("#mode"), { target: { value: "phone" } });
    await until(() => $("#bandTable").textContent!.includes("No phone privileges here for this license class"));
    fireEvent.change($("#mode"), { target: { value: "any" } });
    await until(() => !$("#bandTable").textContent!.includes("No phone privileges"));
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
      tap($("#chart"), x2, y);
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

  it("starts over on Clear", async () => {
    $("#clearAll").click();
    await until(() => has("#landing"));
    expect($("#clearAll").classList.contains("ghost")).toBe(true);
    expect(has(".app.no-data")).toBe(true);
  });
});

describe("a connected NanoVNA", () => {
  it("connects from the landing, reads the device and sweeps its range", async () => {
    $("#landConnect").click();
    await until(() => has("#vnaInfo") && $("#bandTable").textContent!.includes("20m"));
    expect($("#vnaInfo").textContent).toBe("NanoVNA-H 4 · firmware 1.2.44");
    expect($("#vnaRange").textContent).toBe("3–55 MHz · 401 points");
    expect($("#vnaBtn").textContent).toBe("Disconnect");
    expect($("#resNote").textContent).toContain("401 points from the NanoVNA");
    expect(has("#photoCard")).toBe(false);
    expect(has("#expS1p")).toBe(true);
    expect(device.log).toContain("scan 3000000 55000000 401 3");
  });

  it("keeps pins across live sweeps, and stops on Hold", async () => {
    const pinned = document.querySelectorAll("#ptTable [data-del]").length;
    const scans = (): number => device.log.filter((c) => c.startsWith("scan")).length;
    const before = scans();
    $("#liveBtn").click();
    await until(() => $("#liveBtn").textContent === "Hold");
    expect($<HTMLButtonElement>("#sweepBtn").disabled).toBe(true);
    await until(() => scans() >= before + 3);
    $("#liveBtn").click();
    await until(() => $("#liveBtn").textContent === "Live");
    expect(document.querySelectorAll("#ptTable [data-del]").length).toBe(pinned);
  });

  it("recalls a calibration slot and sweeps its range", async () => {
    const slot = $<HTMLSelectElement>("#vnaSlot");
    expect(slot.options).toHaveLength(8);
    fireEvent.change(slot, { target: { value: "1" } });
    await until(() => $("#vnaRange").textContent === "144–148 MHz · 101 points");
    expect($("#bandTable").textContent).toContain("2m");
  });

  it("disconnects, and keeps the last sweep on the page", async () => {
    $("#vnaBtn").click();
    await until(() => $("#vnaBtn").textContent === "Connect NanoVNA");
    expect(has("#vnaPanel")).toBe(false);
    expect($("#bandTable").textContent).toContain("2m");
    expect(has(".app.no-data")).toBe(false);
  });
});
