/* Reading the calibration slots, against the stand-in device. Its slots are
 * the ones read from a NanoVNA-H4 on firmware 1.2.44. */

import { describe, expect, it } from "vitest";
import { parseCal, readSlots, slotLabel, slotOf, type Slot } from "@/slots";
import { NanoVNA } from "@/vna";
import { FakeNanoVNA, H4_SLOTS } from "@/vna-fake";

const FULL = ["load", "isoln", "Es", "Er", "Et", "cal'ed"];
const open = async (dev: FakeNanoVNA): Promise<NanoVNA> => NanoVNA.open(dev.link());
const recalls = (dev: FakeNanoVNA): string[] => dev.log.filter((c) => c.startsWith("recall"));

describe("parseCal", () => {
  it("reads the calibration terms", () => {
    expect(parseCal(["load isoln Es Er Et cal'ed "])).toEqual(FULL);
    expect(parseCal(["load Es Er cal'ed "])).toEqual(["load", "Es", "Er", "cal'ed"]);
    expect(parseCal([])).toEqual([]);
    expect(parseCal(["usage: cal [load|open|short|thru|done|reset|on|off]"])).toEqual([]);
  });
});

describe("readSlots", () => {
  it("reads every slot and ends on the slot the device started on", async () => {
    const dev = new FakeNanoVNA();
    const vna = await open(dev);
    await vna.recall(2);
    const got = await readSlots(vna, vna.info.slots);
    expect(got.slots).toHaveLength(7);
    expect(got.slots.map((s) => (s.kind === "set" ? [s.range.start, s.range.stop, s.range.points] : s.kind)))
      .toEqual(H4_SLOTS.map((s) => s.slice(0, 3)));
    expect(got.slots[4]).toMatchObject({ cal: ["load", "Es", "Er", "cal'ed"] });
    expect(got).toMatchObject({ at: 2, restored: true });
    expect(recalls(dev).at(-1)).toBe("recall 2");
    expect([dev.start, dev.stop]).toEqual([14e6, 14.35e6]);
  });

  it("tells the starting slot from an empty one when it reads the same as the device before", async () => {
    const dev = new FakeNanoVNA();
    const vna = await open(dev);
    await vna.recall(0);
    const got = await readSlots(vna, 7);
    expect(got.slots[0]).toMatchObject({ kind: "set", range: { start: 144e6 } });
    expect(got).toMatchObject({ at: 0, restored: true });
  });

  it("marks an empty slot, which a recall leaves the device unchanged by", async () => {
    const slots = H4_SLOTS.map((s) => [...s] as typeof s) as (typeof H4_SLOTS[number] | null)[];
    slots[3] = null;
    const dev = new FakeNanoVNA({ slots });
    const vna = await open(dev);
    const got = await readSlots(vna, 7);
    expect(got.slots[3]).toEqual({ kind: "empty" });
    expect(got.slots[4]).toMatchObject({ kind: "set" });
    expect(got).toMatchObject({ at: 6, restored: true });
    expect([dev.start, dev.stop, dev.points]).toEqual([3e6, 55e6, 401]);
  });

  it("says so when no slot holds what the device had, and names the slot it is on", async () => {
    const dev = new FakeNanoVNA();
    const vna = await open(dev);
    await vna.command("sweep 7000000 7300000 101", 1000);
    const got = await readSlots(vna, 7);
    expect(got).toMatchObject({ at: 6, restored: false });
  });

  it("calls slots unknown when every one reads the same", async () => {
    const dev = new FakeNanoVNA({ slots: [null, null] });
    const vna = await open(dev);
    const got = await readSlots(vna, 2);
    expect(got.slots).toEqual([{ kind: "unknown" }, { kind: "unknown" }]);
    expect(got.restored).toBe(false);
  });
});

describe("the slot menu", () => {
  const range = { start: 3e6, stop: 55e6, points: 401 };
  it("names a slot by its range and calibration", () => {
    expect(slotLabel(6, { kind: "set", range, cal: FULL })).toBe("Slot 6 · 3–55 MHz");
    expect(slotLabel(1, { kind: "set", range: { start: 50e3, stop: 900e6, points: 101 }, cal: FULL })).toBe("Slot 1 · 0.05–900 MHz");
    expect(slotLabel(4, { kind: "set", range, cal: ["load", "Es", "Er", "cal'ed"] })).toContain("· S11 only");
    expect(slotLabel(5, { kind: "set", range, cal: [] })).toContain("· no calibration");
    expect(slotLabel(2, { kind: "empty" })).toBe("Slot 2 · empty");
    expect(slotLabel(3, undefined)).toBe("Slot 3");
  });

  it("finds the slot that holds a range and calibration", () => {
    const slots: Slot[] = [{ kind: "empty" }, { kind: "set", range, cal: FULL }];
    expect(slotOf(slots, { range, cal: FULL })).toBe(1);
    expect(slotOf(slots, { range, cal: ["load", "Es", "Er", "cal'ed"] })).toBeNull();
    expect(slotOf(null, { range, cal: FULL })).toBeNull();
  });
});
