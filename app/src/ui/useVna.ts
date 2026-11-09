/* A NanoVNA over Web Serial: connect, sweep once, sweep live, recall a slot,
 * read what the slots hold.
 *
 * The device sweeps the range it is set to, so its calibration applies as
 * stored. Each finished sweep goes to `onSweep`. A fine sweep scans one band
 * of that range instead, at the same point count, until it is cleared or the
 * range changes; Sweep and Live then scan the band. A scan pauses the device's
 * own sweep, so each sweep ends with `resume`. Live resumes once, when it
 * stops. The device and its range live
 * in refs as well as state: the live loop and a sweep in flight read them
 * after awaits, when the render that started them is stale.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NanoVNA, VnaError, type Range, type Scan } from "@/vna";
import type { Fine } from "@/fine";
import { commandMs } from "@/shell";
import { loadSlots, readSlots as readAll, slotOf, storeSlots, type Slot } from "@/slots";
import { connectPort, serialApi, type SerialLike } from "@/vna-serial";

export interface Vna {
  /** Why live sweeps are unavailable in this browser, or "" when they are. */
  unsupported: string;
  device: NanoVNA | null;
  range: Range | null;
  live: boolean;
  /** The last error, for the page to show. */
  note: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sweep(): Promise<void>;
  setLive(on: boolean): void;
  recall(slot: number): Promise<void>;
  /** What each slot holds, from the last Read, or null before one. */
  slots: Slot[] | null;
  /** The slot the device is on, when it is known. */
  slot: number | null;
  /** True while Read recalls the slots. */
  reading: boolean;
  /** Recall each slot, note what it holds, and go back to the starting slot. */
  readSlots(): Promise<void>;
  /** Run a line typed in the Shell window and return what the device printed. */
  command(line: string): Promise<string[]>;
  /** Read the device's range again, and sweep when the shell changed it. */
  reread(): Promise<void>;
  /** The band Sweep and Live scan instead of the whole range, or null. */
  fine: Fine | null;
  /** Sweep a band finely from now on, or the whole range again with null. */
  setFine(f: Fine | null): Promise<void>;
  /** The calibration terms the device reports, such as `load isoln Es Er Et
   *  cal'ed`, or null before they are read. */
  cal: string[] | null;
}

const log = (line: unknown): void => console.info("[NanoVNA]", line);

export function useVna(onSweep: (scan: Scan, board: string, range: Range, fine: Fine | null) => void): Vna {
  const [serial, setSerial] = useState<SerialLike | string>(() => serialApi());
  const [device, setDevice] = useState<NanoVNA | null>(null);
  const [range, setRange] = useState<Range | null>(null);
  const [live, setLiveState] = useState(false);
  const [note, setNote] = useState("");
  const [slots, setSlotsState] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [reading, setReading] = useState(false);
  const [fine, setFineState] = useState<Fine | null>(null);
  const [cal, setCal] = useState<string[] | null>(null);
  const fineRef = useRef<Fine | null>(null);
  const keepFine = (f: Fine | null): void => { fineRef.current = f; setFineState(f); };
  const slotList = useRef<Slot[] | null>(null);
  const setSlots = (s: Slot[] | null): void => { slotList.current = s; setSlotsState(s); };
  const dev = useRef<NanoVNA | null>(null), rng = useRef<Range | null>(null), liveOn = useRef(false), busy = useRef(false);
  const sink = useRef(onSweep);
  useLayoutEffect(() => { sink.current = onSweep; });

  // `make dev` at ?fake: a stand-in NanoVNA, for work without the device.
  useEffect(() => {
    if (!import.meta.env.DEV || !new URLSearchParams(location.search).has("fake")) return;
    void import("@/vna-fake").then(({ FakeNanoVNA }) => setSerial(new FakeNanoVNA({ noise: 0.004 }).serial()));
  }, []);

  const stopLive = (): void => { liveOn.current = false; setLiveState(false); };

  const disconnect = useCallback(async (): Promise<void> => {
    stopLive();
    const d = dev.current;
    dev.current = rng.current = null;
    setDevice(null);
    setRange(null);
    setSlots(null);
    setSlot(null);
    setCal(null);
    keepFine(null);
    await d?.resume().catch(() => undefined);
    await d?.close();
  }, []);

  const fail = useCallback((e: unknown): void => {
    console.error("[NanoVNA]", e);
    stopLive();
    setNote(e instanceof Error ? e.message : String(e));
    if (!(e instanceof VnaError) || e.closed) void disconnect();
  }, [disconnect]);

  /** Sweep the device's range once and hand it on. Live passes `hold` to
   *  leave the device paused until it stops. */
  const sweepOnce = useCallback(async (hold = false): Promise<void> => {
    const d = dev.current, r = rng.current, f = fineRef.current;
    if (!d || !r) return;
    // The device's point count, so it keeps its settings.
    const scan = await d.scan(f ? { start: f.start, stop: f.stop, points: r.points } : r);
    if (!hold) await d.resume();
    // Disconnected, a recall changed the range, or the fine band changed, while it swept.
    if (dev.current !== d || rng.current !== r || fineRef.current !== f) return;
    if (scan.hz.length < 2) throw new VnaError("The sweep came back empty.");
    sink.current(scan, d.info.board, r, f);
  }, []);

  const connect = useCallback(async (): Promise<void> => {
    if (typeof serial === "string") { setNote(serial); return; }
    try {
      const link = await connectPort(serial);
      if (!link) return;
      const d = await NanoVNA.open(link, log);
      log(d.info);
      const r = await d.range(), terms = await d.cal();
      const list = loadSlots(d.info);
      setSlots(list);
      setSlot(slotOf(list, { range: r, cal: terms }));
      setCal(terms);
      dev.current = d;
      rng.current = r;
      keepFine(null);
      setDevice(d);
      setRange(r);
      setNote("");
      await sweepOnce();
    } catch (e) {
      fail(e);
    }
  }, [serial, sweepOnce, fail]);

  /** Set when a sweep is asked for while one is running: it runs once more after. */
  const again = useRef(false);
  const sweep = useCallback(async (): Promise<void> => {
    if (liveOn.current) return;
    if (busy.current) { again.current = true; return; }
    busy.current = true;
    try {
      do { again.current = false; await sweepOnce(); } while (again.current && !liveOn.current && dev.current);
    } catch (e) { fail(e); } finally { busy.current = false; }
  }, [sweepOnce, fail]);

  const setFine = useCallback(async (f: Fine | null): Promise<void> => {
    if (!dev.current) return;
    keepFine(f);
    // Live scans it on its next sweep.
    if (!liveOn.current) await sweep();
  }, [sweep]);

  const setLive = useCallback((on: boolean): void => {
    if (!on) { stopLive(); return; }
    if (liveOn.current) return;
    liveOn.current = true;
    setLiveState(true);
    void (async () => {
      try {
        while (liveOn.current && dev.current) {
          await sweepOnce(true);
          // Let the page draw and take clicks between sweeps, even when a reply arrives at once.
          await new Promise((r) => setTimeout(r, 0));
        }
        await dev.current?.resume();
      } catch (e) {
        fail(e);
      }
      stopLive();
    })();
  }, [sweepOnce, fail]);

  const recall = useCallback(async (slot: number): Promise<void> => {
    const d = dev.current;
    if (!d) return;
    try {
      keepFine(null);
      const r = await d.recall(slot);
      if (!r) { setNote(`Slot ${slot} is empty. The NanoVNA kept its calibration.`); return; }
      setNote("");
      setSlot(slot);
      setCal(await d.cal());
      rng.current = r;
      setRange(r);
      if (!liveOn.current) await sweepOnce();
    } catch (e) {
      fail(e);
    }
  }, [sweepOnce, fail]);

  /** Read the device's range and slot again, and sweep when the range changed. */
  const follow = useCallback(async (d: NanoVNA): Promise<void> => {
    const was = rng.current, r = await d.range(), terms = await d.cal();
    const at = slotOf(slotList.current, { range: r, cal: terms });
    if (dev.current !== d) return;
    setSlot(at);
    setCal(terms);
    if (was && r.start === was.start && r.stop === was.stop && r.points === was.points) return;
    keepFine(null);
    rng.current = r;
    setRange(r);
    if (!liveOn.current) await sweepOnce();
  }, [sweepOnce]);

  const reread = useCallback(async (): Promise<void> => {
    const d = dev.current;
    if (!d) return;
    try { await follow(d); } catch (e) { fail(e); }
  }, [follow, fail]);

  const readSlots = useCallback(async (): Promise<void> => {
    const d = dev.current;
    if (!d || busy.current) return;
    stopLive();
    busy.current = true;
    setReading(true);
    try {
      const got = await readAll(d, d.info.slots);
      if (dev.current !== d) return;
      storeSlots(d.info, got.slots);
      setSlots(got.slots);
      setNote(got.restored ? "" : `The calibration before Read matches no slot. The NanoVNA is on slot ${got.at}.`);
      await follow(d);
    } catch (e) {
      fail(e);
    } finally {
      busy.current = false;
      setReading(false);
    }
  }, [follow, fail]);

  /** After `save` or `clearconfig` in the shell, the slots it changed. */
  const saved = async (d: NanoVNA, line: string, out: string[]): Promise<void> => {
    if (out.some((l) => /usage/i.test(l))) return;
    if (/^clearconfig\b/.test(line)) {
      // A wrong key answers "Key unmatched." and erases nothing.
      if (!out.some((l) => /cleared/i.test(l))) return;
      storeSlots(d.info, null); setSlots(null); setSlot(null); return;
    }
    const n = /^save\s+(\d+)$/.exec(line)?.[1];
    const list = slotList.current;
    if (n === undefined || !list || +n >= list.length) return;
    const next = list.slice(), terms = await d.cal();
    next[+n] = { kind: "set", range: await d.range(), cal: terms };
    storeSlots(d.info, next);
    setSlots(next);
    setSlot(+n);
    setCal(terms);
  };

  const command = useCallback(async (line: string): Promise<string[]> => {
    const d = dev.current;
    if (!d) throw new VnaError("The NanoVNA is not connected.", true);
    try {
      const out = await d.command(line, commandMs(line));
      await saved(d, line.trim().split(/\s+/).join(" "), out);
      return out;
    } catch (e) {
      if (!(e instanceof VnaError) || e.closed) void disconnect();
      throw e;
    }
  }, [disconnect]);

  // Let go of the port when the page goes.
  useEffect(() => () => {
    liveOn.current = false;
    const d = dev.current;
    void d?.resume().catch(() => undefined).finally(() => d.close());
  }, []);

  return {
    unsupported: typeof serial === "string" ? serial : "",
    device, range, live, note, connect, disconnect, sweep, setLive, recall, slots, slot, reading, readSlots, command, reread, fine, setFine, cal,
  };
}
