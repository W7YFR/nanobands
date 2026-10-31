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
import { beforeAll, describe, expect, it } from "vitest";
import "@/ui/base.css";
import photo from "../data/random-wire-3-55mhz.jpg?url";
import pkg from "../../../package.json";
import { FakeNanoVNA } from "@/vna-fake";

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

beforeAll(async () => {
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
