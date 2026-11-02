/* The NanoVNA's saved calibration slots: what each one holds.
 *
 * No command lists the slots, so Read recalls each one and reads its range
 * and calibration. Then it recalls the slot that matches what the device had
 * before, so the device ends where it started. A recall of an empty slot is
 * taken to change nothing. A slot that reads the same as the one before it is
 * read again after a different slot, to tell the two apart.
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
  recall(slot: number): Promise<Range>;
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

export async function readSlots(d: SlotDevice, count: number): Promise<SlotRead> {
  const state = async (r: Range): Promise<SlotState> => ({ range: r, cal: await d.cal() });
  const start = await state(await d.range());
  const read: SlotState[] = [], twin: boolean[] = [];
  let prev = start;
  for (let i = 0; i < count; i++) {
    read[i] = await state(await d.recall(i));
    twin[i] = sameState(read[i]!, prev);
    prev = read[i]!;
  }
  let last = count - 1;
  const slots: Slot[] = read.map((s, i) => (twin[i] ? { kind: "unknown" } : { kind: "set", ...s }));
  // A twin is a full slot or an empty one. Recall a slot that differs, then
  // the twin again: an empty slot leaves the device on the other one.
  for (let i = 0; i < count; i++) {
    if (!twin[i]) continue;
    const j = read.findIndex((s) => !sameState(s, read[i]!));
    if (j < 0) continue;
    await d.recall(j);
    const again = await state(await d.recall(i));
    last = i;
    slots[i] = sameState(again, read[j]!) ? { kind: "empty" } : { kind: "set", ...again };
  }
  const back = slotOf(slots, start);
  if (back !== null && back !== last) await d.recall(back);
  return { slots, at: back ?? last, restored: back !== null };
}

const mhz = (hz: number): number => +(hz / 1e6).toFixed(6);

/** The menu's name for a slot, such as "Slot 6 · 3–55 MHz". The Range row shows its points. */
export function slotLabel(i: number, s: Slot | undefined): string {
  if (!s) return `Slot ${i}`;
  if (s.kind !== "set") return `Slot ${i} · ${s.kind}`;
  const cal = !s.cal.includes("cal'ed") ? " · no calibration" : !s.cal.includes("Et") ? " · S11 only" : "";
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
