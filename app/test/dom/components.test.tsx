/* The components' markup and wiring, in jsdom. */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { analyze } from "@/analysis";
import { AnalyzeCard, CalibrateCard, LoadCard } from "@/ui/Cards";
import { Landing } from "@/ui/Landing";
import { DEFAULT_FIELDS, DEFAULT_PREFS, checkAt, settingsOf } from "@/ui/model";
import { BandTable, PointsTable } from "@/ui/Tables";
import { MATCH, OK } from "@/ui/colors";
import type { Vna } from "@/ui/useVna";
import type { NanoVNA } from "@/vna";

/** A V-shaped dip at 14.2 MHz across 3–30 MHz. */
function vSweep(): { f: number[]; s: number[] } {
  const f = Array.from({ length: 541 }, (_, i) => 3 + (27 * i) / 540);
  return { f, s: f.map((x) => 1.1 + 0.6 * Math.abs(x - 14.2)) };
}
const settings = settingsOf({ ...DEFAULT_FIELDS, start: "3", stop: "30" }, DEFAULT_PREFS);
const an = (() => { const { f, s } = vSweep(); return analyze(f, s, { thr: 3, prom: 0.2, top: 5 })!; })();

const vnaStub = (over: Partial<Vna> = {}): Vna => ({
  unsupported: "", device: null, range: null, live: false, note: "",
  connect: vi.fn(async () => undefined), disconnect: vi.fn(async () => undefined), sweep: vi.fn(async () => undefined),
  setLive: vi.fn(), recall: vi.fn(async () => undefined), ...over,
});

describe("AnalyzeCard", () => {
  const curve = (() => { const { f, s } = vSweep(); return { N: f.length, f: Float64Array.from(f), s: Float64Array.from(s) }; })();
  const card = (f: number | null, onPref = vi.fn(), onPin = vi.fn()) => render(
    <AnalyzeCard prefs={DEFAULT_PREFS} onPref={onPref} onPin={onPin} check={f === null ? null : checkAt(curve, settings, f)}
      sweep={[an.fmin, an.fmax]} thr={settings.thr} top={settings.top} />,
  );

  it("sends the typed frequency up", () => {
    const onPref = vi.fn();
    card(null, onPref);
    fireEvent.change(screen.getByLabelText("Frequency"), { target: { value: "14.3" } });
    expect(onPref).toHaveBeenCalledWith("freq", "14.3");
    expect(document.getElementById("freqCheck")).toBeNull();
  });

  it("pins the frequency on Enter", () => {
    const onPin = vi.fn();
    card(14.3, vi.fn(), onPin);
    fireEvent.keyDown(screen.getByLabelText("Frequency"), { key: "a" });
    expect(onPin).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText("Frequency"), { key: "Enter" });
    expect(onPin).toHaveBeenCalledOnce();
  });

  it("says you may transmit in your segment under Max SWR", () => {
    card(14.3);
    const r = document.getElementById("freqCheck")!;
    expect(r).toHaveTextContent("You may transmit");
    expect(r).toHaveTextContent("SWR 1.16");
    expect(r).toHaveTextContent("20m · Phone/image");
  });

  it("says why not over Max SWR or outside your segments", () => {
    card(11);
    const r = document.getElementById("freqCheck")!;
    expect(r).toHaveTextContent("Do not transmit");
    expect(r).toHaveTextContent("over Max SWR 3");
    expect(r).toHaveTextContent("Not in an amateur band");
  });

  it("gives no verdict where the sweep has no reading and the band plan allows it", () => {
    card(50.5);
    const r = document.getElementById("freqCheck")!;
    expect(r).toHaveTextContent("Outside the sweep (3.000–30.000 MHz)");
    expect(r).toHaveTextContent("6m · All modes");
    expect(r).not.toHaveTextContent("transmit");
  });
});

describe("Landing", () => {
  it("offers both ways in", () => {
    const onConnect = vi.fn(), onOpen = vi.fn();
    render(<Landing heroRef={{ current: null }} onConnect={onConnect} unsupported="" note="" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect NanoVNA" }));
    fireEvent.click(screen.getByRole("button", { name: "Open a photo or .s1p file" }));
    expect(onConnect).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.getByRole("img", { name: "NanoBands" })).toBeInTheDocument();
  });

  it("says why Connect cannot work in this browser", () => {
    render(<Landing heroRef={{ current: null }} onConnect={() => {}} unsupported="Live sweeps need Chrome or Edge on a computer." note="" onOpen={() => {}} />);
    expect(screen.getByRole("button", { name: "Connect NanoVNA" })).toBeDisabled();
    expect(screen.getByText("Live sweeps need Chrome or Edge on a computer.")).toBeInTheDocument();
  });
});

describe("LoadCard", () => {
  it("offers Connect, full width, before a device is connected", () => {
    const vna = vnaStub();
    render(<LoadCard source={null} fileName={null} over={false} onBrowse={() => {}} vna={vna} />);
    const btn = screen.getByRole("button", { name: "Connect NanoVNA" });
    expect(btn).toHaveClass("wide");
    expect(screen.queryByRole("button", { name: "Sweep" })).toBeNull();
    fireEvent.click(btn);
    expect(vna.connect).toHaveBeenCalledOnce();
  });

  it("shows the device, its slots, and Sweep, Live and Disconnect once connected", () => {
    const device = { info: { board: "NanoVNA-H 4", version: "1.2.44", slots: 7, method: "mask" } } as NanoVNA;
    const vna = vnaStub({ device, range: { start: 3e6, stop: 55e6, points: 401 } });
    const { container } = render(<LoadCard source="vna" fileName="nanovna-3-55mhz.s1p" over={false} onBrowse={() => {}} vna={vna} />);
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(container.querySelector("#vnaInfo")).toHaveTextContent("NanoVNA-H 4 · firmware 1.2.44");
    expect(screen.getByText("3–55 MHz · 401 points")).toBeInTheDocument();
    expect(container.querySelector("#drop")).not.toHaveTextContent("nanovna-3-55mhz.s1p");
    expect(screen.getAllByRole("option")).toHaveLength(8);
    fireEvent.change(screen.getByLabelText("Calibration"), { target: { value: "2" } });
    expect(vna.recall).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect(vna.setLive).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: "Disconnect" })).not.toHaveClass("wide");
  });

  it("shows Hold while live, and no Sweep to press", () => {
    const device = { info: { board: "NanoVNA", version: "0.4.5", slots: 5, method: "scan" } } as NanoVNA;
    render(<LoadCard source={null} fileName={null} over={false} onBrowse={() => {}} vna={vnaStub({ device, range: { start: 1e6, stop: 30e6, points: 101 }, live: true })} />);
    expect(screen.getByText("Sweeping live")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hold" })).toHaveClass("on");
    expect(screen.getByRole("button", { name: "Sweep" })).toBeDisabled();
  });
});

describe("CalibrateCard", () => {
  it("offers a reading when the sweep was typed, and uses it on request", () => {
    const onUse = vi.fn();
    render(
      <CalibrateCard fields={DEFAULT_FIELDS} onField={() => {}} grid={{ kind: "found", horizontal: 9, vertical: 7 }} straight onStraight={() => {}}
        ocr={{ kind: "offer", start: 3, stop: 55, raw: "START 3 / STOP 55" }} onUseOcr={onUse} onDetectGrid={() => {}}
        mode="idle" onRefMode={() => {}} refs={[]} onRemoveRef={() => {}} />,
    );
    expect(screen.getByText(/Grid found/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit corners" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use it" }));
    expect(onUse).toHaveBeenCalledOnce();
  });

  it("sends field edits up", () => {
    const onField = vi.fn();
    render(<CalibrateCard fields={DEFAULT_FIELDS} onField={onField} grid={null} ocr={null} straight onStraight={() => {}} onUseOcr={() => {}} onDetectGrid={() => {}}
      mode="idle" onRefMode={() => {}} refs={[{ u: 0.5, f: 14 }]} onRemoveRef={() => {}} />);
    fireEvent.change(document.querySelector("#fStart")!, { target: { value: "1.8" } });
    expect(onField).toHaveBeenCalledWith("start", "1.8");
    expect(screen.getByText("add one more…")).toBeInTheDocument();
  });
});

describe("the tables", () => {
  it("say there is no data before there is", () => {
    render(<BandTable an={null} settings={settings} />);
    expect(screen.getByText("No data yet.")).toBeInTheDocument();
  });

  it("mark 20 m all usable for a dip in the middle of it", () => {
    render(<BandTable an={an} settings={settings} />);
    const row = screen.getByText("20m").closest("td")!;
    expect(row).toHaveTextContent("all usable");
  });

  it("list the crossings and the dip, and remove a pin", () => {
    const onRemove = vi.fn();
    render(<PointsTable an={an} settings={settings} manual={[7.1]} swr={() => 5.1} onRemove={onRemove} />);
    expect(screen.getByText("Dip (best match)")).toBeInTheDocument();
    expect(screen.getByText("Drops below 3")).toBeInTheDocument();
    expect(screen.getByText("Rises above 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "remove" }));
    expect(onRemove).toHaveBeenCalledWith(7.1);
  });

  it("color a dip as the chart colors the curve there", () => {
    // The dip at 14.2 MHz falls between General's 20 m segments, and in Extra's.
    const { unmount } = render(<PointsTable an={an} settings={settings} manual={[]} swr={() => NaN} onRemove={() => undefined} />);
    expect(screen.getByText("Dip (best match)")).toHaveStyle({ color: MATCH });
    unmount();
    render(<PointsTable an={an} settings={{ ...settings, cls: "E" }} manual={[]} swr={() => NaN} onRemove={() => undefined} />);
    expect(screen.getByText("Dip (best match)")).toHaveStyle({ color: OK });
  });
});
