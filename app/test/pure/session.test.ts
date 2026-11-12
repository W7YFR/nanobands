/* The saved session: what is kept, what is not, and old snapshots. */

import { describe, expect, it } from "vitest";
import { EMPTY_DOC, type Doc } from "@/ui/model";
import { applySnapshot, snapshotOf } from "@/ui/session";

const photoDoc = (over: Partial<Doc> = {}): Doc => ({
  ...EMPTY_DOC, source: "image", fileName: "swr.jpg",
  corners: [[1, 1], [9, 1], [9, 9], [1, 9]],
  trace: { kind: "photo", N: 3, v: Float32Array.from([0.1, 0.5, NaN]), auto: true, edited: false },
  fields: { start: "3", stop: "55", top: "5", bot: "1", sens: "80" },
  manual: [14.2], view: [13, 15], straight: true,
  grid: { kind: "found", horizontal: 9, vertical: 7 }, ocr: { kind: "read", start: 3, stop: 55, raw: "x" },
  ...over,
});

const noTrace = (d: Doc): Doc => d;

describe("the session", () => {
  it("comes back as it was saved", () => {
    const sv = snapshotOf(photoDoc());
    const back = applySnapshot({ ...EMPTY_DOC, source: "image", corners: [[0, 0], [1, 0], [1, 1], [0, 1]] }, sv, noTrace);
    expect(back.fields).toEqual({ start: "3", stop: "55", top: "5", bot: "1", sens: "80" });
    expect(back.manual).toEqual([14.2]);
    expect(back.view).toEqual([13, 15]);
    expect(back.straight).toBe(true);
    expect(back.corners).toEqual([[1, 1], [9, 1], [9, 9], [1, 9]]);
    expect(back.trace?.kind === "photo" && Array.from(back.trace.v)).toEqual([expect.closeTo(0.1), 0.5, NaN]);
    expect(back.grid).toEqual({ kind: "found", horizontal: 9, vertical: 7 });
  });

  it("does not keep a reading in progress or an offer to use one", () => {
    expect(snapshotOf(photoDoc({ ocr: { kind: "looking" } })).notes.ocr).toBeNull();
    expect(snapshotOf(photoDoc({ ocr: { kind: "offer", start: 3, stop: 55, raw: "" } })).notes.ocr).toBeNull();
  });

  it("reads a snapshot from before the React port", () => {
    const old = { fields: { "#fStart": "1.8", "#fStop": "30", "#swrTop": "10", "#swrBot": "1", "#sens": "60" }, notes: { ocr: "<b>html</b>", grid: "" } };
    const back = applySnapshot({ ...EMPTY_DOC, source: "image" }, old as never, noTrace);
    expect(back.fields).toEqual({ start: "1.8", stop: "30", top: "10", bot: "1", sens: "60" });
    expect(back.ocr).toBeNull();
  });

  it("keeps a Touchstone file's own sweep over the saved one", () => {
    const d: Doc = { ...EMPTY_DOC, source: "s1p", fields: { ...EMPTY_DOC.fields, start: "1", stop: "2" } };
    expect(applySnapshot(d, snapshotOf(photoDoc()), noTrace).fields).toMatchObject({ start: "1", stop: "2", sens: "80" });
  });

  it("marks a NanoVNA sweep's fine bands again", () => {
    const fine = [{ band: "40m", lo: 7, hi: 7.3 }, { band: "20m", lo: 14, hi: 14.35 }];
    const sv = snapshotOf({ ...EMPTY_DOC, source: "vna", fine });
    expect(applySnapshot({ ...EMPTY_DOC, source: "vna" }, sv, noTrace).fine).toEqual(fine);
    // A band without its span, or a saved band that is not a list, is left out.
    expect(applySnapshot({ ...EMPTY_DOC, source: "vna" }, { ...sv, fine: [{ band: "40m" }, fine[1]] as never }, noTrace).fine).toEqual([fine[1]]);
    expect(applySnapshot({ ...EMPTY_DOC, source: "vna" }, { ...sv, fine: fine[0] as never }, noTrace).fine).toEqual([]);
  });

  it("keeps a NanoVNA sweep's kept sweeps, and only a NanoVNA sweep's", () => {
    const kept = [{ n: 2, f: Float64Array.from([14, 14.1]), s: Float64Array.from([1.5, 1.2]), on: false }];
    const sv = snapshotOf({ ...EMPTY_DOC, source: "vna", kept });
    expect(applySnapshot({ ...EMPTY_DOC, source: "vna" }, sv, noTrace).kept).toEqual(kept);
    expect(applySnapshot({ ...EMPTY_DOC, source: "s1p" }, sv, noTrace).kept).toEqual([]);
    // A kept sweep without its readings is left out.
    expect(applySnapshot({ ...EMPTY_DOC, source: "vna" }, { ...sv, kept: [{ n: 1, f: [14], s: [1] }] as never }, noTrace).kept).toEqual([]);
  });

  it("traces a photo afresh when its snapshot has corners and no trace", () => {
    let traced = false;
    applySnapshot({ ...EMPTY_DOC, source: "image" }, { corners: [[0, 0], [1, 0], [1, 1], [0, 1]] }, (d) => { traced = true; return d; });
    expect(traced).toBe(true);
  });
});
