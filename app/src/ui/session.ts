/* The saved session: the last file, and the work done on it.
 *
 * The file itself is stored as it was loaded (a photo or Touchstone text);
 * the snapshot is what was done to it since. A refresh reads both back. A note
 * that needs the page that wrote it (a reading in progress, an offer to use
 * one) is not saved.
 */

import type { Quad } from "@/geometry";
import { DEFAULT_FIELDS, type Doc, type Fields, type GridNote, type OcrNote } from "./model";

export interface Snapshot {
  fields: Fields;
  corners: Quad | null;
  refs: { u: number; f: number }[];
  manual: number[];
  view: [number, number] | null;
  straight: boolean;
  sweepTyped: boolean;
  collapsed: boolean;
  trace: { N: number; v: Float32Array; auto: boolean; edited: boolean } | null;
  notes: { grid: GridNote | null; ocr: OcrNote | null };
}

export function snapshotOf(d: Doc): Snapshot {
  const t = d.trace;
  const ocr = d.ocr && d.ocr.kind !== "looking" && d.ocr.kind !== "offer" ? d.ocr : null;
  return {
    fields: d.fields, corners: d.corners, refs: d.refs, manual: d.manual, view: d.view,
    straight: d.straight, sweepTyped: d.sweepTyped, collapsed: d.collapsed,
    trace: t?.kind === "photo" ? { N: t.N, v: t.v.slice(), auto: t.auto, edited: t.edited } : null,
    notes: { grid: d.grid, ocr },
  };
}

/** Field names from before the React port, when the snapshot keyed them by element. */
const OLD_FIELDS: Record<string, keyof Fields> = { "#fStart": "start", "#fStop": "stop", "#swrTop": "top", "#swrBot": "bot", "#sens": "sens" };

/** A loaded file's doc with a snapshot laid over it. `traceIt` traces the
 *  photo afresh when the snapshot has corners and no trace. */
export function applySnapshot(d: Doc, sv: Partial<Snapshot>, traceIt: (d: Doc) => Doc): Doc {
  const fields: Fields = { ...DEFAULT_FIELDS };
  for (const [k, v] of Object.entries(sv.fields ?? {})) {
    const key = (OLD_FIELDS[k] ?? k) as keyof Fields;
    if (key in fields && typeof v === "string") fields[key] = v;
  }
  let out: Doc = {
    ...d,
    refs: sv.refs ?? [], manual: sv.manual ?? [], view: sv.view ?? null, sweepTyped: !!sv.sweepTyped,
  };
  // A Touchstone file's sweep is in the file, not in the fields.
  out.fields = d.source === "image" ? fields : { ...fields, start: d.fields.start, stop: d.fields.stop };
  if (d.source !== "image") return out;
  const isNote = (n: unknown): boolean => typeof n === "object" && n !== null && "kind" in n;
  out = {
    ...out,
    corners: sv.corners ?? d.corners,
    straight: !!sv.straight,
    collapsed: !!sv.collapsed,
    grid: isNote(sv.notes?.grid) ? sv.notes!.grid! : null,
    ocr: isNote(sv.notes?.ocr) ? sv.notes!.ocr! : null,
  };
  if (sv.trace) {
    out.trace = { kind: "photo", N: sv.trace.N, v: Float32Array.from(sv.trace.v), auto: sv.trace.auto, edited: sv.trace.edited };
  } else if (sv.corners) out = traceIt(out);
  return out;
}
