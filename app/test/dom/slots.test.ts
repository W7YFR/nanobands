/* The slot list kept in the browser. */

import { beforeEach, describe, expect, it } from "vitest";
import { loadSlots, storeSlots, type Slot } from "@/slots";
import type { DeviceInfo } from "@/vna";

describe("the slot cache", () => {
  const h4: DeviceInfo = { board: "NanoVNA-H 4", version: "1.2.44", slots: 7, method: "mask" };
  const h: DeviceInfo = { board: "NanoVNA-H", version: "1.2.44", slots: 5, method: "mask" };
  beforeEach(() => localStorage.clear());

  it("keeps a list for each board and firmware", () => {
    const slots: Slot[] = [{ kind: "empty" }];
    expect(loadSlots(h4)).toBeNull();
    storeSlots(h4, slots);
    expect(loadSlots(h4)).toEqual(slots);
    expect(loadSlots(h)).toBeNull();
    storeSlots(h4, null);
    expect(loadSlots(h4)).toBeNull();
  });
});
