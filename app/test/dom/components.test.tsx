/* The components' markup and wiring, in jsdom. */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyze } from "@/analysis";
import { AnalyzeCard, CalibrateCard, LoadCard } from "@/ui/Cards";
import { Landing } from "@/ui/Landing";
import { BANDS } from "@/bands";
import { DEFAULT_FIELDS, DEFAULT_PREFS, bandView, checkAt, settingsOf } from "@/ui/model";
import { BandTable, PointsTable } from "@/ui/Tables";
import { MATCH, OK } from "@/ui/colors";
import type { Vna } from "@/ui/useVna";
import type { NanoVNA } from "@/vna";
import type { Slot } from "@/slots";

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
  setLive: vi.fn(), recall: vi.fn(async () => undefined),
  slots: null, slot: null, reading: false, readSlots: vi.fn(async () => undefined), command: vi.fn(async () => []), reread: vi.fn(async () => undefined),
  fine: null, setFine: vi.fn(async () => undefined), cal: null, ...over,
});

describe("AnalyzeCard", () => {
  const curve = (() => { const { f, s } = vSweep(); return { N: f.length, f: Float64Array.from(f), s: Float64Array.from(s) }; })();
  const card = (f: number | null, onPref = vi.fn(), onPin = vi.fn(), onView = vi.fn()) => render(
    <AnalyzeCard prefs={DEFAULT_PREFS} onPref={onPref} onPin={onPin} onView={onView} check={f === null ? null : checkAt(curve, settings, f)}
      sweep={[an.fmin, an.fmax]} thr={settings.thr} top={settings.top} />,
  );

  it("sends the typed frequency up", () => {
    const onPref = vi.fn();
    card(null, onPref);
    fireEvent.change(screen.getByLabelText("Frequency"), { target: { value: "14.3" } });
    expect(onPref).toHaveBeenCalledWith("freq", "14.3");
    expect(document.getElementById("freqCheck")).toBeNull();
  });

  it("clears the frequency with its ×, and shows no × when empty", () => {
    const onPref = vi.fn();
    const { unmount } = render(<AnalyzeCard prefs={DEFAULT_PREFS} onPref={onPref} onPin={vi.fn()} onView={vi.fn()} check={null} sweep={null} thr={3} top={5} />);
    expect(screen.queryByRole("button", { name: "Clear frequency" })).toBeNull();
    unmount();
    render(<AnalyzeCard prefs={{ ...DEFAULT_PREFS, freq: "14.3" }} onPref={onPref} onPin={vi.fn()} onView={vi.fn()} check={null} sweep={null} thr={3} top={5} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear frequency" }));
    expect(onPref).toHaveBeenCalledWith("freq", "");
    expect(screen.getByLabelText("Frequency")).toHaveFocus();
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

  it("says not to transmit at the top of the scale, even with the top at Max SWR", () => {
    const s3 = settingsOf({ ...DEFAULT_FIELDS, start: "3", stop: "30", top: "3" }, DEFAULT_PREFS);
    const flat = { ...curve, s: curve.s.map((w) => Math.min(3, w)) };
    render(<AnalyzeCard prefs={DEFAULT_PREFS} onPref={vi.fn()} onPin={vi.fn()} onView={vi.fn()} check={checkAt(flat, s3, 21.3)}
      sweep={[an.fmin, an.fmax]} thr={3} top={3} />);
    const r = document.getElementById("freqCheck")!;
    expect(r).toHaveTextContent("Do not transmit");
    expect(r).toHaveTextContent("SWR ≥ 3, off the top of the scale");
  });

  it("offers View inside the sweep only", () => {
    const onView = vi.fn();
    card(14.3, vi.fn(), vi.fn(), onView);
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(onView).toHaveBeenCalledOnce();
  });

  it("gives no verdict where the sweep has no reading and the band plan allows it", () => {
    card(50.5);
    const r = document.getElementById("freqCheck")!;
    expect(r).toHaveTextContent("Outside the sweep (3.000–30.000 MHz)");
    expect(r).toHaveTextContent("6m · All modes");
    expect(r).not.toHaveTextContent("transmit");
    expect(screen.queryByRole("button", { name: "View" })).toBeNull();
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

  it("marks the step done once connected, and keeps the device, its slots, Sweep and Live in view", () => {
    const device = { info: { board: "NanoVNA-H 4", version: "1.2.44", slots: 7, method: "mask" } } as NanoVNA;
    const vna = vnaStub({ device, range: { start: 3e6, stop: 55e6, points: 401 } });
    const { container } = render(<LoadCard source="vna" fileName="nanovna-3-55mhz.s1p" over={false} onBrowse={() => {}} vna={vna} />);
    expect(container.querySelector("#loadCard .step")).toHaveClass("done");
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(container.querySelector("#vnaInfo")).toHaveTextContent("NanoVNA-H 4 · firmware 1.2.44");
    expect(screen.getByText("3–55 MHz · 401 points")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(8);
    fireEvent.change(screen.getByLabelText("Calibration"), { target: { value: "2" } });
    expect(vna.recall).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect(vna.setLive).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: "Shell" })).toBeInTheDocument();
    // Disconnect and a file wait behind Change.
    expect(screen.queryByRole("button", { name: "Disconnect" })).toBeNull();
    expect(container.querySelector("#drop")).toBeNull();
  });

  it("names each slot from the last Read, and selects the one the device is on", () => {
    const device = { info: { board: "NanoVNA-H 4", version: "1.2.44", slots: 7, method: "mask" } } as NanoVNA;
    const cal = ["load", "isoln", "Es", "Er", "Et", "cal'ed"];
    const slots: Slot[] = [
      { kind: "set", range: { start: 144e6, stop: 148e6, points: 101 }, cal },
      { kind: "set", range: { start: 13e6, stop: 15e6, points: 101 }, cal: ["load", "Es", "Er", "cal'ed"] },
      { kind: "empty" }, { kind: "unknown" },
    ];
    const vna = vnaStub({ device, range: { start: 144e6, stop: 148e6, points: 101 }, slots, slot: 0 });
    render(<LoadCard source="vna" fileName={null} over={false} onBrowse={() => {}} vna={vna} />);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Slot 0 · 144–148 MHz", "Slot 1 · 13–15 MHz · S11 only", "Slot 2 · empty", "Slot 3 · unknown",
      "Slot 4", "Slot 5", "Slot 6",
    ]);
    expect(screen.getByLabelText("Calibration")).toHaveValue("0");
    // The device is on a known slot, so Read starts at once.
    fireEvent.click(screen.getByRole("button", { name: "Read" }));
    expect(vna.readSlots).toHaveBeenCalledOnce();
  });

  it("warns when the device applies no calibration", () => {
    const device = { info: { board: "NanoVNA-H 4", version: "1.2.44", slots: 7, method: "mask" } } as NanoVNA;
    const range = { start: 3e6, stop: 55e6, points: 401 };
    const { container, rerender } = render(<LoadCard source="vna" fileName={null} over={false} onBrowse={() => {}} vna={vnaStub({ device, range, cal: ["load", "open", "short"] })} />);
    expect(container.querySelector("#vnaUncal")).toHaveTextContent("No calibration applied");
    rerender(<LoadCard source="vna" fileName={null} over={false} onBrowse={() => {}} vna={vnaStub({ device, range, cal: ["load", "isoln", "Es", "Er", "Et", "cal'ed"] })} />);
    expect(container.querySelector("#vnaUncal")).toBeNull();
    // Before the terms are read, there is nothing to warn about yet.
    rerender(<LoadCard source="vna" fileName={null} over={false} onBrowse={() => {}} vna={vnaStub({ device, range, cal: null })} />);
    expect(container.querySelector("#vnaUncal")).toBeNull();
  });

  it("warns before Read when the device may hold a calibration no slot keeps", () => {
    const device = { info: { board: "NanoVNA-H 4", version: "1.2.44", slots: 7, method: "mask" } } as NanoVNA;
    const vna = vnaStub({ device, range: { start: 3e6, stop: 55e6, points: 401 } });
    render(<LoadCard source="vna" fileName={null} over={false} onBrowse={() => {}} vna={vna} />);
    fireEvent.click(screen.getByRole("button", { name: "Read" }));
    const ask = screen.getByRole("alertdialog", { name: "Read the slots?" });
    expect(ask).toHaveTextContent("will cause the device to lose the current calibration");
    expect(screen.getByRole("button", { name: "Read slots" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    // Escape cancels too.
    fireEvent.click(screen.getByRole("button", { name: "Read" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(vna.readSlots).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Read" }));
    fireEvent.click(screen.getByRole("button", { name: "Read slots" }));
    expect(vna.readSlots).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("shows Reading… and holds the menu while it reads", () => {
    const device = { info: { board: "NanoVNA-H 4", version: "1.2.44", slots: 7, method: "mask" } } as NanoVNA;
    render(<LoadCard source="vna" fileName={null} over={false} onBrowse={() => {}} vna={vnaStub({ device, range: { start: 3e6, stop: 55e6, points: 401 }, reading: true })} />);
    expect(screen.getByRole("button", { name: "Reading…" })).toBeDisabled();
    expect(screen.getByLabelText("Calibration")).toBeDisabled();
  });

  it("offers Disconnect and a file behind Change while connected", () => {
    const device = { info: { board: "NanoVNA-H 4", version: "1.2.44", slots: 7, method: "mask" } } as NanoVNA;
    const vna = vnaStub({ device, range: { start: 3e6, stop: 55e6, points: 401 } });
    const onBrowse = vi.fn();
    const { container } = render(<LoadCard source="vna" fileName="nanovna-3-55mhz.s1p" over={false} onBrowse={onBrowse} vna={vna} />);
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(container.querySelector("#drop")).not.toHaveTextContent("nanovna-3-55mhz.s1p");
    fireEvent.click(container.querySelector("#drop")!);
    expect(onBrowse).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(vna.disconnect).toHaveBeenCalledOnce();
    // With the choices open, the panel keeps the device's name, and its settings step aside.
    expect(container.querySelector("#vnaInfo")).toHaveTextContent("NanoVNA-H 4 · firmware 1.2.44");
    for (const name of ["Sweep", "Live", "Shell"]) expect(screen.queryByRole("button", { name })).toBeNull();
    expect(screen.queryByLabelText("Calibration")).toBeNull();
    expect(container.querySelector("#vnaRange")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Sweep" })).toBeInTheDocument();
  });

  it("keeps a connected device's panel in view with a photo open, and offers Disconnect and another file behind Change", () => {
    const device = { info: { board: "NanoVNA-H 4", version: "1.2.44", slots: 7, method: "mask" } } as NanoVNA;
    const vna = vnaStub({ device, range: { start: 3e6, stop: 55e6, points: 401 } });
    const { container } = render(<LoadCard source="image" fileName="wire.jpg" over={false} onBrowse={() => {}} vna={vna} />);
    expect(container.querySelector("#fileName")).toHaveTextContent("wire.jpg");
    expect(container.querySelector("#vnaPanel")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Shell" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disconnect" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Open another file" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open another file" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Shell" })).toBeNull();
  });

  it("offers another file or the NanoVNA behind Change with only a file open", () => {
    const { container } = render(<LoadCard source="image" fileName="wire.jpg" over={false} onBrowse={() => {}} vna={vnaStub()} />);
    expect(container.querySelector("#vnaPanel")).toBeNull();
    expect(screen.queryByRole("button", { name: "Connect NanoVNA" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByRole("button", { name: "Open another file" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect NanoVNA" })).toBeInTheDocument();
  });

  it("shows Hold while live, and no Sweep to press", () => {
    const device = { info: { board: "NanoVNA", version: "0.4.5", slots: 5, method: "scan" } } as NanoVNA;
    render(<LoadCard source={null} fileName={null} over={false} onBrowse={() => {}} vna={vnaStub({ device, range: { start: 1e6, stop: 30e6, points: 101 }, live: true })} />);
    expect(screen.getByText("Sweeping live")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hold" })).toHaveClass("on");
    expect(screen.getByRole("button", { name: "Sweep" })).toBeDisabled();
  });
});

describe("the shell", () => {
  /** The Load card, where Shell sits in the device panel's top row. */
  const ShellCard = ({ vna }: { vna: Vna }) => <LoadCard source="vna" fileName={null} over={false} onBrowse={() => {}} vna={vna} />;
  const device = { info: { board: "NanoVNA-H 4", version: "1.2.44", slots: 7, method: "mask" } } as NanoVNA;
  // Each test opens the window as for the first time.
  beforeEach(() => localStorage.clear());

  it("is offered only while a device is connected", () => {
    const { rerender } = render(<ShellCard vna={vnaStub()} />);
    expect(screen.queryByRole("button", { name: "Shell" })).toBeNull();
    rerender(<ShellCard vna={vnaStub({ device })} />);
    expect(screen.getByRole("button", { name: "Shell" })).toBeEnabled();
  });

  it("keeps the window open when the device disconnects", () => {
    const { rerender } = render(<ShellCard vna={vnaStub({ device })} />);
    fireEvent.click(screen.getByRole("button", { name: "Shell" }));
    rerender(<ShellCard vna={vnaStub()} />);
    expect(screen.queryByRole("button", { name: "Shell" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Shell" })).toHaveTextContent("Not connected");
    expect(screen.getByLabelText("Command")).toBeDisabled();
  });

  it("opens the window over the page, holds Live, and reads the range again on close", () => {
    const vna = vnaStub({ device, live: true });
    render(<ShellCard vna={vna} />);
    fireEvent.click(screen.getByRole("button", { name: "Shell" }));
    expect(vna.setLive).toHaveBeenCalledWith(false);
    const dialog = screen.getByRole("dialog", { name: "Shell" });
    expect(dialog.parentElement).toBe(document.body);
    expect(screen.getByLabelText("Command")).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(vna.reread).toHaveBeenCalledOnce();
  });

  it("sends a command, shows the reply, and steps back through what was typed", async () => {
    const vna = vnaStub({ device, command: vi.fn(async () => ["3000000 55000000 401"]) });
    render(<ShellCard vna={vna} />);
    fireEvent.click(screen.getByRole("button", { name: "Shell" }));
    const input = screen.getByLabelText("Command");
    fireEvent.change(input, { target: { value: " sweep " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(vna.command).toHaveBeenCalledWith("sweep");
    expect(await screen.findByText("3000000 55000000 401")).toBeInTheDocument();
    expect(screen.getByText("ch> sweep")).toBeInTheDocument();
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input).toHaveValue("sweep");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveValue("");
  });

  it("shows an error, and does not send a command that takes over the port", async () => {
    const vna = vnaStub({ device, command: vi.fn(async () => { throw new Error('The NanoVNA does not know the command "bogus".'); }) });
    render(<ShellCard vna={vna} />);
    fireEvent.click(screen.getByRole("button", { name: "Shell" }));
    const input = screen.getByLabelText("Command");
    fireEvent.change(input, { target: { value: "reset" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(vna.command).not.toHaveBeenCalled();
    expect(screen.getByText(/^Not sent\. Restarts the device/)).toHaveClass("err");
    fireEvent.change(input, { target: { value: "bogus" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByText(/does not know the command/)).toHaveClass("err");
  });

  it("warns to only run commands you understand", () => {
    render(<ShellCard vna={vnaStub({ device })} />);
    fireEvent.click(screen.getByRole("button", { name: "Shell" }));
    expect(document.getElementById("shellWarn")).toHaveTextContent("Only run commands you understand.");
  });

  it("opens with the list of commands the first time, then as last left", () => {
    const { unmount } = render(<ShellCard vna={vnaStub({ device })} />);
    fireEvent.click(screen.getByRole("button", { name: "Shell" }));
    const q = screen.getByRole("button", { name: "Commands" });
    expect(q).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(q);
    expect(q).toHaveAttribute("aria-expanded", "false");
    unmount();
    render(<ShellCard vna={vnaStub({ device })} />);
    fireEvent.click(screen.getByRole("button", { name: "Shell" }));
    expect(screen.getByRole("button", { name: "Commands" })).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("shellHelp")).toBeNull();
  });

  it("lists the commands beside the prompt with ?, and puts a picked one in the prompt", () => {
    render(<ShellCard vna={vnaStub({ device })} />);
    fireEvent.click(screen.getByRole("button", { name: "Shell" }));
    const q = screen.getByRole("button", { name: "Commands" });
    expect(q).toHaveAttribute("aria-expanded", "true");
    const list = document.getElementById("shellHelp")!;
    expect(list).toHaveTextContent("Loads the calibration and range from a slot.");
    expect(list.querySelector("button:disabled")).toHaveTextContent("Not sent here.");
    fireEvent.click(screen.getByText("Loads the calibration and range from a slot."));
    expect(screen.getByLabelText("Command")).toHaveValue("recall ");
    expect(screen.getByLabelText("Command")).toHaveFocus();
    expect(document.getElementById("shellHelp")).not.toBeNull();
    fireEvent.click(q);
    expect(document.getElementById("shellHelp")).toBeNull();
  });

  it("opens the list when ? is typed in the prompt", () => {
    localStorage.setItem("nanobands-shell-help", "0");
    const vna = vnaStub({ device });
    render(<ShellCard vna={vna} />);
    fireEvent.click(screen.getByRole("button", { name: "Shell" }));
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: "?" } });
    fireEvent.keyDown(screen.getByLabelText("Command"), { key: "Enter" });
    expect(document.getElementById("shellHelp")).not.toBeNull();
    expect(vna.command).not.toHaveBeenCalled();
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

  it("list every band, or only the usable ones", () => {
    // 3:1 on the V at 14.2 MHz: only 20 m has a usable part.
    const { unmount } = render(<BandTable an={an} settings={settings} />);
    expect(screen.getByText("40m")).toBeInTheDocument();
    unmount();
    render(<BandTable an={an} settings={settings} shown="usable" />);
    expect([...document.querySelectorAll("tbody.band")].map((t) => t.getAttribute("data-band"))).toEqual(["20m"]);
  });

  it("say when no band is usable", () => {
    render(<BandTable an={an} settings={{ ...settings, cls: "T" }} shown="usable" />);
    expect(screen.getByText("No usable band segments in this sweep.")).toBeInTheDocument();
  });

  it("pick a band on a click, and not as the mouse passes over it", () => {
    const onPick = vi.fn();
    render(<BandTable an={an} settings={settings} onPick={onPick} />);
    const rows = document.querySelector('tbody[data-band="40m"]')!;
    fireEvent.pointerEnter(rows, { pointerType: "mouse" });
    fireEvent.pointerLeave(rows, { pointerType: "mouse" });
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("40m"));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ name: "40m" }));
  });

  it("mark the band the chart shows", () => {
    const b20 = BANDS.find((b) => b.name === "20m")!;
    render(<BandTable an={an} settings={settings} view={bandView(an, b20)} />);
    expect([...document.querySelectorAll("tbody.band.on")].map((t) => t.getAttribute("data-band"))).toEqual(["20m"]);
  });

  it("give the range of the piece of a bar under the mouse", () => {
    // At 1.15:1 the V is usable from about 14.12 to 14.28 MHz. General's 20 m
    // phone segment, 14.225–14.35 MHz, is green then red.
    const tight = (() => { const { f, s } = vSweep(); return analyze(f, s, { thr: 1.15, prom: 0.2, top: 5 })!; })();
    render(<BandTable an={tight} settings={{ ...settings, thr: 1.15 }} />);
    const bar = [...document.querySelectorAll('tbody[data-band="20m"] tr')].find((r) => r.textContent?.includes("14.225–14.350"))!.querySelector(".bar")!;
    bar.getBoundingClientRect = () => ({ left: 0, width: 125, top: 0, height: 10, right: 125, bottom: 10, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerMove(bar, { pointerType: "mouse", clientX: 10, clientY: 5 });
    expect(document.querySelector(".barTip")).toHaveTextContent(/^14\.225–14\.2\d\d · Usable$/);
    fireEvent.pointerMove(bar, { pointerType: "mouse", clientX: 110, clientY: 5 });
    expect(document.querySelector(".barTip")).toHaveTextContent(/^14\.2\d\d–14\.350 · SWR too high$/);
    fireEvent.pointerLeave(bar, { pointerType: "mouse" });
    expect(document.querySelector(".barTip")).toBeNull();
  });

  it("say you may not transmit between 60 m's channels", () => {
    // A flat 1.2:1 across 5–6 MHz: every 60 m channel is usable.
    const f = Array.from({ length: 201 }, (_, i) => 5 + i / 200);
    const flat = analyze(f, f.map(() => 1.2), { thr: 3, prom: 0.2, top: 5 })!;
    render(<BandTable an={flat} settings={settings} />);
    const bar = document.querySelector('tbody[data-band="60m"] .bar')!;
    // The bar runs 5.3306–5.4064 MHz across 758 pixels: 10 kHz per 100 pixels.
    bar.getBoundingClientRect = () => ({ left: 0, width: 758, top: 0, height: 10, right: 758, bottom: 10, x: 0, y: 0, toJSON: () => ({}) });
    const x = (mhz: number): number => (mhz - 5.3306) * 10000;
    fireEvent.pointerMove(bar, { pointerType: "mouse", clientX: x(5.332), clientY: 5 });
    expect(document.querySelector(".barTip")).toHaveTextContent("5.3320 · Usable");
    fireEvent.pointerMove(bar, { pointerType: "mouse", clientX: x(5.340), clientY: 5 });
    expect(document.querySelector(".barTip")).toHaveTextContent("5.3334–5.3466 · You may not transmit here");
    fireEvent.pointerMove(bar, { pointerType: "mouse", clientX: x(5.36), clientY: 5 });
    expect(document.querySelector(".barTip")).toHaveTextContent("5.3515–5.3665 · Usable");
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

  it("color a pin as the chart colors the curve there", () => {
    // 14.3 MHz is in General's 20 m phone segment; 13.9 MHz is in no band.
    const { unmount } = render(<PointsTable an={an} settings={settings} manual={[14.3]} swr={() => 1.5} onRemove={() => undefined} />);
    expect(screen.getByText("Pinned")).toHaveStyle({ color: OK });
    unmount();
    render(<PointsTable an={an} settings={settings} manual={[13.9]} swr={() => 1.5} onRemove={() => undefined} />);
    expect(screen.getByText("Pinned")).toHaveStyle({ color: MATCH });
  });
});
