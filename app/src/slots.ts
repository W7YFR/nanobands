/* The NanoVNA's saved calibration slots: what each one holds.
 *
 * No command lists the slots, so Read recalls each one and reads its range
 * and calibration. Then it recalls the slot that matches what the device had
 * before, so the device ends where it started. The device says when a slot
 * is empty. Older firmware says nothing and keeps what it had, so there a
 * slot that reads the same as the one before it is read again after a
 * different slot, to tell the two apart.
 *
 * The list is kept in the browser for each board and firmware.
 */

import type { DeviceInfo, Range } from "./vna";

/** A range and the calibration `cal` reports, such as `load isoln Es Er Et cal'ed`. */
export interface SlotState {
  range: Range;
  cal: string[];
}

/** What a slot holds. "unknown": every slot reads the same, so an empty one cannot be told apart. */
export type Slot = ({ kind: "set" } & SlotState) | { kind: "empty" } | { kind: "unknown" };

/** The part of the device that Read uses. */
export interface SlotDevice {
  /** Null when the device says the slot is empty. */
  recall(slot: number): Promise<Range | null>;
  range(): Promise<Range>;
  cal(): Promise<string[]>;
}

/** Read the reply to `cal` with no arguments: the calibration terms it has. */
export function parseCal(lines: string[]): string[] {
  const line = lines[0] ?? "";
  return /usage/i.test(line) ? [] : line.trim().split(/\s+/).filter((w) => w !== "");
}

export function sameState(a: SlotState, b: SlotState): boolean {
  return a.range.start === b.range.start && a.range.stop === b.range.stop && a.range.points === b.range.points
    && a.cal.join(" ") === b.cal.join(" ");
}

/** The slot that holds this state, or null. */
export function slotOf(slots: Slot[] | null, s: SlotState): number | null {
  const i = slots?.findIndex((x) => x.kind === "set" && sameState(x, s)) ?? -1;
  return i >= 0 ? i : null;
}

export interface SlotRead {
  slots: Slot[];
  /** The slot the device is on after Read. */
  at: number;
  /** True when that slot holds what the device had before Read. */
  restored: boolean;
}

export async function readSlots(d: SlotDevice, count: number, onSlot?: (i: number) => void): Promise<SlotRead> {
  const state = async (r: Range): Promise<SlotState> => ({ range: r, cal: await d.cal() });
  const start = await state(await d.range());
  const read: (SlotState | null)[] = [], twin: boolean[] = [];
  // The last slot the device loaded: it is on that slot after Read.
  let prev = start, last = -1;
  for (let i = 0; i < count; i++) {
    onSlot?.(i);
    const r = await d.recall(i);
    if (!r) { read[i] = null; continue; }
    const s = await state(r);
    read[i] = s;
    twin[i] = sameState(s, prev);
    prev = s;
    last = i;
  }
  const slots: Slot[] = read.map((s, i) => (!s ? { kind: "empty" } : twin[i] ? { kind: "unknown" } : { kind: "set", ...s }));
  // A twin is a full slot or an empty one. Recall a slot that differs, then
  // the twin again: an empty slot leaves the device on the other one.
  for (let i = 0; i < count; i++) {
    const s = read[i];
    if (!s || !twin[i]) continue;
    const j = read.findIndex((o) => o && !sameState(o, s));
    if (j < 0) continue;
    await d.recall(j);
    const r = await d.recall(i), again = r && (await state(r));
    last = again ? i : j;
    slots[i] = !again || sameState(again, read[j]!) ? { kind: "empty" } : { kind: "set", ...again };
  }
  if (last < 0) last = count - 1;
  const back = slotOf(slots, start);
  if (back !== null && back !== last) await d.recall(back);
  return { slots, at: back ?? last, restored: back !== null };
}

const mhz = (hz: number): number => +(hz / 1e6).toFixed(6);

/** Whether the terms `cal` reports say a calibration is applied. Without
 *  one, the device's readings are raw. */
export const calibrated = (cal: readonly string[]): boolean => cal.includes("cal'ed");

/** The menu's name for a slot, such as "Slot 6 · 3–55 MHz". The Range row shows its points. */
export function slotLabel(i: number, s: Slot | undefined): string {
  if (!s) return `Slot ${i}`;
  if (s.kind !== "set") return `Slot ${i} · ${s.kind}`;
  const cal = !calibrated(s.cal) ? " · no calibration" : !s.cal.includes("Et") ? " · S11 only" : "";
  return `Slot ${i} · ${mhz(s.range.start)}–${mhz(s.range.stop)} MHz${cal}`;
}

/* ---------------- The cache ---------------- */

const KEY = "nanobands-slots";
const id = (info: DeviceInfo): string => `${info.board} ${info.version}`;

function all(): Record<string, Slot[]> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Slot[]>; } catch { return {}; }
}

export function loadSlots(info: DeviceInfo): Slot[] | null {
  return all()[id(info)] ?? null;
}

/** Keep the list, or forget it with null. */
export function storeSlots(info: DeviceInfo, slots: Slot[] | null): void {
  const a = all();
  if (slots) a[id(info)] = slots; else delete a[id(info)];
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* storage blocked: Read again next time */ }
}
