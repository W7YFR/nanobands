/* A stand-in NanoVNA that answers the shell like the firmware does.
 *
 * Tests use it, and `make dev` uses it at `?fake`, since the real device is
 * not always at hand. It answers the way a NanoVNA-H4 on firmware 1.2.44 was
 * seen to: `info`, `version`, `sweep` with and without a range, `recall`,
 * `save`, `cal`, `scan` with an output mask, `frequencies`, `data`, `pause`,
 * `resume`, `clearconfig`, and `cmd?` for anything else. Its slots are the
 * ones read from that H4. A recall of an empty slot changes nothing and says
 * `Err, default load`; set `quiet` to act like older firmware, which says
 * nothing. A scan pauses the device's own sweep and sets its point count. Set
 * `version` below 0.7.1 to act like older firmware without the mask.
 */

import type { Link } from "./vna";
import type { SerialLike, SerialPortLike } from "./vna-serial";

export interface FakeOptions {
  board?: string;
  version?: string;
  /** Saved calibration slots, null where empty. */
  slots?: (FakeSlot | null)[];
  /** Random wobble added to |S11| per sweep, so live sweeps visibly move. */
  noise?: number;
  /** Text waiting on the port when it opens, such as a reply nobody read. */
  stale?: string;
  /** Say nothing on a recall of an empty slot, like older firmware. */
  quiet?: boolean;
}



/** A slot: start, stop, points and what `cal` prints. */
export type FakeSlot = [number, number, number, string];

const FULL = "load isoln Es Er Et cal'ed";

/** The slots read from the user's H4 on 2026-11-01. */
export const H4_SLOTS: FakeSlot[] = [
  [144e6, 148e6, 101, FULL], [50e3, 900e6, 101, FULL], [14e6, 14.35e6, 101, FULL], [28e6, 30e6, 101, FULL],
  [13e6, 15e6, 101, "load Es Er cal'ed"], [6e6, 50e6, 101, FULL], [3e6, 55e6, 401, FULL],
];

/** SWR of a wire with dips near 7.1, 14.2, 21.3 and 28.4 MHz. */
export const fakeSwr = (hz: number): number => 1.15 + 6 * Math.sin((Math.PI * hz) / 7.1e6) ** 2;

export class FakeNanoVNA {
  board: string;
  version: string;
  slots: (FakeSlot | null)[];
  noise: number;
  stale: string;
  quiet: boolean;
  /** How long the port takes to answer a scan, in ms, so tests can act while one runs. */
  scanMs = 0;
  start = 3e6;
  stop = 55e6;
  points = 401;
  cal = FULL;
  /** Whether the device's own sweep is stopped, as a scan leaves it. */
  paused = false;
  /** Every command received, for tests. */
  log: string[] = [];

  constructor(o: FakeOptions = {}) {
    this.board = o.board ?? "NanoVNA-H 4";
    this.version = o.version ?? "1.2.44";
    this.slots = o.slots ?? H4_SLOTS.map((s) => [...s]);
    this.noise = o.noise ?? 0;
    this.stale = o.stale ?? "";
    this.quiet = o.quiet ?? false;
  }

  private freqs(start = this.start, stop = this.stop, n = this.points): number[] {
    return Array.from({ length: n }, (_, i) => Math.round(start + ((stop - start) * i) / (n - 1)));
  }

  private s11(hz: number): [number, number] {
    const s = fakeSwr(hz), g = Math.min(0.999, Math.max(0, (s - 1) / (s + 1) + this.noise * (Math.random() - 0.5))), ph = hz / 3e6;
    return [g * Math.cos(ph), g * Math.sin(ph)];
  }

  private get masked(): boolean {
    const [a = 0, b = 0, c = 0] = this.version.split(".").map(Number);
    return a > 0 || b > 7 || (b === 7 && c >= 1);
  }

  /** The reply to one command line, echo and prompt included. */
  answer(line: string): string {
    const cmd = line.trim();
    this.log.push(cmd);
    const out = (lines: string[]): string => `${cmd}\r\n${lines.map((l) => l + "\r\n").join("")}ch> `;
    if (!cmd) return "\r\nch> ";
    const [name = "", ...a] = cmd.split(/\s+/);
    const n = a.map(Number);
    switch (name) {
      case "info":
        return out([`Board: ${this.board}`, "2019-2025 Copyright NanoVNA.com", `Version: ${this.version} [p:401, IF:12k, ADC:384k, Lcd:480x320]`]);
      case "version":
        return out([this.version]);
      case "sweep":
        if (!a.length) return out([`${this.start} ${this.stop} ${this.points}`]);
        [this.start = this.start, this.stop = this.stop, this.points = this.points] = n;
        return out([]);
      case "recall": {
        const i = n[0];
        if (i === undefined || i >= this.slots.length) return out(["usage:  0..134287960"]);
        const s = this.slots[i];
        if (!s) return out(this.quiet ? [] : ["Err, default load"]);
        [this.start, this.stop, this.points, this.cal] = s;
        return out([]);
      }
      case "clearconfig":
        if (a.length !== 1) return out(["usage: clearconfig {protection key}"]);
        if (a[0] !== "1234") return out(["Key unmatched."]);
        this.slots = this.slots.map(() => null);
        return out(["Config and all cal data cleared.", "Do reset manually to take effect. Then do touch cal and save."]);
      case "save": {
        const i = n[0];
        if (i === undefined || i >= this.slots.length) return out(["usage:  0..134287960"]);
        this.slots[i] = [this.start, this.stop, this.points, this.cal];
        return out([]);
      }
      case "cal":
        if (!a.length) return out([`${this.cal} `]);
        break;
      case "pause":
      case "resume":
        this.paused = name === "pause";
        return out([]);
      case "frequencies":
        return out(this.freqs().map(String));
      case "data":
        return out(this.freqs().map((f) => this.s11(f).join(" ")));
      case "scan": {
        const [start = this.start, stop = this.stop, pts = this.points, mask] = n;
        if (mask !== undefined && !this.masked) break;
        this.paused = true;
        this.points = pts;
        if (mask === undefined) { [this.start, this.stop, this.points] = [start, stop, pts]; return out([]); }
        return out(this.freqs(start, stop, pts).map((f) => {
          const cols: (string | number)[] = [];
          if (mask & 1) cols.push(f);
          if (mask & 2) cols.push(...this.s11(f));
          if (mask & 4) cols.push(0, 0);
          return cols.join(" ");
        }));
      }
    }
    return `${cmd}\r\n${name}?\r\nch> `;
  }

  /** A Link straight to this device, for tests without streams. */
  link(): Link {
    const queue: string[] = this.stale ? [this.stale] : [];
    let wake: (() => void) | null = null, closed = false, partial = "";
    return {
      write: async (text) => {
        partial += text;
        let at;
        while ((at = partial.indexOf("\r")) >= 0) {
          queue.push(this.answer(partial.slice(0, at)));
          partial = partial.slice(at + 1);
        }
        wake?.();
      },
      read: async () => {
        while (!queue.length && !closed) await new Promise<void>((r) => (wake = r));
        return closed ? null : queue.shift()!;
      },
      close: async () => { closed = true; wake?.(); },
    };
  }

  /** A Web Serial stand-in whose one port is this device. */
  serial(): SerialLike {
    return { requestPort: async () => this.port() };
  }

  private port(): SerialPortLike {
    const enc = new TextEncoder(), dec = new TextDecoder();
    let ctrl: ReadableStreamDefaultController<Uint8Array> | null = null, partial = "";
    let readable: ReadableStream<Uint8Array> | null = null, writable: WritableStream<Uint8Array> | null = null;
    return {
      open: async () => {
        readable = new ReadableStream({ start: (c) => { ctrl = c; if (this.stale) c.enqueue(enc.encode(this.stale)); } });
        writable = new WritableStream({
          write: (chunk) => {
            partial += dec.decode(chunk, { stream: true });
            let at;
            while ((at = partial.indexOf("\r")) >= 0) {
              const line = partial.slice(0, at), reply = this.answer(line);
              partial = partial.slice(at + 1);
              // Real replies arrive in pieces; split one so the reader has to join them.
              const mid = Math.floor(reply.length / 2);
              const send = (): void => { try { ctrl?.enqueue(enc.encode(reply.slice(0, mid))); ctrl?.enqueue(enc.encode(reply.slice(mid))); } catch { /* closed */ } };
              if (this.scanMs && /^scan\b/.test(line.trim())) setTimeout(send, this.scanMs);
              else send();
            }
          },
        });
      },
      close: async () => { try { ctrl?.close(); } catch { /* already closed */ } },
      get readable() { return readable; },
      get writable() { return writable; },
    };
  }
}
