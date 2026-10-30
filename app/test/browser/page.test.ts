/* The page end to end: its own markup, its own controller, a real photo
 * dropped on it.
 *
 * OCR is the one thing replaced. The real Tesseract.js comes from a CDN and
 * takes seconds; a stand-in on window.Tesseract answers with the text the
 * NanoVNA's screen says, so what is tested is the wiring around it.
 */

import { beforeAll, describe, expect, it } from "vitest";
import "@/style.css";
import html from "../../index.html?raw";
import photo from "../data/random-wire-3-55mhz.jpg?url";
import pkg from "../../../package.json";

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector<T>(sel)!;

async function until(test: () => boolean, ms = 20000): Promise<void> {
  const t0 = performance.now();
  while (!test()) {
    if (performance.now() - t0 > ms) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 50));
  }
}

beforeAll(async () => {
  indexedDB.deleteDatabase("nanobands");
  localStorage.clear();
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script").forEach((s) => s.remove());
  document.body.innerHTML = doc.body.innerHTML;
  window.Tesseract = {
    createWorker: async () => ({
      setParameters: async () => undefined,
      recognize: async () => ({ data: { text: "START 3.000 000 MHz\nBW:1000Hz 401p\nSTOP 55.000 000 MHz", lines: null } }),
      terminate: async () => undefined,
    }),
  };
  const { start } = await import("@/ui/app");
  start();
});

describe("the page", () => {
  it("shows the version from package.json in its footer", () => {
    expect($("#version").textContent).toBe(pkg.version);
    expect($("#year").textContent).toBe(String(new Date().getFullYear()));
  });

  it("starts empty, with no Clear and no photo controls", () => {
    expect($("#clearAll").classList.contains("hidden")).toBe(true);
    expect($("#straightBtn").classList.contains("hidden")).toBe(true);
    expect($("#bandTable").textContent).toContain("No data yet");
  });

  it("finds the grid, reads the sweep and fills the tables from a dropped photo", async () => {
    const blob = await (await fetch(photo)).blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "random-wire.jpg", { type: "image/jpeg" }));
    const input = $<HTMLInputElement>("#file");
    input.files = dt.files;
    input.dispatchEvent(new Event("change"));

    await until(() => $<HTMLInputElement>("#fStop").value === "55");
    expect($("#drop").textContent).toContain("random-wire.jpg");
    expect($("#gridNote").textContent).toContain("Grid found (9 horizontal, 7 vertical lines)");
    expect($("#ocrNote").textContent).toContain("3–55 MHz");
    expect($<HTMLInputElement>("#fStart").value).toBe("3");
    expect($("#straightBtn").textContent).toBe("Edit corners");
    expect($("#clearAll").classList.contains("hidden")).toBe(false);

    const rows = [...document.querySelectorAll<HTMLTableRowElement>("#ptTable tr")].map((r) => r.textContent ?? "");
    expect(rows.filter((r) => /Drops below 3|Rises above 3/.test(r))).toHaveLength(9);
    expect(rows.some((r) => r.startsWith("4.640"))).toBe(true);
    // General class, 3:1: 20 m is all usable, 40 m is not.
    const bands = $("#bandTable").textContent ?? "";
    expect(bands).toMatch(/20m\s*all usable/);
    expect(bands).toMatch(/40m\s*none/);
  });

  it("filters the table by mode", async () => {
    const mode = $<HTMLSelectElement>("#mode");
    mode.value = "phone";
    mode.dispatchEvent(new Event("input"));
    expect($("#bandTable").textContent).toContain("No phone privileges here for this license class");
    mode.value = "any";
    mode.dispatchEvent(new Event("input"));
  });

  it("collapses and expands the photo", () => {
    $("#collapseBtn").click();
    expect($("#photoCard").classList.contains("collapsed")).toBe(true);
    expect($("#collapseBtn").textContent).toBe("Expand");
    $("#collapseBtn").click();
    expect($("#photoCard").classList.contains("collapsed")).toBe(false);
  });

  it("starts over on Clear", () => {
    $("#clearAll").click();
    expect($("#clearAll").classList.contains("hidden")).toBe(true);
    expect($<HTMLInputElement>("#fStart").value).toBe("");
    expect($("#drop").textContent).toContain("Drop / paste a photo");
    expect($("#bandTable").textContent).toContain("No data yet");
  });
});
