/* A set of sweeps from Export's All (.zip): which file is the latest, and the kept sweeps in their places. */

import { describe, expect, it } from "vitest";
import { keptNumberOf, sweepSet } from "@/sweep-set";

const f = (name: string): { name: string; text: string } => ({ name, text: name });

describe("sweepSet", () => {
  it("finds the latest sweep and the kept sweeps, oldest first", () => {
    const set = sweepSet([f("nanovna-3-55mhz-kept1.s1p"), f("nanovna-3-55mhz.s1p"), f("nanovna-3-55mhz-kept3.s1p"), f("nanovna-3-55mhz-kept2.s1p")], 3);
    expect(set).toEqual({ latest: f("nanovna-3-55mhz.s1p"), kept: ["kept3", "kept2", "kept1"].map((k) => f(`nanovna-3-55mhz-${k}.s1p`)) });
  });

  it("keeps the newest, up to the most it keeps", () => {
    const set = sweepSet([f("a.s1p"), f("a-kept1.s1p"), f("a-kept2.s1p"), f("a-kept4.s1p")], 2);
    expect(typeof set !== "string" && set.kept.map((k) => k.name)).toEqual(["a-kept2.s1p", "a-kept1.s1p"]);
  });

  it("leaves out folders, macOS's ._ files and what is not a sweep", () => {
    const set = sweepSet([f("sweeps/a.s1p"), f("__MACOSX/._a.s1p"), f("notes.md"), f("sweeps/a-kept1.s1p")], 3);
    expect(typeof set !== "string" && [set.latest.name, ...set.kept.map((k) => k.name)]).toEqual(["a.s1p", "a-kept1.s1p"]);
  });

  it("says why when it cannot tell which file is the latest", () => {
    expect(sweepSet([f("a-kept1.s1p")], 3)).toMatch(/no Touchstone file for the latest sweep/);
    expect(sweepSet([f("a.s1p"), f("b.s1p")], 3)).toMatch(/more than one sweep/);
    expect(sweepSet([f("swr-trace.csv")], 3)).toMatch(/no Touchstone file/);
  });

  it("reads a kept sweep's number from its name", () => {
    expect(keptNumberOf("nanovna-3-55mhz-kept2.s1p")).toBe(2);
    expect(keptNumberOf("nanovna-3-55mhz.s1p")).toBeNull();
  });
});
